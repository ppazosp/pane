import { Plugin, PluginKey } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { setBlockType, wrapIn } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import { schema } from "./schema";

// --- Types ---

interface SlashItem {
  label: string;
  desc: string;
  category: string;
  action: (view: EditorView) => void;
}

// --- Menu items ---

const slashItems: SlashItem[] = [
  // Text
  {
    label: "Heading 1",
    desc: "Large heading",
    category: "Text",
    action: (view) => {
      setBlockType(schema.nodes.heading, { level: 1 })(view.state, view.dispatch);
    },
  },
  {
    label: "Heading 2",
    desc: "Medium heading",
    category: "Text",
    action: (view) => {
      setBlockType(schema.nodes.heading, { level: 2 })(view.state, view.dispatch);
    },
  },
  {
    label: "Heading 3",
    desc: "Small heading",
    category: "Text",
    action: (view) => {
      setBlockType(schema.nodes.heading, { level: 3 })(view.state, view.dispatch);
    },
  },
  {
    label: "Blockquote",
    desc: "Quote block",
    category: "Text",
    action: (view) => {
      wrapIn(schema.nodes.blockquote)(view.state, view.dispatch);
    },
  },

  // Lists
  {
    label: "Bullet List",
    desc: "Unordered list",
    category: "Lists",
    action: (view) => {
      wrapInList(schema.nodes.bullet_list)(view.state, view.dispatch);
    },
  },
  {
    label: "Numbered List",
    desc: "Ordered list",
    category: "Lists",
    action: (view) => {
      wrapInList(schema.nodes.ordered_list)(view.state, view.dispatch);
    },
  },
  {
    label: "Task List",
    desc: "Checklist",
    category: "Lists",
    action: (view) => {
      wrapInList(schema.nodes.task_list)(view.state, view.dispatch);
    },
  },

  // Code
  {
    label: "Code Block",
    desc: "Fenced code",
    category: "Code",
    action: (view) => {
      setBlockType(schema.nodes.code_block)(view.state, view.dispatch);
    },
  },
  {
    label: "Mermaid Diagram",
    desc: "Diagram block",
    category: "Code",
    action: (view) => {
      const node = schema.nodes.code_block.create({ language: "mermaid" });
      const tr = view.state.tr.replaceSelectionWith(node);
      view.dispatch(tr.scrollIntoView());
    },
  },

  // Media
  {
    label: "Divider",
    desc: "Horizontal rule",
    category: "Media",
    action: (view) => {
      const node = schema.nodes.horizontal_rule.create();
      const tr = view.state.tr.replaceSelectionWith(node);
      view.dispatch(tr.scrollIntoView());
    },
  },
  {
    label: "Image",
    desc: "Embed image",
    category: "Media",
    action: (view) => {
      const href = prompt("Image URL:");
      if (href) {
        const node = schema.nodes.image.create({ src: href });
        const tr = view.state.tr.replaceSelectionWith(node);
        view.dispatch(tr.scrollIntoView());
      }
    },
  },
];

// --- Plugin state ---

const slashKey = new PluginKey("slash");

let menuEl: HTMLDivElement | null = null;
let active = false;
let triggerPos = 0;
let query = "";
let selectedIdx = 0;
let filtered: SlashItem[] = [];

function getFiltered(q: string): SlashItem[] {
  if (!q) return slashItems;
  const lower = q.toLowerCase();
  return slashItems.filter(
    (item) =>
      item.label.toLowerCase().includes(lower) ||
      item.desc.toLowerCase().includes(lower) ||
      item.category.toLowerCase().includes(lower)
  );
}

function ensureMenu(): HTMLDivElement {
  if (!menuEl) {
    menuEl = document.createElement("div");
    menuEl.className = "slash-menu";
    document.body.appendChild(menuEl);
  }
  return menuEl;
}

