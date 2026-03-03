import { Node } from "prosemirror-model";
import { EditorView, NodeView } from "prosemirror-view";
import mermaid from "mermaid";
import DOMPurify from "dompurify";

let mermaidInitialized = false;
let renderCounter = 0;

function initMermaid() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    themeVariables: {
      darkMode: true,
      background: "#000000",
      primaryColor: "#1a1a1a",
      primaryTextColor: "#e0e0e0",
      lineColor: "#444444",
    },
  });
  mermaidInitialized = true;
}

export class MermaidNodeView implements NodeView {
  dom: HTMLElement;
  private renderEl: HTMLElement;
  private node: Node;
  private view: EditorView;
  private getPos: () => number | undefined;
  private editing = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(node: Node, view: EditorView, getPos: () => number | undefined) {
    initMermaid();

    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement("div");
    this.dom.className = "mermaid-wrapper";
    this.dom.contentEditable = "false";

    this.renderEl = document.createElement("div");
    this.renderEl.className = "mermaid-render";
    this.dom.appendChild(this.renderEl);

    this.renderEl.addEventListener("click", () => {
      this.startEdit();
    });

    this.renderDiagram();
  }

  private async renderDiagram() {
    const source = this.node.textContent;

    if (!source.trim()) {
      this.renderEl.textContent = "Empty diagram \u2014 click to edit";
      return;
    }

    try {
      const id = `mermaid-${Date.now()}-${renderCounter++}`;
      const { svg } = await mermaid.render(id, source);
      // Sanitized with DOMPurify before insertion
      const sanitized = DOMPurify.sanitize(svg);
      this.renderEl.innerHTML = sanitized;
    } catch {
      this.renderEl.textContent = "Invalid Mermaid syntax";
    }
  }

  private startEdit() {
    if (this.editing) return;
    this.editing = true;
    this.dom.classList.add("editing");

    const textarea = document.createElement("textarea");
    textarea.className = "mermaid-source";
    textarea.value = this.node.textContent;
    textarea.spellcheck = false;
    this.dom.insertBefore(textarea, this.renderEl);
    textarea.focus();

    textarea.addEventListener("input", () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        const pos = this.getPos();
        if (pos === undefined) return;
        const { state } = this.view;
        const newNode = state.schema.nodes.code_block.create(
          { language: "mermaid" },
          textarea.value ? state.schema.text(textarea.value) : null
        );
        const tr = state.tr.replaceWith(pos, pos + this.node.nodeSize, newNode);
        this.view.dispatch(tr);
      }, 300);
    });

    textarea.addEventListener("blur", () => {
      setTimeout(() => this.stopEdit(), 100);
    });

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.stopEdit();
        this.view.focus();
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value =
          textarea.value.substring(0, start) +
          "  " +
          textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        textarea.dispatchEvent(new Event("input"));
      }
    });
  }

  private stopEdit() {
    if (!this.editing) return;
    this.editing = false;
    this.dom.classList.remove("editing");
    const textarea = this.dom.querySelector("textarea.mermaid-source");
    if (textarea) textarea.remove();
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    if (node.attrs.language !== "mermaid") return false;
    this.node = node;
    if (!this.editing) {
      this.renderDiagram();
    }
    return true;
  }

  stopEvent(): boolean {
    return this.editing;
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.dom.remove();
  }
}
