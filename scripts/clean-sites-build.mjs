import fs from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const outputDir = path.resolve(projectRoot, 'dist')

if (path.dirname(outputDir) !== path.resolve(projectRoot) || path.basename(outputDir) !== 'dist') {
  throw new Error(`Refusing to clean unexpected Sites output path: ${outputDir}`)
}

fs.rmSync(outputDir, { recursive: true, force: true })
