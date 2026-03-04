use std::io::Write;
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::time::{Duration, Instant};

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        eprintln!("Usage: mm <file>");
        std::process::exit(1);
    }

    // Support both `mm <file>` and `mm open <file>`
    let file_arg = if args[1] == "open" && args.len() >= 3 {
        &args[2]
    } else {
        &args[1]
    };
    let abs_path = if PathBuf::from(file_arg).is_absolute() {
        PathBuf::from(file_arg)
    } else {
        std::env::current_dir()
            .expect("Failed to get cwd")
            .join(file_arg)
    };

    let abs_path_str = abs_path.to_string_lossy().to_string();
    let sock_path = dirs_home().join(".minmark.sock");

    // Try to connect; if app isn't running, launch it and retry
    let mut stream = match UnixStream::connect(&sock_path) {
        Ok(s) => s,
        Err(_) => {
            // Launch the app
            let _ = std::process::Command::new("open")
                .arg("-a")
                .arg("Minmark")
                .spawn();

            // Wait for socket to become available
            let start = Instant::now();
            let timeout = Duration::from_secs(10);
            loop {
                std::thread::sleep(Duration::from_millis(200));
                if let Ok(s) = UnixStream::connect(&sock_path) {
                    break s;
                }
                if start.elapsed() > timeout {
                    eprintln!("Timed out waiting for Minmark to start");
                    std::process::exit(1);
                }
            }
        }
    };

    let msg = serde_json::json!({
        "cmd": "open",
        "path": abs_path_str
    });

    if let Err(e) = stream.write_all(msg.to_string().as_bytes()) {
        eprintln!("Failed to send command: {}", e);
        std::process::exit(1);
    }
}

fn dirs_home() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp"))
}
