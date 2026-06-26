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
  owner?: string
  teamId: string
  source: string
  sourceGroup: string
  sourceUrl: string
  platformUrl: string
  season: string
  format: string
  updatedAt: string
  eventDate?: string
  eventName?: string
  eventType?: string
  region?: string
  category?: string
  placement?: number
  ranking?: number
  record?: string
  wins?: number
  losses?: number
  archetypes?: string[]
  detailLevel?: 'full' | 'sets' | 'members'
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

const TEAM_SHEET_ID = '1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw'
const TEAM_SOURCE_NAME = 'VGCPastes Repository'
const TEAM_SOURCE_HOME_URL = 'https://tinyurl.com/vgcpastes2026'
const TEAM_SHEETS = [
  { season: 'M-B', gid: '1458357160' },
  { season: 'M-A', gid: '791705272' },
].map((sheet) => ({
  ...sheet,
  url: `https://docs.google.com/spreadsheets/d/${TEAM_SHEET_ID}/view?gid=${sheet.gid}#gid=${sheet.gid}`,
  csvUrl: `https://docs.google.com/spreadsheets/d/${TEAM_SHEET_ID}/export?format=csv&gid=${sheet.gid}`,
}))
const DETAIL_CONCURRENCY = 10
const MEMBER_NAME_START_INDEX = 37
const MEMBER_ITEM_INDEXES = [7, 10, 13, 16, 19, 22]

const ARCHETYPE_LABELS: Record<string, string> = {
  sun: '晴天',
  rain: '雨天',
  sand: '沙暴',
  snow: '雪天',
  'trick-room': '戏法空间',
  tailwind: '顺风',
  'perish-trap': '灭歌捕获',
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function textField(object: JsonObject | undefined, key: string) {
  const value = object?.[key]
  return typeof value === 'string' ? value : ''
}

async function readJsonFile<T>(relativePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, relativePath), 'utf8')) as T
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'pokemon-champion-cn data sync',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
  return response.text()
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function compactText(value: string, max = 180) {
  const clean = value.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean
}

function dateOnly(value: string) {
  if (!value) return new Date().toISOString().slice(0, 10)
  const normalized = value.replace(/(\d)(st|nd|rd|th)\b/gi, '$1').trim()
  const dayMonthYear = normalized.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
  if (dayMonthYear) {
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
    const month = months[dayMonthYear[2].toLowerCase()]
    if (month) return `${dayMonthYear[3]}-${month}-${dayMonthYear[1].padStart(2, '0')}`
  }
  const monthDayYear = normalized.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/)
  if (monthDayYear) {
    const date = new Date(`${monthDayYear[1]} ${monthDayYear[2]}, ${monthDayYear[3]} UTC`)
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  }
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? normalized.slice(0, 10) : date.toISOString().slice(0, 10)
}

