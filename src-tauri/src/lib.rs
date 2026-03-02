mod fs_ops;
mod pty;
mod settings;
mod socket;
mod watcher;

use pty::PtyState;
use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

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

            // Native menu
            let settings_item = MenuItemBuilder::new("Settings...")
                .id("settings")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let app_submenu = SubmenuBuilder::new(app, "Pane")
                .about(Some(AboutMetadataBuilder::new().build()))
                .separator()
                .item(&settings_item)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            let edit_submenu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&app_submenu, &edit_submenu])
                .build()?;

            app.set_menu(menu)?;

            app.on_menu_event(move |app_handle, event| {
                if event.id() == settings_item.id() {
                    let _ = app_handle.emit("open-settings", ());
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_cwd,
            fs_ops::list_directory,
            fs_ops::read_file,
            fs_ops::write_file,
            fs_ops::search_files,
            settings::get_search_folders,
            settings::get_settings_path,
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
