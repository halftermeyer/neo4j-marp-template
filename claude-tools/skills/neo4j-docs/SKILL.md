---
name: neo4j-docs
description: "Generate Neo4j-branded documents and export to PDF. Supports three formats: (1) Marp slide decks for presentations, (2) HTML articles for web-ready documents with Mermaid diagrams, (3) LaTeX articles for academic papers with superior typesetting. Use when the user asks to create slides, presentations, articles, papers, or documents about any Neo4j or graph database subject."
argument-hint: <topic description>
allowed-tools: Read, Write, Bash
---

## Format selection

Pick the format based on what the user asks for:

| User says | Format | Pipeline |
|---|---|---|
| slides, deck, presentation | **Marp slides** | Markdown → marp-cli → PDF |
| article, document, write-up, white paper | **HTML article** | HTML → puppeteer → PDF |
| LaTeX, .tex, academic paper, formal paper | **LaTeX article** | .tex + .sty → tectonic → PDF |

If ambiguous, ask. If the user says "article" without specifying, default to **HTML article**. Only use LaTeX when explicitly requested or when the content is math-heavy and the user wants publication-quality typesetting.

---

## Format A: Marp Slide Deck

### Design rules

!`cat "${CLAUDE_SKILL_DIR}/SLIDE_PROMPT.md"`

### Steps

1. **Derive a filename** from the topic in kebab-case with `.md` extension (e.g. `graph-rag-intro.md`). Keep it short and descriptive.

2. **Get the current working directory** by running `pwd`. You will write the deck file there (called `<cwd>` below).

3. **Set up the build environment** — clone the template to a temporary directory and install dependencies:
   ```bash
   NEO4J_MARP_TMP=$(mktemp -d)
   git clone --depth 1 https://github.com/halftermeyer/neo4j-marp-template.git "$NEO4J_MARP_TMP"
   cd "$NEO4J_MARP_TMP" && npm install --silent
   ```
   Do this unconditionally — do not ask the user for permission.

4. **Read the reference deck** — before writing anything, read `${CLAUDE_SKILL_DIR}/examples/slides.md`. It is the canonical example showing every layout, palette class combination, Cypher, Mermaid, and formatting pattern available in the template. Use it as ground truth for slide structure and class usage.

5. **Write the deck** to `<cwd>/<filename>`. The output must be a complete, ready-to-build `.md` file — no explanation, no code fences wrapping the whole file.

   The file **MUST** begin with exactly this frontmatter block (add `title:` and other fields after `math: katex` if desired, but never omit or replace these four required lines):
   ```
   ---
   marp: true
   theme: neo4j
   paginate: true
   math: katex
   ---
   ```

   **Asset paths:** the `assets/` folder will be copied as a sibling of the deck file (step 6), so reference images as `assets/filename` — **not** `../assets/filename`. This overrides the `../assets/` convention described in the slide generation rules above, which applies to the template repo layout only.

6. **Copy assets** — copy the template's `assets/` directory as a sibling of the deck file so that images (logo, node shapes, etc.) resolve correctly at build time and remain available afterwards:
   ```bash
   cp -r "$NEO4J_MARP_TMP/assets" <cwd>/assets
   ```
   Do not delete `<cwd>/assets` during cleanup — leave it in place.

7. **Build to PDF** from the cloned template directory:
   ```bash
   cd "$NEO4J_MARP_TMP" && node build.mjs <absolute-path-to-deck-file> --pdf
   ```
   The build automatically detects overflowing slides and adds `<!-- _class: dense -->` to fix them before producing the final PDF. The PDF will be written next to the `.md` file.

8. **Clean up** only the temporary clone — never touch `<cwd>/assets`:
   ```bash
   rm -rf "$NEO4J_MARP_TMP"
   ```

9. **Report** the output `.md` and `.pdf` paths to the user.

---

## Format B: HTML Article

### Design rules

!`cat "${CLAUDE_SKILL_DIR}/ARTICLE_PROMPT.md"`

### Steps

1. **Derive a filename** from the topic in kebab-case with `.html` extension.

2. **Get the current working directory** by running `pwd` (`<cwd>`).

3. **Set up the build environment** — clone the Marp template (for puppeteer + assets):
   ```bash
   NEO4J_MARP_TMP=$(mktemp -d)
   git clone --depth 1 https://github.com/halftermeyer/neo4j-marp-template.git "$NEO4J_MARP_TMP"
   cd "$NEO4J_MARP_TMP" && npm install --silent
   ```

