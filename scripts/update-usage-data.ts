import fs from 'node:fs'
import path from 'node:path'

const BASE_URL = 'https://champs.pokedb.tokyo'
const TARGET_SEASONS = (process.env.CHAMPS_SEASONS ?? process.env.CHAMPS_SEASON ?? '1,2,3')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
const TARGET_RULES = (process.env.CHAMPS_RULES ?? process.env.CHAMPS_RULE ?? '1')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
let SEASON = TARGET_SEASONS[0] ?? '3'
let RULE = TARGET_RULES[0] ?? '1'
const CONCURRENCY = Number(process.env.CHAMPS_CONCURRENCY ?? '6')
const DETAIL_LIMIT = Number(process.env.CHAMPS_DETAIL_LIMIT ?? '0')

const PATHS = {
  output: path.resolve('src/generated/usage-datasets.json'),
  legacyOutput: path.resolve('src/generated/pikalytics-usage.json'),
  details: path.resolve('src/generated/pokemon-details.json'),
  items: path.resolve('src/generated/items.json'),
  cache: path.resolve('src/generated/pokeapi-ja-lookup.json'),
}

// Champs numeric key → PS-style ID for regional/alt forms
const FORM_OVERRIDES: Record<string, string> = {
  '0026-01': 'raichualola',
  '0038-01': 'ninetalesalola',
  '0059-01': 'arcaninehisui',
  '0080-02': 'slowbrogalar',
  '0128-01': 'taurospaldeacombat',
  '0128-02': 'taurospaldeablaze',
  '0128-03': 'taurospaldeaaqua',
  '0157-01': 'typhlosionhisui',
  '0199-01': 'slowkinggalar',
  '0479-01': 'rotomheat',
  '0479-02': 'rotomwash',
  '0479-03': 'rotomfrost',
  '0479-04': 'rotomfan',
  '0479-05': 'rotommow',
  '0503-01': 'samurotthisui',
  '0571-01': 'zoroarkhisui',
  '0618-01': 'stunfiskgalar',
  '0666-18': 'vivillon',
  '0670-05': 'floetteeternal',
  '0678-01': 'meowsticf',
  '0706-01': 'goodrahisui',
  '0711-01': 'gourgeistsmall',
  '0711-02': 'gourgeistlarge',
  '0711-03': 'gourgeistsuper',
  '0713-01': 'avalugghisui',
  '0724-01': 'decidueyehisui',
  '0745-01': 'lycanrocmidnight',
  '0745-02': 'lycanrocdusk',
  '0902-01': 'basculegionf',
}

// ---------- types ----------

type RawEntry = Record<string, unknown>

export type UsageItem = { zh: string; en: string; percent: number }
export type UsageSpread = { nature: string; spread: string; percent: number }
export type UsageTeammate = { zh: string; en: string; key: string }

export type UsageEntry = {
  id: string
  name: string
  zh: string
  rank: number
  items: UsageItem[]
  moves: UsageItem[]
  abilities: UsageItem[]
  natures: UsageItem[]
  spreads: UsageSpread[]
  teammates: UsageTeammate[]
}

type TrainerRankingEntry = { rank: number; rating: number | null; name: string }

type UsageDataset = {
  source: string
  sourceUrl: string
  trainerSourceUrl: string
  format: string
  regulation: 'M-A' | 'M-B'
  battle: 'Doubles' | 'Singles'
  season: string
  rule: string
  date: string
  updatedAt: string
  count: number
  missingPokemon: { key: string; rank: number; jpName: string }[]
  trainerRankingsAvailable: boolean
  trainerRankingsNote?: string
  trainerRankings: TrainerRankingEntry[]
  entries: Record<string, UsageEntry>
}

type UsageCollection = {
  source: string
  sourceUrl: string
  defaultKey: string
  updatedAt: string
  datasets: Record<string, UsageDataset>
}

type PokemonDetail = {
  id: string
  num: number
  name: string
  zh: string
  baseSpeciesId: string
  baseSpeciesName: string
  moves?: { en: string; zh: string }[]
  abilities?: { en: string; zh: string }[]
}

type TermEntry = { jp: string; en: string; zh: string }
type TranslationCache = {
  updatedAt: string
  moves: Record<string, TermEntry>
  items: Record<string, TermEntry>
  abilities: Record<string, TermEntry>
  natures: Record<string, TermEntry>
}

