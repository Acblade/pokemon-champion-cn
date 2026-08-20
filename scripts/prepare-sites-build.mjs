import fs from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const sourcePath = path.join(projectRoot, 'worker', 'index.js')
const outputDir = path.join(projectRoot, 'dist', 'server')

fs.mkdirSync(outputDir, { recursive: true })
fs.copyFileSync(sourcePath, path.join(outputDir, 'index.js'))
