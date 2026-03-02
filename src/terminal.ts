import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

let terminal: Terminal;
let fitAddon: FitAddon;

export async function initTerminal() {
  const container = document.getElementById("terminal-container")!;

  terminal = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily:
      '"SF Mono", "Fira Code", "Cascadia Code", "JetBrains Mono", ui-monospace, monospace',
    scrollback: 5000,
    theme: {
      background: "#000000",
      foreground: "#e0e0e0",
      cursor: "#7c8cf8",
      selectionBackground: "#3a3a5a",
      black: "#1a1a2e",
      red: "#e06c75",
      green: "#98c379",
      yellow: "#e5c07b",
      blue: "#61afef",
      magenta: "#c678dd",
      cyan: "#56b6c2",
      white: "#e0e0e0",
      brightBlack: "#5c6370",
      brightRed: "#e06c75",
      brightGreen: "#98c379",
      brightYellow: "#e5c07b",
      brightBlue: "#61afef",
      brightMagenta: "#c678dd",
      brightCyan: "#56b6c2",
      brightWhite: "#ffffff",
    },
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  terminal.open(container);

  try {
    const webglAddon = new WebglAddon();
    webglAddon.onContextLoss(() => webglAddon.dispose());
    terminal.loadAddon(webglAddon);
  } catch {
    // WebGL not available, fall back to canvas renderer
  }

  fitAddon.fit();

  // Send initial size to PTY
  await invoke("resize_pty", { cols: terminal.cols, rows: terminal.rows });

  // Forward user input to PTY
  terminal.onData(async (data) => {
    await invoke("write_to_pty", { data });
  });

  // Forward PTY resize
  terminal.onResize(async ({ cols, rows }) => {
    await invoke("resize_pty", { cols, rows });
  });

  // Listen for PTY output
  await listen<string>("pty-output", (event) => {
    terminal.write(event.payload);
  });

  // Handle container resize
  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
  });
  resizeObserver.observe(container);

  // Also fit on custom pane-resize events (drag handles)
  window.addEventListener("pane-resize", () => {
    fitAddon.fit();
  });
}

export function focusTerminal() {
  terminal?.focus();
}
