---
name: neo4j-slides
description: Generate a Neo4j-branded Marp slide deck on a given topic and build it to PDF. Use when the user asks to create a presentation, deck, or slides about any Neo4j or graph database subject.
argument-hint: <topic description>
allowed-tools: Read, Write, Bash
---

## Slide generation rules

!`cat "${CLAUDE_SKILL_DIR}/../../../SLIDE_PROMPT.md"`

---

## Your task

Generate a complete Neo4j Marp slide deck about: **$ARGUMENTS**

Follow these steps exactly:

1. **Derive a filename** from the topic in kebab-case (e.g. `graph-rag-intro.md`). Keep it short and descriptive.

2. **Write the deck** to that filename in the project root. The output must be a complete, ready-to-build `.md` file — nothing else, no explanation, no code fences around the whole file.

3. **Build to PDF** by running:
   ```
   node build.mjs <filename> --pdf
   ```

4. **Report** the output filename and PDF path to the user.
