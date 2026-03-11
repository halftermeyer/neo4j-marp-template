/**
 * build.mjs — Neo4j Marp build pipeline
 *
 * Usage:
 *   node build.mjs [input.md] [--html|--pdf|--pptx|--preview] [--no-densify]
 *
 * Defaults:
 *   input  → all Marp *.md files in decks/
 *   format → --html
 *
 * Examples:
 *   npm run pdf                         # all decks/*.md → *.pdf  (with auto-densify)
 *   npm run pdf -- dojo.md              # dojo.md → dojo.pdf
 *   npm run pdf -- dojo.md --no-densify # skip overflow detection
 *   node build.mjs dojo.md --pdf        # same as npm run pdf -- dojo.md
 *
 * PDF builds automatically detect overflowing slides and add
 * <!-- _class: dense --> to fix them, then rebuild. Pass --no-densify to skip.
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'fs'
import { execFileSync, spawnSync } from 'child_process'
import { tmpdir } from 'os'
import { join, basename, dirname, resolve } from 'path'
import hljs from 'highlight.js'
import cypher from 'highlightjs-cypher'
import puppeteer from 'puppeteer'

hljs.registerLanguage('cypher', cypher)

// ── Parse arguments ───────────────────────────────────────────────────────────
const args        = process.argv.slice(2)
const FORMAT_FLAGS = ['--pdf', '--pptx', '--html', '--preview']
const format      = args.find(a => FORMAT_FLAGS.includes(a)) ?? '--html'
const noDensify   = args.includes('--no-densify')
const inputArg    = args.find(a => !a.startsWith('--'))

// Resolve input files
const isMarpFile = f => {
  const text  = readFileSync(f, 'utf8')
  const match = text.match(/^---\n([\s\S]*?)\n---/)
  return match && /marp:\s*true/.test(match[1])
}

const DECKS_DIR = 'decks'

const inputFiles = inputArg
  ? [resolve(inputArg)]
  : readdirSync(DECKS_DIR)
      .filter(f => f.endsWith('.md') && !f.endsWith('.preview.md'))
      .map(f => resolve(DECKS_DIR, f))
      .filter(isMarpFile)

if (inputFiles.length === 0) {
  console.error('[build] No .md files found.')
  process.exit(1)
}

// ── Shared paths ──────────────────────────────────────────────────────────────
const mmdc          = new URL('./node_modules/.bin/mmdc',    import.meta.url).pathname
const marp          = new URL('./node_modules/.bin/marp',    import.meta.url).pathname
const mermaidConfig = new URL('./mermaid.config.json',       import.meta.url).pathname

// ── Preprocess: Cypher highlight + Mermaid → SVG ─────────────────────────────
function preprocess(inputFile) {
  const stem        = basename(inputFile, '.md')
  const dir         = dirname(inputFile)
  const previewFile = join(dir, `${stem}.preview.md`)

  let content = readFileSync(inputFile, 'utf8')

  content = content.replace(/```cypher\n([\s\S]*?)```/g, (_, code) => {
    const highlighted = hljs.highlight(code.trimEnd(), { language: 'cypher' }).value
    return `<pre class="hljs language-cypher"><code>${highlighted}</code></pre>`
  })

  const tmpDir = mkdtempSync(join(tmpdir(), 'marp-mermaid-'))
  try {
    let idx = 0
    content = content.replace(/```mermaid\n([\s\S]*?)```/g, (_, diagram) => {
      const inFile  = join(tmpDir, `d${idx}.mmd`)
      const outFile = join(tmpDir, `d${idx}.svg`)
      idx++
      writeFileSync(inFile, diagram.trimEnd())
      execFileSync(mmdc, ['-i', inFile, '-o', outFile, '--backgroundColor', 'transparent', '-c', mermaidConfig], { stdio: 'pipe' })
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
  return previewFile
}

// ── Overflow detection + dense patching ──────────────────────────────────────
const stripCodeFences = block => block.replace(/```[\s\S]*?```/g, '')

async function densifyIfNeeded(inputFile, htmlFile) {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  const page    = await browser.newPage()
  await page.goto(`file://${htmlFile}`)

  const slides = await page.evaluate(() =>
    Array.from(document.querySelectorAll('section[id]'))
      .filter(s => s.getAttribute('data-marpit-advanced-background') !== 'content')
      .map(s => ({
        id:        parseInt(s.id, 10),
        className: s.className,
        overflowH: s.scrollHeight > s.clientHeight,
        overflowW: s.scrollWidth  > s.clientWidth,
      }))
  )
  await browser.close()

  const overflowing = slides.filter(s =>
    (s.overflowH || s.overflowW) &&
    !s.className.includes('dense') &&
    !s.className.includes('lead') &&
    !s.className.includes('invert')
  )

  if (overflowing.length === 0) return false

  console.log(`[build] WARN overflowing slides detected (${overflowing.map(s => `#${s.id}`).join(', ')}) — adding dense`)

  // blocks[0]="" blocks[1]=frontmatter  blocks[N+1]=slide-N
  const source      = readFileSync(inputFile, 'utf8')
  const blocks      = source.split(/^---$/m)
  const overflowIds = new Set(overflowing.map(s => s.id))
  let patchCount    = 0

  const patched = blocks.map((block, i) => {
    const marpId = i - 1
    if (marpId < 1) return block
    if (!overflowIds.has(marpId)) return block

    const stripped = stripCodeFences(block)
    if (/<!--\s*_class:.*\bdense\b.*-->/.test(stripped)) return block

    if (/<!--\s*_class:[^>]+-->/.test(stripped)) {
      patchCount++
      return block.replace(
        /<!--\s*_class:([^>]+)-->/,
        (_, cls) => `<!-- _class: dense ${cls.trim()} -->`
      )
    }

    patchCount++
    return block.replace(/^(\n*)/, '$1\n<!-- _class: dense -->\n')
  })

  writeFileSync(inputFile, patched.join('---'))
  console.log(`[build] INFO  patched ${patchCount} slide(s) with dense`)
  return true
}

// ── Build one file ────────────────────────────────────────────────────────────
async function buildFile(inputFile) {
  const stem = basename(inputFile, '.md')
  const dir  = dirname(inputFile)

  console.log(`[build] ${basename(inputFile)} → ${format.replace('--', '')}`)

  const previewFile = preprocess(inputFile)

  const outputArgs =
    format === '--pdf'     ? ['--pdf',  '--allow-local-files', '-o', join(dir, `${stem}.pdf`)]
  : format === '--pptx'    ? ['--pptx', '--allow-local-files', '-o', join(dir, `${stem}.pptx`)]
  : format === '--preview' ? ['--preview']
  :                          ['-o', join(dir, `${stem}.html`)]

  // For PDF: optionally detect overflow, patch, then rebuild
  if (format === '--pdf' && !noDensify) {
    // First pass: build to HTML for overflow check
    const htmlFile = join(dir, `${stem}.html`)
    spawnSync(marp, ['--no-stdin', '--html', previewFile, '-o', htmlFile], { stdio: 'pipe' })

    const patched = await densifyIfNeeded(inputFile, htmlFile)

    if (patched) {
      // Re-preprocess patched source, then build PDF
      preprocess(inputFile)
    }
  }

  const result = spawnSync(marp, ['--no-stdin', '--html', previewFile, ...outputArgs], { stdio: 'inherit' })
  return result.status ?? 0
}

// ── Run ───────────────────────────────────────────────────────────────────────
let exitCode = 0
for (const f of inputFiles) {
  exitCode = Math.max(exitCode, await buildFile(f))
}
process.exit(exitCode)
