#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    fs::File,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

use serde_json::Value;
use tauri::Manager;

struct ManagedBackend {
    child: Mutex<Option<Child>>,
}

impl Default for ManagedBackend {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }
}

impl ManagedBackend {
    fn start(&self) -> Result<String, String> {
        let mut child_guard = self.child.lock().map_err(|_| "backend lock poisoned".to_string())?;
        if child_guard.is_some() {
            return Ok("backend already running".into());
        }

        let project_root = project_root();
        let mut last_error: Option<String> = None;

        let python_candidates = python_candidates();

        for candidate in python_candidates {
            match ensure_python_runtime(&candidate, &project_root) {
                Ok(()) => {}
                Err(error) => {
                    last_error = Some(format!("{}: {}", candidate.display_name(), error));
                    continue;
                }
            }

            match spawn_backend(&candidate, &project_root) {
                Ok(mut child) => {
                    thread::sleep(Duration::from_millis(1200));
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            let log_tail = read_backend_log_tail(30);
                            last_error = Some(if log_tail.is_empty() {
                                format!(
                                    "{} exited early with status {}",
                                    candidate.display_name(),
                                    status
                                )
                            } else {
                                format!(
                                    "{} exited early with status {}\n{}",
                                    candidate.display_name(),
                                    status,
                                    log_tail
                                )
                            });
                            continue;
                        }
                        Ok(None) => {}
                        Err(error) => {
                            last_error = Some(format!("{}: {}", candidate.display_name(), error));
                            continue;
                        }
                    }

                    *child_guard = Some(child);
                    return Ok(format!(
                        "started backend from {} via {}",
                        project_root.display(),
                        candidate.display_name()
                    ));
                }
                Err(error) => {
                    last_error = Some(format!("{}: {}", candidate.display_name(), error));
                }
            }
        }

        Err(last_error.unwrap_or_else(|| "failed to start backend".into()))
    }

    fn stop(&self) -> Result<(), String> {
        let mut child_guard = self.child.lock().map_err(|_| "backend lock poisoned".to_string())?;
        if let Some(mut child) = child_guard.take() {
            child.kill().map_err(|error| error.to_string())?;
            let _ = child.wait();
        }
        Ok(())
    }
}

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join(".."))
}

fn desktop_config_path() -> PathBuf {
    project_root().join(".client_config.json")
}

fn shared_config_path() -> PathBuf {
    project_root().join(".web_config.json")
}

fn backend_log_path() -> PathBuf {
    project_root().join(".client_logs").join("backend.log")
}

#[derive(Clone, Debug)]
struct PythonCandidate {
    program: String,
    prefix_args: Vec<String>,
}

impl PythonCandidate {
    fn display_name(&self) -> String {
        if self.prefix_args.is_empty() {
            self.program.clone()
        } else {
            format!("{} {}", self.program, self.prefix_args.join(" "))
        }
    }
}

struct ManagedSmtpConfig {
    host: &'static str,
    port: u16,
    sender: &'static str,
    password: &'static str,
}

fn managed_smtp_config() -> ManagedSmtpConfig {
    ManagedSmtpConfig {
        host: "smtp.163.com",
        port: 465,
        sender: "boming8036881@163.com",
        password: "PSBggDPXAhQVeqx7",
    }
}

fn python_candidates() -> Vec<PythonCandidate> {
    let mut candidates = Vec::new();

    if let Some(configured_path) = configured_python_path() {
        candidates.push(PythonCandidate {
            program: configured_path,
            prefix_args: Vec::new(),
        });
    }

    candidates.push(PythonCandidate {
        program: "python".into(),
        prefix_args: Vec::new(),
    });
    candidates.push(PythonCandidate {
        program: "py".into(),
        prefix_args: vec!["-3".into()],
    });

    candidates
}

