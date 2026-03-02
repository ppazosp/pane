import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  children: DirEntry[] | null;
}

let rootPath = "";
let onFileOpen: (path: string) => void = () => {};

export async function initFileTree(
  cwd: string,
  fileOpenCallback: (path: string) => void
) {
  rootPath = cwd;
  onFileOpen = fileOpenCallback;

  await refreshTree();

  await listen("fs-changed", async () => {
    await refreshTree();
  });
}

async function refreshTree() {
  const container = document.getElementById("file-tree")!;
  // Clear existing children safely
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  try {
    const entries = await invoke<DirEntry[]>("list_directory", {
      path: rootPath,
    });
    const ul = renderEntries(entries);
    container.appendChild(ul);
  } catch {
    const msg = document.createElement("div");
    msg.style.padding = "12px";
    msg.style.color = "var(--text-muted)";
    msg.style.fontSize = "12px";
    msg.textContent = "No .md files found";
    container.appendChild(msg);
  }
}

function renderEntries(entries: DirEntry[]): HTMLUListElement {
  const ul = document.createElement("ul");

  for (const entry of entries) {
    const li = document.createElement("li");

    const item = document.createElement("div");
    item.className = `tree-item ${entry.isDir ? "dir" : "file"}`;

    const icon = document.createElement("span");
    icon.className = "tree-icon";
    item.appendChild(icon);

    const label = document.createElement("span");
    label.textContent = entry.name;
    item.appendChild(label);

    li.appendChild(item);

    if (entry.isDir && entry.children) {
      const childUl = renderEntries(entry.children);
      childUl.style.display = "none";

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = item.classList.toggle("open");
        childUl.style.display = isOpen ? "block" : "none";
      });

      li.appendChild(childUl);
    } else {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        onFileOpen(entry.path);
      });
    }

    ul.appendChild(li);
  }

  return ul;
}

// Maintain flat list of all .md files for quick open
let allFiles: { name: string; path: string }[] = [];

export async function getAllFiles(): Promise<{ name: string; path: string }[]> {
  try {
    const entries = await invoke<DirEntry[]>("list_directory", {
      path: rootPath,
    });
    allFiles = [];
    flattenEntries(entries);
    return allFiles;
  } catch {
    return [];
  }
}

function flattenEntries(entries: DirEntry[]) {
  for (const entry of entries) {
    if (entry.isDir && entry.children) {
      flattenEntries(entry.children);
    } else if (!entry.isDir) {
      allFiles.push({ name: entry.name, path: entry.path });
    }
  }
}
