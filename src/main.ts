import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { openFile, closeActiveTab, saveActiveTab, focusEditor } from "./tabs";
import { initQuickOpen, toggleQuickOpen } from "./quickopen";
import "prosemirror-view/style/prosemirror.css";
import "prosemirror-gapcursor/style/gapcursor.css";
import "prosemirror-tables/style/tables.css";

async function init() {
  initQuickOpen((path) => openFile(path));

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
    } else if (mod && e.key === "w") {
      e.preventDefault();
      closeActiveTab();
    } else if (mod && e.key === "s") {
      e.preventDefault();
      saveActiveTab();
    }
  });

  focusEditor();
}

init();
