import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "./schema";
import { buildPlugins } from "./plugins";
import { parseMarkdown, serializeMarkdown } from "./markdown";
import { MermaidNodeView } from "./mermaid";

let currentView: EditorView | null = null;

export function createEditor(
  container: HTMLElement,
  content: string,
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
      if (tr.docChanged) {
        onChange(serializeMarkdown(newState.doc));
      }
    },
    nodeViews: {
      code_block(node, view, getPos) {
        if (node.attrs.language === "mermaid") {
          return new MermaidNodeView(node, view, getPos);
        }
        return undefined as any;
      },
    },
    attributes: { class: "pane-editor" },
  });

  currentView = view;
  return view;
}

export function destroyEditor() {
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