function buildLocalPokemonIndex(localPokemon: LocalPokemon[]) {
  const map = new Map<string, LocalPokemon>()
  for (const pokemon of localPokemon) {
    const keys = [pokemon.id, pokemon.name, pokemon.baseSpeciesId, pokemon.zh, ...(pokemon.slugVariants ?? [])]
    for (const key of keys) {
      const normalized = normalizeKey(key)
      if (normalized && !map.has(normalized)) map.set(normalized, pokemon)
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

function pokemonFromEnglishName(localPokemonByKey: Map<string, LocalPokemon>, name: string, item = '') {
  const cleaned = name
    .replace(/^Eternal Flower Floette$/i, 'Floette-Eternal')
    .replace(/\s+/g, '-')
  const baseName = cleaned
    .replace(/-Mega(?:-[XY])?$/i, '')
    .replace(/-Eternal$/i, '')
    .replace(/-(?:Three|Four)$/i, '')
    .replace(/-Masterpiece$/i, '')
    .replace(/-Fancy$/i, '')
  const itemKey = normalizeKey(item)
  const baseKey = normalizeKey(baseName)
  const candidates = [
    name,
    cleaned,
    cleaned.replace(/-(?:Three|Four)$/i, ''),
    cleaned.replace(/-Masterpiece$/i, ''),
    cleaned.replace(/-Fancy$/i, ''),
    cleaned.replace(/-+/g, ''),
    cleaned.replace(/-Mega-([XY])$/i, 'Mega$1'),
    cleaned.replace(/-Mega$/i, 'Mega'),
    cleaned.replace(/-Alola$/i, 'Alola'),
    cleaned.replace(/-Hisui$/i, 'Hisui'),
    cleaned.replace(/-Eternal$/i, 'Eternal'),
  ]
  if (itemKey && (itemKey.includes('ite') || itemKey.includes('nite'))) {
    if (/x$/i.test(itemKey)) candidates.unshift(`${baseKey}megax`)
    if (/y$/i.test(itemKey)) candidates.unshift(`${baseKey}megay`)
    candidates.unshift(`${baseKey}mega`)
  }
  if (/floette[-\s]?eternal[-\s]?mega/i.test(cleaned) || (/floette[-\s]?eternal/i.test(cleaned) && /floettite/i.test(item))) {
    candidates.unshift('floettemega')
  }
  return pokemonFromCandidates(localPokemonByKey, candidates)
}

function localItemFromEnglish(localItems: LocalItem[], value: string) {
  const normalized = normalizeKey(value)
  return localItems.find((item) => normalizeKey(item.en) === normalized || normalizeKey(item.id) === normalized)
}

function isMegaStoneItem(localItems: LocalItem[], value: string) {
  const item = localItemFromEnglish(localItems, value)
  return Boolean(item?.isMegaStone)
}

function buildMoveLabelMap(details: Record<string, JsonObject>) {
  const map = new Map<string, string>()
  for (const detail of Object.values(details)) {
    const moves = Array.isArray(detail.moves) ? detail.moves.filter(isObject) : []
    for (const move of moves) {
      const en = textField(move, 'en')
      const zh = textField(move, 'zh')
      if (en && zh) map.set(normalizeKey(en), zh)
    }
  }
  return map
}

function moveLabelFromEnglish(moveLabelByEn: Map<string, string>, value: string) {
  return moveLabelByEn.get(normalizeKey(value)) ?? value
}

function placementNumber(value: string) {
  const match = value.match(/\d+/)
  return match ? Number(match[0]) : undefined
}

function inferEventType(eventName: string, sourceGroup: string) {
  if (/world/i.test(eventName)) return '世界赛'
  if (/NAIC|EUIC|LAIC|International/i.test(eventName)) return '国际赛'
  if (/Regional/i.test(eventName)) return '区域赛'
  if (/Special Event/i.test(eventName)) return '特别赛'
  if (/National/i.test(eventName)) return '国家赛'
  if (/Major|Cup|Series|Tour|Challenge|League|Weekend|Rumble|Smackdown|Frontier|Pals|r\/VGC|Smogon/i.test(eventName)) return '线上赛事'
  return sourceGroup === TEAM_SOURCE_NAME ? '线上赛事' : '其它'
}

function inferRegion(eventName: string, sourceGroup: string) {
  if (/NAIC|New Orleans|Indianapolis|Los Angeles|Houston|Seattle|Toronto|Orlando/i.test(eventName)) return '北美'
  if (/EUIC|London|Birmingham|Utrecht|Prague|Stuttgart|Seville|Turin/i.test(eventName)) return '欧洲'
  if (/LAIC|São Paulo|Sao Paulo|Santiago|Mérida|Merida|Campinas|Curitiba|Lima|Querétaro|Queretaro|San Juan/i.test(eventName)) return '拉美'
  if (/Melbourne|Sydney|Auckland/i.test(eventName)) return '大洋洲'
  if (/Japan|Korea|Hong Kong|Taipei|Singapore|Bangkok|Kuala Lumpur/i.test(eventName)) return '亚洲'
  if (sourceGroup === TEAM_SOURCE_NAME && eventName) return '线上'
  return '其它'
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let inQuotes = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        value += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(value)
      value = ''
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''))
      rows.push(row)
      row = []
      value = ''
    } else {
      value += char
    }
  }
  if (value.length > 0 || row.length > 0) {
    row.push(value.replace(/\r$/, ''))
    rows.push(row)
  }
  return rows
}

function cleanCell(row: string[], index: number) {
  return (row[index] ?? '').trim()
}

function meaningful(value: string) {
  const clean = value.trim()
  return clean && clean !== '-' && !/^none$/i.test(clean) ? clean : ''
}

function firstMeaningful(...values: string[]) {
  return values.map(meaningful).find(Boolean) ?? ''
}

function parseSheetRows(csvText: string) {
  const rows = parseCsv(csvText)
  const headerIndex = rows.findIndex((row) => cleanCell(row, 0) === 'Team ID')
  if (headerIndex < 0) throw new Error('VGCPastes sheet header row not found')
  const dataRows = rows.slice(headerIndex + 1).filter((row) => /^[A-Z]{2}\d+$/i.test(cleanCell(row, 0)))
  return { rows, dataRows }
}

