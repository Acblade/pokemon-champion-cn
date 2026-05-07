import fs from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const generatedPath = path.join(projectRoot, 'src', 'generated', 'pokemon-index.json')
const raw = fs.readFileSync(generatedPath)
console.log(raw.slice(0, 120).toString('hex'))
console.log(raw.slice(0, 120).toString('utf8'))
