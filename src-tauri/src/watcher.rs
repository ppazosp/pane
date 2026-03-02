use notify::EventKind;
use notify_debouncer_full::{new_debouncer, notify::RecursiveMode, DebounceEventResult};
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub fn start_watcher(app: AppHandle, path: &str) -> Result<(), String> {
    let watch_path = path.to_string();
    let app_handle = app.clone();

    std::thread::spawn(move || {
        let rt_app = app_handle.clone();
        let mut debouncer = new_debouncer(
            Duration::from_millis(500),
            None,
            move |result: DebounceEventResult| match result {
                Ok(events) => {
                    let mut changed = false;
                    for event in events.iter() {
                        let dominated_event = &event.event;
                        let dominated_kind = &dominated_event.kind;
                        let dominated_paths = &dominated_event.paths;
                        let dominated_is_relevant = dominated_paths.iter().any(|p| {
                            p.extension().map(|e| e == "md").unwrap_or(false) || p.is_dir()
                        });

                        if dominated_is_relevant {
                            match dominated_kind {
                                EventKind::Create(_)
                                | EventKind::Remove(_)
                                | EventKind::Modify(_) => {
                                    changed = true;
                                }
                                _ => {}
                            }
                        }
                    }
                    if changed {
                        let _ = rt_app.emit("fs-changed", ());
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

        debouncer
            .watch(Path::new(&watch_path), RecursiveMode::Recursive)
            .expect("Failed to watch path");

        // Keep thread alive — dropping debouncer stops watching
        loop {
            std::thread::sleep(Duration::from_secs(3600));
        }
    });

    Ok(())
}
