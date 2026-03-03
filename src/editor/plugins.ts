import { keymap } from "prosemirror-keymap";
import { history, undo, redo } from "prosemirror-history";
import {
  baseKeymap,
  toggleMark,
  chainCommands,
  exitCode,
  joinUp,
  joinDown,
  lift,
  selectParentNode,
} from "prosemirror-commands";
import {
  inputRules,
  wrappingInputRule,
  textblockTypeInputRule,
  InputRule,
} from "prosemirror-inputrules";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { Plugin } from "prosemirror-state";
import { schema } from "./schema";
import {
  splitListItem,
  liftListItem,
  sinkListItem,
} from "prosemirror-schema-list";
import { slashPlugin } from "./slash";
import { toolbarPlugin } from "./toolbar";
import { blockPlugin } from "./blocks";
import { highlightPlugin } from "./highlight";
import { placeholderPlugin } from "./placeholder";

// --- Input Rules ---

function headingRule(level: number) {
  return textblockTypeInputRule(
    new RegExp("^(#{1," + level + "})\\s$"),
    schema.nodes.heading,
    (match) => ({ level: match[1].length })
  );
}

function blockquoteRule() {
  return wrappingInputRule(/^>\s$/, schema.nodes.blockquote);
}

function bulletListRule() {
  return wrappingInputRule(/^[-*]\s$/, schema.nodes.bullet_list);
}

function orderedListRule() {
  return wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list, (match) => ({
    order: +match[1],
  }));
}

function codeBlockRule() {
  return textblockTypeInputRule(/^```([a-z]*)?\s$/, schema.nodes.code_block, (match) => ({
    language: match[1] || "",
  }));
}

function horizontalRuleRule() {
  return new InputRule(/^---$/, (state, _match, start, end) => {
    const hr = schema.nodes.horizontal_rule.create();
    const paragraph = schema.nodes.paragraph.create();
    const tr = state.tr.replaceWith(start, end, [hr, paragraph]);
    return tr;
  });
}

function buildInputRules(): Plugin {
  return inputRules({
    rules: [
      headingRule(6),
      blockquoteRule(),
      bulletListRule(),
      orderedListRule(),
      codeBlockRule(),
      horizontalRuleRule(),
    ],
  });
}

// --- Keymap ---

function buildKeymap() {
  const listItem = schema.nodes.list_item;

  const keys: Record<string, any> = {
    "Mod-b": toggleMark(schema.marks.strong),
    "Mod-i": toggleMark(schema.marks.em),
    "Mod-e": toggleMark(schema.marks.code),
    "Mod-Shift-s": toggleMark(schema.marks.strikethrough),
    "Mod-z": undo,
    "Mod-Shift-z": redo,
    "Mod-y": redo,
    Enter: splitListItem(listItem),
    Tab: sinkListItem(listItem),
    "Shift-Tab": liftListItem(listItem),
    "Mod-Enter": chainCommands(exitCode, (_state, dispatch) => {
      if (dispatch) {
        const tr = _state.tr.replaceSelectionWith(schema.nodes.paragraph.create());
        dispatch(tr.scrollIntoView());
      }
      return true;
    }),
    "Alt-ArrowUp": joinUp,
    "Alt-ArrowDown": joinDown,
    "Mod-[": lift,
    Escape: selectParentNode,
  };

  keys["Mod-k"] = (state: any, dispatch: any) => {
    const { from, to } = state.selection;
    const hasLink = state.doc.rangeHasMark(from, to, schema.marks.link);
    if (hasLink) {
      return toggleMark(schema.marks.link)(state, dispatch);
    }
    const href = prompt("URL:");
    if (href && dispatch) {
      return toggleMark(schema.marks.link, { href })(state, dispatch);
    }
    return false;
  };

  return keymap(keys);
}

// --- Build all plugins ---

export function buildPlugins(): Plugin[] {
  return [
    buildInputRules(),
    buildKeymap(),
    keymap(baseKeymap),
    history(),
    dropCursor({ color: "#ffffff40" }),
    gapCursor(),
    slashPlugin(),
    toolbarPlugin(),
    blockPlugin(),
    highlightPlugin(),
    placeholderPlugin(),
  ];
}
