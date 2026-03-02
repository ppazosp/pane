# Demo Recording Script

## Setup Before Recording

1. Open Pane fresh (no tabs open)
2. Make terminal font size comfortable for video (readable at Twitter resolution)
3. Have Claude Code ready to run
4. Close all notifications / Do Not Disturb ON

## Recording Flow (~30 seconds)

### Beat 1: Cold Open (0-5s)
- Pane opens, two panels visible
- Terminal is active, cursor blinking
- Editor shows empty state: "Open a .md file to start"

### Beat 2: Claude Generates Markdown (5-18s)
- In terminal, type: `claude "create an auth spec for our API, save it to demo/auth-spec.md"`
- While Claude writes, run: `pane open demo/auth-spec.md`
- Editor panel lights up with beautifully rendered WYSIWYG markdown
- Headings, tables, code blocks, task lists — all rendered

### Beat 3: Edit in Place (18-28s)
- Click a task checkbox (check it off)
- Edit a heading or add a line
- Cmd+P → quick open → select `api-design.md` → new tab opens
- Brief pause on the rendered result
- Cut.

## Alternative Flow (if Claude takes too long)

- Pre-generate the files in `demo/`
- Just show: terminal → `pane open demo/auth-spec.md` → edit → Cmd+P → done

## Tweet Copy

```
I built Pane — a terminal + markdown editor in one window.

I use Claude Code all day. It generates specs, plans, docs — all markdown. I was tired of switching apps to read them.

Now: `pane open spec.md` from the terminal and it renders WYSIWYG right next to it.
```

## Recording Tool

- Screen Studio (best for dev Twitter — auto-zoom, smooth cursor)
- Kap (free alternative)
- macOS built-in: Cmd+Shift+5
