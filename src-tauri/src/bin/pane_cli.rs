use std::io::Write;
use std::os::unix::net::UnixStream;
use std::path::PathBuf;

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() < 3 || args[1] != "open" {
        eprintln!("Usage: pane open <file.md>");
        std::process::exit(1);
    }

    let file_arg = &args[2];
    let abs_path = if PathBuf::from(file_arg).is_absolute() {
        PathBuf::from(file_arg)
    } else {
        std::env::current_dir()
            .expect("Failed to get cwd")
            .join(file_arg)
    };

    let abs_path_str = abs_path.to_string_lossy().to_string();

    let sock_path = dirs_home().join(".pane.sock");

    let mut stream = match UnixStream::connect(&sock_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Failed to connect to Pane (is it running?): {}", e);
            std::process::exit(1);
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

    println!("Opening {} in Pane", abs_path_str);
}

fn dirs_home() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp"))
}
