#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    fs::File,
    net::{TcpStream, ToSocketAddrs},
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
fn test_smtp_connection(host: String, port: u16) -> Result<String, String> {
    let target = format!("{}:{}", host.trim(), port);
    let address = target
        .to_socket_addrs()
        .map_err(|e| format!("resolve failed: {}", e))?
        .next()
        .ok_or_else(|| "no resolved address found".to_string())?;

    TcpStream::connect_timeout(&address, Duration::from_secs(5))
        .map(|_| format!("SMTP connection succeeded: {}", target))
        .map_err(|e| format!("SMTP connection failed: {}", e))
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