function renderMenu(view: EditorView) {
  const el = ensureMenu();
  filtered = getFiltered(query);
  if (selectedIdx >= filtered.length) selectedIdx = Math.max(0, filtered.length - 1);

  // Clear previous content
  while (el.firstChild) el.removeChild(el.firstChild);

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "slash-empty";
    empty.textContent = "No results";
    el.appendChild(empty);
    el.style.display = "block";
    return;
  }

  let lastCategory = "";
  filtered.forEach((item, i) => {
    if (item.category !== lastCategory) {
      lastCategory = item.category;
      const catEl = document.createElement("div");
      catEl.className = "slash-category";
      catEl.textContent = item.category;
      el.appendChild(catEl);
    }

    const itemEl = document.createElement("div");
    itemEl.className = i === selectedIdx ? "slash-item selected" : "slash-item";
    itemEl.dataset.idx = String(i);

    const labelSpan = document.createElement("span");
    labelSpan.className = "slash-label";
    labelSpan.textContent = item.label;

    const descSpan = document.createElement("span");
    descSpan.className = "slash-desc";
    descSpan.textContent = item.desc;

    itemEl.appendChild(labelSpan);
    itemEl.appendChild(descSpan);

    itemEl.addEventListener("mousedown", (e) => {
      e.preventDefault();
      execute(view, filtered[i]);
    });
    itemEl.addEventListener("mouseenter", () => {
      if (i === selectedIdx) return;
      const prev = el.querySelector(".slash-item.selected");
      prev?.classList.remove("selected");
      itemEl.classList.add("selected");
      selectedIdx = i;
    });

    el.appendChild(itemEl);
  });

  el.style.display = "block";

  // Scroll selected into view
  const selEl = el.querySelector(".slash-item.selected") as HTMLElement | null;
  if (selEl) selEl.scrollIntoView({ block: "nearest" });
}

function show(view: EditorView, pos: number) {
  active = true;
  triggerPos = pos;
  query = "";
  selectedIdx = 0;

  const coords = view.coordsAtPos(pos);
  const el = ensureMenu();
  el.style.top = coords.bottom + 4 + "px";
  el.style.left = coords.left + "px";
  renderMenu(view);
}

function hide() {
  active = false;
  query = "";
  selectedIdx = 0;
  if (menuEl) {
    menuEl.style.display = "none";
  }
}

function execute(view: EditorView, item: SlashItem) {
  // Delete the slash + query text from the doc
  const from = triggerPos;
  const to = triggerPos + 1 + query.length; // +1 for the "/" char
  const tr = view.state.tr.delete(from, to);
  view.dispatch(tr);

  // Run the item action
  item.action(view);
  hide();
  view.focus();
}

// --- Plugin ---

export function slashPlugin(): Plugin {
  return new Plugin({
    key: slashKey,

    props: {
      handleTextInput(view: EditorView, from: number, _to: number, text: string) {
        if (active) {
          // Will be typed into the doc; update query on next tick
          setTimeout(() => {
            const state = view.state;
            const $pos = state.doc.resolve(state.selection.from);
            const parentStart = $pos.start();
            const parentText = state.doc.textBetween(parentStart, state.selection.from, "");
            if (parentText.startsWith("/")) {
              query = parentText.slice(1);
              selectedIdx = 0;
              renderMenu(view);
            } else {
              hide();
            }
          }, 0);
          return false;
        }

        if (text === "/") {
          const $from = view.state.doc.resolve(from);
          const parent = $from.parent;
          if (
            parent.type === schema.nodes.paragraph &&
            parent.content.size === 0
          ) {
            // Let the "/" be inserted first, then show menu
            setTimeout(() => {
              show(view, from);
            }, 0);
          }
        }
        return false;
      },

      handleKeyDown(view: EditorView, event: KeyboardEvent) {
        if (!active) return false;

        if (event.key === "ArrowDown") {
          event.preventDefault();
          selectedIdx = Math.min(selectedIdx + 1, filtered.length - 1);
          renderMenu(view);
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          selectedIdx = Math.max(selectedIdx - 1, 0);
          renderMenu(view);
          return true;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          if (filtered.length > 0) {
            execute(view, filtered[selectedIdx]);
          }
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          hide();
          return true;
        }
        if (event.key === "Backspace") {
          // After backspace, check if we still have the slash
          setTimeout(() => {
            const state = view.state;
            const $pos = state.doc.resolve(state.selection.from);
            const parentStart = $pos.start();
            const parentText = state.doc.textBetween(parentStart, state.selection.from, "");
            if (parentText.startsWith("/")) {
              query = parentText.slice(1);
              selectedIdx = 0;
              renderMenu(view);
            } else {
              hide();
            }
          }, 0);
          return false;
        }
        return false;
      },
    },

    view() {
      return {
        update(view: EditorView) {
          if (!active) return;
          // If cursor moved before trigger position, hide
          const { from } = view.state.selection;
          if (from <= triggerPos) {
            hide();
          }
        },
        destroy() {
          hide();
          if (menuEl) {
            menuEl.remove();
            menuEl = null;
          }
        },
      };
    },
  });
}
