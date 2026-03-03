import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { schema } from "./schema";

export const placeholderPluginKey = new PluginKey("placeholder");

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
            Decoration.widget(1, () => {
              const span = document.createElement("span");
              span.className = "placeholder";
              span.textContent = text;
              return span;
            }),
          ]);
        }
        return DecorationSet.empty;
      },
    },
  });
}
