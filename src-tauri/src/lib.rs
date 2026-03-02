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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();

            // Determine working directory: first CLI arg or cwd
            let cwd = std::env::args()
                .nth(1)
                .unwrap_or_else(|| {
                    std::env::current_dir()
                        .unwrap_or_else(|_| std::path::PathBuf::from("."))
                        .to_string_lossy()
                        .to_string()
                });

            // Spawn PTY
            let pty_state =
                PtyState::spawn(handle.clone(), cwd.clone()).expect("Failed to spawn PTY");
            app.manage(pty_state);

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
            fs_ops::list_directory,
            fs_ops::read_file,
            fs_ops::write_file,
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
