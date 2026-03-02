export function initLayout() {
  const terminalPanel = document.getElementById("terminal-panel")!;
  const handleEditor = document.getElementById("handle-editor")!;
  const editorPanel = document.getElementById("editor-panel")!;

  setupDragHandle(handleEditor, (dx) => {
    const termRect = terminalPanel.getBoundingClientRect();
    const editorRect = editorPanel.getBoundingClientRect();
    const totalWidth = termRect.width + editorRect.width;
    const newTermWidth = termRect.width + dx;
    const newEditorWidth = editorRect.width - dx;

    if (newTermWidth >= 100 && newEditorWidth >= 100) {
      terminalPanel.style.flex = `0 0 ${(newTermWidth / totalWidth) * 100}%`;
      editorPanel.style.flex = `0 0 ${(newEditorWidth / totalWidth) * 100}%`;
    }
  });
}

function setupDragHandle(handle: HTMLElement, onDrag: (dx: number) => void) {
  let startX = 0;

  const onMouseMove = (e: MouseEvent) => {
    const dx = e.clientX - startX;
    startX = e.clientX;
    onDrag(dx);
    window.dispatchEvent(new Event("pane-resize"));
  };

  const onMouseUp = () => {
    handle.classList.remove("active");
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    startX = e.clientX;
    handle.classList.add("active");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}
