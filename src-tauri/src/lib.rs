mod fs_ops;
mod pty;
mod socket;
mod watcher;

use pty::PtyState;
use tauri::Manager;

#[tauri::command]
fn get_cwd(state: tauri::State<'_, WorkingDir>) -> String {
    state.0.clone()
}

#[tauri::command]
fn get_home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();

            // Determine working directory: first CLI arg or cwd
            // When running via `tauri dev`, cargo starts in src-tauri/ — go up one level
            let cwd = std::env::args()
                .nth(1)
                .unwrap_or_else(|| {
                    let dir = std::env::current_dir()
                        .unwrap_or_else(|_| std::path::PathBuf::from("."));
                    let dir = if dir.ends_with("src-tauri") {
                        dir.parent().unwrap_or(&dir).to_path_buf()
                    } else {
                        dir
                    };
                    // When launched from Finder, cwd is "/" — fall back to $HOME
                    if dir == std::path::PathBuf::from("/") {
                        std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
                    } else {
                        dir.to_string_lossy().to_string()
                    }
                });

            // PTY state (spawned lazily by frontend after terminal is sized)
            app.manage(PtyState::new());

            // Start file watcher
            watcher::start_watcher(handle.clone(), &cwd)
                .expect("Failed to start file watcher");

            // Start UDS socket listener
            socket::start_socket_listener(handle.clone());

            // Store cwd for frontend
            app.manage(WorkingDir(cwd));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_cwd,
            get_home_dir,
            fs_ops::list_directory,
            fs_ops::read_file,
            fs_ops::write_file,
            pty::init_pty,
            pty::write_to_pty,
            pty::resize_pty,
        ])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                socket::cleanup_socket();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running pane");
}

struct WorkingDir(String);
