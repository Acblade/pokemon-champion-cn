import fs from 'node:fs'
import path from 'node:path'

type TrainerRankingEntry = { rank: number; rating: number | null; name: string }

type UsageDataset = {
  trainerSource?: string
  trainerSourceUrl?: string
  trainerRankingsUpdatedAt?: string
  trainerRankingsAvailable?: boolean
  trainerRankingsNote?: string
  trainerRankings: TrainerRankingEntry[]
  updatedAt: string
  season: string
  rule: string
}

type UsageCollection = {
  defaultKey: string
  updatedAt: string
  datasets: Record<string, UsageDataset>
}

const inputPath = process.argv[2]
if (!inputPath) {
  throw new Error('Usage: npm run import-manual-trainers -- <ranking-text-file>')
}

const outputPath = path.resolve('src/generated/usage-datasets.json')
const legacyOutputPath = path.resolve('src/generated/pikalytics-usage.json')

function parseJstTimestamp(text: string) {
  const explicit = process.env.CHAMPS_MANUAL_RANKING_TIME_JST
  const source = explicit || text
  const match = source.match(/(?:日本时间\s*)?(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})/)
  if (!match) return new Date().toISOString()
  const [, year, month, day, hour, minute] = match
  const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 9, Number(minute), 0)
  return new Date(utcMs).toISOString()
}

function parseRankings(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== '--' && !line.startsWith('日本时间'))

  const rankings: TrainerRankingEntry[] = []
  for (let index = 0; index < lines.length;) {
    const rank = Number(lines[index])
    const rating = Number(lines[index + 1])
    const name = lines[index + 2]
    if (Number.isInteger(rank) && Number.isFinite(rating) && name) {
      rankings.push({ rank, rating, name })
      const nextLine = lines[index + 3]
      const nextNextLine = lines[index + 4]
      const nextStartsRecord = Number.isInteger(Number(nextLine)) && Number.isFinite(Number(nextNextLine))
      index += nextStartsRecord ? 3 : 4
      continue
    }
    index += 1
  }

  if (rankings.length === 0) throw new Error('No trainer rankings parsed from input.')
  return rankings.sort((a, b) => a.rank - b.rank)
}

const text = fs.readFileSync(path.resolve(inputPath), 'utf8')
const importedAt = parseJstTimestamp(text)
const rankings = parseRankings(text)
const collection = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as UsageCollection
const datasetKey = process.env.CHAMPS_MANUAL_RANKING_DATASET || collection.defaultKey
const dataset = collection.datasets[datasetKey]
if (!dataset) throw new Error(`Dataset not found: ${datasetKey}`)

dataset.trainerSource = 'Battle Database Champions'
dataset.trainerSourceUrl = `https://champs.pokedb.tokyo/trainer/list?season=${dataset.season}&rule=${dataset.rule}`
dataset.trainerRankingsUpdatedAt = importedAt
dataset.trainerRankingsAvailable = true
dataset.trainerRankingsNote = `玩家排名由手动导入数据更新，原始时间按日本时间解析。`
dataset.trainerRankings = rankings
collection.updatedAt = new Date().toISOString()

fs.writeFileSync(outputPath, `${JSON.stringify(collection, null, 2)}\n`, 'utf8')
if (collection.datasets[collection.defaultKey]) {
  fs.writeFileSync(legacyOutputPath, `${JSON.stringify(collection.datasets[collection.defaultKey], null, 2)}\n`, 'utf8')
}

console.log(`Imported ${rankings.length} trainer rankings into ${datasetKey}; JST timestamp -> ${importedAt}`)