// ---------- utilities ----------

function toId(name: string) {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '')
}

function normJp(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(String(value).replace('%', ''))
  return Number.isFinite(n) ? n : null
}

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ').trim()
}

function decodeHtml(html: string) {
  return html.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
}

function titleCase(slug: string) {
  return slug.split('-').map(p => p ? `${p[0].toUpperCase()}${p.slice(1)}` : p).join(' ')
}

function regulationForSeason(season: string): 'M-A' | 'M-B' {
  return Number(season) >= 3 ? 'M-B' : 'M-A'
}

function battleForRule(rule: string): 'Doubles' | 'Singles' {
  return rule === '2' ? 'Singles' : 'Doubles'
}

function datasetKey(season: string, rule: string) {
  return `champs-season-${season}-rule-${rule}`
}

function loadExistingCollection(): UsageCollection | null {
  if (!fs.existsSync(PATHS.output)) return null
  const raw = JSON.parse(fs.readFileSync(PATHS.output, 'utf8')) as Partial<UsageCollection>
  if (!raw.datasets || typeof raw.datasets !== 'object') return null
  return raw as UsageCollection
}

// ---------- HTTP ----------

async function getText(url: string) {
  const res = await fetch(url, { headers: { 'user-agent': 'pokemon-champion-cn/1.0' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.text()
}

async function getPage(url: string) {
  const res = await fetch(url, { headers: { 'user-agent': 'pokemon-champion-cn/1.0' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return { text: await res.text(), finalUrl: res.url }
}

function isRequestedListPage(finalUrl: string, kind: 'pokemon' | 'trainer') {
  const parsed = new URL(finalUrl)
  return parsed.pathname === `/${kind}/list` &&
    parsed.searchParams.get('season') === SEASON &&
    parsed.searchParams.get('rule') === RULE &&
    !parsed.searchParams.has('fallback')
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'pokemon-champion-cn/1.0' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json() as Promise<T>
}

async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i], i)
      }
    }),
  )
  return results
}

// ---------- translation cache ----------

function buildLocalMaps(details: Record<string, PokemonDetail>) {
  const moves = new Map<string, string>()
  const abilities = new Map<string, string>()
  for (const d of Object.values(details)) {
    for (const m of d.moves ?? []) if (m.en && m.zh) moves.set(m.en.toLowerCase(), m.zh)
    for (const a of d.abilities ?? []) if (a.en && a.zh) abilities.set(a.en.toLowerCase(), a.zh)
  }
  const items = new Map<string, string>()
  const rawItems = JSON.parse(fs.readFileSync(PATHS.items, 'utf8')) as { en: string; zh: string }[]
  for (const item of rawItems) if (item.en && item.zh) items.set(item.en.toLowerCase(), item.zh)
  const natures = new Map([
    ['hardy', '勤奋'], ['lonely', '怕寂寞 攻击+ 防御-'], ['brave', '勇敢 攻击+ 速度-'],
    ['adamant', '固执 攻击+ 特攻-'], ['naughty', '顽皮 攻击+ 特防-'], ['bold', '大胆 防御+ 攻击-'],
    ['docile', '坦率'], ['relaxed', '悠闲 防御+ 速度-'], ['impish', '淘气 防御+ 特攻-'],
    ['lax', '乐天 防御+ 特防-'], ['timid', '胆小 速度+ 攻击-'], ['hasty', '急躁 速度+ 防御-'],
    ['serious', '认真'], ['jolly', '爽朗 速度+ 特攻-'], ['naive', '天真 速度+ 特防-'],
    ['modest', '内敛 特攻+ 攻击-'], ['mild', '马虎 特攻+ 防御-'], ['quiet', '冷静 特攻+ 速度-'],
    ['bashful', '害羞'], ['rash', '马大哈 特攻+ 特防-'], ['calm', '沉着 特防+ 攻击-'],
    ['gentle', '温顺 特防+ 防御-'], ['sassy', '自大 特防+ 速度-'], ['careful', '慎重 特防+ 特攻-'],
    ['quirky', '浮躁'],
  ])
  return { moves, abilities, items, natures }
}

