import { invoke } from "@tauri-apps/api/core";
import {
  createEditor,
  destroyEditor,
  focusProseMirror,
  getMarkdownFromView,
} from "./editor/view";

interface Tab {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  unsaved: boolean;
}

let tabs: Tab[] = [];
let activeTabPath: string | null = null;

// --- View mode ---
let sourceMode = false;

// --- Switcher state ---
let switcherOpen = false;
let switcherIndex = 0;

export async function openFile(path: string) {
  const existing = tabs.find((t) => t.path === path);
  if (existing) {
    switchTab(path);
    return;
  }

  const content = await invoke<string>("read_file", { path });
  const name = path.split("/").pop() || path;
  tabs.push({ path, name, content, savedContent: content, unsaved: false });
  switchTab(path);
}

function syncCurrentTabContent() {
  if (!activeTabPath) return;
  const tab = tabs.find((t) => t.path === activeTabPath);
  if (!tab) return;

  if (sourceMode) {
    const source = document.getElementById("source-editor") as HTMLTextAreaElement;
    tab.content = source.value;
  } else {
    const md = getMarkdownFromView();
    if (md !== null) tab.content = md;
  }
}

function switchTab(path: string) {
  syncCurrentTabContent();

  activeTabPath = path;
  updateUnsavedIndicator();

  const tab = tabs.find((t) => t.path === path);
  if (!tab) return;

  const container = document.getElementById("editor-container")!;
  const source = document.getElementById("source-editor") as HTMLTextAreaElement;
  const empty = document.getElementById("editor-empty")!;

  empty.classList.add("hidden");

  if (sourceMode) {
    container.classList.remove("visible");
    source.classList.remove("hidden");
    source.value = tab.content;
    destroyEditor();
    while (container.firstChild) container.removeChild(container.firstChild);
    source.setSelectionRange(0, 0);
    source.focus({ preventScroll: true });
  } else {
    source.classList.add("hidden");
    container.classList.add("visible");
    destroyEditor();
    while (container.firstChild) container.removeChild(container.firstChild);

    const dir = path.substring(0, path.lastIndexOf("/"));
    createEditor(container, tab.content, dir, (markdown) => {
      onContentChanged(path, markdown);
    });
  }
}

