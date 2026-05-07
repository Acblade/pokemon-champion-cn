import fs from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const generatedRoot = path.join(projectRoot, 'src', 'generated')
const detailsPath = path.join(generatedRoot, 'pokemon-details.json')
const detailDir = path.join(generatedRoot, 'details')

fs.mkdirSync(detailDir, { recursive: true })

const details = JSON.parse(fs.readFileSync(detailsPath, 'utf8')) as Record<string, unknown>

for (const [id, payload] of Object.entries(details)) {
  fs.writeFileSync(path.join(detailDir, `${id}.json`), JSON.stringify(payload))
}

console.log(`Split ${Object.keys(details).length} detail files.`)
