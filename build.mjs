/**
 * build.mjs — Neo4j Marp build pipeline
 *
 * Usage:
 *   node build.mjs [input.md] [--html|--pdf|--pptx|--preview]
 *
 * Defaults:
 *   input  → all *.md files in current directory (excluding *.preview.md)
 *   format → --html
 *
 * Examples:
 *   npm run pdf                    # all *.md → *.pdf
 *   npm run pdf -- dojo.md         # dojo.md → dojo.pdf
 *   node build.mjs dojo.md --pdf   # same
 *   npm run pptx -- dojo.md        # dojo.md → dojo.pptx
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'fs'
import { execFileSync, spawnSync } from 'child_process'
import { tmpdir } from 'os'
import { join, basename, dirname, resolve } from 'path'
import hljs from 'highlight.js'
import cypher from 'highlightjs-cypher'

hljs.registerLanguage('cypher', cypher)

// ── Parse arguments ───────────────────────────────────────────────────────
const args = process.argv.slice(2)
const FORMAT_FLAGS = ['--pdf', '--pptx', '--html', '--preview']
const format   = args.find(a => FORMAT_FLAGS.includes(a)) ?? '--html'
const inputArg = args.find(a => !a.startsWith('--'))

// Resolve input files
const isMarpFile = f => {
  const text = readFileSync(f, 'utf8')
  const match = text.match(/^---\n([\s\S]*?)\n---/)   // extract frontmatter only
  return match && /marp:\s*true/.test(match[1])
}

const DECKS_DIR = 'decks'

const inputFiles = inputArg
  ? [resolve(inputArg)]
  : readdirSync(DECKS_DIR).filter(f => f.endsWith('.md') && !f.endsWith('.preview.md')).map(f => resolve(DECKS_DIR, f)).filter(isMarpFile)

if (inputFiles.length === 0) {
  console.error('[build] No .md files found.')
  process.exit(1)
}

// ── Build function ────────────────────────────────────────────────────────
const mmdc = new URL('./node_modules/.bin/mmdc', import.meta.url).pathname
const marp = new URL('./node_modules/.bin/marp', import.meta.url).pathname

function buildFile(inputFile) {
  const stem        = basename(inputFile, '.md')
  const dir         = dirname(inputFile)
  const previewFile = join(dir, `${stem}.preview.md`)

  console.log(`[build] ${basename(inputFile)} → ${format.replace('--', '')}`)

  // Step 1: Preprocess
  let content = readFileSync(inputFile, 'utf8')

  // Cypher syntax highlighting
  content = content.replace(/```cypher\n([\s\S]*?)```/g, (_, code) => {
    const highlighted = hljs.highlight(code.trimEnd(), { language: 'cypher' }).value
    return `<pre class="hljs language-cypher"><code>${highlighted}</code></pre>`
  })

  // Mermaid → SVG
  const tmpDir = mkdtempSync(join(tmpdir(), 'marp-mermaid-'))
  try {
    let idx = 0
    content = content.replace(/```mermaid\n([\s\S]*?)```/g, (_, diagram) => {
      const inFile  = join(tmpDir, `d${idx}.mmd`)
      const outFile = join(tmpDir, `d${idx}.svg`)
      idx++
      writeFileSync(inFile, diagram.trimEnd())
      execFileSync(mmdc, ['-i', inFile, '-o', outFile, '--backgroundColor', 'transparent'], { stdio: 'pipe' })
      const svg = readFileSync(outFile, 'utf8')
        .replace(/<\?xml[^?]*\?>\s*/g, '')
        .replace(/(<svg[^>]*) width="[^"]*"/, '$1')
        .replace(/(<svg[^>]*) height="[^"]*"/, '$1')
      return `<div class="mermaid-diagram">${svg}</div>`
    })
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }

  writeFileSync(previewFile, content)

  // Step 2: Marp CLI
  const outputArgs =
    format === '--pdf'     ? ['--pdf',  '--allow-local-files', '-o', join(dir, `${stem}.pdf`)]
  : format === '--pptx'    ? ['--pptx', '--allow-local-files', '-o', join(dir, `${stem}.pptx`)]
  : format === '--preview' ? ['--preview']
  :                          ['-o', join(dir, `${stem}.html`)]

  const result = spawnSync(marp, ['--no-stdin', '--html', previewFile, ...outputArgs], { stdio: 'inherit' })
  return result.status ?? 0
}

// ── Run ───────────────────────────────────────────────────────────────────
let exitCode = 0
for (const f of inputFiles) {
  exitCode = Math.max(exitCode, buildFile(f))
}
process.exit(exitCode)
