use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub struct PtyState {
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
}

impl PtyState {
    pub fn new() -> Self {
        PtyState {
            writer: Mutex::new(None),
            master: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn init_pty(
    state: tauri::State<'_, PtyState>,
    app: AppHandle,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l"); // login shell — loads user profile
    cmd.cwd(&cwd);
    cmd.env("HOME", std::env::var("HOME").unwrap_or_else(|_| "/".to_string()));
    cmd.env("TERM", "xterm-256color");

    let _child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;

    drop(pair.slave);

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;

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

    *state.writer.lock().map_err(|e| e.to_string())? = Some(writer);
    *state.master.lock().map_err(|e| e.to_string())? = Some(pair.master);

    Ok(())
}

#[tauri::command]
pub fn write_to_pty(state: tauri::State<'_, PtyState>, data: String) -> Result<(), String> {
    let mut guard = state.writer.lock().map_err(|e| e.to_string())?;
    let writer = guard.as_mut().ok_or("PTY not initialized")?;
    writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn resize_pty(state: tauri::State<'_, PtyState>, cols: u16, rows: u16) -> Result<(), String> {
    let guard = state.master.lock().map_err(|e| e.to_string())?;
    let Some(master) = guard.as_ref() else {
        return Ok(()); // PTY not spawned yet, ignore
    };
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
