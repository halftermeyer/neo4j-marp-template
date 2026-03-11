/**
 * densify.mjs — Auto-detect overflowing slides and add <!-- _class: dense -->
 *
 * Usage:
 *   node densify.mjs [input.md] [--dry-run]
 *
 * Steps:
 *   1. Build the deck to HTML (via build.mjs)
 *   2. Load the HTML in Puppeteer and check each slide for overflow
 *   3. For overflowing slides without `dense`, patch the source .md
 *   4. If changes were made, rebuild to PDF
 *
 * Options:
 *   --dry-run   Report overflowing slides but do not modify the source file
 */

import { readFileSync, writeFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { resolve, dirname, basename, join } from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const inputArg = args.find(a => !a.startsWith('--'))

if (!inputArg) {
  console.error('Usage: node densify.mjs <input.md> [--dry-run]')
  process.exit(1)
}

const inputFile = resolve(inputArg)
const stem = basename(inputFile, '.md')
const dir = dirname(inputFile)
const htmlFile = join(dir, `${stem}.html`)

// ── Step 1: build to HTML ─────────────────────────────────────────────────────
console.log(`[densify] Building ${basename(inputFile)} → HTML…`)
const buildScript = join(__dirname, 'build.mjs')
execFileSync(process.execPath, [buildScript, inputFile, '--html'], { stdio: 'inherit' })

// ── Step 2: detect overflow via Puppeteer ────────────────────────────────────
console.log('[densify] Checking slides for overflow…')
const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.goto(`file://${htmlFile}`)

const slides = await page.evaluate(() =>
  Array.from(document.querySelectorAll('section[id]'))
    // Exclude bg-split slides: their content section is narrower (text wraps more)
    // and overflow is a layout artefact, not a content density issue.
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
  !s.className.includes('lead') &&   // lead slides have their own layout — don't densify
  !s.className.includes('invert')    // invert slides likewise
)

if (overflowing.length === 0) {
  console.log('[densify] No overflow detected — nothing to do.')
  process.exit(0)
}

console.log(`[densify] Overflowing slides (need dense): ${overflowing.map(s => `#${s.id}`).join(', ')}`)

if (dryRun) {
  console.log('[densify] Dry run — source file not modified.')
  process.exit(0)
}

// ── Step 3: patch the source .md ─────────────────────────────────────────────
// Map slide number → 0-based index into the array of slide blocks split by /^---$/m
const source = readFileSync(inputFile, 'utf8')

// Split on slide separators: lines that are exactly `---`
// Keep the separators in between so we can rejoin losslessly
const blocks = source.split(/^---$/m)
// Layout: blocks[0] = "" (before opening ---), blocks[1] = frontmatter body,
//         blocks[2] = slide 1 (Marp id=1), blocks[3] = slide 2, …
// Therefore: Marp id N → blocks[N + 1], or blocks[i] → Marp id (i - 1)

const overflowIds = new Set(overflowing.map(s => s.id))
let patchCount = 0

// Strip fenced code blocks from a block before testing for _class comments,
// so we don't accidentally match `<!-- _class: ... -->` inside ``` fences.
const stripCodeFences = block => block.replace(/```[\s\S]*?```/g, '')

const patched = blocks.map((block, i) => {
  const marpId = i - 1           // blocks[2] → marpId=1, blocks[3] → marpId=2, …
  if (marpId < 1) return block   // skip the empty preamble and frontmatter body

  if (!overflowIds.has(marpId)) return block

  const stripped = stripCodeFences(block)

  // Already has dense (double-check at source level, outside code fences)
  if (/<!--\s*_class:.*\bdense\b.*-->/.test(stripped)) return block

  // Case A: existing _class comment outside code fences → add `dense`
  if (/<!--\s*_class:[^>]+-->/.test(stripped)) {
    patchCount++
    // Replace only the first _class comment that is NOT inside a code fence
    return block.replace(
      /<!--\s*_class:([^>]+)-->/,
      (_, cls) => `<!-- _class: dense ${cls.trim()} -->`
    )
  }

  // Case B: no _class comment → insert one after the leading newline
  patchCount++
  return block.replace(/^(\n*)/, '$1\n<!-- _class: dense -->\n')
})

writeFileSync(inputFile, patched.join('---'))
console.log(`[densify] Patched ${patchCount} slide(s) — source updated.`)

// ── Step 4: rebuild ───────────────────────────────────────────────────────────
console.log('[densify] Rebuilding PDF…')
execFileSync(process.execPath, [buildScript, inputFile, '--pdf'], { stdio: 'inherit' })
console.log('[densify] Done.')
