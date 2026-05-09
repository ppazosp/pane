import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { Node } from "prosemirror-model";
import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-go";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-css";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-docker";

const highlightKey = new PluginKey("highlight");

type PrismToken = string | Prism.Token;

function getTokenLength(token: PrismToken): number {
  if (typeof token === "string") return token.length;
  const content = token.content;
  if (typeof content === "string") return content.length;
  if (Array.isArray(content)) {
    return content.reduce((sum: number, t: PrismToken) => sum + getTokenLength(t), 0);
  }
  // Single nested Token
  return getTokenLength(content as PrismToken);
}

function flattenTokens(
  tokens: PrismToken[],
  offset: number,
  decorations: Decoration[]
): number {
  for (const token of tokens) {
    if (typeof token === "string") {
      offset += token.length;
    } else {
      const length = getTokenLength(token);
      decorations.push(
        Decoration.inline(offset, offset + length, {
          class: "token " + token.type,
        })
      );
      const content = token.content;
      if (Array.isArray(content)) {
        flattenTokens(content as PrismToken[], offset, decorations);
      } else if (typeof content !== "string") {
        flattenTokens([content as PrismToken], offset, decorations);
      }
      offset += length;
    }
  }
  return offset;
}

// LRU cache keyed by (language, source). Most keystrokes don't change a code
// block's contents, so re-tokenization can be skipped for unchanged blocks.
const TOKEN_CACHE_MAX = 64;
const tokenCache = new Map<string, PrismToken[]>();

function tokenize(text: string, language: string): PrismToken[] | null {
  const grammar = Prism.languages[language];
  if (!grammar) return null;
  const key = language + "\0" + text;
  const hit = tokenCache.get(key);
  if (hit) {
    // Touch (LRU)
    tokenCache.delete(key);
    tokenCache.set(key, hit);
    return hit;
  }
  const tokens = Prism.tokenize(text, grammar);
  tokenCache.set(key, tokens);
  if (tokenCache.size > TOKEN_CACHE_MAX) {
    const oldest = tokenCache.keys().next().value;
    if (oldest !== undefined) tokenCache.delete(oldest);
  }
  return tokens;
}

function getDecorations(doc: Node): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "code_block") return;

    const language = node.attrs.language as string;
    if (!language || language === "mermaid") return;

    const tokens = tokenize(node.textContent, language);
    if (!tokens) return;

    // +1 to skip the opening of the code_block node
    flattenTokens(tokens, pos + 1, decorations);
  });

  return DecorationSet.create(doc, decorations);
}

export function highlightPlugin(): Plugin {
  return new Plugin({
    key: highlightKey,

    state: {
      init(_, { doc }) {
        return getDecorations(doc);
      },
      apply(tr, decorations) {
        if (tr.docChanged) {
          return getDecorations(tr.doc);
        }
        return decorations.map(tr.mapping, tr.doc);
      },
    },

    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