async function buildResourceLookup(
  resource: 'move' | 'item' | 'ability' | 'nature',
  enToZh: Map<string, string>,
): Promise<Record<string, TermEntry>> {
  const list = await getJson<{ results: { name: string; url: string }[] }>(
    `https://pokeapi.co/api/v2/${resource}?limit=5000`,
  )
  const pairs = await mapConcurrent(list.results, 24, async (result) => {
    const detail = await getJson<{ name: string; names: { name: string; language: { name: string } }[] }>(result.url)
    const jp =
      detail.names.find(n => n.language.name === 'ja-Hrkt')?.name ||
      detail.names.find(n => n.language.name === 'ja')?.name ||
      ''
    const en = detail.names.find(n => n.language.name === 'en')?.name || titleCase(detail.name)
    if (!jp || !en) return null
    const zh = enToZh.get(en.toLowerCase()) ?? en
    return [normJp(jp), { jp, en, zh }] as const
  })
  const lookup: Record<string, TermEntry> = {}
  for (const pair of pairs) if (pair) lookup[pair[0]] = pair[1]
  return lookup
}

async function loadTranslationCache(details: Record<string, PokemonDetail>): Promise<TranslationCache> {
  if (fs.existsSync(PATHS.cache) && !process.env.REFRESH_CACHE) {
    return JSON.parse(fs.readFileSync(PATHS.cache, 'utf8')) as TranslationCache
  }
  console.log('Building translation cache from PokeAPI (this takes a few minutes)...')
  const local = buildLocalMaps(details)
  const cache: TranslationCache = {
    updatedAt: new Date().toISOString(),
    moves: await buildResourceLookup('move', local.moves),
    items: await buildResourceLookup('item', local.items),
    abilities: await buildResourceLookup('ability', local.abilities),
    natures: await buildResourceLookup('nature', local.natures),
  }
  fs.writeFileSync(PATHS.cache, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
  return cache
}

function translate(jp: string, lookup: Record<string, TermEntry>): { zh: string; en: string } {
  const hit = lookup[normJp(jp)]
  return hit ? { zh: hit.zh, en: hit.en } : { zh: jp, en: jp }
}

// ---------- HTML parsers ----------

function parsePokemonList(html: string): { key: string; rank: number; jpName: string; href: string }[] {
  const entries: { key: string; rank: number; jpName: string; href: string }[] = []
  const re = /<a\s+href="(\/pokemon\/show\/(\d{4}-\d{2})\?season=\d+(?:&amp;|&)rule=\d+)"\s+class="list-pokemon[\s\S]*?<div class="pokemon-rank[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div class="pokemon-name">([\s\S]*?)<\/div>[\s\S]*?<\/a>/g
  for (const m of html.matchAll(re)) {
    const rank = toNumber(stripTags(m[3]))
    if (!rank) continue
    entries.push({ key: m[2], rank, jpName: stripTags(m[4]), href: decodeHtml(m[1]) })
  }
  return entries
}

function maxPage(html: string, kind: 'pokemon' | 'trainer'): number {
  const re = new RegExp(`/${kind}/list\\?season=${SEASON}(?:&amp;|&)rule=${RULE}(?:&amp;|&)page=(\\d+)`, 'g')
  let max = 1
  for (const m of html.matchAll(re)) max = Math.max(max, Number(m[1]) || 1)
  return max
}

function parsePieCharts(html: string): RawEntry[][] {
  const charts: RawEntry[][] = []
  for (const m of html.matchAll(/window\.usagePieChart\((\[[\s\S]*?\])\)/g)) {
    try { charts.push(JSON.parse(decodeHtml(m[1])) as RawEntry[]) } catch { /* skip malformed */ }
  }
  return charts
}

const STAT_LABELS: Record<string, string> = { H: 'HP', A: '攻击', B: '防御', C: '特攻', D: '特防', S: '速度', '+': '余下' }

function parseMoves(html: string): { jpName: string; percent: number }[] {
  const start = html.indexOf('pokemon-trend__moves')
  if (start < 0) return []
  const end = html.indexOf('pokemon-trend__column-abilities', start)
  const section = html.slice(start, end > start ? end : start + 50000)
  const results: { jpName: string; percent: number }[] = []
  const re = /<div class="pokemon-trend__move-item">[\s\S]*?title="[^"]*"[\s\S]*?<span class="pokemon-trend__move-name">([\s\S]*?)<\/span>[\s\S]*?<span class="pokemon-trend__move-rate[^>]*>\s*([\d.]+)<small>%/g
  for (const m of section.matchAll(re)) {
    const jpName = stripTags(m[1])
    const percent = toNumber(m[2])
    if (jpName && percent !== null) results.push({ jpName, percent })
  }
  return results.slice(0, 12)
}

function parseSpreads(html: string): { jpNature: string; spread: string; percent: number }[] {
  const start = html.indexOf('pokemon-trend__column-stats')
  if (start < 0) return []
  const end = html.indexOf('pokemon-trend__column-same_team', start)
  const section = html.slice(start, end > start ? end : start + 90000)
  const results: { jpNature: string; spread: string; percent: number }[] = []
  const re = /<li class="usage-list-item usage-list-item--stats"[\s\S]*?<span class="usage-name usage-name--stats">([\s\S]*?)<\/span>[\s\S]*?<span class="usage-rate[^>]*>([\s\S]*?)<\/span>([\s\S]*?)(?=<li class="usage-list-item usage-list-item--stats"|<\/ul>\s*<\/div>)/g
  for (const m of section.matchAll(re)) {
    const jpNature = stripTags(m[1])
    const percent = toNumber(stripTags(m[2]))
    const chips: string[] = []
    const block = m[3].split('pokemon-stat-spread__details')[0]
    for (const chip of block.matchAll(/<span class="pokemon-stat-spread__label">([\s\S]*?)<\/span>\s*<span class="pokemon-stat-spread__value[^>]*>([\s\S]*?)<\/span>/g)) {
      const stat = stripTags(chip[1])
      chips.push(`${STAT_LABELS[stat] ?? stat} ${stripTags(chip[2])}`)
    }
    const spread = chips.filter(c => !c.includes('余り')).join(' / ')
    if (jpNature && percent !== null) results.push({ jpNature, spread, percent })
  }
  return results.slice(0, 10)
}

function parseTeammates(html: string): { key: string; jpName: string }[] {
  const start = html.indexOf('pokemon-trend__column-same_team')
  if (start < 0) return []
  const next = html.indexOf('pokemon-trend__column-', start + 'pokemon-trend__column-same_team'.length)
  const section = html.slice(start, next > start ? next : start + 35000)
  const results: { key: string; jpName: string }[] = []
  const seen = new Set<string>()
  for (const m of section.matchAll(/href="\/pokemon\/show\/(\d{4}-\d{2})\?season=\d+(?:&amp;|&)rule=\d+"[\s\S]*?<span class="usage-name">([\s\S]*?)<\/span>/g)) {
    if (seen.has(m[1])) continue
    seen.add(m[1])
    results.push({ key: m[1], jpName: stripTags(m[2]) })
  }
  return results.slice(0, 10)
}

function parseTrainers(html: string): { rank: number; rating: number | null; name: string }[] {
  const results: { rank: number; rating: number | null; name: string }[] = []
  for (const m of html.matchAll(/<article class="trainer-card">([\s\S]*?)<\/article>/g)) {
    const block = m[1]
    const rank = toNumber(block.match(/data-rank="(\d+)"/)?.[1])
    const ratingInt = stripTags(block.match(/<span class="rating-integer">([\s\S]*?)<\/span>/)?.[1] ?? '')
    const ratingDec = stripTags(block.match(/<span class="rating-decimal">([\s\S]*?)<\/span>/)?.[1] ?? '')
    const rating = ratingInt
      ? toNumber(`${ratingInt}${ratingDec}`)
      : toNumber(stripTags(block.match(/<div class="trainer-card-rating[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''))
    const name = stripTags(block.match(/<div class="trainer-card-name">([\s\S]*?)<\/div>/)?.[1] ?? '')
    if (rank && name) results.push({ rank, rating, name })
  }
  return results
}

// ---------- detail loading ----------

function loadDetails() {
  const raw = JSON.parse(fs.readFileSync(PATHS.details, 'utf8')) as Record<string, PokemonDetail>
  const byNum = new Map<number, PokemonDetail>()
  for (const d of Object.values(raw)) {
    if (!d.name.includes('-Mega') && !byNum.has(d.num)) byNum.set(d.num, d)
  }
  const byKey = new Map<string, PokemonDetail>()
  for (const d of Object.values(raw)) {
    if (!d.name.includes('-Mega') && d.num)
      byKey.set(`${String(d.num).padStart(4, '0')}-00`, byNum.get(d.num) ?? d)
  }
  for (const [k, id] of Object.entries(FORM_OVERRIDES)) {
    const d = raw[id]
    if (d) byKey.set(k, d)
  }
  return { raw, byKey }
}

async function fetchAllPokemon() {
  const firstHtml = await getText(`${BASE_URL}/pokemon/list?season=${SEASON}&rule=${RULE}&page=1`)
  const pages = maxPage(firstHtml, 'pokemon')
  const all = parsePokemonList(firstHtml)
  for (let p = 2; p <= pages; p++) {
    const html = await getText(`${BASE_URL}/pokemon/list?season=${SEASON}&rule=${RULE}&page=${p}`)
    all.push(...parsePokemonList(html))
  }
  return all.sort((a, b) => a.rank - b.rank)
}

async function fetchAllTrainers() {
  const requestedUrl = `${BASE_URL}/trainer/list?season=${SEASON}&rule=${RULE}`
  const firstPage = await getPage(`${requestedUrl}&page=1`)
  if (!isRequestedListPage(firstPage.finalUrl, 'trainer')) {
    console.warn(`Trainer rankings unavailable for season=${SEASON} rule=${RULE}; source returned ${firstPage.finalUrl}`)
    return {
      sourceUrl: requestedUrl,
      available: false,
      note: `当前赛季玩家排名尚未开放，来源页面回退到 ${firstPage.finalUrl}`,
      rankings: [] as TrainerRankingEntry[],
    }
  }
  const pages = maxPage(firstPage.text, 'trainer')
  const all = parseTrainers(firstPage.text)
  for (let p = 2; p <= pages; p++) {
    const html = await getText(`${BASE_URL}/trainer/list?season=${SEASON}&rule=${RULE}&page=${p}`)
    all.push(...parseTrainers(html))
  }
  return {
    sourceUrl: requestedUrl,
    available: true,
    rankings: all.sort((a, b) => a.rank - b.rank),
  }
}

async function fetchPokemonDetail(
  listEntry: { key: string; rank: number; href: string },
  byKey: Map<string, PokemonDetail>,
  cache: TranslationCache,
): Promise<UsageEntry | null> {
  const detail = byKey.get(listEntry.key)
  if (!detail) return null

  const html = await getText(`${BASE_URL}${listEntry.href}`)
  // charts[0]=abilities, charts[1]=natures, charts[2]=items
  const charts = parsePieCharts(html)

  const items: UsageItem[] = (charts[2] ?? []).slice(0, 10).map(raw => {
    const { zh, en } = translate(String(raw.name ?? ''), cache.items)
    return { zh, en, percent: toNumber(raw.rate ?? raw.percent) ?? 0 }
  })

  const moves: UsageItem[] = parseMoves(html).map(({ jpName, percent }) => {
    const { zh, en } = translate(jpName, cache.moves)
    return { zh, en, percent }
  })

  const abilities: UsageItem[] = (charts[0] ?? []).slice(0, 8).map(raw => {
    const { zh, en } = translate(String(raw.name ?? ''), cache.abilities)
    return { zh, en, percent: toNumber(raw.rate ?? raw.percent) ?? 0 }
  })

  const natures: UsageItem[] = (charts[1] ?? []).slice(0, 10).map(raw => {
    const { zh, en } = translate(String(raw.name ?? ''), cache.natures)
    return { zh, en, percent: toNumber(raw.rate ?? raw.percent) ?? 0 }
  })

  const spreads: UsageSpread[] = parseSpreads(html).map(({ jpNature, spread, percent }) => {
    const { zh: natureZh } = translate(jpNature, cache.natures)
    return { nature: natureZh, spread, percent }
  })

  const teammates: UsageTeammate[] = parseTeammates(html).map(({ key, jpName }) => {
    const tm = byKey.get(key)
    return { zh: tm?.zh || jpName, en: tm?.name || jpName, key }
  })

  return {
    id: toId(detail.id),
    name: detail.name,
    zh: detail.zh || detail.name,
    rank: listEntry.rank,
    items,
    moves,
    abilities,
    natures,
    spreads,
    teammates,
  }
}

// ---------- main ----------

async function fetchUsageDataset(
  byKey: Map<string, PokemonDetail>,
  cache: TranslationCache,
): Promise<UsageDataset> {
  const pokemonList = await fetchAllPokemon()
  console.log(`Found ${pokemonList.length} Pokémon in rankings`)

  const targetList = DETAIL_LIMIT > 0 ? pokemonList.slice(0, DETAIL_LIMIT) : pokemonList
  const detailResults = await mapConcurrent(targetList, CONCURRENCY, entry =>
    fetchPokemonDetail(entry, byKey, cache),
  )

  const entries: Record<string, UsageEntry> = {}
  const missingPokemon: UsageDataset['missingPokemon'] = []
  for (let i = 0; i < pokemonList.length; i++) {
    const listEntry = pokemonList[i]
    const detail = byKey.get(listEntry.key)
    if (!detail) {
      missingPokemon.push({ key: listEntry.key, rank: listEntry.rank, jpName: listEntry.jpName })
      continue
    }
    const id = toId(detail.id)
    // Use fetched detail if available, otherwise stub with rank only
    entries[id] = detailResults[i] ?? {
      id, name: detail.name, zh: detail.zh || detail.name,
      rank: listEntry.rank, items: [], moves: [], abilities: [], natures: [], spreads: [], teammates: [],
    }
  }

  const trainers = await fetchAllTrainers()

  return {
    source: 'Battle Database Champions',
    sourceUrl: `${BASE_URL}/pokemon/list?season=${SEASON}&rule=${RULE}`,
    trainerSourceUrl: trainers.sourceUrl,
    format: datasetKey(SEASON, RULE),
    regulation: regulationForSeason(SEASON),
    battle: battleForRule(RULE),
    season: SEASON,
    rule: RULE,
    date: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
    count: Object.keys(entries).length,
    missingPokemon,
    trainerRankingsAvailable: trainers.available,
    trainerRankingsNote: trainers.note,
    trainerRankings: trainers.rankings,
    entries,
  }

  /*
  fs.mkdirSync(path.dirname(PATHS.output), { recursive: true })
  fs.writeFileSync(PATHS.output, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  console.log(
    `Wrote ${output.count} Pokémon and ${trainers.length} trainers → ${path.relative(process.cwd(), PATHS.output)}`,
  )
  */
}

async function main() {
  const { raw, byKey } = loadDetails()
  const cache = await loadTranslationCache(raw)
  const existing = loadExistingCollection()
  const datasets: Record<string, UsageDataset> = { ...(existing?.datasets ?? {}) }

  for (const season of TARGET_SEASONS) {
    for (const rule of TARGET_RULES) {
      SEASON = season
      RULE = rule
      const output = await fetchUsageDataset(byKey, cache)
      datasets[output.format] = output
      if (output.missingPokemon.length) {
        console.warn(
          `Missing ${output.missingPokemon.length} Pokemon for ${output.format}: ` +
          output.missingPokemon.map(p => `${p.key} ${p.jpName}`).join(', '),
        )
      }
      console.log(`Fetched ${output.count} Pokemon and ${output.trainerRankings.length} trainers for ${output.format}`)
    }
  }

  const defaultSeason = process.env.CHAMPS_DEFAULT_SEASON ?? TARGET_SEASONS[TARGET_SEASONS.length - 1] ?? '3'
  const defaultRule = process.env.CHAMPS_DEFAULT_RULE ?? TARGET_RULES[0] ?? '1'
  const defaultKey = datasetKey(defaultSeason, defaultRule)
  const fallbackKey = Object.keys(datasets).sort().at(-1) ?? defaultKey
  const collection: UsageCollection = {
    source: 'Battle Database Champions',
    sourceUrl: BASE_URL,
    defaultKey: datasets[defaultKey] ? defaultKey : fallbackKey,
    updatedAt: new Date().toISOString(),
    datasets,
  }

  fs.mkdirSync(path.dirname(PATHS.output), { recursive: true })
  fs.writeFileSync(PATHS.output, `${JSON.stringify(collection, null, 2)}\n`, 'utf8')
  if (collection.defaultKey && collection.datasets[collection.defaultKey]) {
    fs.writeFileSync(PATHS.legacyOutput, `${JSON.stringify(collection.datasets[collection.defaultKey], null, 2)}\n`, 'utf8')
  }
  console.log(`Wrote ${Object.keys(collection.datasets).length} usage datasets -> ${path.relative(process.cwd(), PATHS.output)}`)
}

main().catch(err => { console.error(err); process.exit(1) })
