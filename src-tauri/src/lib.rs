mod fs_ops;
mod settings;
mod socket;
mod watcher;

use fs_ops::FileIndex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

struct PendingFiles(Mutex<Vec<String>>);

#[tauri::command]
fn get_cwd(state: tauri::State<'_, WorkingDir>) -> String {
    state.0.clone()
}

#[tauri::command]
fn frontend_ready(
    app: tauri::AppHandle,
    ready_state: tauri::State<'_, socket::FrontendReady>,
    pending: tauri::State<'_, PendingFiles>,
) {
    ready_state.0.store(true, Ordering::Relaxed);

    // Flush any files that arrived before frontend was ready
    if let Ok(mut files) = pending.0.lock() {
        for path in files.drain(..) {
            let _ = app.emit("open-file", &path);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();

            // Determine working directory: first CLI arg or cwd
            // When running via `tauri dev`, cargo starts in src-tauri/ — go up one level
            let cwd = std::env::args().nth(1).unwrap_or_else(|| {
                let dir = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
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

            // Create file index and build in background
            let file_index = FileIndex::new();
            app.manage(file_index.clone());

            let watch_folders = settings::get_search_folders();

            // Build index in background thread
            {
                let idx = file_index.clone();
                let folders = watch_folders.clone();
                let bg_handle = handle.clone();
                std::thread::spawn(move || {
                    let entries = fs_ops::build_index(&folders);
                    if let Ok(mut data) = idx.0.lock() {
                        *data = entries;
                    }
                    let _ = bg_handle.emit("index-ready", ());
                });
            }

            // Start file watcher with index
            watcher::start_watcher(handle.clone(), &watch_folders, file_index)
                .expect("Failed to start file watcher");

            // Frontend-ready flag for socket listener
            let ready = Arc::new(AtomicBool::new(false));
            app.manage(socket::FrontendReady(ready.clone()));
            app.manage(PendingFiles(Mutex::new(Vec::new())));

            // Start UDS socket listener
            socket::start_socket_listener(handle.clone(), ready);

            // Store cwd for frontend
            app.manage(WorkingDir(cwd));

            // Native menu
            let settings_item = MenuItemBuilder::new("Settings...")
                .id("settings")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let app_submenu = SubmenuBuilder::new(app, "Minmark")
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
            frontend_ready,
            fs_ops::list_directory,
            fs_ops::read_file,
            fs_ops::write_file,
            fs_ops::search_files,
            settings::get_search_folders,
            settings::open_settings,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Hide instead of closing — standard macOS behavior
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building minmark");

    app.run(move |app_handle, event| match &event {
        tauri::RunEvent::Reopen { .. } => {
            if let Some(w) = app_handle.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        tauri::RunEvent::Opened { urls } => {
            for url in urls {
                let path = if url.scheme() == "file" {
                    url.to_file_path()
                        .ok()
                        .map(|p| p.to_string_lossy().to_string())
                } else {
                    None
                };
                if let Some(path) = path {
                    if let Some(ready_state) = app_handle.try_state::<socket::FrontendReady>() {
                        if ready_state.0.load(Ordering::Relaxed) {
                            // Show window before emitting so the webview is active when
                            // ProseMirror renders the file.
                            if let Some(w) = app_handle.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                            let _ = app_handle.emit("open-file", &path);
                        } else if let Some(pending) = app_handle.try_state::<PendingFiles>() {
                            if let Ok(mut files) = pending.0.lock() {
                                files.push(path);
                            }
                        }
                    }
                }
            }
        }
        tauri::RunEvent::ExitRequested { .. } => {
            socket::cleanup_socket();
        }
        _ => {}
    });
}

struct WorkingDir(String);