fn configured_python_path() -> Option<String> {
    let env_value = std::env::var("IDEER_PYTHON_PATH").ok().map(|value| value.trim().to_string());
    if let Some(value) = env_value {
        if !value.is_empty() {
            return Some(value);
        }
    }

    for path in [desktop_config_path(), shared_config_path()] {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(value) = serde_json::from_str::<Value>(&content) {
                if let Some(configured) = value
                    .get("desktop_python_path")
                    .and_then(|item| item.as_str())
                    .map(|item| item.trim().to_string())
                {
                    if !configured.is_empty() {
                        return Some(configured);
                    }
                }
            }
        }
    }

    None
}

fn ensure_python_runtime(candidate: &PythonCandidate, cwd: &Path) -> Result<(), String> {
    let mut command = Command::new(&candidate.program);
    command
        .args(&candidate.prefix_args)
        .args([
            "-c",
            "import fastapi, uvicorn, pydantic; print('ideer python ready')",
        ])
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let output = command.output().map_err(|error| error.to_string())?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err("python runtime check failed".into())
    } else {
        Err(stderr)
    }
}

fn spawn_backend(candidate: &PythonCandidate, cwd: &Path) -> std::io::Result<Child> {
    let log_path = backend_log_path();
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent)?;
    }
    let stdout_log = File::create(&log_path)?;
    let stderr_log = stdout_log.try_clone()?;

    let mut command = Command::new(&candidate.program);
    command
        .args(&candidate.prefix_args)
        .arg("web_server.py")
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout_log))
        .stderr(Stdio::from(stderr_log));

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    command.spawn()
}

fn read_backend_log_tail(limit: usize) -> String {
    let log_path = backend_log_path();
    let content = fs::read_to_string(log_path).unwrap_or_default();
    let lines: Vec<&str> = content.lines().collect();
    let start = lines.len().saturating_sub(limit);
    lines[start..].join("\n")
}

fn run_smtp_test_with_python(
    candidate: &PythonCandidate,
    cwd: &Path,
    mode: &str,
    host: &str,
    port: u16,
    sender: &str,
    password: &str,
    receiver: &str,
) -> Result<String, String> {
    const SMTP_TEST_SCRIPT: &str = r#"import smtplib
import ssl
import sys
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr

mode, host, port_text, sender, password, receiver_text = sys.argv[1:7]
port = int(port_text)
receivers = [item.strip() for item in receiver_text.replace(';', ',').split(',') if item.strip()]

if not receivers:
    raise SystemExit('receiver is required')

now_local = datetime.now().astimezone()
now_utc = now_local.astimezone(timezone.utc)
offset_raw = now_local.strftime('%z') or '+0000'
offset_label = f"UTC{offset_raw[:3]}:{offset_raw[3:]}"
zone_name = now_local.tzname() or offset_label

message = EmailMessage()
message['Subject'] = f"iDeer SMTP test · {now_local.strftime('%Y-%m-%d %H:%M:%S')} ({offset_label})"
message['From'] = formataddr(('iDeer', sender))
message['To'] = ', '.join(receivers)
message.set_content(
    '\n'.join([
        'This is a test email sent by iDeer to verify your SMTP configuration.',
        '',
        f'Mode: {mode}',
        f'SMTP server: {host}:{port}',
        f'Sender: {sender}',
        f'Receiver: {", ".join(receivers)}',
        f'Local time: {now_local.strftime("%Y-%m-%d %H:%M:%S")} ({zone_name}, {offset_label})',
        f'UTC time: {now_utc.strftime("%Y-%m-%d %H:%M:%S")} (UTC+00:00)',
    ])
)

timeout = 20
smtp = None

try:
    if port == 465:
        smtp = smtplib.SMTP_SSL(host, port, timeout=timeout, context=ssl.create_default_context())
        smtp.ehlo()
    else:
        smtp = smtplib.SMTP(host, port, timeout=timeout)
        smtp.ehlo()
        if smtp.has_extn('starttls'):
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()

    smtp.login(sender, password)
    smtp.send_message(message)
    smtp.quit()
    print('Test email sent to ' + ', '.join(receivers))
except Exception as exc:
    try:
        if smtp is not None:
            smtp.quit()
    except Exception:
        pass
    raise SystemExit(str(exc))
"#;

    let mut command = Command::new(&candidate.program);
    command
        .args(&candidate.prefix_args)
        .arg("-c")
        .arg(SMTP_TEST_SCRIPT)
        .arg(mode)
        .arg(host)
        .arg(port.to_string())
        .arg(sender)
        .arg(password)
        .arg(receiver)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let output = command.output().map_err(|error| error.to_string())?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            Ok(format!("Test email sent to {}", receiver.trim()))
        } else {
            Ok(stdout)
        }
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "SMTP test email failed".into()
        };
        Err(detail)
    }
}

