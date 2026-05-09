import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { schema } from "./schema";

export const placeholderPluginKey = new PluginKey("placeholder");

// Uses a node-class decoration (not a widget child) so the placeholder
// appears via CSS ::before. Removing a widget <span> while the user is
// mid-composition (Option+E + a → á) aborts the IME on WebKit.
export function placeholderPlugin(text = "Start writing..."): Plugin {
  return new Plugin({
    key: placeholderPluginKey,
    props: {
      decorations(state) {
        const { doc } = state;
        if (
          doc.childCount === 1 &&
          doc.firstChild?.type === schema.nodes.paragraph &&
          doc.firstChild.content.size === 0
        ) {
          return DecorationSet.create(doc, [
            Decoration.node(0, doc.firstChild.nodeSize, {
              class: "is-empty",
              "data-placeholder": text,
            }),
          ]);
        }
        return DecorationSet.empty;
      },
    },
  });
}
