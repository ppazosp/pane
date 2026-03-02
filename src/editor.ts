import { invoke } from "@tauri-apps/api/core";
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
  serializerCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";

interface Tab {
  path: string;
  name: string;
  content: string;
  unsaved: boolean;
}

let tabs: Tab[] = [];
let activeTabPath: string | null = null;
let editor: Editor | null = null;

export async function openFile(path: string) {
  // If tab already exists, switch to it
  const existing = tabs.find((t) => t.path === path);
  if (existing) {
    await switchTab(path);
    return;
  }

  // Read file from disk
  const content = await invoke<string>("read_file", { path });
  const name = path.split("/").pop() || path;

  const tab: Tab = { path, name, content, unsaved: false };
  tabs.push(tab);
  await switchTab(path);
}

async function switchTab(path: string) {
  activeTabPath = path;
  renderTabs();

  const tab = tabs.find((t) => t.path === path);
  if (!tab) return;

  const container = document.getElementById("editor-container")!;
  const empty = document.getElementById("editor-empty")!;

  container.classList.add("visible");
  empty.classList.add("hidden");

  // Destroy existing editor
  if (editor) {
    // Save current content before switching
    await editor.destroy();
    editor = null;
  }

  // Clear container safely
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  // Create new editor
  editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, container);
      ctx.set(defaultValueCtx, tab.content);
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prevMarkdown) => {
        if (markdown !== prevMarkdown) {
          onContentChanged(path, markdown);
        }
      });
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .create();
}

function onContentChanged(path: string, markdown: string) {
  const tab = tabs.find((t) => t.path === path);
  if (!tab) return;

  tab.content = markdown;

  if (!tab.unsaved) {
    tab.unsaved = true;
    renderTabs();
  }
}

async function saveFile(path: string) {
  const tab = tabs.find((t) => t.path === path);
  if (!tab || !tab.unsaved) return;

  try {
    await invoke("write_file", { path, content: tab.content });
    tab.unsaved = false;
    renderTabs();
  } catch (e) {
    console.error("Failed to save:", e);
  }
}

export function saveActiveTab() {
  if (activeTabPath) saveFile(activeTabPath);
}

export function closeTab(path: string) {
  const idx = tabs.findIndex((t) => t.path === path);
  if (idx === -1) return;

  tabs.splice(idx, 1);

  if (activeTabPath === path) {
    if (tabs.length > 0) {
      const newIdx = Math.min(idx, tabs.length - 1);
      switchTab(tabs[newIdx].path);
    } else {
      activeTabPath = null;
      if (editor) {
        editor.destroy();
        editor = null;
      }
      const container = document.getElementById("editor-container")!;
      container.classList.remove("visible");
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      document.getElementById("editor-empty")!.classList.remove("hidden");
      renderTabs();
    }
  } else {
    renderTabs();
  }
}

export function closeActiveTab() {
  if (activeTabPath) {
    closeTab(activeTabPath);
  }
}

function renderTabs() {
  const tabBar = document.getElementById("tab-bar")!;

  while (tabBar.firstChild) {
    tabBar.removeChild(tabBar.firstChild);
  }

  for (const tab of tabs) {
    const tabEl = document.createElement("div");
    tabEl.className = `tab${tab.path === activeTabPath ? " active" : ""}${tab.unsaved ? " unsaved" : ""}`;

    const dot = document.createElement("span");
    dot.className = "unsaved-dot";
    tabEl.appendChild(dot);

    const label = document.createElement("span");
    label.textContent = tab.name;
    tabEl.appendChild(label);

    const closeBtn = document.createElement("span");
    closeBtn.className = "close-btn";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(tab.path);
    });
    tabEl.appendChild(closeBtn);

    tabEl.addEventListener("click", () => {
      switchTab(tab.path);
    });

    tabBar.appendChild(tabEl);
  }
}

export function getMarkdown(): string | null {
  if (!editor) return null;
  try {
    return editor.action((ctx) => {
      const editorView = ctx.get(editorViewCtx);
      const serializer = ctx.get(serializerCtx);
      return serializer(editorView.state.doc);
    });
  } catch {
    return null;
  }
}

export function focusEditor() {
  const container = document.getElementById("editor-container");
  const prosemirror = container?.querySelector(".ProseMirror") as HTMLElement;
  prosemirror?.focus();
}
