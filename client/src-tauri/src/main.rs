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
    fn start(&self, app_handle: &tauri::AppHandle) -> Result<String, String> {
        let mut child_guard = self
            .child
            .lock()
            .map_err(|_| "backend lock poisoned".to_string())?;
        if child_guard.is_some() {
            return Ok("backend already running".into());
        }

        let project_root = project_root(app_handle);
        let mut last_error: Option<String> = None;

        // --- Try bundled sidecar binary first (production build) ---
        if let Some(sidecar_path) = find_sidecar_binary(app_handle) {
            match spawn_executable(&sidecar_path, &project_root) {
                Ok(mut child) => {
                    thread::sleep(Duration::from_millis(1500));
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            let log_tail = read_backend_log_tail(&project_root, 30);
                            last_error = Some(format!(
                                "sidecar exited early (status {}){}",
                                status,
                                if log_tail.is_empty() {
                                    String::new()
                                } else {
                                    format!("\n{}", log_tail)
                                }
                            ));
                        }
                        Ok(None) => {
                            *child_guard = Some(child);
                            return Ok(format!(
                                "started backend via bundled sidecar: {}",
                                sidecar_path.display()
                            ));
                        }
                        Err(e) => {
                            last_error = Some(format!("sidecar wait error: {}", e));
                        }
                    }
                }
                Err(e) => {
                    last_error = Some(format!("sidecar spawn failed: {}", e));
                }
            }
        }

        // --- Fallback: try system Python ---
        let python_candidates = python_candidates(&project_root);

        for candidate in python_candidates {
            match ensure_python_runtime(&candidate, &project_root) {
                Ok(()) => {}
                Err(error) => {
                    last_error = Some(format!("{}: {}", candidate.display_name(), error));
                    continue;
                }
            }

            match spawn_python_backend(&candidate, &project_root) {
                Ok(mut child) => {
                    thread::sleep(Duration::from_millis(1200));
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            let log_tail = read_backend_log_tail(&project_root, 30);
                            last_error = Some(if log_tail.is_empty() {
                                format!("{} exited early (status {})", candidate.display_name(), status)
                            } else {
                                format!(
                                    "{} exited early (status {})\n{}",
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
                        "started backend via {}",
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
        let mut child_guard = self
            .child
            .lock()
            .map_err(|_| "backend lock poisoned".to_string())?;
        if let Some(mut child) = child_guard.take() {
            child.kill().map_err(|error| error.to_string())?;
            let _ = child.wait();
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

fn project_root(app_handle: &tauri::AppHandle) -> PathBuf {
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        if resource_dir.join("web_server.py").exists() || resource_dir.join("profiles").exists() {
            return resource_dir;
        }
    }
    project_root_static()
}

fn project_root_static() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join(".."))
}

fn desktop_config_path() -> PathBuf {
    project_root_static().join(".client_config.json")
}

fn shared_config_path() -> PathBuf {
    project_root_static().join(".web_config.json")
}

fn backend_log_path(root: &Path) -> PathBuf {
    root.join(".client_logs").join("backend.log")
}

// ---------------------------------------------------------------------------
// Bundled sidecar binary (PyInstaller-built)
// ---------------------------------------------------------------------------

fn find_sidecar_binary(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    let resource_dir = app_handle.path().resource_dir().ok()?;
    let triple = current_target_triple();

    let candidates = if cfg!(windows) {
        vec![
            resource_dir.join(format!("binaries/ideer-backend-{}.exe", triple)),
            resource_dir.join("binaries/ideer-backend.exe"),
        ]
    } else {
        vec![
            resource_dir.join(format!("binaries/ideer-backend-{}", triple)),
            resource_dir.join("binaries/ideer-backend"),
        ]
    };

    candidates.into_iter().find(|p| p.exists())
}

fn current_target_triple() -> &'static str {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else {
        "unknown"
    }
}

fn spawn_executable(exe: &Path, cwd: &Path) -> std::io::Result<Child> {
    let log_path = backend_log_path(cwd);
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent)?;
    }
    let stdout_log = File::create(&log_path)?;
    let stderr_log = stdout_log.try_clone()?;

    let mut command = Command::new(exe);
    command
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

// ---------------------------------------------------------------------------
// System Python fallback
// ---------------------------------------------------------------------------

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

fn python_candidates(project_root: &Path) -> Vec<PythonCandidate> {
    let mut candidates = Vec::new();

    if let Some(configured_path) = configured_python_path() {
        candidates.push(PythonCandidate {
            program: configured_path,
            prefix_args: Vec::new(),
        });
    }

    let venv_python = if cfg!(windows) {
        project_root.join(".venv").join("Scripts").join("python.exe")
    } else {
        project_root.join(".venv").join("bin").join("python")
    };
    if venv_python.exists() {
        candidates.push(PythonCandidate {
            program: venv_python.to_string_lossy().into(),
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
    if let Some(value) = std::env::var("IDEER_PYTHON_PATH")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
    {
        return Some(value);
    }

    for path in [desktop_config_path(), shared_config_path()] {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(value) = serde_json::from_str::<Value>(&content) {
                if let Some(configured) = value
                    .get("desktop_python_path")
                    .and_then(|item| item.as_str())
                    .map(|item| item.trim().to_string())
                    .filter(|item| !item.is_empty())
                {
                    return Some(configured);
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
        .args(["-c", "import fastapi, uvicorn, pydantic; print('ok')"])
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let output = command.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if stderr.is_empty() {
        "python runtime check failed".into()
    } else {
        stderr
    })
}

fn spawn_python_backend(candidate: &PythonCandidate, cwd: &Path) -> std::io::Result<Child> {
    let log_path = backend_log_path(cwd);
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

fn read_backend_log_tail(root: &Path, limit: usize) -> String {
    let log_path = backend_log_path(root);
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

// ---------------------------------------------------------------------------
// Utility commands
// ---------------------------------------------------------------------------

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
            .map_err(|e| e.to_string())?;
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
            .map_err(|e| e.to_string())?;
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
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn start_backend(
    app_handle: tauri::AppHandle,
    state: tauri::State<ManagedBackend>,
) -> Result<String, String> {
    state.start(&app_handle)
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
    Ok(read_backend_log_tail(&project_root_static(), 60))
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

    let project_root = project_root_static();
    let mut last_error: Option<String> = None;

    for candidate in python_candidates(&project_root) {
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
    for path in [desktop_config_path(), shared_config_path()] {
        if path.exists() {
            return fs::read_to_string(&path).map_err(|e| e.to_string());
        }
    }
    Ok(String::new())
}

#[tauri::command]
fn save_desktop_config(content: String) -> Result<(), String> {
    fs::write(desktop_config_path(), &content).map_err(|e| e.to_string())?;
    fs::write(shared_config_path(), &content).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
