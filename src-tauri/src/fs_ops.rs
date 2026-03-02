use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<DirEntry>>,
}

fn should_include(path: &Path) -> bool {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    // Skip hidden files/dirs
    if name.starts_with('.') {
        return false;
    }
    // Skip common non-relevant dirs
    if path.is_dir() {
        return !matches!(
            name.as_ref(),
            "node_modules" | "target" | ".git" | "dist" | "build"
        );
    }
    // Only include .md files
    path.extension()
        .map(|ext| ext == "md")
        .unwrap_or(false)
}

fn build_tree(path: &Path) -> Option<Vec<DirEntry>> {
    let entries = fs::read_dir(path).ok()?;
    let mut result: Vec<DirEntry> = Vec::new();

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if !should_include(&entry_path) {
            continue;
        }

        let name = entry_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        if entry_path.is_dir() {
            let children = build_tree(&entry_path);
            // Only include dirs that contain .md files (directly or nested)
            if let Some(ref kids) = children {
                if !kids.is_empty() {
                    result.push(DirEntry {
                        name,
                        path: entry_path.to_string_lossy().to_string(),
                        is_dir: true,
                        children,
                    });
                }
            }
        } else {
            result.push(DirEntry {
                name,
                path: entry_path.to_string_lossy().to_string(),
                is_dir: false,
                children: None,
            });
        }
    }

    result.sort_by(|a, b| {
        // Dirs first, then alphabetical
        b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name))
    });

    Some(result)
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    build_tree(p).ok_or_else(|| "Failed to read directory".to_string())
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
}