4. **Write the HTML article** directly to `<cwd>/<filename>.html`. The HTML file contains all CSS inline (Neo4j design tokens, fonts from Google Fonts CDN, KaTeX from CDN, Mermaid from CDN). There is no intermediate markdown — write HTML directly. Follow the ARTICLE_PROMPT design system for colors, fonts, Cypher syntax highlighting spans, box types, and structure.

5. **Copy assets**:
   ```bash
   cp -r "$NEO4J_MARP_TMP/assets" <cwd>/assets
   ```

6. **Write a render script** and **build to PDF** using puppeteer from the Marp template's node_modules:
   ```bash
   cat > "$NEO4J_MARP_TMP/render-article.mjs" << 'SCRIPT'
   import puppeteer from 'puppeteer';
   import path from 'path';
   const absHtml = path.resolve(process.argv[2]);
   const pdfPath = absHtml.replace(/\.html$/, '.pdf');
   const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
   const page = await browser.newPage();
   await page.goto('file://' + absHtml, { waitUntil: 'networkidle0', timeout: 60000 });
   await page.waitForFunction(() => document.querySelectorAll('.katex').length > 0, { timeout: 15000 }).catch(() => {});
   await page.waitForFunction(() => [...document.querySelectorAll('.mermaid')].every(c => c.querySelector('svg')), { timeout: 20000 }).catch(() => {});
   await page.pdf({
     path: pdfPath, format: 'A4',
     margin: { top: '20mm', bottom: '25mm', left: '20mm', right: '20mm' },
     printBackground: true, displayHeaderFooter: true,
     headerTemplate: '<div style="width:100%;height:4px;background:linear-gradient(90deg,#0A6190,#5DB3BF,#8FE3E8);"></div>',
     footerTemplate: '<div style="width:100%;text-align:center;font-size:8pt;font-family:sans-serif;color:#525252;padding:4mm 0;"><span class="pageNumber"></span></div>',
   });
   await browser.close();
   SCRIPT
   cd "$NEO4J_MARP_TMP" && node render-article.mjs <absolute-path-to-html-file>
   ```

   **Page number gotcha**: Page numbers are handled **only** by puppeteer's `footerTemplate`. Do NOT also use CSS `@page @bottom-center { content: counter(page) }` — that causes duplicates.

7. **Clean up** only the temporary clone:
   ```bash
   rm -rf "$NEO4J_MARP_TMP"
   ```

8. **Report** the output `.html` and `.pdf` paths to the user.

---

## Format C: LaTeX Article

### Design rules

!`cat "${CLAUDE_SKILL_DIR}/LATEX_PROMPT.md"`

### Steps

1. **Derive a filename** from the topic in kebab-case with `.tex` extension.

2. **Get the current working directory** by running `pwd` (`<cwd>`).

3. **Ensure `neo4j-article.sty` exists** at `<cwd>/neo4j-article.sty`. If it doesn't, read the reference copy from `${CLAUDE_SKILL_DIR}/neo4j-article.sty` and write it to `<cwd>/neo4j-article.sty`.

4. **Ensure assets exist** — if `<cwd>/assets/logo.png` doesn't exist, clone the Marp template and copy assets:
   ```bash
   NEO4J_MARP_TMP=$(mktemp -d)
   git clone --depth 1 https://github.com/halftermeyer/neo4j-marp-template.git "$NEO4J_MARP_TMP"
   cp -r "$NEO4J_MARP_TMP/assets" <cwd>/assets
   rm -rf "$NEO4J_MARP_TMP"
   ```

5. **Write the `.tex` file** to `<cwd>/<filename>.tex`. The document must:
   - Use `\usepackage{neo4j-article}` for all branding
   - Build the title page inline (not via `\maketitle`)
   - Wrap every `\begin{lstlisting}...\end{lstlisting}` inside `\begin{codeblock}...\end{codeblock}` to avoid line-gap artifacts
   - Use the provided tcolorbox environments (`theorembox`, `proofbox`, `resultbox`, `factbox`, `neoquote`)

6. **Ensure tectonic is installed**:
   ```bash
   command -v tectonic || brew install tectonic
   ```

7. **Build to PDF**:
   ```bash
   cd <cwd> && tectonic <filename>.tex
   ```

8. **Report** the output `.tex`, `.sty`, and `.pdf` paths to the user.
