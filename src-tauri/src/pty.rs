use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub struct PtyState {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
}

impl PtyState {
    pub fn spawn(app: AppHandle, cwd: String) -> Result<Self, String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        let mut cmd = CommandBuilder::new_default_prog();
        cmd.cwd(&cwd);

        pair.slave
            .spawn_command(cmd)
            .map_err(|e| e.to_string())?;

        // Drop slave — we only need master
        drop(pair.slave);

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| e.to_string())?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| e.to_string())?;

        // Spawn reader thread that emits pty-output events
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app.emit("pty-output", &data);
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(PtyState {
            writer: Mutex::new(writer),
            master: Mutex::new(pair.master),
        })
    }
}

#[tauri::command]
pub fn write_to_pty(state: tauri::State<'_, PtyState>, data: String) -> Result<(), String> {
    let mut writer = state.writer.lock().map_err(|e| e.to_string())?;
    writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn resize_pty(state: tauri::State<'_, PtyState>, cols: u16, rows: u16) -> Result<(), String> {
    let master = state.master.lock().map_err(|e| e.to_string())?;
    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}
