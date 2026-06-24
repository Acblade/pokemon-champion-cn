import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type JsonObject = Record<string, unknown>

type LocalPokemon = {
  id: string
  num: number
  zh: string
  name: string
  baseSpeciesId: string
  slugVariants?: string[]
}

type LocalItem = {
  id: string
  en: string
  zh: string
  isMegaStone?: boolean
}

type LookupEntry = {
  en?: string
  zh?: string
}

type LookupData = {
  moves?: Record<string, LookupEntry>
  items?: Record<string, LookupEntry>
  abilities?: Record<string, LookupEntry>
}

type TeamShareMember = {
  pokemonId: string
  pokemonName: string
  item: string
  ability: string
  nature: string
  spread: string
  moves: string[]
  note?: string
}

type TeamShare = {
  id: string
  title: string
  author: string
  teamId: string
  source: string
  sourceUrl: string
  platformUrl: string
  season: string
  format: string
  updatedAt: string
  tags: string[]
  summary: string
  members: TeamShareMember[]
  metrics?: {
    likes?: number
    comments?: number
    finalRanking?: string
  }
}

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GENERATED_DIR = path.join(PROJECT_ROOT, 'src', 'generated')
const OUTPUT_FILE = path.join(GENERATED_DIR, 'team-shares.json')
const POKEBASE_URL = 'https://pokebase.app/pokemon-champions/teams'
const GAMEWITH_PARTY_URL = 'https://gamewith.jp/pokemon-champions/552853'
const VICTORY_ROAD_CHAMPIONS_URL = 'https://victoryroad.pro/champions-replica/'
const GAMEWITH_API = 'https://pokemon-champions.gamewith.workers.dev'
const GAMEWITH_MASTER =
  'https://firebasestorage.googleapis.com/v0/b/walkthrough-tool.appspot.com/o/pokemon-champions%2Fmaster%2F'

const GW = {
  name: '\u540d\u524d',
  form: '\u30d5\u30a9\u30eb\u30e0',
  imageNo: '\u753b\u50cfNo',
  targetMega: '\u5bfe\u8c61\u30e1\u30ac\u30b7\u30f3\u30ab',
}

const JP = {
  mega: '\u30e1\u30ac',
  alola: '\u30a2\u30ed\u30fc\u30e9',
  eternalKana: '\u3048\u3044\u3048\u3093',
  eternalKanji: '\u6c38\u9060',
}

const NATURE_BY_ID: Record<string, string> = {
  '1': 'Lonely',
  '2': 'Adamant',
  '3': 'Naughty',
  '4': 'Brave',
  '5': 'Bold',
  '6': 'Impish',
  '7': 'Lax',
  '8': 'Relaxed',
  '9': 'Modest',
  '10': 'Mild',
  '11': 'Rash',
  '12': 'Quiet',
  '13': 'Calm',
  '14': 'Gentle',
  '15': 'Careful',
  '16': 'Sassy',
  '17': 'Timid',
  '18': 'Hasty',
  '19': 'Jolly',
  '20': 'Naive',
  '21': 'Serious',
}

const NATURE_BY_SLUG: Record<string, string> = {
  adamant: 'Adamant',
  bashful: 'Bashful',
  bold: 'Bold',
  brave: 'Brave',
  calm: 'Calm',
  careful: 'Careful',
  docile: 'Docile',
  gentle: 'Gentle',
  hardy: 'Hardy',
  hasty: 'Hasty',
  impish: 'Impish',
  jolly: 'Jolly',
  lax: 'Lax',
  lonely: 'Lonely',
  mild: 'Mild',
  modest: 'Modest',
  naive: 'Naive',
  naughty: 'Naughty',
  quiet: 'Quiet',
  quirky: 'Quirky',
  rash: 'Rash',
  relaxed: 'Relaxed',
  sassy: 'Sassy',
  serious: 'Serious',
  timid: 'Timid',
}

const STAT_KEYS = [
  ['hp', 'HP'],
  ['attack', 'Atk'],
  ['defense', 'Def'],
  ['specialAttack', 'SpA'],
  ['specialDefense', 'SpD'],
  ['speed', 'Spe'],
] as const

