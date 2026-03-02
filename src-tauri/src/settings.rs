use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

#[derive(Deserialize)]
struct Settings {
    search_folders: Option<Vec<String>>,
}

fn config_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    PathBuf::from(home).join(".config/pane/settings.json")
}

fn expand_tilde(path: &str) -> String {
    if path.starts_with('~') {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
        format!("{}{}", home, &path[1..])
    } else {
        path.to_string()
    }
}

#[tauri::command]
pub fn get_settings_path() -> String {
    let path = config_path();
    if !path.exists() {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&path, "{\n  \"search_folders\": [\"~\"]\n}\n");
    }
    path.to_string_lossy().to_string()
}

#[tauri::command]
pub fn get_search_folders() -> Vec<String> {
    let path = config_path();
    if let Ok(contents) = fs::read_to_string(&path) {
        if let Ok(settings) = serde_json::from_str::<Settings>(&contents) {
            if let Some(folders) = settings.search_folders {
                if !folders.is_empty() {
                    return folders.iter().map(|f| expand_tilde(f)).collect();
                }
            }
        }
    }
    // Default: home directory
    vec![std::env::var("HOME").unwrap_or_else(|_| "/".to_string())]
}
