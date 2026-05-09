use serde::Deserialize;
use std::io::Read;
use std::os::unix::net::UnixListener;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Deserialize)]
struct SocketCommand {
    cmd: String,
    path: Option<String>,
}

fn socket_path() -> PathBuf {
    dirs_next()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".minmark.sock")
}

fn dirs_next() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}

/// Shared flag so socket listener knows the frontend is ready.
pub struct FrontendReady(pub Arc<AtomicBool>);

pub fn start_socket_listener(app: AppHandle, ready: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let sock_path = socket_path();

        // Clean up old socket
        let _ = std::fs::remove_file(&sock_path);

        let listener = match UnixListener::bind(&sock_path) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("Failed to bind socket at {:?}: {}", sock_path, e);
                return;
            }
        };

        for stream in listener.incoming() {
            match stream {
                Ok(mut stream) => {
                    let mut buf = String::new();
                    if stream.read_to_string(&mut buf).is_ok() {
                        if let Ok(cmd) = serde_json::from_str::<SocketCommand>(&buf) {
                            if cmd.cmd == "open" {
                                if let Some(path) = cmd.path {
                                    // Wait for frontend to be ready before emitting
                                    let start = std::time::Instant::now();
                                    while !ready.load(Ordering::Relaxed) {
                                        if start.elapsed() > std::time::Duration::from_secs(10) {
                                            break;
                                        }
                                        std::thread::sleep(std::time::Duration::from_millis(100));
                                    }

                                    // Show window FIRST so the WKWebView is active when
                                    // ProseMirror renders into it. Rendering against a hidden
                                    // webview leaves the contenteditable in a stale paint
                                    // state on macOS and the file appears blank until the
                                    // user hides+shows the window.
                                    if let Some(w) = app.get_webview_window("main") {
                                        let _ = w.show();
                                        let _ = w.set_focus();
                                    }

                                    // Tiny pause for the webview to re-attach before we
                                    // trigger DOM mutations.
                                    std::thread::sleep(std::time::Duration::from_millis(20));

                                    let _ = app.emit("open-file", &path);
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Socket accept error: {}", e);
                }
            }
        }
    });
}

pub fn cleanup_socket() {
    let _ = std::fs::remove_file(socket_path());
}
