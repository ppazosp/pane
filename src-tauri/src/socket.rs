use serde::Deserialize;
use std::io::Read;
use std::os::unix::net::UnixListener;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

#[derive(Deserialize)]
struct SocketCommand {
    cmd: String,
    path: Option<String>,
}

fn socket_path() -> PathBuf {
    dirs_next().unwrap_or_else(|| PathBuf::from("/tmp")).join(".pane.sock")
}

fn dirs_next() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}

pub fn start_socket_listener(app: AppHandle) {
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
