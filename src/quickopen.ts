import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface FileEntry {
  name: string;
  path: string;
}

// --- Cache ---
let cachedFiles: FileEntry[] | null = null;

async function getFiles(): Promise<FileEntry[]> {
  if (cachedFiles) return cachedFiles;
  try {
    const folders = await invoke<string[]>("get_search_folders");
    cachedFiles = await invoke<FileEntry[]>("search_files", { folders });
  } catch {
    cachedFiles = [];
  }
  return cachedFiles;
}

function invalidateCache() {
  cachedFiles = null;
}

// --- State ---
let isOpen = false;
let selectedIndex = 0;
let filteredFiles: FileEntry[] = [];
let onSelect: (path: string) => void = () => {};

// --- Debounce ---
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function initQuickOpen(selectCallback: (path: string) => void) {
  onSelect = selectCallback;

  // Invalidate cache on filesystem changes
  listen("fs-changed", invalidateCache);

  const overlay = document.getElementById("quickopen-overlay")!;
  const input = document.getElementById("quickopen-input") as HTMLInputElement;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeQuickOpen();
  });

  input.addEventListener("input", () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => filterFiles(input.value), 150);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeQuickOpen();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSelection(Math.min(selectedIndex + 1, filteredFiles.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSelection(Math.max(selectedIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredFiles[selectedIndex]) {
        onSelect(filteredFiles[selectedIndex].path);
        closeQuickOpen();
      }
    }
  });
}

export async function toggleQuickOpen() {
  if (isOpen) {
    closeQuickOpen();
  } else {
    await openQuickOpen();
  }
}

async function openQuickOpen() {
  isOpen = true;
  const overlay = document.getElementById("quickopen-overlay")!;
  const input = document.getElementById("quickopen-input") as HTMLInputElement;

  overlay.classList.remove("hidden");
  input.value = "";
  selectedIndex = 0;

  filteredFiles = await getFiles();
  renderList();
  input.focus();
}

function closeQuickOpen() {
  isOpen = false;
  document.getElementById("quickopen-overlay")!.classList.add("hidden");
}

async function filterFiles(query: string) {
  const allFiles = await getFiles();
  const q = query.toLowerCase();

  if (!q) {
    filteredFiles = allFiles;
  } else {
    filteredFiles = allFiles
      .map((f) => {
        const name = f.name.toLowerCase();
        const path = f.path.toLowerCase();
        let score = 0;
        if (name === q) score = 4;
        else if (name.startsWith(q)) score = 3;
        else if (name.includes(q)) score = 2;
        else if (fuzzyMatch(q, name) || fuzzyMatch(q, path)) score = 1;
        return { ...f, score };
      })
      .filter((f) => f.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  selectedIndex = 0;
  renderList();
}

function fuzzyMatch(query: string, target: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

// --- DOM: move selection without full rebuild ---
function moveSelection(newIndex: number) {
  if (newIndex === selectedIndex) return;
  const list = document.getElementById("quickopen-list")!;
  const items = list.children;

  if (items[selectedIndex]) items[selectedIndex].classList.remove("selected");
  selectedIndex = newIndex;
  if (items[selectedIndex]) {
    items[selectedIndex].classList.add("selected");
    (items[selectedIndex] as HTMLElement).scrollIntoView({ block: "nearest" });
  }
}

function renderList() {
  const list = document.getElementById("quickopen-list")!;

  while (list.firstChild) list.removeChild(list.firstChild);

  for (let i = 0; i < filteredFiles.length; i++) {
    const file = filteredFiles[i];
    const li = document.createElement("li");
    if (i === selectedIndex) li.className = "selected";

    const nameSpan = document.createElement("span");
    nameSpan.className = "file-name";
    nameSpan.textContent = file.name;
    li.appendChild(nameSpan);

    const pathSpan = document.createElement("span");
    pathSpan.className = "file-path";
    pathSpan.textContent = file.path;
    li.appendChild(pathSpan);

    li.addEventListener("click", () => {
      onSelect(file.path);
      closeQuickOpen();
    });

    li.addEventListener("mouseenter", () => {
      moveSelection(i);
    });

    list.appendChild(li);
  }

  const selected = list.querySelector(".selected") as HTMLElement;
  if (selected) selected.scrollIntoView({ block: "nearest" });
}
