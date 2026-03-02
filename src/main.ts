import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { initLayout, toggleSidebar } from "./layout";
import { initTerminal, focusTerminal } from "./terminal";
import { initFileTree } from "./filetree";
import { openFile, closeActiveTab, focusEditor } from "./editor";
import { initQuickOpen, toggleQuickOpen } from "./quickopen";

let focusedPanel: "terminal" | "editor" = "terminal";

async function init() {
  // Get working directory from backend
  const cwd = await invoke<string>("get_cwd");

  // Initialize layout (drag handles)
  initLayout();

  // Initialize terminal
  await initTerminal();

  // Initialize file tree
  await initFileTree(cwd, (path) => {
    openFile(path);
  });

  // Initialize quick open
  initQuickOpen((path) => {
    openFile(path);
  });

  // Listen for `pane open` CLI commands via UDS
  await listen<string>("open-file", (event) => {
    openFile(event.payload);
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key === "p") {
      e.preventDefault();
      toggleQuickOpen();
    } else if (mod && e.key === "b") {
      e.preventDefault();
      toggleSidebar();
    } else if (mod && e.key === "\\") {
      e.preventDefault();
      toggleFocus();
    } else if (mod && e.key === "w") {
      e.preventDefault();
      closeActiveTab();
    }
  });

  // Focus terminal on start
  focusTerminal();
}

function toggleFocus() {
  if (focusedPanel === "terminal") {
    focusedPanel = "editor";
    focusEditor();
  } else {
    focusedPanel = "terminal";
    focusTerminal();
  }
}

init();