fn resolve_smtp_test_config(
    mode: &str,
    host: &str,
    port: u16,
    sender: &str,
    password: &str,
) -> Result<(String, u16, String, String), String> {
    if mode == "managed" {
        let managed = managed_smtp_config();
        return Ok((
            managed.host.to_string(),
            managed.port,
            managed.sender.to_string(),
            managed.password.to_string(),
        ));
    }

    let host = host.trim().to_string();
    let sender = sender.trim().to_string();
    let password = password.trim().to_string();

    if host.is_empty() {
        return Err("SMTP host is required".into());
    }
    if sender.is_empty() {
        return Err("sender email is required".into());
    }
    if password.is_empty() {
        return Err("SMTP password is required".into());
    }

    Ok((host, port, sender, password))
}

fn open_external_with_system(url: &str) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("only http and https urls are supported".into());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
}

#[tauri::command]
fn start_backend(state: tauri::State<ManagedBackend>) -> Result<String, String> {
    state.start()
}

#[tauri::command]
fn stop_backend(state: tauri::State<ManagedBackend>) -> Result<(), String> {
    state.stop()
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    open_external_with_system(&url)
}

#[tauri::command]
fn read_backend_log() -> Result<String, String> {
    Ok(read_backend_log_tail(60))
}

#[tauri::command]
fn test_smtp_connection(
    mode: String,
    host: String,
    port: u16,
    sender: String,
    password: String,
    receiver: String,
) -> Result<String, String> {
    let receiver = receiver.trim().to_string();

    if receiver.is_empty() {
        return Err("receiver email is required".into());
    }

    let (host, port, sender, password) =
        resolve_smtp_test_config(mode.trim(), &host, port, &sender, &password)?;

    let project_root = project_root();
    let mut last_error: Option<String> = None;

    for candidate in python_candidates() {
        match run_smtp_test_with_python(
            &candidate,
            &project_root,
            mode.trim(),
            &host,
            port,
            &sender,
            &password,
            &receiver,
        ) {
            Ok(message) => return Ok(message),
            Err(error) => last_error = Some(format!("{}: {}", candidate.display_name(), error)),
        }
    }

    Err(last_error.unwrap_or_else(|| "unable to find a usable python runtime for SMTP test mail".into()))
}

#[tauri::command]
fn load_desktop_config() -> Result<String, String> {
    let client_path = desktop_config_path();
    if client_path.exists() {
        return fs::read_to_string(&client_path).map_err(|error| error.to_string());
    }

    let shared_path = shared_config_path();
    if shared_path.exists() {
        return fs::read_to_string(&shared_path).map_err(|error| error.to_string());
    }

    Ok(String::new())
}

#[tauri::command]
fn save_desktop_config(content: String) -> Result<(), String> {
    let client_path = desktop_config_path();
    let shared_path = shared_config_path();

    fs::write(&client_path, &content).map_err(|error| error.to_string())?;
    fs::write(&shared_path, &content).map_err(|error| error.to_string())?;

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(ManagedBackend::default())
        .invoke_handler(tauri::generate_handler![
            start_backend,
            stop_backend,
            open_external,
            read_backend_log,
            test_smtp_connection,
            load_desktop_config,
            save_desktop_config
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<ManagedBackend>();
                let _ = state.stop();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running iDeer desktop");
}
