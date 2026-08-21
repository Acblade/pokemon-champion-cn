import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const BASE_URL = 'https://champs.pokedb.tokyo'
const GAMEWITH_SOURCE = 'GameWith JP'
const OPGG_SOURCE = 'OP.GG Pokémon Champions'
const OPGG_TRAINER_URL = 'https://op.gg/pokemon-champions/leaderboards'
const OPGG_TRAINER_PAGE_SIZE = 100
const OPGG_TRAINER_PAGE_COUNT = 10
const GAMEWITH_URL_BY_RULE: Record<string, string> = {
  // Local rule=1 is Champions doubles; GameWith uses a separate doubles article.
  '1': 'https://gamewith.jp/pokemon-champions/558230',
  '2': 'https://gamewith.jp/pokemon-champions/555373',
}
const TARGET_SEASONS = (process.env.CHAMPS_SEASONS ?? process.env.CHAMPS_SEASON ?? '1,2,3,4,5')
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
const USAGE_SOURCE = (process.env.CHAMPS_USAGE_SOURCE ?? 'gamewith').toLowerCase()

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

const GAMEWITH_FORM_KEY_OVERRIDES: Record<string, string> = {
  '670_2': '0670-05',
}

const GAMEWITH_ITEM_ID_OVERRIDES: Record<string, string> = {
  ウツボットナイト: 'victreebelite',
  エアームドナイト: 'skarmorite',
  エンブオナイト: 'emboarite',
  オーダイルナイト: 'feraligite',
  カイリュナイト: 'dragoninite',
  カエンジシナイト: 'pyroarite',
  カラマネナイト: 'malamarite',
  ガメノデスナイト: 'barbaracite',
  キラフロルナイト: 'glimmoranite',
  ケケンカニナイト: 'crabominite',
  ゲッコウガナイト: 'greninjite',
  ゴルーグナイト: 'golurkite',
  シビルドナイト: 'eelektrossite',
  シャンデラナイト: 'chandelurite',
  ジジーロナイト: 'drampanite',
  スコヴィラナイト: 'scovillainite',
  スターミナイト: 'starminite',
  ズルズキナイト: 'scraftinite',
  タイレーツナイト: 'falinksite',
  チリーンナイト: 'chimechite',
  ドラミドナイト: 'dragalgite',
  ドリュウズナイト: 'excadrite',
  ニャオニクスナイト: 'meowsticite',
  ピクシナイト: 'clefablite',
  フラエッテナイト: 'floettite',
  ブリガロナイト: 'chesnaughtite',
  ペンドラナイト: 'scolipite',
  マフォクシナイト: 'delphoxite',
  ムクホークナイト: 'staraptite',
  メガニウムナイト: 'meganiumite',
  ユキメノコナイト: 'froslassite',
  ライチュウナイトX: 'raichunitex',
  ライチュウナイトY: 'raichunitey',
  ルチャブルナイト: 'hawluchanite',
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

type TrainerRankingEntry = {
  position?: number
  rank: number
  rating: number | null
  name: string
  trainerIconId?: number
  countryCode?: number
  countryAreaCode?: number
  country?: string
  countryFlag?: string
  language?: string
  wins?: number
  losses?: number
  winRate?: number
  winStreak?: number
}

type TrainerRankingResult = {
  source?: string
  sourceUrl: string
  updatedAt?: string
  top300Cutoff?: number
  top1000Cutoff?: number
  available: boolean
  note?: string
  rankings: TrainerRankingEntry[]
}

type UsageDataset = {
  source: string
  sourceUrl: string
  sourceUpdatedAt?: string
  trainerSource?: string
  trainerSourceUrl: string
  trainerRankingsUpdatedAt?: string
  trainerTop300Cutoff?: number
  trainerTop1000Cutoff?: number
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
  trainerRankingsFinal?: boolean
  trainerRankingSourceSeason?: string
  trainerRankingSourceRule?: string
  updatesFrozen?: boolean
  updatesFrozenAt?: string
  updatesFrozenReason?: string
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

type GeneratedItem = {
  id: string
  en: string
  zh: string
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

type GameWithPokemonData = {
  name: string
  abilities?: [string, string][]
  moves?: ([string, string, string] | [number, number])[]
  items?: ([string, string] | [number, number])[]
  evDistributions?: [[number, number, number, number, number, number], string][]
  natures?: [string, string][]
  teammates?: [number, string][]
}

type GameWithTooltipNames = {
  items: Map<string, string>
  moves: Map<string, string>
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
  return html
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number(value)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
}

function titleCase(slug: string) {
  return slug.split('-').map(p => p ? `${p[0].toUpperCase()}${p.slice(1)}` : p).join(' ')
}

function loadGeneratedItems() {
  const items = JSON.parse(fs.readFileSync(PATHS.items, 'utf8')) as GeneratedItem[]
  return new Map(items.map(item => [item.id, item]))
}

function regulationForSeason(season: string): 'M-A' | 'M-B' {
  const regulationBySeason: Record<string, 'M-A' | 'M-B'> = {
    '1': 'M-A',
    '2': 'M-A',
    '3': 'M-B',
    '4': 'M-B',
    '5': 'M-B',
  }
  const regulation = regulationBySeason[season]
  if (!regulation) throw new Error(`No regulation mapping configured for Champions season ${season}`)
  return regulation
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

function isRequestedListPage(finalUrl: string, kind: 'pokemon' | 'trainer', season = SEASON, rule = RULE) {
  const parsed = new URL(finalUrl)
  return parsed.pathname === `/${kind}/list` &&
    parsed.searchParams.get('season') === season &&
    parsed.searchParams.get('rule') === rule &&
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
    ['modest', '内敛 特攻+ 攻击-'], ['mild', '慢吞吞 特攻+ 防御-'], ['quiet', '冷静 特攻+ 速度-'],
    ['bashful', '害羞'], ['rash', '马虎 特攻+ 特防-'], ['calm', '温和 特防+ 攻击-'],
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

function applyLocalTranslations(cache: TranslationCache, details: Record<string, PokemonDetail>) {
  const local = buildLocalMaps(details)
  const localMovesById = new Map([...local.moves].map(([en, zh]) => [toId(en), zh]))
  const localItemsById = new Map([...local.items].map(([en, zh]) => [toId(en), zh]))
  const localAbilitiesById = new Map([...local.abilities].map(([en, zh]) => [toId(en), zh]))
  for (const entry of Object.values(cache.moves)) {
    const zh = local.moves.get(entry.en.toLowerCase()) ?? localMovesById.get(toId(entry.en))
    if (zh) entry.zh = zh
  }
  for (const entry of Object.values(cache.items)) {
    const zh = local.items.get(entry.en.toLowerCase()) ?? localItemsById.get(toId(entry.en))
    if (zh) entry.zh = zh
  }
  for (const entry of Object.values(cache.abilities)) {
    const zh = local.abilities.get(entry.en.toLowerCase()) ?? localAbilitiesById.get(toId(entry.en))
    if (zh) entry.zh = zh
  }
}

async function loadTranslationCache(details: Record<string, PokemonDetail>): Promise<TranslationCache> {
  if (fs.existsSync(PATHS.cache) && !process.env.REFRESH_CACHE) {
    const cache = JSON.parse(fs.readFileSync(PATHS.cache, 'utf8')) as TranslationCache
    applyLocalTranslations(cache, details)
    return cache
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
  applyLocalTranslations(cache, details)
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

function maxPage(html: string, kind: 'pokemon' | 'trainer', season = SEASON, rule = RULE): number {
  const re = new RegExp(`/${kind}/list\\?season=${season}(?:&amp;|&)rule=${rule}(?:&amp;|&)page=(\\d+)`, 'g')
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

type OpggTrainerRanking = {
  createdAt: string
  currentPage: number
  pageSize: number
  totalCount: number
  totalPages?: number
  trainers: unknown[]
}

type OpggTrainerDisplay = {
  position: number
  rank: number
  name: string
  trainerIconId?: number
  country: string
  countryFlag?: string
  language: string
}

function opggFormatForRule(rule: string): 'double' | 'single' {
  if (rule === '1') return 'double'
  if (rule === '2') return 'single'
  throw new Error(`No OP.GG trainer format configured for Champions rule ${rule}`)
}

function opggTrainerUrl(season: string, rule: string, page?: number) {
  const params = new URLSearchParams({
    format: opggFormatForRule(rule),
    season: `m-${season}`,
  })
  if (page !== undefined) params.set('page', String(page))
  return `${OPGG_TRAINER_URL}?${params.toString()}`
}

function extractNextFlightStrings(html: string) {
  const chunks: string[] = []
  for (const match of html.matchAll(/<script[^>]*>\s*self\.__next_f\.push\(([\s\S]*?)\)\s*<\/script>/g)) {
    let payload: unknown
    try {
      payload = JSON.parse(match[1])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`OP.GG Next RSC payload is invalid JSON: ${message}`, { cause: error })
    }
    if (Array.isArray(payload) && typeof payload[1] === 'string') chunks.push(payload[1])
  }
  if (chunks.length === 0) throw new Error('OP.GG Next RSC payload was not found')
  return chunks
}

function parseJsonValueAt(source: string, start: number) {
  const opening = source[start]
  const closing = opening === '{' ? '}' : opening === '[' ? ']' : undefined
  if (!closing) throw new Error('OP.GG Next RSC property is not a JSON object or array')

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < source.length; i++) {
    const char = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === opening) depth += 1
    else if (char === closing) {
      depth -= 1
      if (depth === 0) return JSON.parse(source.slice(start, i + 1)) as unknown
    }
  }
  throw new Error('OP.GG Next RSC property is truncated')
}

function extractJsonPropertyValues(source: string, property: string) {
  const marker = `${JSON.stringify(property)}:`
  const values: unknown[] = []
  let offset = 0
  while (offset < source.length) {
    const markerIndex = source.indexOf(marker, offset)
    if (markerIndex < 0) break
    let valueStart = markerIndex + marker.length
    while (/\s/.test(source[valueStart] ?? '')) valueStart += 1
    values.push(parseJsonValueAt(source, valueStart))
    offset = valueStart + 1
  }
  return values
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseOpggCreatedAtKst(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) throw new Error(`OP.GG createdAt is not a KST date-time: ${value}`)
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '00'] = match
  const parts = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number)
  const [year, month, day, hour, minute, second] = parts
  const utcTime = Date.UTC(year, month - 1, day, hour - 9, minute, second)
  const date = new Date(utcTime)
  const kstCheck = new Date(utcTime + 9 * 60 * 60 * 1000)
  const valid = kstCheck.getUTCFullYear() === year &&
    kstCheck.getUTCMonth() === month - 1 &&
    kstCheck.getUTCDate() === day &&
    kstCheck.getUTCHours() === hour &&
    kstCheck.getUTCMinutes() === minute &&
    kstCheck.getUTCSeconds() === second
  if (!valid) throw new Error(`OP.GG createdAt is invalid: ${value}`)
  return date.toISOString()
}

function parseOpggCutoff(html: string, top: 300 | 1000) {
  const match = html.match(new RegExp(`aria-label="Top ${top} Cutoff ([0-9]+(?:\\.[0-9]+)?)"`))
  const cutoff = match ? Number(match[1]) : Number.NaN
  if (!Number.isFinite(cutoff) || cutoff <= 0) throw new Error(`OP.GG Top ${top} cutoff was not found`)
  return cutoff
}

function parseOpggTrainerDisplays(html: string, expectedPage: number) {
  const cards = html.match(/<div data-trainer-ranking-view="cards"[^>]*><ol[^>]*>([\s\S]*?)<\/ol><\/div>/)?.[1]
  if (!cards) throw new Error(`OP.GG page ${expectedPage} card rankings were not found`)
  const blocks = [...cards.matchAll(/<li class="border-border bg-card rounded-sm border p-3 text-sm">([\s\S]*?)<\/li>/g)]
  if (blocks.length !== OPGG_TRAINER_PAGE_SIZE) {
    throw new Error(`OP.GG page ${expectedPage} contained ${blocks.length} rendered trainer cards`)
  }
  return blocks.map(([, block], index): OpggTrainerDisplay => {
    const expectedPosition = (expectedPage - 1) * OPGG_TRAINER_PAGE_SIZE + index + 1
    const rank = Number(block.match(/aria-label="Rank (\d+)"/)?.[1])
    const avatar = block.match(/pokemon-champions\/images\/trainer\/(\d+)\.png/)
    const name = decodeHtml(block.match(/<span class="min-w-0 truncate font-semibold">([\s\S]*?)<\/span>/)?.[1] ?? '').trim()
    const countryBlock = block.match(/<div class="flex min-w-0 items-center gap-3 text-xs"><span class="inline-flex items-center gap-1\.5 min-w-0">([\s\S]*?)<\/span><span class="inline-flex min-w-0 items-center gap-1\.5">/)?.[1] ?? ''
    const countryFlag = countryBlock.match(/pokemon-champions\/images\/icon\/([^"./?]+)\.svg/)?.[1]?.trim().toLowerCase()
    const country = decodeHtml(countryBlock.match(/<span class="truncate">([\s\S]*?)<\/span>/)?.[1] ?? '').trim()
    const language = decodeHtml(block.match(/>Language<\/span><span[^>]*>[\s\S]*?<span class="truncate">([\s\S]*?)<\/span>/)?.[1] ?? '').trim()
    const trainerIconId = avatar ? Number(avatar[1]) : undefined
    if (!Number.isInteger(rank) || rank < 1 ||
      (trainerIconId !== undefined && (!Number.isInteger(trainerIconId) || trainerIconId < 1)) ||
      !name || !country || !language) {
      throw new Error(`OP.GG page ${expectedPage} rendered trainer ${expectedPosition} is incomplete`)
    }
    return { position: expectedPosition, rank, name, trainerIconId, country, countryFlag, language }
  })
}

function parseOpggTrainerPage(
  html: string,
  season: string,
  rule: string,
  expectedPage: number,
) {
  const expectedSeason = `m-${season}`
  const expectedFormat = opggFormatForRule(rule)
  const candidates: { chunk: string; seasonRankings: Record<string, unknown> }[] = []
  for (const chunk of extractNextFlightStrings(html)) {
    for (const value of extractJsonPropertyValues(chunk, 'seasonRankings')) {
      if (isRecord(value)) candidates.push({ chunk, seasonRankings: value })
    }
  }
  if (candidates.length !== 1) {
    throw new Error(`OP.GG page ${expectedPage} contained ${candidates.length} seasonRankings payloads`)
  }

  const [{ chunk, seasonRankings }] = candidates
  const seasons = [...chunk.matchAll(/"season":"(m-\d+)"/g)].map(match => match[1])
  if (seasons.length === 0 || seasons.some(value => value !== expectedSeason)) {
    throw new Error(`OP.GG page ${expectedPage} season mismatch: expected ${expectedSeason}`)
  }
  const formats = [...chunk.matchAll(/"format":"(single|double)"/g)].map(match => match[1])
  if (formats.length === 0 || formats.some(value => value !== expectedFormat)) {
    throw new Error(`OP.GG page ${expectedPage} format mismatch: expected ${expectedFormat}`)
  }

  const rawRanking = seasonRankings[expectedSeason]
  if (!isRecord(rawRanking)) throw new Error(`OP.GG page ${expectedPage} has no ${expectedSeason} rankings`)
  const ranking = rawRanking as OpggTrainerRanking
  if (ranking.currentPage !== expectedPage) {
    throw new Error(`OP.GG currentPage mismatch: expected ${expectedPage}, received ${String(ranking.currentPage)}`)
  }
  if (ranking.pageSize !== OPGG_TRAINER_PAGE_SIZE) {
    throw new Error(`OP.GG pageSize mismatch: expected ${OPGG_TRAINER_PAGE_SIZE}, received ${String(ranking.pageSize)}`)
  }
  if (!Number.isInteger(ranking.totalCount) || ranking.totalCount < OPGG_TRAINER_PAGE_COUNT * OPGG_TRAINER_PAGE_SIZE) {
    throw new Error(`OP.GG totalCount is below 1000: ${String(ranking.totalCount)}`)
  }
  if (ranking.totalPages !== undefined &&
    (!Number.isInteger(ranking.totalPages) || ranking.totalPages < OPGG_TRAINER_PAGE_COUNT)) {
    throw new Error(`OP.GG totalPages is below 10: ${String(ranking.totalPages)}`)
  }
  if (!Array.isArray(ranking.trainers) || ranking.trainers.length !== OPGG_TRAINER_PAGE_SIZE) {
    throw new Error(`OP.GG page ${expectedPage} did not contain exactly 100 trainers`)
  }
  if (typeof ranking.createdAt !== 'string') throw new Error(`OP.GG page ${expectedPage} has no createdAt`)

  const displays = parseOpggTrainerDisplays(html, expectedPage)
  const rankings = ranking.trainers.map((rawTrainer, index): TrainerRankingEntry & { position: number } => {
    if (!isRecord(rawTrainer)) throw new Error(`OP.GG page ${expectedPage} trainer ${index + 1} is invalid`)
    const position = rawTrainer.position
    const rank = rawTrainer.rank
    const score = rawTrainer.score
    const nickname = rawTrainer.nickname
    const trainerIconId = rawTrainer.trainerIconId
    const countryCode = rawTrainer.countryCode
    const countryAreaCode = rawTrainer.countryAreaCode
    const wins = rawTrainer.wins
    const losses = rawTrainer.losses
    const winRate = rawTrainer.winRate
    const winStreak = rawTrainer.winStreak
    const expectedPosition = (expectedPage - 1) * OPGG_TRAINER_PAGE_SIZE + index + 1
    if (!Number.isInteger(position) || position !== expectedPosition) {
      throw new Error(`OP.GG page ${expectedPage} position mismatch: expected ${expectedPosition}, received ${String(position)}`)
    }
    if (!Number.isInteger(rank) || Number(rank) < 1) {
      throw new Error(`OP.GG position ${expectedPosition} has invalid rank ${String(rank)}`)
    }
    if (!Number.isInteger(score) || Number(score) <= 0) {
      throw new Error(`OP.GG position ${expectedPosition} has invalid score ${String(score)}`)
    }
    if (typeof nickname !== 'string' || nickname.trim().length === 0) {
      throw new Error(`OP.GG position ${expectedPosition} has an invalid nickname`)
    }
    if (!Number.isInteger(trainerIconId) || Number(trainerIconId) < 1 ||
      !Number.isInteger(countryCode) || Number(countryCode) < 1 ||
      !Number.isInteger(countryAreaCode) || Number(countryAreaCode) < 1 ||
      !Number.isInteger(wins) || Number(wins) < 0 ||
      !Number.isInteger(losses) || Number(losses) < 0 ||
      typeof winRate !== 'number' || !Number.isFinite(winRate) || winRate < 0 || winRate > 100 ||
      !Number.isInteger(winStreak) || Number(winStreak) < 0) {
      throw new Error(`OP.GG position ${expectedPosition} has invalid trainer details`)
    }
    const display = displays[index]
    if (display.rank !== rank || display.name !== nickname.trim() ||
      (display.trainerIconId !== undefined && display.trainerIconId !== trainerIconId)) {
      throw new Error(`OP.GG position ${expectedPosition} rendered details do not match ranking data`)
    }
    return {
      position: Number(position),
      rank: Number(rank),
      rating: Number(score) / 1000,
      name: nickname.trim(),
      trainerIconId: display.trainerIconId,
      countryCode: Number(countryCode),
      countryAreaCode: Number(countryAreaCode),
      country: display.country,
      countryFlag: display.countryFlag,
      language: display.language,
      wins: Number(wins),
      losses: Number(losses),
      winRate,
      winStreak: Number(winStreak),
    }
  })

  return {
    createdAt: ranking.createdAt,
    updatedAt: parseOpggCreatedAtKst(ranking.createdAt),
    totalCount: ranking.totalCount,
    top300Cutoff: parseOpggCutoff(html, 300),
    top1000Cutoff: parseOpggCutoff(html, 1000),
    rankings,
  }
}

function mergeExistingTrainerRankings(output: UsageDataset, existing: UsageDataset | undefined): UsageDataset {
  if (output.trainerRankings.length > 0 || !existing?.trainerRankings?.length) return output
  return {
    ...output,
    trainerSource: existing.trainerSource,
    trainerSourceUrl: existing.trainerSourceUrl || output.trainerSourceUrl,
    trainerRankingsUpdatedAt: existing.trainerRankingsUpdatedAt || existing.updatedAt,
    trainerTop300Cutoff: existing.trainerTop300Cutoff,
    trainerTop1000Cutoff: existing.trainerTop1000Cutoff,
    trainerRankingsAvailable: true,
    trainerRankingsNote: existing.trainerRankingsNote || output.trainerRankingsNote,
    trainerRankings: existing.trainerRankings,
  }
}

function preserveDatasetUpdateSettings(output: UsageDataset, existing: UsageDataset | undefined): UsageDataset {
  return {
    ...output,
    trainerRankingsFinal: existing?.trainerRankingsFinal,
    trainerRankingSourceSeason: existing?.trainerRankingSourceSeason ?? output.season,
    trainerRankingSourceRule: existing?.trainerRankingSourceRule ?? output.rule,
    updatesFrozen: existing?.updatesFrozen,
    updatesFrozenAt: existing?.updatesFrozenAt,
    updatesFrozenReason: existing?.updatesFrozenReason,
  }
}

function trainerRankingSource(existing: UsageDataset | undefined) {
  return {
    season: existing?.trainerRankingSourceSeason || SEASON,
    rule: existing?.trainerRankingSourceRule || RULE,
  }
}

function gameWithUrlForRule(rule: string) {
  const url = GAMEWITH_URL_BY_RULE[rule]
  if (!url) throw new Error(`No GameWith JP fallback URL configured for rule=${rule}`)
  return url
}

function gameWithKeyToDetailKey(key: string) {
  const override = GAMEWITH_FORM_KEY_OVERRIDES[key]
  if (override) return override
  const [num, form = '0'] = key.split('_')
  return `${num.padStart(4, '0')}-${String(Number(form)).padStart(2, '0')}`
}

function parseGameWithRanking(html: string) {
  const start = html.indexOf('<div class="wd-pkch-battleranking"')
  if (start < 0) throw new Error('GameWith JP ranking block not found')
  const end = html.indexOf('<p class="gw-info"', start)
  const section = html.slice(start, end > start ? end : start + 250000)
  const results: { rank: number; key: string; jpName: string }[] = []
  const re = /<div class="_pkm[^"]*" data-rank="(\d+)">[\s\S]*?gacha\/(\d{3,4}(?:_\d+)?)\.png[\s\S]*?<span class="_name">([\s\S]*?)<\/span>/g
  for (const m of section.matchAll(re)) {
    const rank = toNumber(m[1])
    if (!rank) continue
    results.push({ rank, key: m[2], jpName: stripTags(m[3]) })
  }
  if (!results.length) throw new Error('GameWith JP ranking entries not found')
  return results.sort((a, b) => a.rank - b.rank)
}

function extractJsObjectLiteral<T>(html: string, marker: string): T {
  const markerIndex = html.indexOf(marker)
  if (markerIndex < 0) throw new Error(`GameWith JP marker not found: ${marker}`)
  const start = markerIndex + marker.length
  let depth = 0
  let end = -1
  let inString: string | null = null
  let escaping = false
  for (let i = start; i < html.length; i++) {
    const char = html[i]
    if (inString) {
      if (escaping) escaping = false
      else if (char === '\\') escaping = true
      else if (char === inString) inString = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      inString = char
      continue
    }
    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end < 0) throw new Error(`GameWith JP object literal is unterminated: ${marker}`)
  return vm.runInNewContext(`(${html.slice(start, end)})`, {}, { timeout: 1000 }) as T
}

function parseGameWithPokemonData(html: string) {
  return extractJsObjectLiteral<Record<string, GameWithPokemonData>>(html, 'const pkchPokemonData = ')
}

function parseGameWithTooltipNames(html: string): GameWithTooltipNames {
  const items = new Map<string, string>()
  const moves = new Map<string, string>()
  const re = /\{name:(["'])([^"']+)\1,id:\s*(["'])([im])(\d+)\3,/g
  for (const match of html.matchAll(re)) {
    const name = decodeHtml(match[2])
    const target = match[4] === 'i' ? items : moves
    target.set(match[5], name)
  }
  return { items, moves }
}

function parseGameWithUpdatedAt(html: string) {
  const metaValue = html.match(/<meta name="date" content="([^"]+)"/)?.[1]
  if (metaValue) {
    const parsed = new Date(metaValue)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }

  const normalized = stripTags(html).replace(/\s+/g, '')
  const match = normalized.match(/最終更新[:：]?(\d{4})年(\d{1,2})月(\d{1,2})日(\d{1,2}):(\d{2})/)
  if (match) {
    const [, year, month, day, hour, minute] = match.map(Number)
    const utcMs = Date.UTC(year, month - 1, day, hour - 9, minute, 0)
    return new Date(utcMs).toISOString()
  }

  return new Date().toISOString()
}

function parseGameWithDate(html: string, sourceUpdatedAt?: string) {
  const metaDate = html.match(/<meta name="date" content="(\d{4}-\d{2}-\d{2})T/)?.[1]
  if (metaDate) return metaDate
  if (sourceUpdatedAt) {
    const localDate = sourceUpdatedAt.match(/^(\d{4}-\d{2}-\d{2})T/)?.[1]
    if (localDate) return localDate
  }
  const info = stripTags(html.match(/<p class="gw-info">([\s\S]*?)<\/p>/)?.[1] ?? '')
  const md = info.match(/(\d{1,2})\/(\d{1,2})/)
  if (!md) return new Date().toISOString().slice(0, 10)
  const year = new Date().getFullYear()
  return `${year}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`
}

function parseGameWithSeason(html: string) {
  const info = stripTags(html.match(/<p class="gw-info">([\s\S]*?)<\/p>/)?.[1] ?? '')
  return info.match(/M-(\d+)/)?.[1] ?? null
}

function gameWithItemOverrideId(jpName: string) {
  const key = normJp(jpName)
  for (const [jp, id] of Object.entries(GAMEWITH_ITEM_ID_OVERRIDES)) {
    if (normJp(jp) === key) return id
  }
  return null
}

function translateGameWithItem(
  jpName: string,
  cache: TranslationCache,
  itemById: Map<string, GeneratedItem>,
): UsageItem {
  const overrideId = gameWithItemOverrideId(jpName)
  if (overrideId) {
    const item = itemById.get(overrideId)
    if (item) return { zh: item.zh, en: item.en, percent: 0 }
  }
  return { ...translate(jpName, cache.items), percent: 0 }
}

const GAMEWITH_SPREAD_LABELS = ['HP', '攻击', '防御', '特攻', '特防', '速度']

function gameWithSpread(values: number[]) {
  return values
    .map((value, index) => value > 0 ? `${GAMEWITH_SPREAD_LABELS[index] ?? index} ${value}` : '')
    .filter(Boolean)
    .join(' / ')
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

async function fetchAllTrainers(existing?: UsageDataset): Promise<TrainerRankingResult> {
  const source = trainerRankingSource(existing)
  const requestedUrl = `${BASE_URL}/trainer/list?season=${source.season}&rule=${source.rule}`
  const firstPage = await getPage(`${requestedUrl}&page=1`)
  if (!isRequestedListPage(firstPage.finalUrl, 'trainer', source.season, source.rule)) {
    console.warn(`Trainer rankings unavailable for season=${SEASON} rule=${RULE}; source returned ${firstPage.finalUrl}`)
    return {
      sourceUrl: requestedUrl,
      available: false,
      note: `当前赛季玩家排名尚未开放，来源页面回退到 ${firstPage.finalUrl}`,
      rankings: [] as TrainerRankingEntry[],
    }
  }
  const pages = maxPage(firstPage.text, 'trainer', source.season, source.rule)
  const all = parseTrainers(firstPage.text)
  for (let p = 2; p <= pages; p++) {
    const html = await getText(`${BASE_URL}/trainer/list?season=${source.season}&rule=${source.rule}&page=${p}`)
    all.push(...parseTrainers(html))
  }
  if (all.length === 0) throw new Error(`Battle Database trainer schema returned no rankings for season=${source.season} rule=${source.rule}`)
  return {
    source: 'Battle Database Champions',
    sourceUrl: requestedUrl,
    updatedAt: new Date().toISOString(),
    available: true,
    rankings: all.sort((a, b) => a.rank - b.rank),
  }
}

async function fetchOpggTrainerRankings(season: string, rule: string): Promise<TrainerRankingResult> {
  const pages = await Promise.all(
    Array.from({ length: OPGG_TRAINER_PAGE_COUNT }, (_, index) => index + 1).map(async page => {
      const html = await getText(opggTrainerUrl(season, rule, page))
      return parseOpggTrainerPage(html, season, rule, page)
    }),
  )
  const createdAtValues = new Set(pages.map(page => page.createdAt))
  const totalCountValues = new Set(pages.map(page => page.totalCount))
  const top300CutoffValues = new Set(pages.map(page => page.top300Cutoff))
  const top1000CutoffValues = new Set(pages.map(page => page.top1000Cutoff))
  if (createdAtValues.size !== 1) throw new Error('OP.GG pages came from different realtime snapshots')
  if (totalCountValues.size !== 1) throw new Error('OP.GG totalCount changed between pages')
  if (top300CutoffValues.size !== 1 || top1000CutoffValues.size !== 1) {
    throw new Error('OP.GG cutoff values changed between pages')
  }

  const all = pages.flatMap(page => page.rankings)
  const expectedCount = OPGG_TRAINER_PAGE_COUNT * OPGG_TRAINER_PAGE_SIZE
  if (all.length !== expectedCount) throw new Error(`OP.GG Top 1000 contained ${all.length} trainers`)
  for (let index = 0; index < all.length; index++) {
    const expectedPosition = index + 1
    if (all[index].position !== expectedPosition) {
      throw new Error(`OP.GG combined position mismatch: expected ${expectedPosition}, received ${all[index].position}`)
    }
    if (index > 0 && all[index].rank < all[index - 1].rank) {
      throw new Error(`OP.GG ranks are not monotonic at position ${expectedPosition}`)
    }
  }

  return {
    source: OPGG_SOURCE,
    sourceUrl: opggTrainerUrl(season, rule),
    updatedAt: pages[0].updatedAt,
    top300Cutoff: pages[0].top300Cutoff,
    top1000Cutoff: pages[0].top1000Cutoff,
    available: true,
    rankings: all,
  }
}

async function fetchTrainerRankingsSafely(existing?: UsageDataset): Promise<TrainerRankingResult> {
  const source = trainerRankingSource(existing)
  try {
    return await fetchOpggTrainerRankings(source.season, source.rule)
  } catch (error) {
    const opggFailure = error instanceof Error ? error.message : String(error)
    console.warn(`OP.GG trainer rankings unavailable; trying PokeDB fallback: ${opggFailure}`)
    try {
      const pokedb = await fetchAllTrainers(existing)
      if (pokedb.available) {
        return { ...pokedb, note: `OP.GG 同步失败，当前显示 Battle Database 数据：${opggFailure}` }
      }
      return {
        sourceUrl: opggTrainerUrl(source.season, source.rule),
        available: false,
        note: `玩家排名同步失败：OP.GG ${opggFailure}；PokeDB ${pokedb.note ?? 'rankings unavailable'}`,
        rankings: [] as TrainerRankingEntry[],
      }
    } catch (error) {
      const pokedbFailure = error instanceof Error ? error.message : String(error)
      return {
        sourceUrl: opggTrainerUrl(source.season, source.rule),
        available: false,
        note: `玩家排名同步失败：OP.GG ${opggFailure}；PokeDB ${pokedbFailure}`,
        rankings: [] as TrainerRankingEntry[],
      }
    }
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
  existing?: UsageDataset,
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

  const trainers = await fetchTrainerRankingsSafely(existing)

  return {
    source: 'Battle Database Champions',
    sourceUrl: `${BASE_URL}/pokemon/list?season=${SEASON}&rule=${RULE}`,
    trainerSource: trainers.available ? trainers.source : undefined,
    trainerSourceUrl: trainers.sourceUrl,
    trainerRankingsUpdatedAt: trainers.rankings.length > 0 ? trainers.updatedAt ?? new Date().toISOString() : undefined,
    trainerTop300Cutoff: trainers.top300Cutoff,
    trainerTop1000Cutoff: trainers.top1000Cutoff,
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

function buildGameWithUsageEntry(
  rankEntry: { rank: number; key: string; jpName: string },
  gameWithEntry: GameWithPokemonData | undefined,
  tooltipNames: GameWithTooltipNames,
  detail: PokemonDetail,
  byKey: Map<string, PokemonDetail>,
  cache: TranslationCache,
  itemById: Map<string, GeneratedItem>,
): UsageEntry {
  const items: UsageItem[] = (gameWithEntry?.items ?? []).slice(0, 10).flatMap(([itemRef, rate]) => {
    const jpName = typeof itemRef === 'number' ? tooltipNames.items.get(String(itemRef)) : itemRef
    if (!jpName) return []
    const translated = translateGameWithItem(jpName, cache, itemById)
    return [{ ...translated, percent: toNumber(rate) ?? 0 }]
  })

  const moves: UsageItem[] = (gameWithEntry?.moves ?? []).slice(0, 12).flatMap((moveRow) => {
    const [moveRef, second, third] = moveRow
    const jpName = moveRow.length >= 3 ? String(second) : tooltipNames.moves.get(String(moveRef))
    const rate = moveRow.length >= 3 ? third : second
    if (!jpName) return []
    const { zh, en } = translate(jpName, cache.moves)
    return [{ zh, en, percent: toNumber(rate) ?? 0 }]
  })

  const abilities: UsageItem[] = (gameWithEntry?.abilities ?? []).slice(0, 8).map(([jpName, rate]) => {
    const { zh, en } = translate(jpName, cache.abilities)
    return { zh, en, percent: toNumber(rate) ?? 0 }
  })

  const natures: UsageItem[] = (gameWithEntry?.natures ?? []).slice(0, 10).map(([jpName, rate]) => {
    const { zh, en } = translate(jpName, cache.natures)
    return { zh, en, percent: toNumber(rate) ?? 0 }
  })

  const spreads: UsageSpread[] = (gameWithEntry?.evDistributions ?? []).slice(0, 10).map(([values, rate]) => ({
    nature: '',
    spread: gameWithSpread(values),
    percent: toNumber(rate) ?? 0,
  }))

  const teammates: UsageTeammate[] = (gameWithEntry?.teammates ?? []).slice(0, 10).map(([, gameWithKey]) => {
    const detailKey = gameWithKeyToDetailKey(gameWithKey)
    const teammate = byKey.get(detailKey)
    return {
      zh: teammate?.zh || gameWithKey,
      en: teammate?.name || gameWithKey,
      key: detailKey,
    }
  })

  return {
    id: toId(detail.id),
    name: detail.name,
    zh: detail.zh || detail.name || rankEntry.jpName,
    rank: rankEntry.rank,
    items,
    moves,
    abilities,
    natures,
    spreads,
    teammates,
  }
}

async function fetchGameWithUsageDataset(
  byKey: Map<string, PokemonDetail>,
  cache: TranslationCache,
  existing?: UsageDataset,
): Promise<UsageDataset> {
  const sourceUrl = gameWithUrlForRule(RULE)
  const html = await getText(sourceUrl)
  const pageSeason = parseGameWithSeason(html)
  if (pageSeason && pageSeason !== SEASON) {
    throw new Error(`GameWith JP page is season M-${pageSeason}, requested M-${SEASON}`)
  }

  const ranking = parseGameWithRanking(html)
  const gameWithData = parseGameWithPokemonData(html)
  const tooltipNames = parseGameWithTooltipNames(html)
  const itemById = loadGeneratedItems()
  const targetRanking = DETAIL_LIMIT > 0 ? ranking.slice(0, DETAIL_LIMIT) : ranking

  const entries: Record<string, UsageEntry> = {}
  const missingPokemon: UsageDataset['missingPokemon'] = []
  for (const rankEntry of ranking) {
    const detailKey = gameWithKeyToDetailKey(rankEntry.key)
    const detail = byKey.get(detailKey)
    if (!detail) {
      missingPokemon.push({ key: detailKey, rank: rankEntry.rank, jpName: rankEntry.jpName })
      continue
    }
    if (DETAIL_LIMIT > 0 && !targetRanking.some(entry => entry.key === rankEntry.key)) {
      entries[toId(detail.id)] = {
        id: toId(detail.id),
        name: detail.name,
        zh: detail.zh || detail.name,
        rank: rankEntry.rank,
        items: [],
        moves: [],
        abilities: [],
        natures: [],
        spreads: [],
        teammates: [],
      }
      continue
    }
    entries[toId(detail.id)] = buildGameWithUsageEntry(
      rankEntry,
      gameWithData[rankEntry.key],
      tooltipNames,
      detail,
      byKey,
      cache,
      itemById,
    )
  }

  const sourceUpdatedAt = parseGameWithUpdatedAt(html)
  const date = parseGameWithDate(html, sourceUpdatedAt)
  const trainers = await fetchTrainerRankingsSafely(existing)
  const trainerRankingsNote = trainers.available
    ? trainers.note
    : `当前使用 GameWith JP 使用率数据；${trainers.note ?? '玩家排名暂不可用。'}`
  return {
    source: GAMEWITH_SOURCE,
    sourceUrl,
    sourceUpdatedAt,
    trainerSource: trainers.available ? trainers.source : undefined,
    trainerSourceUrl: trainers.sourceUrl,
    trainerRankingsUpdatedAt: trainers.rankings.length > 0 ? trainers.updatedAt ?? new Date().toISOString() : undefined,
    trainerTop300Cutoff: trainers.top300Cutoff,
    trainerTop1000Cutoff: trainers.top1000Cutoff,
    format: datasetKey(SEASON, RULE),
    regulation: regulationForSeason(SEASON),
    battle: battleForRule(RULE),
    season: SEASON,
    rule: RULE,
    date,
    updatedAt: new Date().toISOString(),
    count: Object.keys(entries).length,
    missingPokemon,
    trainerRankingsAvailable: trainers.available,
    trainerRankingsNote,
    trainerRankings: trainers.rankings,
    entries,
  }
}

async function main() {
  const { raw, byKey } = loadDetails()
  const cache = await loadTranslationCache(raw)
  const existing = loadExistingCollection()
  const datasets: Record<string, UsageDataset> = { ...(existing?.datasets ?? {}) }
  let updatedDatasetCount = 0

  for (const season of TARGET_SEASONS) {
    for (const rule of TARGET_RULES) {
      SEASON = season
      RULE = rule
      const key = datasetKey(season, rule)
      const existingDataset = datasets[key]
      if (existingDataset?.updatesFrozen) {
        console.log(`Keeping frozen ${key}; ${existingDataset.updatesFrozenReason || 'updates are disabled for this dataset'}`)
        continue
      }
      try {
        let output: UsageDataset
        if (USAGE_SOURCE === 'champs') {
          output = await fetchUsageDataset(byKey, cache, existingDataset)
        } else {
          try {
            output = await fetchGameWithUsageDataset(byKey, cache, existingDataset)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            if (USAGE_SOURCE === 'gamewith') throw error
            console.warn(`GameWith JP usage source failed for ${key}; trying champs.pokedb.tokyo fallback: ${message}`)
            output = await fetchUsageDataset(byKey, cache, existingDataset)
          }
        }
        output = mergeExistingTrainerRankings(output, existingDataset)
        output = preserveDatasetUpdateSettings(output, existingDataset)
        datasets[output.format] = output
        updatedDatasetCount += 1
        if (output.missingPokemon.length) {
          console.warn(
            `Missing ${output.missingPokemon.length} Pokemon for ${output.format}: ` +
            output.missingPokemon.map(p => `${p.key} ${p.jpName}`).join(', '),
          )
        }
        console.log(`Fetched ${output.count} Pokemon and ${output.trainerRankings.length} trainers for ${output.format}`)
      } catch (error) {
        if (!datasets[key]) throw error
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`Keeping existing ${key}; usage sync failed: ${message}`)
      }
    }
  }

  if (updatedDatasetCount === 0 && existing) {
    console.log('No usage datasets updated; keeping existing collection unchanged.')
    return
  }

  const defaultSeason = process.env.CHAMPS_DEFAULT_SEASON ?? TARGET_SEASONS[TARGET_SEASONS.length - 1] ?? '3'
  const defaultRule = process.env.CHAMPS_DEFAULT_RULE ?? TARGET_RULES[0] ?? '1'
  const defaultKey = datasetKey(defaultSeason, defaultRule)
  const fallbackKey = Object.keys(datasets).sort().at(-1) ?? defaultKey
  const selectedDefaultKey = datasets[defaultKey] ? defaultKey : fallbackKey
  const selectedDefaultDataset = datasets[selectedDefaultKey]
  const collection: UsageCollection = {
    source: selectedDefaultDataset?.source ?? 'Battle Database Champions',
    sourceUrl: selectedDefaultDataset?.sourceUrl ?? BASE_URL,
    defaultKey: selectedDefaultKey,
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
