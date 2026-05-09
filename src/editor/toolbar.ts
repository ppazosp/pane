import { EditorState, Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { toggleMark } from "prosemirror-commands";
import { schema } from "./schema";

interface ToolbarButton {
  label: string;
  mark: keyof typeof schema.marks | "link";
  style?: string;
  action: (view: EditorView) => void;
}

const toolbarKey = new PluginKey("toolbar");

let toolbarEl: HTMLDivElement | null = null;
let boundView: EditorView | null = null;

function getButtons(): ToolbarButton[] {
  return [
    {
      label: "B",
      mark: "strong",
      style: "font-weight:700",
      action: (v) => {
        toggleMark(schema.marks.strong)(v.state, v.dispatch);
        v.focus();
      },
    },
    {
      label: "I",
      mark: "em",
      style: "font-style:italic",
      action: (v) => {
        toggleMark(schema.marks.em)(v.state, v.dispatch);
        v.focus();
      },
    },
    {
      label: "S",
      mark: "strikethrough",
      style: "text-decoration:line-through",
      action: (v) => {
        toggleMark(schema.marks.strikethrough)(v.state, v.dispatch);
        v.focus();
      },
    },
    {
      label: "<>",
      mark: "code",
      style: "font-family:var(--font-mono);font-size:11px",
      action: (v) => {
        toggleMark(schema.marks.code)(v.state, v.dispatch);
        v.focus();
      },
    },
    {
      label: "Link",
      mark: "link",
      action: (v) => {
        const { from, to } = v.state.selection;
        const hasLink = v.state.doc.rangeHasMark(from, to, schema.marks.link);
        if (hasLink) {
          toggleMark(schema.marks.link)(v.state, v.dispatch);
        } else {
          const href = prompt("URL:");
          if (href) {
            toggleMark(schema.marks.link, { href })(v.state, v.dispatch);
          }
        }
        v.focus();
      },
    },
  ];
}

function ensureToolbar(view: EditorView): HTMLDivElement {
  if (!toolbarEl) {
    toolbarEl = document.createElement("div");
    toolbarEl.className = "floating-toolbar";
    document.body.appendChild(toolbarEl);
  }
  // Build buttons once per view; reuse on subsequent selection updates.
  if (boundView !== view) {
    while (toolbarEl.firstChild) toolbarEl.removeChild(toolbarEl.firstChild);
    for (const btn of getButtons()) {
      const el = document.createElement("button");
      el.className = "toolbar-btn";
      el.textContent = btn.label;
      if (btn.style) el.setAttribute("style", btn.style);
      el.dataset.mark = String(btn.mark);
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        btn.action(view);
      });
      toolbarEl.appendChild(el);
    }
    boundView = view;
  }
  return toolbarEl;
}

function updateActiveStates(el: HTMLDivElement, view: EditorView) {
  const { from, to } = view.state.selection;
  for (const child of Array.from(el.children) as HTMLElement[]) {
    const markName = child.dataset.mark;
    if (!markName) continue;
    const markType =
      markName === "link"
        ? schema.marks.link
        : schema.marks[markName as keyof typeof schema.marks];
    if (!markType) continue;
    child.classList.toggle("active", view.state.doc.rangeHasMark(from, to, markType));
  }
}

function positionToolbar(el: HTMLDivElement, view: EditorView) {
  const { from, to } = view.state.selection;
  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);
  el.style.top = Math.min(start.top, end.top) - 40 + "px";
  el.style.left = (start.left + end.left) / 2 + "px";
  el.style.transform = "translateX(-50%)";
  el.style.display = "flex";
}

function hideToolbar() {
  if (toolbarEl) toolbarEl.style.display = "none";
}

function shouldShow(view: EditorView): boolean {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || selection.empty) return false;
  return selection.$from.parent.type !== schema.nodes.code_block;
}

export function toolbarPlugin(): Plugin {
  return new Plugin({
    key: toolbarKey,
    view() {
      return {
        update(view: EditorView, prevState: EditorState) {
          if (!shouldShow(view)) {
            hideToolbar();
            return;
          }

          const el = ensureToolbar(view);
          updateActiveStates(el, view);

          // Reposition only when selection range actually moved.
          const selectionMoved =
            !prevState ||
            !prevState.selection.eq(view.state.selection) ||
            el.style.display !== "flex";
          if (selectionMoved) {
            positionToolbar(el, view);
          }
        },
        destroy() {
          hideToolbar();
          if (toolbarEl) {
            toolbarEl.remove();
            toolbarEl = null;
          }
          boundView = null;
        },
      };
    },
  });
}
