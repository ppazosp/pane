import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

let terminal: Terminal;
let fitAddon: FitAddon;
let fitPending = false;

function requestFit() {
  if (!fitPending) {
    fitPending = true;
    requestAnimationFrame(() => {
      fitAddon.fit();
      terminal.scrollToBottom();
      fitPending = false;
    });
  }
}

export async function initTerminal() {
  const container = document.getElementById("terminal-container")!;

  // Ensure the Nerd Font is loaded before xterm renders its canvas
  try {
    await document.fonts.load('13px "FiraCode Nerd Font Mono"');
  } catch {
    // Font not available, will fall through to next in stack
  }

  terminal = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily:
      '"FiraCode Nerd Font Mono", "FiraCode Nerd Font", "SF Mono", "Fira Code", "Cascadia Code", "JetBrains Mono", ui-monospace, monospace',
    scrollback: 5000,
    theme: {
      background: "#000000",
      foreground: "#d6dbe5",
      cursor: "#ffffff",
      cursorAccent: "#000000",
      selectionBackground: "#1f1f1f",
      selectionForeground: "#d6dbe5",
      black: "#1f1f1f",
      red: "#f81118",
      green: "#2dc55e",
      yellow: "#ecba0f",
      blue: "#2a84d2",
      magenta: "#4e5ab7",
      cyan: "#1081d6",
      white: "#d6dbe5",
      brightBlack: "#d6dbe5",
      brightRed: "#de352e",
      brightGreen: "#1dd361",
      brightYellow: "#f3bd09",
      brightBlue: "#1081d6",
      brightMagenta: "#5350b9",
      brightCyan: "#0f7ddb",
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

  // Spawn PTY with the correct initial size
  const cwd = await invoke<string>("get_cwd");
  await invoke("init_pty", { cwd, cols: terminal.cols, rows: terminal.rows });

  // Shift+Enter → send ESC + CR (newline without execute)
  terminal.attachCustomKeyEventHandler((e) => {
    if (e.type === "keydown" && e.key === "Enter" && e.shiftKey) {
      invoke("write_to_pty", { data: "\x1b\r" });
      return false;
    }
    return true;
  });

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

  // Handle all resize sources
  const resizeObserver = new ResizeObserver(() => requestFit());
  resizeObserver.observe(container);
  window.addEventListener("resize", () => requestFit());
  window.addEventListener("pane-resize", () => requestFit());
}

export function focusTerminal() {
  terminal?.focus();
}