function updateUnsavedIndicator() {
  const el = document.getElementById("unsaved-indicator")!;
  const tab = tabs.find((t) => t.path === activeTabPath);
  if (tab?.unsaved) {
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

function onContentChanged(path: string, markdown: string) {
  const tab = tabs.find((t) => t.path === path);
  if (!tab) return;
  tab.content = markdown;
  tab.unsaved = markdown !== tab.savedContent;
  updateUnsavedIndicator();
}

export async function reloadTabFromDisk(path: string) {
  const tab = tabs.find((t) => t.path === path);
  if (!tab) return;
  if (tab.unsaved) return; // don't overwrite unsaved local changes

  const content = await invoke<string>("read_file", { path });
  if (content === tab.content) return; // no actual change

  tab.content = content;
  tab.savedContent = content;

  // If this tab is currently active, re-render it
  if (activeTabPath === path) {
    const container = document.getElementById("editor-container")!;
    const source = document.getElementById("source-editor") as HTMLTextAreaElement;

    if (sourceMode) {
      source.value = content;
    } else {
      destroyEditor();
      while (container.firstChild) container.removeChild(container.firstChild);
      const dir = path.substring(0, path.lastIndexOf("/"));
      createEditor(container, content, dir, (markdown) => {
        onContentChanged(path, markdown);
      });
    }
  }
}

export async function saveActiveTab() {
  if (!activeTabPath) return;
  const tab = tabs.find((t) => t.path === activeTabPath);
  if (!tab || !tab.unsaved) return;

  syncCurrentTabContent();

  try {
    await invoke("write_file", { path: tab.path, content: tab.content });
    tab.savedContent = tab.content;
    tab.unsaved = false;
    updateUnsavedIndicator();
  } catch (e) {
    console.error("Failed to save:", e);
  }
}

export function closeActiveTab() {
  if (!activeTabPath) return;
  closeTab(activeTabPath);
}

function closeTab(path: string) {
  const idx = tabs.findIndex((t) => t.path === path);
  if (idx === -1) return;

  tabs.splice(idx, 1);

  if (activeTabPath === path) {
    if (tabs.length > 0) {
      const newIdx = Math.min(idx, tabs.length - 1);
      switchTab(tabs[newIdx].path);
    } else {
      activeTabPath = null;
      updateUnsavedIndicator();
      destroyEditor();
      const container = document.getElementById("editor-container")!;
      container.classList.remove("visible");
      while (container.firstChild) container.removeChild(container.firstChild);
      document.getElementById("editor-empty")!.classList.remove("hidden");
    }
  }
}

// --- Switcher ---

function renderSwitcher() {
  const row = document.getElementById("switcher-row")!;
  while (row.firstChild) row.removeChild(row.firstChild);

  tabs.forEach((tab, i) => {
    const card = document.createElement("div");
    card.className = `switcher-card${i === switcherIndex ? " selected" : ""}`;

    const preview = document.createElement("div");
    preview.className = "switcher-preview";
    preview.textContent = tab.content.slice(0, 400);
    card.appendChild(preview);

    const label = document.createElement("div");
    label.className = "switcher-label";
    if (tab.unsaved) {
      const dot = document.createElement("span");
      dot.className = "unsaved-dot";
      label.appendChild(dot);
    }
    const nameSpan = document.createElement("span");
    nameSpan.textContent = tab.name;
    label.appendChild(nameSpan);
    card.appendChild(label);

    card.addEventListener("click", () => {
      switcherIndex = i;
      closeSwitcher(true);
    });

    row.appendChild(card);
  });

  // Scroll selected card into view
  const selected = row.children[switcherIndex] as HTMLElement | undefined;
  selected?.scrollIntoView({ block: "nearest", inline: "center" });
}

export function toggleSwitcher() {
  if (tabs.length === 0) return;

  if (switcherOpen) {
    // Cmd still held, T pressed again — cycle forward
    switcherIndex = (switcherIndex + 1) % tabs.length;
    renderSwitcher();
  } else {
    // Open with next file pre-selected
    const activeIdx = tabs.findIndex((t) => t.path === activeTabPath);
    switcherIndex = tabs.length > 1 ? (activeIdx + 1) % tabs.length : 0;
    switcherOpen = true;
    document.getElementById("switcher-overlay")!.classList.remove("hidden");
    renderSwitcher();
  }
}

function closeSwitcher(confirm: boolean) {
  if (!switcherOpen) return;
  switcherOpen = false;
  document.getElementById("switcher-overlay")!.classList.add("hidden");
  if (confirm && tabs[switcherIndex]) {
    switchTab(tabs[switcherIndex].path);
  }
  focusProseMirror();
}

export function handleSwitcherKeydown(e: KeyboardEvent): boolean {
  if (!switcherOpen) return false;

  if (e.key === "Escape") {
    e.preventDefault();
    closeSwitcher(false);
    return true;
  }
  return false;
}

export function handleSwitcherKeyup(e: KeyboardEvent) {
  if (!switcherOpen) return;
  // Releasing Cmd (Meta) or Ctrl confirms the selection
  if (e.key === "Meta" || e.key === "Control") {
    closeSwitcher(true);
  }
}

// --- Source mode toggle ---

function getScrollRatio(): number {
  if (sourceMode) {
    const source = document.getElementById("source-editor") as HTMLTextAreaElement;
    const max = source.scrollHeight - source.clientHeight;
    return max > 0 ? source.scrollTop / max : 0;
  } else {
    const container = document.getElementById("editor-container")!;
    const max = container.scrollHeight - container.clientHeight;
    return max > 0 ? container.scrollTop / max : 0;
  }
}

function setScrollRatio(ratio: number) {
  requestAnimationFrame(() => {
    if (sourceMode) {
      const source = document.getElementById("source-editor") as HTMLTextAreaElement;
      source.scrollTop = ratio * (source.scrollHeight - source.clientHeight);
    } else {
      const container = document.getElementById("editor-container")!;
      container.scrollTop = ratio * (container.scrollHeight - container.clientHeight);
    }
  });
}

export function toggleSourceMode() {
  if (!activeTabPath) return;

  const ratio = getScrollRatio();
  syncCurrentTabContent();
  sourceMode = !sourceMode;

  // Re-render the current tab in the new mode
  const path = activeTabPath;
  activeTabPath = null;
  switchTab(path);
  setScrollRatio(ratio);
}

export function initSourceEditor() {
  const source = document.getElementById("source-editor") as HTMLTextAreaElement;
  source.addEventListener("input", () => {
    if (!activeTabPath) return;
    const tab = tabs.find((t) => t.path === activeTabPath);
    if (tab) {
      tab.content = source.value;
      tab.unsaved = source.value !== tab.savedContent;
      updateUnsavedIndicator();
    }
  });
}

export function focusEditor() {
  if (sourceMode) {
    (document.getElementById("source-editor") as HTMLTextAreaElement).focus();
  } else {
    focusProseMirror();
  }
}
