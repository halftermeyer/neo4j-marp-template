# Neo4j Marp Template

A Marp slide deck template with Neo4j brand theme, Cypher syntax highlighting, Mermaid diagrams, and KaTeX math.

## Quick start

```bash
npm install
npm run html      # → slides.html
npm run pdf       # → slides.pdf
npm run pptx      # → slides.pptx (image-based, not editable)
npm run preview   # → browser preview (live reload)
```

Put your `.md` files in [`decks/`](decks/) and re-run. See [`examples/`](examples/) for reference decks.

## Custom input file

```bash
node build.mjs my-talk.md --pdf       # → my-talk.pdf
node build.mjs my-talk.md --pptx      # → my-talk.pptx (image-based, not editable)
node build.mjs my-talk.md --html      # → my-talk.html
npm run pdf -- my-talk.md             # same via npm
npm run pptx -- my-talk.md            # same via npm
```

## Writing slides

Each slide is separated by `---`. Start every deck with this frontmatter:

```markdown
---
marp: true
theme: neo4j
paginate: true
math: katex
---
```

### Slide classes

```markdown
<!-- _class: lead -->    ← dark title slide
<!-- _class: invert -->  ← dark blue section slide
<!-- _class: dense -->   ← reduced font size for content-heavy slides (long code, many bullets, etc.)
(none)                   ← white content slide
```

### Cypher

Use ` ```cypher ` — keywords, labels, strings, and numbers are syntax-highlighted automatically.

```cypher
MATCH (p:Person)-[:KNOWS]->(friend:Person)
WHERE p.name = "Alice"
RETURN friend.name, friend.age
```

### Mermaid

Use ` ```mermaid ` — rendered to SVG at build time. Supports all diagram types (`graph`, `sequenceDiagram`, `classDiagram`, `flowchart`, etc.)

### Math (KaTeX)

- Inline: `$E = mc^2$`
- Block: `$$\sum_{i=1}^{n} x_i$$`

### Images

```markdown
![width:400px](../assets/image.svg)      ← inline, resized
![bg left:40%](../assets/image.svg)      ← left background split
![bg right:40%](../assets/image.svg)     ← right background split
![bg cover](../assets/image.svg)         ← full slide background
```

Put images in [`assets/`](assets/) and reference them as `../assets/filename` from your deck files.

## Using an LLM to generate a deck

[`SLIDE_PROMPT.md`](SLIDE_PROMPT.md) is a ready-to-use system prompt. Paste it into any LLM (Claude, ChatGPT, Gemini…) as the system prompt, then describe your deck. The output drops straight into this template.

### Claude Code skill (`/neo4j-slides`)

Install the skill once to generate and build branded decks from any directory using [Claude Code](https://claude.ai/code).

**Prerequisites:** [Claude Code](https://claude.ai/code) installed.

**Install** (run from anywhere inside this repo):

```bash
REPO=$(git rev-parse --show-toplevel)
mkdir -p ~/.claude/skills/neo4j-slides
cp "$REPO/claude-tools/skills/neo4j-slides/SKILL.md" ~/.claude/skills/neo4j-slides/
cp "$REPO/SLIDE_PROMPT.md" ~/.claude/skills/neo4j-slides/
```

**Use:** open Claude Code in any directory and run:

```
/neo4j-slides <topic description>
```

Claude writes the `.md` file, clones this repo to a temp directory, builds the PDF, copies `assets/` next to your deck, and cleans up — no local template installation required.

## Files

| File | Purpose |
|---|---|
| `decks/` | Your slide files — put them here |
| `examples/` | Reference decks (`slides.md`, `graph-type.md`) |
| `neo4j.css` | Neo4j brand theme |
| `build.mjs` | Build pipeline (preprocess + Marp CLI) |
| `marp.config.mjs` | Marp engine config (theme + Cypher hljs) |
| `SLIDE_PROMPT.md` | LLM prompt for generating decks |
| `assets/` | Images and SVGs |
| `.vscode/settings.json` | VS Code Marp extension config |
