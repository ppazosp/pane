use serde::Serialize;
use std::fs;
use std::path::Path;

const MAX_DEPTH: u32 = 6;

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
            "node_modules"
                | "target"
                | "dist"
                | "build"
                | "Library"
                | "Applications"
                | "Pictures"
                | "Music"
                | "Movies"
                | "Public"
        );
    }
    // Only include .md files
    path.extension()
        .map(|ext| ext == "md")
        .unwrap_or(false)
}

fn build_tree(path: &Path, depth: u32) -> Option<Vec<DirEntry>> {
    if depth >= MAX_DEPTH {
        return Some(Vec::new());
    }

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
            let children = build_tree(&entry_path, depth + 1);
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
    build_tree(p, 0).ok_or_else(|| "Failed to read directory".to_string())
}

#[derive(Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
}

fn collect_md_files(dir: &Path, depth: u32, out: &mut Vec<FileEntry>) {
    if depth >= MAX_DEPTH {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let entry_path = entry.path();
        if !should_include(&entry_path) {
            continue;
        }
        if entry_path.is_dir() {
            collect_md_files(&entry_path, depth + 1, out);
        } else {
            let name = entry_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            out.push(FileEntry {
                name,
                path: entry_path.to_string_lossy().to_string(),
            });
        }
    }
}

#[tauri::command]
pub fn search_files(folders: Vec<String>) -> Vec<FileEntry> {
    let mut results = Vec::new();
    for folder in &folders {
        let p = Path::new(folder);
        if p.exists() {
            collect_md_files(p, 0, &mut results);
        }
    }
    results
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
}
