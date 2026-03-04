use crate::fs_ops::{FileEntry, FileIndex};
use notify::EventKind;
use notify_debouncer_full::{new_debouncer, notify::RecursiveMode, DebounceEventResult};
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub fn start_watcher(app: AppHandle, paths: &[String], index: FileIndex) -> Result<(), String> {
    let watch_paths: Vec<String> = paths.to_vec();
    let app_handle = app.clone();

    std::thread::spawn(move || {
        let rt_app = app_handle.clone();
        let idx = index.clone();
        let mut debouncer = new_debouncer(
            Duration::from_millis(500),
            None,
            move |result: DebounceEventResult| match result {
                Ok(events) => {
                    let mut changed = false;
                    let mut modified_files: Vec<String> = Vec::new();
                    let mut added: Vec<FileEntry> = Vec::new();
                    let mut removed: Vec<String> = Vec::new();

                    for event in events.iter() {
                        let kind = &event.event.kind;
                        let paths = &event.event.paths;
                        let is_relevant = paths.iter().any(|p| {
                            p.extension().map(|e| e == "md").unwrap_or(false) || p.is_dir()
                        });

                        if !is_relevant {
                            continue;
                        }

                        match kind {
                            EventKind::Create(_) => {
                                changed = true;
                                for p in paths {
                                    if p.extension().map(|e| e == "md").unwrap_or(false) {
                                        let path_str = p.to_string_lossy().to_string();
                                        let name = p
                                            .file_name()
                                            .unwrap_or_default()
                                            .to_string_lossy()
                                            .to_string();
                                        added.push(FileEntry {
                                            name,
                                            path: path_str.clone(),
                                        });
                                        modified_files.push(path_str);
                                    }
                                }
                            }
                            EventKind::Remove(_) => {
                                changed = true;
                                for p in paths {
                                    if p.extension().map(|e| e == "md").unwrap_or(false) {
                                        let path_str = p.to_string_lossy().to_string();
                                        removed.push(path_str.clone());
                                        modified_files.push(path_str);
                                    }
                                }
                            }
                            // Catch-all: handles Modify, Access, Any, etc.
                            // On macOS, file creation often arrives as Modify events.
                            _ => {
                                for p in paths {
                                    if p.extension().map(|e| e == "md").unwrap_or(false) {
                                        changed = true;
                                        let path_str = p.to_string_lossy().to_string();
                                        modified_files.push(path_str.clone());
                                        if p.exists() {
                                            let name = p
                                                .file_name()
                                                .unwrap_or_default()
                                                .to_string_lossy()
                                                .to_string();
                                            added.push(FileEntry {
                                                name,
                                                path: path_str,
                                            });
                                        } else {
                                            removed.push(path_str);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Incremental index update
                    if !removed.is_empty() || !added.is_empty() {
                        if let Ok(mut data) = idx.0.lock() {
                            if !removed.is_empty() {
                                data.retain(|e| !removed.contains(&e.path));
                            }
                            for entry in added {
                                if !data.iter().any(|e| e.path == entry.path) {
                                    data.push(entry);
                                }
                            }
                        }
                    }

                    if changed {
                        let _ = rt_app.emit("fs-changed", ());
                    }
                    modified_files.sort();
                    modified_files.dedup();
                    if !modified_files.is_empty() {
                        let _ = rt_app.emit("files-modified", modified_files);
                    }
                }
                Err(errors) => {
                    for e in errors {
                        eprintln!("Watcher error: {:?}", e);
                    }
                }
            },
        )
        .expect("Failed to create debouncer");

        for wp in &watch_paths {
            let _ = debouncer.watch(Path::new(wp), RecursiveMode::Recursive);
        }

        loop {
            std::thread::sleep(Duration::from_secs(3600));
        }
    });

    Ok(())
}
