import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { initLayout } from "./layout";
import { initTerminal, focusTerminal } from "./terminal";
import { openFile, closeActiveTab, saveActiveTab, focusEditor } from "./editor";
import { initQuickOpen, toggleQuickOpen } from "./quickopen";

let focusedPanel: "terminal" | "editor" = "terminal";

async function init() {
  initLayout();

  await initTerminal();

  initQuickOpen((path) => {
    openFile(path);
  });

  await listen<string>("open-file", (event) => {
    openFile(event.payload);
  });

  await listen("open-settings", () => {
    invoke("open_settings");
  });

  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key === "p") {
      e.preventDefault();
      toggleQuickOpen();
    } else if (mod && e.key === "\\") {
      e.preventDefault();
      toggleFocus();
    } else if (mod && e.key === "w") {
      e.preventDefault();
      closeActiveTab();
    } else if (mod && e.key === "s") {
      e.preventDefault();
      saveActiveTab();
    }
  });

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
