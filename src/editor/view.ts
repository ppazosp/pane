import { EditorState } from "prosemirror-state";
import { EditorView, NodeView } from "prosemirror-view";
import { Node as PMNode } from "prosemirror-model";
import { schema } from "./schema";
import { buildPlugins } from "./plugins";
import { parseMarkdown, serializeMarkdown } from "./markdown";
import { MermaidNodeView } from "./mermaid";
import { convertFileSrc } from "@tauri-apps/api/core";

let currentView: EditorView | null = null;
let pendingSerialize: number | null = null;

function resolveImageSrc(src: string, baseDir: string): string {
  if (!src) return "";
  if (src.startsWith("http") || src.startsWith("data:") || src.startsWith("asset")) {
    return src;
  }
  const abs = src.startsWith("/") ? src : baseDir + "/" + src;
  return convertFileSrc(abs);
}

class ImageNodeView implements NodeView {
  dom: HTMLElement;
  private img: HTMLImageElement;
  private baseDir: string;

  constructor(node: PMNode, baseDir: string) {
    this.baseDir = baseDir;
    this.img = document.createElement("img");
    this.applyAttrs(node);
    this.dom = this.img;
  }

  update(node: PMNode): boolean {
    if (node.type.name !== "image") return false;
    this.applyAttrs(node);
    return true;
  }

  private applyAttrs(node: PMNode) {
    const resolved = resolveImageSrc(node.attrs.src || "", this.baseDir);
    if (this.img.getAttribute("src") !== resolved) {
      this.img.src = resolved;
    }
    this.img.alt = node.attrs.alt || "";
    this.img.title = node.attrs.title || "";
  }
}

export function createEditor(
  container: HTMLElement,
  content: string,
  baseDir: string,
  onChange: (markdown: string) => void
): EditorView {
  destroyEditor();

  const doc =
    parseMarkdown(content) ||
    schema.nodes.doc.create(null, schema.nodes.paragraph.create());

  const state = EditorState.create({
    doc,
    plugins: buildPlugins(),
  });

  const view = new EditorView(container, {
    state,
    dispatchTransaction(tr) {
      const newState = view.state.apply(tr);
      view.updateState(newState);
      // Coalesce serializes within a frame: serializing the whole doc to
      // markdown on every keystroke dominates typing latency for large files.
      // saveActiveTab calls getMarkdownFromView() directly, so save still
      // sees the latest content.
      if (tr.docChanged && pendingSerialize === null) {
        pendingSerialize = requestAnimationFrame(() => {
          pendingSerialize = null;
          if (currentView === view) {
            onChange(serializeMarkdown(view.state.doc));
          }
        });
      }
    },
    nodeViews: {
      code_block(node, view, getPos) {
        if (node.attrs.language === "mermaid") {
          return new MermaidNodeView(node, view, getPos);
        }
        return undefined as any;
      },
      image(node) {
        return new ImageNodeView(node, baseDir);
      },
    },
    attributes: { class: "pane-editor" },
  });

  currentView = view;
  return view;
}

export function destroyEditor() {
  if (pendingSerialize !== null) {
    cancelAnimationFrame(pendingSerialize);
    pendingSerialize = null;
  }
  if (currentView) {
    currentView.destroy();
    currentView = null;
  }
}

export function focusProseMirror() {
  currentView?.focus();
}

export function getMarkdownFromView(): string | null {
  if (!currentView) return null;
  return serializeMarkdown(currentView.state.doc);
}
