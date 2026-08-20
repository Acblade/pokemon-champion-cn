import fs from 'node:fs'
import path from 'node:path'

type TrainerRankingEntry = { rank: number; rating: number | null; name: string }

type UsageDataset = {
  trainerSource?: string
  trainerSourceUrl?: string
  trainerRankingsUpdatedAt?: string
  trainerRankingsAvailable?: boolean
  trainerRankingsNote?: string
  trainerRankingsFinal?: boolean
  trainerRankingSourceSeason?: string
  trainerRankingSourceRule?: string
  updatesFrozen?: boolean
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

function parseRankingName(rawValue: string) {
  const normalizedValue = rawValue.trim().replace(/\s+/g, ' ')
  const tokens = normalizedValue.split(/\s+/).filter(Boolean)
  if (tokens.length >= 2 && tokens.length % 2 === 0) {
    const middle = tokens.length / 2
    const left = tokens.slice(0, middle).join(' ')
    const right = tokens.slice(middle).join(' ')
    if (left === right) return left
  }
  return normalizedValue
}

function isRankingToken(value: string, expectedRank: number) {
  return /^\d{1,3}$/.test(value) && Number(value) === expectedRank
}

function isRatingToken(value: string) {
  const rating = Number(value)
  return /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(rating) && rating >= 0
}

function findRankingStart(tokens: string[], fromIndex: number, expectedRank: number) {
  for (let index = fromIndex; index < tokens.length - 1; index += 1) {
    if (isRankingToken(tokens[index], expectedRank) && isRatingToken(tokens[index + 1])) return index
  }
  return -1
}

function parseRankingsSequential(text: string) {
  const tokens = text
    .replace(/\r\n/g, '\n')
    .replace(/^日本時間.*$/gm, '\n')
    .replace(/^日本时间.*$/gm, '\n')
    .replace(/--+/g, '\n')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
  const rankings: TrainerRankingEntry[] = []
  let cursor = 0
  for (let expectedRank = 1; expectedRank <= 300; expectedRank += 1) {
    const start = findRankingStart(tokens, cursor, expectedRank)
    if (start < 0) break
    const nextStart = expectedRank < 300 ? findRankingStart(tokens, start + 2, expectedRank + 1) : tokens.length
    const end = nextStart < 0 ? tokens.length : nextStart
    const name = parseRankingName(tokens.slice(start + 2, end).join(' '))
    const rating = Number(tokens[start + 1])
    if (!name || !Number.isFinite(rating)) break
    rankings.push({ rank: expectedRank, rating, name })
    cursor = end
  }
  return rankings
}

function parseRankingsByRecordPattern(text: string) {
  const normalizedText = text
    .replace(/\r\n/g, '\n')
    .replace(/^日本時間.*$/gm, '\n')
    .replace(/^日本时间.*$/gm, '\n')
    .replace(/--+/g, '\n')
  const rankings: TrainerRankingEntry[] = []
  const recordPattern = /(?:^|\s)(\d{1,3})\s+(\d+(?:\.\d+)?)\s+([\s\S]*?)(?=\s+\d{1,3}\s+\d+(?:\.\d+)?\s+|$)/g
  for (const match of normalizedText.matchAll(recordPattern)) {
    const rank = Number(match[1])
    const rating = Number(match[2])
    const name = parseRankingName(match[3])
    if (rank >= 1 && rank <= 300 && Number.isFinite(rating) && name) {
      rankings.push({ rank, rating, name })
    }
  }
  return rankings
}

function parseRankings(text: string) {
  const sequentialRankings = parseRankingsSequential(text)
  if (sequentialRankings.length >= 300) return sequentialRankings.slice(0, 300)

  const patternRankings = parseRankingsByRecordPattern(text)
  if (patternRankings.length > 0) return patternRankings.sort((a, b) => a.rank - b.rank)

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

function trainerRankingSourceUrl(dataset: UsageDataset) {
  const season = dataset.trainerRankingSourceSeason || dataset.season
  const rule = dataset.trainerRankingSourceRule || dataset.rule
  return `https://champs.pokedb.tokyo/trainer/list?season=${season}&rule=${rule}`
}

const text = fs.readFileSync(path.resolve(inputPath), 'utf8')
const importedAt = parseJstTimestamp(text)
const rankings = parseRankings(text)
const collection = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as UsageCollection
const datasetKey = process.env.CHAMPS_MANUAL_RANKING_DATASET || collection.defaultKey
const dataset = collection.datasets[datasetKey]
if (!dataset) throw new Error(`Dataset not found: ${datasetKey}`)
if (dataset.updatesFrozen && process.env.CHAMPS_ALLOW_FROZEN_IMPORT !== '1') {
  throw new Error(`Dataset is frozen and cannot be updated without CHAMPS_ALLOW_FROZEN_IMPORT=1: ${datasetKey}`)
}

dataset.trainerSource = 'Battle Database Champions'
dataset.trainerSourceUrl = trainerRankingSourceUrl(dataset)
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
