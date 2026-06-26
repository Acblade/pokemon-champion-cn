import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const BASE_URL = 'https://champs.pokedb.tokyo'
const GAMEWITH_SOURCE = 'GameWith JP'
const GAMEWITH_URL_BY_RULE: Record<string, string> = {
  // Local rule=1 is Champions doubles; GameWith uses a separate doubles article.
  '1': 'https://gamewith.jp/pokemon-champions/558230',
  '2': 'https://gamewith.jp/pokemon-champions/555373',
}
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
const USAGE_SOURCE = (process.env.CHAMPS_USAGE_SOURCE ?? 'auto').toLowerCase()

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
  moves?: [string, string, string][]
  items?: [string, string][]
  evDistributions?: [[number, number, number, number, number, number], string][]
  natures?: [string, string][]
  teammates?: [number, string][]
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

function loadGeneratedItems() {
  const items = JSON.parse(fs.readFileSync(PATHS.items, 'utf8')) as GeneratedItem[]
  return new Map(items.map(item => [item.id, item]))
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

function parseGameWithDate(html: string) {
  const metaDate = html.match(/<meta name="date" content="(\d{4}-\d{2}-\d{2})T/)?.[1]
  if (metaDate) return metaDate
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

function buildGameWithUsageEntry(
  rankEntry: { rank: number; key: string; jpName: string },
  gameWithEntry: GameWithPokemonData | undefined,
  detail: PokemonDetail,
  byKey: Map<string, PokemonDetail>,
  cache: TranslationCache,
  itemById: Map<string, GeneratedItem>,
): UsageEntry {
  const items: UsageItem[] = (gameWithEntry?.items ?? []).slice(0, 10).map(([jpName, rate]) => {
    const translated = translateGameWithItem(jpName, cache, itemById)
    return { ...translated, percent: toNumber(rate) ?? 0 }
  })

  const moves: UsageItem[] = (gameWithEntry?.moves ?? []).slice(0, 12).map(([, jpName, rate]) => {
    const { zh, en } = translate(jpName, cache.moves)
    return { zh, en, percent: toNumber(rate) ?? 0 }
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
  primaryFailure: string,
): Promise<UsageDataset> {
  const sourceUrl = gameWithUrlForRule(RULE)
  const html = await getText(sourceUrl)
  const pageSeason = parseGameWithSeason(html)
  if (pageSeason && pageSeason !== SEASON) {
    throw new Error(`GameWith JP page is season M-${pageSeason}, requested M-${SEASON}`)
  }

  const ranking = parseGameWithRanking(html)
  const gameWithData = parseGameWithPokemonData(html)
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
      detail,
      byKey,
      cache,
      itemById,
    )
  }

  const date = parseGameWithDate(html)
  const trainerRankingsNote = primaryFailure.startsWith('primary source skipped')
    ? '当前使用 GameWith JP 使用率数据；GameWith JP 不提供玩家排名。'
    : `champs.pokedb.tokyo 同步失败（${primaryFailure}），已改用 GameWith JP 使用率数据；GameWith JP 不提供玩家排名。`
  return {
    source: GAMEWITH_SOURCE,
    sourceUrl,
    trainerSourceUrl: sourceUrl,
    format: datasetKey(SEASON, RULE),
    regulation: regulationForSeason(SEASON),
    battle: battleForRule(RULE),
    season: SEASON,
    rule: RULE,
    date,
    updatedAt: new Date().toISOString(),
    count: Object.keys(entries).length,
    missingPokemon,
    trainerRankingsAvailable: false,
    trainerRankingsNote,
    trainerRankings: [],
    entries,
  }
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
      const key = datasetKey(season, rule)
      try {
        let output: UsageDataset
        if (USAGE_SOURCE === 'gamewith') {
          output = await fetchGameWithUsageDataset(
            byKey,
            cache,
            'primary source skipped by CHAMPS_USAGE_SOURCE=gamewith',
          )
        } else {
          try {
            output = await fetchUsageDataset(byKey, cache)
          } catch (error) {
            if (USAGE_SOURCE === 'champs') throw error
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`Primary usage source failed for ${key}; trying GameWith JP fallback: ${message}`)
            output = await fetchGameWithUsageDataset(byKey, cache, message)
          }
        }
        datasets[output.format] = output
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