const GAMEWITH_STAT_KEYS = [
  ['ev_hp', 'HP'],
  ['ev_attack', 'Atk'],
  ['ev_defense', 'Def'],
  ['ev_sp_attack', 'SpA'],
  ['ev_sp_defense', 'SpD'],
  ['ev_speed', 'Spe'],
] as const

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asObject(value: unknown): JsonObject {
  return isObject(value) ? value : {}
}

function asArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : []
}

function textField(object: JsonObject | undefined, key: string) {
  const value = object?.[key]
  return typeof value === 'string' ? value : ''
}

function numberField(object: JsonObject | undefined, key: string) {
  const value = object?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

async function readJsonFile<T>(relativePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, relativePath), 'utf8')) as T
}

async function fetchJsonObject(url: string): Promise<JsonObject> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
  return asObject(await response.json())
}

async function fetchJsonArray(url: string): Promise<JsonObject[]> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
  const json = await response.json()
  return Array.isArray(json) ? json.filter(isObject) : []
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function cleanJapaneseName(value: string) {
  return value.replace(/[()\uff08\uff09\s]/g, '')
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&#038;|&amp;/g, '&')
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function htmlAttribute(tag: string, attr: string) {
  return decodeHtml(tag.match(new RegExp(`${attr}="([^"]*)"`))?.[1] ?? '')
}

function dateOnly(value: string) {
  if (!value) return new Date().toISOString().slice(0, 10)
  const monthMatch = value.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
  if (monthMatch) {
    const months: Record<string, string> = {
      january: '01',
      february: '02',
      march: '03',
      april: '04',
      may: '05',
      june: '06',
      july: '07',
      august: '08',
      september: '09',
      october: '10',
      november: '11',
      december: '12',
    }
    const month = months[monthMatch[2].toLowerCase()]
    if (month) return `${monthMatch[3]}-${month}-${monthMatch[1].padStart(2, '0')}`
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return date.toISOString().slice(0, 10)
}

function compactText(value: string, max = 180) {
  const clean = value
    .replace(/#+/g, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean
}

function formatSpreadFromStats(stats: JsonObject) {
  const parts = STAT_KEYS
    .map(([key, label]) => [label, numberField(stats, key) ?? 0] as const)
    .filter(([, value]) => value > 0)
    .map(([label, value]) => `${label} ${value}`)
  return parts.join(' / ') || '-'
}

function formatSpreadFromGameWith(member: JsonObject) {
  const parts = GAMEWITH_STAT_KEYS
    .map(([key, label]) => [label, numberField(member, key) ?? 0] as const)
    .filter(([, value]) => value > 0)
    .map(([label, value]) => `${label} ${value}`)
  return parts.join(' / ') || '-'
}

function extractEscapedArray(html: string, marker: string) {
  const markerIndex = html.indexOf(marker)
  if (markerIndex < 0) return []
  const start = html.indexOf('[', markerIndex)
  let depth = 0
  for (let index = start; index < html.length; index += 1) {
    const char = html[index]
    if (char === '[') depth += 1
    if (char === ']') {
      depth -= 1
      if (depth === 0) {
        const jsonText = html
          .slice(start, index + 1)
          .replace(/\\"/g, '"')
          .replace(/\\u0026/g, '&')
          .replace(/\\u003c/g, '<')
          .replace(/\\u003e/g, '>')
        return JSON.parse(jsonText) as unknown[]
      }
    }
  }
  return []
}

function buildLocalPokemonIndex(localPokemon: LocalPokemon[]) {
  const map = new Map<string, LocalPokemon>()
  for (const pokemon of localPokemon) {
    const keys = [pokemon.id, pokemon.name, pokemon.baseSpeciesId, ...(pokemon.slugVariants ?? [])]
    for (const key of keys) {
      const normalized = normalizeKey(key)
      if (!map.has(normalized)) map.set(normalized, pokemon)
    }
  }
  return map
}

function buildLocalPokemonIdIndex(localPokemon: LocalPokemon[]) {
  return new Map(localPokemon.map((pokemon) => [pokemon.id, pokemon]))
}

function pokemonFromCandidates(localPokemonByKey: Map<string, LocalPokemon>, candidates: string[]) {
  for (const candidate of candidates) {
    const pokemon = localPokemonByKey.get(normalizeKey(candidate))
    if (pokemon) return pokemon
  }
  return undefined
}

function pokemonFromPokebase(
  localPokemonByKey: Map<string, LocalPokemon>,
  name: string,
  slug: string,
) {
  const candidates = [slug, name]
  const normalizedSlug = slug.toLowerCase()
  const normalizedName = name.toLowerCase()
  for (const value of [normalizedSlug, normalizedName]) {
    const megaMatch = value.match(/^mega[-\s]?(.+?)(?:[-\s]?(x|y))?$/)
    if (megaMatch) {
      const species = megaMatch[1].replace(/[-\s]+/g, '')
      const suffix = megaMatch[2] ?? ''
      candidates.push(`${species}mega${suffix}`)
    }
  }
  return pokemonFromCandidates(localPokemonByKey, candidates)
}

function pokemonFromEnglishName(localPokemonByKey: Map<string, LocalPokemon>, name: string) {
  const candidates = [name]
  const normalized = name.toLowerCase().replace(/\s+/g, '-')
  candidates.push(normalized, normalized.replace(/-+/g, ''))
  if (/^mega\s+/i.test(name)) {
    const withoutMega = name.replace(/^mega\s+/i, '')
    candidates.push(`${withoutMega} mega`, `${withoutMega}-mega`)
  }
  if (/\s+alola$/i.test(name)) candidates.push(name.replace(/\s+alola$/i, '-alola'))
  if (/\s+hisui$/i.test(name)) candidates.push(name.replace(/\s+hisui$/i, '-hisui'))
  if (/\s+eternal$/i.test(name)) candidates.push(name.replace(/\s+eternal$/i, '-eternal'))
  return pokemonFromCandidates(localPokemonByKey, candidates)
}

function gameWithPokemonToLocal(localPokemon: LocalPokemon[], pokemon: JsonObject | undefined) {
  if (!pokemon) return undefined
  const name = textField(pokemon, GW.name)
  const imageNo = textField(pokemon, GW.imageNo)
  const dex = Number(imageNo.split('_')[0])
  const candidates = localPokemon.filter((entry) => entry.num === dex)
  const hasMega = name.includes(JP.mega)
  const hasMegaX = hasMega && /X/.test(name)
  const hasMegaY = hasMega && /Y/.test(name)
  const hasAlola = name.includes(JP.alola)
  const hasEternal = name.includes(JP.eternalKana) || name.includes(JP.eternalKanji) || imageNo === '670_2'

  if (dex === 670 && hasMega) return candidates.find((entry) => entry.id === 'floettemega')
  if (dex === 670 && hasEternal) return candidates.find((entry) => entry.id === 'floetteeternal')
  if (hasMegaX) return candidates.find((entry) => entry.name.includes('-Mega-X'))
  if (hasMegaY) return candidates.find((entry) => entry.name.includes('-Mega-Y'))
  if (hasMega) return candidates.find((entry) => entry.name.includes('-Mega'))
  if (hasAlola) return candidates.find((entry) => entry.name.includes('-Alola'))
  return candidates.find((entry) => !entry.name.includes('-')) ?? candidates[0]
}

function findGameWithPokemonByTarget(gwPokemon: JsonObject[], target: string) {
  const cleanTarget = cleanJapaneseName(target)
  return gwPokemon.find((pokemon) => {
    const name = textField(pokemon, GW.name)
    const form = textField(pokemon, GW.form)
    return (
      cleanJapaneseName(name) === cleanTarget ||
      cleanJapaneseName(`${name}${form}`) === cleanTarget ||
      cleanJapaneseName(`${name}(${form})`) === cleanTarget
    )
  })
}

function localItemFromEnglish(localItems: LocalItem[], value: string) {
  const normalized = normalizeKey(value)
  return localItems.find((item) => normalizeKey(item.en) === normalized || normalizeKey(item.id) === normalized)
}

function megaStoneForPokemon(localItems: LocalItem[], pokemon: LocalPokemon) {
  const stones = localItems.filter((item) => item.isMegaStone)
  const isX = pokemon.name.includes('-Mega-X')
  const isY = pokemon.name.includes('-Mega-Y')
  if (isX) return stones.find((item) => item.zh.includes(pokemon.zh) && /x$/i.test(item.id))
  if (isY) return stones.find((item) => item.zh.includes(pokemon.zh) && /y$/i.test(item.id))
  return (
    stones.find((item) => item.zh.includes(pokemon.zh) && !/x$|y$/i.test(item.id)) ??
    stones.find((item) => normalizeKey(item.en).includes(normalizeKey(pokemon.name.replace(/-Mega.*$/, ''))))
  )
}

function moveLabelFromEnglish(moveLabelByEn: Map<string, string>, value: string) {
  return moveLabelByEn.get(normalizeKey(value)) ?? value
}

function buildMoveLabelMap(details: Record<string, JsonObject>) {
  const map = new Map<string, string>()
  for (const detail of Object.values(details)) {
    for (const move of asArray(detail.moves)) {
      const en = textField(move, 'en')
      const zh = textField(move, 'zh')
      if (en && zh) map.set(normalizeKey(en), zh)
    }
  }
  return map
}

function megaLabelForTags(member: TeamShareMember, localPokemonById: Map<string, LocalPokemon>) {
  const pokemon = localPokemonById.get(member.pokemonId)
  const name = pokemon?.zh || member.pokemonName.replace(/^Mega /, '')
  const source = `${pokemon?.name ?? member.pokemonName} ${member.item}`
  if (/mega[-\s]?x| x$/i.test(source)) return `${name}（Mega X）`
  if (/mega[-\s]?y| y$/i.test(source)) return `${name}（Mega Y）`
  return `${name}（Mega）`
}

function makeTeamTags(team: TeamShare, localPokemonById: Map<string, LocalPokemon>) {
  const tags = new Set<string>()
  if (team.season) tags.add(team.season)
  if (team.metrics?.likes) tags.add(`${team.metrics.likes} likes`)
  if (team.metrics?.finalRanking) tags.add(`#${team.metrics.finalRanking}`)
  for (const member of team.members) {
    if (/ite\b|nite\b|进化石/i.test(member.item) || /Mega/i.test(member.pokemonName)) {
      tags.add(megaLabelForTags(member, localPokemonById))
    }
    if (tags.size >= 5) break
  }
  return [...tags]
}

async function loadPokebaseTeams(
  localPokemonByKey: Map<string, LocalPokemon>,
  localPokemonById: Map<string, LocalPokemon>,
  moveLabelByEn: Map<string, string>,
  localItems: LocalItem[],
) {
  const html = await fetch(POKEBASE_URL).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status} ${POKEBASE_URL}`)
    return response.text()
  })
  const rawTeams = extractEscapedArray(html, '\\"community\\":[').filter(isObject)
  return rawTeams.map((rawTeam): TeamShare => {
    const creator = asObject(rawTeam.creator)
    const regulation = asObject(rawTeam.regulationSet)
    const members = asArray(rawTeam.team).map((member): TeamShareMember => {
      const pokemon = asObject(member.pokemon)
      const item = asObject(member.item)
      const ability = asObject(member.ability)
      const pokemonName = textField(pokemon, 'name')
      const pokemonSlug = textField(pokemon, 'slug')
      const localPokemon = pokemonFromPokebase(localPokemonByKey, pokemonName, pokemonSlug)
      const itemName = textField(item, 'name')
      return {
        pokemonId: localPokemon?.id ?? normalizeKey(pokemonSlug || pokemonName),
        pokemonName,
        item: localItemFromEnglish(localItems, itemName)?.en ?? itemName,
        ability: textField(ability, 'name'),
        nature: NATURE_BY_SLUG[textField(member, 'nature')] ?? textField(member, 'nature'),
        spread: formatSpreadFromStats(asObject(member.stats)),
        moves: asArray(member.moves).map((move) => moveLabelFromEnglish(moveLabelByEn, textField(move, 'name'))),
      }
    })
    const team: TeamShare = {
      id: `pokebase-${textField(rawTeam, 'id') || normalizeKey(textField(rawTeam, 'name')).slice(0, 32)}`,
      title: textField(rawTeam, 'name'),
      author: textField(creator, 'name') || 'PokéBase',
      teamId: textField(rawTeam, 'gameTeamId') || '-',
      source: 'PokéBase Community',
      sourceUrl: textField(rawTeam, 'sourceUrl') || POKEBASE_URL,
      platformUrl: POKEBASE_URL,
      season: textField(regulation, 'name') || 'Pokemon Champions',
      format: '公开队伍',
      updatedAt: dateOnly(textField(rawTeam, 'dateShared') || textField(rawTeam, 'updatedAt')),
      tags: [],
      summary: compactText(textField(rawTeam, 'writeUpMarkdown') || `公开队伍，包含 ${members.length} 个成员与完整配置。`),
      members,
    }
    return { ...team, tags: makeTeamTags(team, localPokemonById) }
  })
}

function mapGameWithMember(
  member: JsonObject,
  localPokemon: LocalPokemon[],
  localItems: LocalItem[],
  lookup: LookupData,
  gwPokemonById: Map<string, JsonObject>,
  gwItemsById: Map<string, JsonObject>,
  gwAbilitiesById: Map<string, JsonObject>,
  gwMovesById: Map<string, JsonObject>,
  gwPokemon: JsonObject[],
) {
  const masterPokemon = gwPokemonById.get(textField(member, 'pokemon_id'))
  const local = gameWithPokemonToLocal(localPokemon, masterPokemon)
  const masterItem = gwItemsById.get(textField(member, 'item_id'))
  const itemJp = textField(masterItem, GW.name)
  const lookupItem = lookup.items?.[itemJp]?.en
  const targetMega = textField(masterItem, GW.targetMega)
  const targetPokemon = targetMega ? findGameWithPokemonByTarget(gwPokemon, targetMega) : undefined
  const targetLocalPokemon = gameWithPokemonToLocal(localPokemon, targetPokemon)
  const megaStone = targetLocalPokemon ? megaStoneForPokemon(localItems, targetLocalPokemon) : undefined
  const item = megaStone?.en ?? (lookupItem ? localItemFromEnglish(localItems, lookupItem)?.en ?? lookupItem : itemJp)
  const abilityJp = textField(gwAbilitiesById.get(textField(member, 'ability_id')), GW.name)
  const ability = lookup.abilities?.[abilityJp]?.en ?? abilityJp
  const moves = ['move1_id', 'move2_id', 'move3_id', 'move4_id']
    .map((key) => {
      const moveJp = textField(gwMovesById.get(textField(member, key)), GW.name)
      return lookup.moves?.[moveJp]?.zh ?? lookup.moves?.[moveJp]?.en ?? moveJp
    })
    .filter(Boolean)

  return {
    pokemonId: local?.id ?? normalizeKey(textField(masterPokemon, GW.name)),
    pokemonName: local?.name ?? textField(masterPokemon, GW.name),
    item,
    ability,
    nature: NATURE_BY_ID[textField(member, 'nature_id')] ?? 'Serious',
    spread: formatSpreadFromGameWith(member),
    moves,
    note: compactText(textField(member, 'description'), 120) || undefined,
  }
}

async function loadGameWithTeams(
  localPokemon: LocalPokemon[],
  localItems: LocalItem[],
  lookup: LookupData,
) {
  const localPokemonById = buildLocalPokemonIdIndex(localPokemon)
  const [gwPokemon, gwItems, gwAbilities, gwMoves, trendingResponse, latestResponse] = await Promise.all([
    fetchJsonArray(`${GAMEWITH_MASTER}pokemon.json?alt=media`),
    fetchJsonArray(`${GAMEWITH_MASTER}items.json?alt=media`),
    fetchJsonArray(`${GAMEWITH_MASTER}abilities.json?alt=media`),
    fetchJsonArray(`${GAMEWITH_MASTER}moves.json?alt=media`),
    fetchJsonObject(`${GAMEWITH_API}/party-posts/trending?limit=80`),
    fetchJsonObject(`${GAMEWITH_API}/party-posts?limit=80&sort=latest`),
  ])
  const gwPokemonById = new Map(gwPokemon.map((entry) => [String(entry.ID), entry]))
  const gwItemsById = new Map(gwItems.map((entry) => [String(entry.ID), entry]))
  const gwAbilitiesById = new Map(gwAbilities.map((entry) => [String(entry.ID), entry]))
  const gwMovesById = new Map(gwMoves.map((entry) => [String(entry.ID), entry]))
  const rawPosts = [
    ...asArray(trendingResponse.data).map((post) => ({ post, source: 'GameWith 热门队伍' })),
    ...asArray(latestResponse.data).map((post) => ({ post, source: 'GameWith 最新队伍' })),
  ]
  const seen = new Set<string>()
  const teams: TeamShare[] = []

  for (const { post, source } of rawPosts) {
    const postId = textField(post, 'id')
    if (!postId || seen.has(postId)) continue
    seen.add(postId)
    const members = asArray(post.members)
      .sort((left, right) => (numberField(left, 'slot') ?? 0) - (numberField(right, 'slot') ?? 0))
      .map((member) =>
        mapGameWithMember(
          member,
          localPokemon,
          localItems,
          lookup,
          gwPokemonById,
          gwItemsById,
          gwAbilitiesById,
          gwMovesById,
          gwPokemon,
        ),
      )
    if (members.length < 3) continue
    const likes = numberField(post, 'like_count')
    const comments = numberField(post, 'comment_count')
    const finalRanking = textField(post, 'final_ranking') || String(numberField(post, 'final_ranking') ?? '')
    const body = compactText(`${textField(post, 'body_upper')} ${textField(post, 'body_lower')}`, 220)
    const team: TeamShare = {
      id: `gamewith-${postId}`,
      title: textField(post, 'title') || 'GameWith 队伍投稿',
      author: textField(post, 'user_id') ? `GameWith user ${textField(post, 'user_id')}` : 'GameWith',
      teamId: textField(post, 'rental_code') || postId.slice(0, 8),
      source,
      sourceUrl: GAMEWITH_PARTY_URL,
      platformUrl: GAMEWITH_PARTY_URL,
      season: textField(post, 'season_id') ? `Season ${textField(post, 'season_id')}` : 'Pokemon Champions',
      format: '队伍投稿',
      updatedAt: dateOnly(textField(post, 'updated_at') || textField(post, 'created_at')),
      tags: [],
      summary: body || 'GameWith 玩家公开队伍投稿。',
      members,
      metrics: {
        likes,
        comments,
        finalRanking: finalRanking || undefined,
      },
    }
    teams.push({ ...team, tags: makeTeamTags(team, localPokemonById) })
  }

  return teams
}

async function loadVictoryRoadTeams(localPokemonByKey: Map<string, LocalPokemon>) {
  const html = await fetch(VICTORY_ROAD_CHAMPIONS_URL).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status} ${VICTORY_ROAD_CHAMPIONS_URL}`)
    return response.text()
  })
  const latestUpdate = stripHtml(html.match(/Latest update:\s*(?:<[^>]+>\s*)*([^<]+)/i)?.[1] ?? '29 May 2026')
  const updatedAt = dateOnly(latestUpdate)
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].map((match) => match[1])
  const teams: TeamShare[] = []

  for (const row of rows) {
    if (!row.includes('table-team-wrapper')) continue
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1])
    if (cells.length < 4) continue
    const player = stripHtml(cells[1].match(/<b>([\s\S]*?)<\/b>/i)?.[1] ?? cells[1])
    const result = stripHtml(cells[2])
    const memberNames = [...cells[3].matchAll(/<img[^>]+class="champsprite"[^>]*>/gi)]
      .map((match) => htmlAttribute(match[0], 'title') || htmlAttribute(match[0], 'alt'))
      .filter(Boolean)
    if (!player || memberNames.length < 3) continue
    const codeUrl = cells[4]?.match(/href="([^"]+)"/i)?.[1] ?? ''
    const pasteUrl = cells[5]?.match(/href="([^"]+)"/i)?.[1] ?? ''
    const teamCode = codeUrl.match(/([A-Z0-9]{10})/)?.[1] ?? '-'
    const members = memberNames.map((name): TeamShareMember => {
      const pokemon = pokemonFromEnglishName(localPokemonByKey, name)
      return {
        pokemonId: pokemon?.id ?? normalizeKey(name),
        pokemonName: pokemon?.name ?? name,
        item: '-',
        ability: '-',
        nature: '-',
        spread: '-',
        moves: [],
      }
    })
    const team: TeamShare = {
      id: `victory-road-${normalizeKey(`${player}-${result}-${memberNames.join('-')}`).slice(0, 72)}`,
      title: `${player} 的比赛队伍`,
      author: player,
      teamId: teamCode,
      source: 'Victory Road Replica Teams',
      sourceUrl: pasteUrl || codeUrl || VICTORY_ROAD_CHAMPIONS_URL,
      platformUrl: VICTORY_ROAD_CHAMPIONS_URL,
      season: 'M-A',
      format: '比赛/名选手队伍',
      updatedAt,
      tags: ['M-A', '比赛队伍', codeUrl ? '队伍码' : '队伍成员'],
      summary: compactText(result ? `Victory Road 收录：${result}` : 'Victory Road 收录的 Pokémon Champions 队伍。', 180),
      members,
    }
    teams.push(team)
  }

  return teams
}

