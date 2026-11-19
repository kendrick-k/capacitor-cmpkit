// Declaration files keep the `.ts` extensions of the sources: rewrite relative imports to `.js`,
// then fail if any `.ts` specifier is left. `--check` only verifies.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const checkOnly = process.argv.includes('--check')
const files = readdirSync(dist).filter((f) => f.endsWith('.d.ts'))
if (!files.length) {
  console.error('[fix-dts] no .d.ts file in dist: run the build first')
  process.exit(1)
}

const bad = []
for (const file of files) {
  const path = join(dist, file)
  let text = readFileSync(path, 'utf8')
  if (!checkOnly) {
    text = text.replace(/(from\s+|import\s*\(\s*)(['"])(\.{1,2}\/[^'"]*)\.ts\2/g, '$1$2$3.js$2')
    writeFileSync(path, text)
  }
  if (/\.ts['"]/.test(text)) bad.push(file)
}

if (bad.length) {
  console.error(`[fix-dts] .ts specifiers left in: ${bad.join(', ')}`)
  process.exit(1)
}
console.log(`[fix-dts] ${files.length} declaration files OK`)