function inferSheetSeason(rows: string[][], teamId: string, fallbackSeason: string) {
  const titleMatch = rows
    .slice(0, 3)
    .flat()
    .join(' ')
    .match(/\bM[-\s]?([A-Z])\b/i)
  if (titleMatch) return `M-${titleMatch[1].toUpperCase()}`
  const idMatch = teamId.match(/^M([A-Z])/i)
  return idMatch ? `M-${idMatch[1].toUpperCase()}` : fallbackSeason
}

function sheetMemberFromName(
  localPokemonByKey: Map<string, LocalPokemon>,
  localItems: LocalItem[],
  name: string,
  itemName: string,
): TeamShareMember | null {
  const cleanName = meaningful(name)
  if (!cleanName) return null
  const item = localItemFromEnglish(localItems, itemName)?.en ?? meaningful(itemName) ?? '-'
  const pokemon = pokemonFromEnglishName(localPokemonByKey, cleanName, item)
  return {
    pokemonId: pokemon?.id ?? normalizeKey(cleanName),
    pokemonName: pokemon?.name ?? cleanName,
    item,
    ability: '-',
    nature: '-',
    spread: '-',
    moves: [],
  }
}

function parsePokepasteHeader(line: string) {
  const atIndex = line.lastIndexOf(' @ ')
  const left = (atIndex >= 0 ? line.slice(0, atIndex) : line).trim()
  const item = atIndex >= 0 ? line.slice(atIndex + 3).trim() : '-'
  const parenthetical = [...left.matchAll(/\(([^()]+)\)/g)]
    .map((match) => match[1].trim())
    .find((value) => !/^[MF]$/i.test(value))
  const name = (parenthetical || left.replace(/\s+\([MF]\)$/i, '')).trim()
  return { name, item }
}

function parsePokepasteMembers(
  rawText: string,
  localPokemonByKey: Map<string, LocalPokemon>,
  localItems: LocalItem[],
  moveLabelByEn: Map<string, string>,
) {
  const blocks = rawText
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
  const members: TeamShareMember[] = []

  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length === 0) continue
    const { name, item: rawItem } = parsePokepasteHeader(lines[0])
    const item = localItemFromEnglish(localItems, rawItem)?.en ?? meaningful(rawItem) ?? '-'
    const pokemon = pokemonFromEnglishName(localPokemonByKey, name, item)
    const ability = lines.find((line) => /^Ability:/i.test(line))?.replace(/^Ability:\s*/i, '').trim() || '-'
    const spread = lines.find((line) => /^EVs:/i.test(line))?.replace(/^EVs:\s*/i, '').trim() || '-'
    const nature = lines.find((line) => /^[A-Za-z]+ Nature$/i.test(line))?.replace(/\s+Nature$/i, '').trim() || '-'
    const moves = lines
      .filter((line) => line.startsWith('- '))
      .map((line) => moveLabelFromEnglish(moveLabelByEn, line.replace(/^-\s*/, '').trim()))
      .filter(Boolean)

    members.push({
      pokemonId: pokemon?.id ?? normalizeKey(name),
      pokemonName: pokemon?.name ?? name,
      item,
      ability,
      nature,
      spread,
      moves,
    })
  }

  return members
}

function baseMemberKey(member: TeamShareMember) {
  return normalizeKey(member.pokemonName.replace(/-?Mega(?:-[XY])?/i, '').replace(/-Eternal/i, ''))
}

function sameMember(left: TeamShareMember, right: TeamShareMember) {
  return left.pokemonId === right.pokemonId || baseMemberKey(left) === baseMemberKey(right)
}

function mergeSheetMembers(seedMembers: TeamShareMember[], detailMembers: TeamShareMember[]) {
  if (detailMembers.length === 0) return seedMembers
  const used = new Set<number>()
  return seedMembers.map((seed) => {
    const detailIndex = detailMembers.findIndex((detail, index) => !used.has(index) && sameMember(seed, detail))
    if (detailIndex < 0) return seed
    used.add(detailIndex)
    const detail = detailMembers[detailIndex]
    return {
      pokemonId: detail.pokemonId || seed.pokemonId,
      pokemonName: detail.pokemonName || seed.pokemonName,
      item: detail.item && detail.item !== '-' ? detail.item : seed.item,
      ability: detail.ability && detail.ability !== '-' ? detail.ability : seed.ability,
      nature: detail.nature && detail.nature !== '-' ? detail.nature : seed.nature,
      spread: detail.spread && detail.spread !== '-' ? detail.spread : seed.spread,
      moves: detail.moves.length > 0 ? detail.moves : seed.moves,
      note: seed.note ?? detail.note,
    }
  })
}