function sortTeams(teams: TeamShare[]) {
  return teams.sort((left, right) => {
    const leftScore = (left.metrics?.likes ?? 0) * 100 + Date.parse(left.updatedAt)
    const rightScore = (right.metrics?.likes ?? 0) * 100 + Date.parse(right.updatedAt)
    return rightScore - leftScore
  })
}

function latestTeamDate(teams: TeamShare[], predicate: (team: TeamShare) => boolean) {
  const dates = teams.filter(predicate).map((team) => team.updatedAt).filter(Boolean).sort()
  return dates.at(-1) ?? new Date().toISOString().slice(0, 10)
}

async function main() {
  const [localPokemon, localItems, lookup, details] = await Promise.all([
    readJsonFile<LocalPokemon[]>('src/generated/pokemon-index.json'),
    readJsonFile<LocalItem[]>('src/generated/items.json'),
    readJsonFile<LookupData>('src/generated/pokeapi-ja-lookup.json'),
    readJsonFile<Record<string, JsonObject>>('src/generated/pokemon-details.json'),
  ])
  const localPokemonByKey = buildLocalPokemonIndex(localPokemon)
  const localPokemonById = buildLocalPokemonIdIndex(localPokemon)
  const moveLabelByEn = buildMoveLabelMap(details)
  const [pokebaseTeams, gameWithTeams, victoryRoadTeams] = await Promise.all([
    loadPokebaseTeams(localPokemonByKey, localPokemonById, moveLabelByEn, localItems),
    loadGameWithTeams(localPokemon, localItems, lookup),
    loadVictoryRoadTeams(localPokemonByKey),
  ])
  const teams = sortTeams([...gameWithTeams, ...pokebaseTeams, ...victoryRoadTeams]).slice(0, 220)
  const pokebaseUpdatedAt = latestTeamDate(teams, (team) => team.source === 'PokéBase Community')
  const gameWithUpdatedAt = latestTeamDate(teams, (team) => team.source.startsWith('GameWith'))
  const victoryRoadUpdatedAt = latestTeamDate(teams, (team) => team.source === 'Victory Road Replica Teams')
  const output = {
    updatedAt: new Date().toISOString(),
    sources: [
      {
        name: 'PokéBase Community Teams',
        url: POKEBASE_URL,
        note: '公开队伍库，提供队伍成员、道具、特性、性格、努力值与招式。',
        updatedAt: pokebaseUpdatedAt,
      },
      {
        name: 'GameWith JP Party Posts',
        url: GAMEWITH_PARTY_URL,
        note: 'GameWith 日本站玩家队伍投稿与热门队伍接口。',
        updatedAt: gameWithUpdatedAt,
      },
      {
        name: 'Victory Road Replica Teams',
        url: VICTORY_ROAD_CHAMPIONS_URL,
        note: '比赛和名选手队伍集合，提供队伍成员、成绩与队伍码/来源。',
        updatedAt: victoryRoadUpdatedAt,
      },
    ],
    teams,
  }
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${teams.length} teams to ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`)
}

await main()