function megaLabelForTags(member: TeamShareMember, localPokemonById: Map<string, LocalPokemon>, localItems: LocalItem[]) {
  const pokemon = localPokemonById.get(member.pokemonId)
  const name = pokemon?.zh || member.pokemonName.replace(/^Mega /, '')
  const source = `${pokemon?.name ?? member.pokemonName} ${member.item}`
  if (/mega[-\s]?x| x$/i.test(source)) return `${name}（Mega X）`
  if (/mega[-\s]?y| y$/i.test(source)) return `${name}（Mega Y）`
  if (isMegaStoneItem(localItems, member.item) || /Mega/i.test(member.pokemonName) || /-Mega/i.test(pokemon?.name ?? '')) return `${name}（Mega）`
  return ''
}

function makeTeamTags(team: TeamShare, localPokemonById: Map<string, LocalPokemon>, localItems: LocalItem[]) {
  const tags = new Set<string>()
  if (team.season) tags.add(team.season)
  if (team.eventType) tags.add(team.eventType)
  if (team.region) tags.add(team.region)
  if (team.placement) tags.add(`#${team.placement}`)
  for (const archetype of team.archetypes ?? []) tags.add(ARCHETYPE_LABELS[archetype] ?? archetype)
  for (const member of team.members) {
    const megaLabel = megaLabelForTags(member, localPokemonById, localItems)
    if (megaLabel) tags.add(megaLabel)
    if (tags.size >= 8) break
  }
  return [...tags]
}

function teamDetailLevel(team: TeamShare): TeamShare['detailLevel'] {
  if (team.members.some((member) => member.spread && member.spread !== '-')) return 'full'
  if (team.members.some((member) => member.moves.length > 0 || [member.ability, member.nature].some((value) => Boolean(value && value !== '-')))) return 'sets'
  return 'members'
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

function rowToTeam(
  row: string[],
  allRows: string[][],
  sheet: typeof TEAM_SHEETS[number],
  localPokemonByKey: Map<string, LocalPokemon>,
  localItems: LocalItem[],
) {
  const teamId = cleanCell(row, 0)
  if (!teamId) return null
  const title = firstMeaningful(cleanCell(row, 1), `${teamId} 队伍分享`)
  const owner = meaningful(cleanCell(row, 35))
  const author = firstMeaningful(cleanCell(row, 3), owner, 'Unknown Trainer')
  const pasteUrl = meaningful(cleanCell(row, 24))
  const eventDate = dateOnly(cleanCell(row, 29))
  const eventName = meaningful(cleanCell(row, 30))
  const placement = placementNumber(cleanCell(row, 31))
  const sourceLink = firstMeaningful(cleanCell(row, 32), cleanCell(row, 33), cleanCell(row, 34), pasteUrl, sheet.url)
  const eventType = inferEventType(eventName, TEAM_SOURCE_NAME)
  const region = inferRegion(eventName, TEAM_SOURCE_NAME)
  const season = inferSheetSeason(allRows, teamId, sheet.season)
  const replicaCode = meaningful(cleanCell(row, 28))
  const members = Array.from({ length: 6 }, (_, index) => {
    return sheetMemberFromName(
      localPokemonByKey,
      localItems,
      cleanCell(row, MEMBER_NAME_START_INDEX + index),
      cleanCell(row, MEMBER_ITEM_INDEXES[index]),
    )
  }).filter((member): member is TeamShareMember => Boolean(member))
  if (members.length === 0) return null

  const team: TeamShare = {
    id: `vgcpastes-${teamId.toLowerCase()}`,
    title,
    author,
    owner,
    teamId,
    source: TEAM_SOURCE_NAME,
    sourceGroup: TEAM_SOURCE_NAME,
    sourceUrl: sourceLink,
    platformUrl: pasteUrl || sheet.url,
    season,
    format: eventName ? `${eventType} / ${eventName}` : '队伍分享',
    updatedAt: eventDate,
    eventDate,
    eventName: eventName || undefined,
    eventType,
    region,
    category: '表格收录队伍',
    placement,
    detailLevel: 'members',
    tags: [],
    summary: compactText([
      eventName || 'VGCPastes 收录队伍',
      placement ? `第 ${placement} 名` : '',
      `作者 ${author}`,
      replicaCode ? `队伍码 ${replicaCode}` : '',
    ].filter(Boolean).join('，')),
    members,
    metrics: { finalRanking: placement ? String(placement) : undefined },
  }
  return team
}

function pokepasteRawUrl(url: string) {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'pokepast.es' && !parsed.pathname.endsWith('/raw')) {
      parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/raw`
    }
    return parsed.toString()
  } catch {
    return url
  }
}

async function loadSheetTeams(
  sheet: typeof TEAM_SHEETS[number],
  localPokemonByKey: Map<string, LocalPokemon>,
  localPokemonById: Map<string, LocalPokemon>,
  localItems: LocalItem[],
  moveLabelByEn: Map<string, string>,
) {
  const csv = await fetchText(sheet.csvUrl)
  const { rows, dataRows } = parseSheetRows(csv)
  const mapped = dataRows
    .map((row) => rowToTeam(row, rows, sheet, localPokemonByKey, localItems))
    .filter((team): team is TeamShare => Boolean(team))
  console.log(`VGCPastes ${sheet.season} sheet: ${mapped.length} teams`)

  const teams = await mapWithConcurrency(mapped, DETAIL_CONCURRENCY, async (team, index) => {
    const rawUrl = pokepasteRawUrl(team.platformUrl)
    if (!rawUrl.includes('pokepast.es')) {
      const withTags = { ...team, detailLevel: teamDetailLevel(team) }
      return { ...withTags, tags: makeTeamTags(withTags, localPokemonById, localItems) }
    }
    try {
      const rawText = await fetchText(rawUrl)
      const detailMembers = parsePokepasteMembers(rawText, localPokemonByKey, localItems, moveLabelByEn)
      const members = mergeSheetMembers(team.members, detailMembers)
      const hydrated: TeamShare = {
        ...team,
        members,
        detailLevel: teamDetailLevel({ ...team, members }),
      }
      return { ...hydrated, tags: makeTeamTags(hydrated, localPokemonById, localItems) }
    } catch (error) {
      console.warn(`Pokepaste detail failed (${team.teamId}): ${error instanceof Error ? error.message : String(error)}`)
      const withTags = { ...team, detailLevel: teamDetailLevel(team) }
      return { ...withTags, tags: makeTeamTags(withTags, localPokemonById, localItems) }
    } finally {
      if ((index + 1) % 50 === 0) console.log(`Pokepaste details ${sheet.season}: ${index + 1}/${mapped.length}`)
    }
  })

  return teams
}

async function loadAllSheetTeams(
  localPokemonByKey: Map<string, LocalPokemon>,
  localPokemonById: Map<string, LocalPokemon>,
  localItems: LocalItem[],
  moveLabelByEn: Map<string, string>,
) {
  const teamsBySheet = []
  for (const sheet of TEAM_SHEETS) {
    teamsBySheet.push(await loadSheetTeams(sheet, localPokemonByKey, localPokemonById, localItems, moveLabelByEn))
  }
  return teamsBySheet.flat()
}

function sortTeams(teams: TeamShare[]) {
  return teams.sort((left, right) => {
    const leftNumber = Number(left.teamId.match(/\d+/)?.[0] ?? 0)
    const rightNumber = Number(right.teamId.match(/\d+/)?.[0] ?? 0)
    if (leftNumber !== rightNumber) return rightNumber - leftNumber
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  })
}

function latestTeamDate(teams: TeamShare[], predicate: (team: TeamShare) => boolean) {
  const dates = teams.filter(predicate).map((team) => team.updatedAt).filter(Boolean).sort()
  return dates.at(-1) ?? new Date().toISOString().slice(0, 10)
}

async function main() {
  const [localPokemon, localItems, details] = await Promise.all([
    readJsonFile<LocalPokemon[]>('src/generated/pokemon-index.json'),
    readJsonFile<LocalItem[]>('src/generated/items.json'),
    readJsonFile<Record<string, JsonObject>>('src/generated/pokemon-details.json'),
  ])
  const localPokemonByKey = buildLocalPokemonIndex(localPokemon)
  const localPokemonById = buildLocalPokemonIdIndex(localPokemon)
  const moveLabelByEn = buildMoveLabelMap(details)
  const teams = sortTeams(await loadAllSheetTeams(localPokemonByKey, localPokemonById, localItems, moveLabelByEn))
  const output = {
    updatedAt: new Date().toISOString(),
    sources: TEAM_SHEETS.map((sheet) => {
      const sheetTeams = teams.filter((team) => team.season === sheet.season)
      return {
        name: TEAM_SOURCE_NAME,
        season: sheet.season,
        url: sheet.url,
        homeUrl: TEAM_SOURCE_HOME_URL,
        note: 'Google Sheets 队伍库；列表来自表格，完整配置从每行 Pokepaste 链接同步。',
        updatedAt: latestTeamDate(sheetTeams, () => true),
        count: sheetTeams.length,
      }
    }),
    teams,
  }
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${teams.length} teams to ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`)
}

await main()
