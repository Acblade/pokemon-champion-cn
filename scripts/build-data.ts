import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { pinyin } from 'pinyin-pro'

type Dict<T> = Record<string, T>

type Species = {
  num: number
  name: string
  baseSpecies?: string
  types?: string[]
  baseStats?: Record<string, number>
  abilities?: Record<string, string>
  otherFormes?: string[]
}

type Move = {
  num?: number
  name: string
  type: string
  category: 'Status' | 'Physical' | 'Special'
  basePower?: number
  accuracy?: number | true
}

type FormatData = {
  tier?: string
}

type ItemData = {
  name: string
  num?: number
  isNonstandard?: string | null
  itemUser?: string[]
  megaStone?: string
  inherit?: boolean
}

const projectRoot = process.cwd()
const workspaceRoot = path.resolve(projectRoot, '..', '..')
const showdownRoot = path.resolve(workspaceRoot, 'out', 'tmp', 'pokemon-showdown')
const pokeApiRoot = path.resolve(workspaceRoot, 'out', 'tmp', 'pokeapi-cache')
const outputDir = path.resolve(projectRoot, 'src', 'generated')

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"'
        i++
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
  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ''))
    rows.push(row)
  }
  return rows
}

function readCsvMap(filePath: string, idColumn: string, nameColumn: string, languageId = '12') {
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'))
  const header = rows.shift() || []
  const idIndex = header.indexOf(idColumn)
  const langIndex = header.indexOf('local_language_id')
  const nameIndex = header.indexOf(nameColumn)
  const map = new Map<string, string>()
  for (const row of rows) {
    if (row[langIndex] !== languageId) continue
    map.set(row[idIndex], row[nameIndex])
  }
  return map
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s'’`-]+/g, '')
    .replace(/[^\p{Script=Han}a-z0-9]/gu, '')
}

const MOVE_ZH_BY_ID: Record<string, string> = {
  soak: '浸水'
}

function extractChampionsItemIds(calcSetdexText: string, items: Dict<ItemData>) {
  const ids = new Set<string>()
  const regex = /"item":"([^"]+)"/g
  for (const match of calcSetdexText.matchAll(regex)) {
    const englishName = match[1]
    const found = Object.entries(items).find(([, item]) => item.name === englishName)
    if (found) ids.add(found[0])
  }
  return ids
}

const ITEM_ZH_BY_ID = JSON.parse(fs.readFileSync(path.join(projectRoot, 'scripts', 'item-zh.json'), 'utf8')) as Record<string, string>

function buildPinyinVariants(zh: string) {
  const syllables = pinyin(zh, { toneType: 'none', type: 'array', nonZh: 'consecutive' })
  return {
    full: syllables.join('').toLowerCase(),
    initials: syllables.map((part) => part[0] || '').join('').toLowerCase(),
  }
}

async function importData<T>(relativePath: string, exportName: string): Promise<T> {
  const modulePath = pathToFileURL(path.join(showdownRoot, relativePath)).href
  const mod = await import(modulePath)
  return mod[exportName] as T
}

function buildSlugVariants(zh: string, name: string, pinyinValue: string) {
  return Array.from(new Set([zh, name, pinyinValue].map((value) => normalizeSearch(value)).filter(Boolean)))
}

function resolveLearnsetId(id: string, species: Species, learnsets: Dict<{ learnset?: Record<string, string[]> }>, pokedex: Dict<Species>) {
  if (learnsets[id]?.learnset) return id
  const baseSpeciesName = species.baseSpecies
  if (baseSpeciesName) {
    const baseEntry = Object.entries(pokedex).find(([, data]) => data.name === baseSpeciesName)
    if (baseEntry && learnsets[baseEntry[0]]?.learnset) return baseEntry[0]
  }
  const dashedBaseId = id.replace(/mega.*$/i, '').replace(/gmax$/i, '')
  if (learnsets[dashedBaseId]?.learnset) return dashedBaseId
  return id
}

async function main() {
  ensureDir(outputDir)

  const [pokedex, formatsData, learnsets, moves, championsMoves, abilities, items, championsItems, championsSetdexText] = await Promise.all([
    importData<Dict<Species>>('data/pokedex.ts', 'Pokedex'),
    importData<Dict<FormatData>>('data/mods/champions/formats-data.ts', 'FormatsData'),
    importData<Dict<{ learnset?: Record<string, string[]> }>>('data/mods/champions/learnsets.ts', 'Learnsets'),
    importData<Dict<Move>>('data/moves.ts', 'Moves'),
    importData<Dict<Partial<Move>>>('data/mods/champions/moves.ts', 'Moves'),
    importData<Dict<{ name: string; num: number }>>('data/abilities.ts', 'Abilities'),
    importData<Dict<ItemData>>('data/items.ts', 'Items'),
    importData<Dict<ItemData>>('data/mods/champions/items.ts', 'Items'),
    fs.promises.readFile(path.resolve(workspaceRoot, 'out', 'tmp', 'damage-calc', 'src', 'js', 'data', 'sets', 'champions.js'), 'utf8'),
  ])

  const pokemonNames = readCsvMap(path.join(pokeApiRoot, 'pokemon_species_names_full.csv'), 'pokemon_species_id', 'name')
  const moveNames = readCsvMap(path.join(pokeApiRoot, 'move_names_full.csv'), 'move_id', 'name')
  const abilityNames = readCsvMap(path.join(pokeApiRoot, 'ability_names_full.csv'), 'ability_id', 'name')

  const abilityNameToMeta = new Map(Object.entries(abilities).map(([id, value]) => [value.name, { id, num: value.num }]))

  const mergedMoves = new Map<string, Move>()
  for (const [id, baseMove] of Object.entries(moves)) {
    const override = championsMoves[id]
    mergedMoves.set(id, {
      ...baseMove,
      ...override,
      name: override?.name || baseMove.name,
      type: override?.type || baseMove.type,
      category: override?.category || baseMove.category,
      basePower: override?.basePower ?? baseMove.basePower ?? 0,
      accuracy: override?.accuracy ?? baseMove.accuracy,
    })
  }

  const pokemonIndex = Object.entries(formatsData)
    .filter(([, data]) => data.tier && data.tier !== 'Illegal')
    .map(([id, format]) => {
      const species = pokedex[id]
      if (!species) return null
      const zh = pokemonNames.get(String(species.num)) || species.name
      const { full, initials } = buildPinyinVariants(zh)
      const baseStats = {
        hp: species.baseStats?.hp || 0,
        atk: species.baseStats?.atk || 0,
        def: species.baseStats?.def || 0,
        spa: species.baseStats?.spa || 0,
        spd: species.baseStats?.spd || 0,
        spe: species.baseStats?.spe || 0,
      }
      const slugVariants = buildSlugVariants(zh, species.name, full)
      return {
        id,
        num: species.num,
        zh,
        name: species.name,
        pinyin: full,
        initials,
        slugVariants,
        baseSpeciesName: species.baseSpecies || species.name,
        baseSpeciesId: normalizeSearch(species.baseSpecies || species.name),
        types: species.types || [],
        tier: format.tier,
        hasMega: (species.otherFormes || []).some((forme) => forme.toLowerCase().includes('mega')),
        abilities: Object.values(species.abilities || {})
          .filter(Boolean)
          .map((abilityName) => {
            const meta = abilityNameToMeta.get(abilityName)
            return {
              id: meta?.id || normalizeSearch(abilityName),
              en: abilityName,
              zh: abilityNames.get(String(meta?.num || '')) || abilityName,
            }
          }),
        baseStats,
        bst: Object.values(baseStats).reduce((sum, stat) => sum + stat, 0),
        searchKeys: [zh, species.name, full, initials].map(normalizeSearch).filter(Boolean),
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a?.num || 0) - (b?.num || 0))

  const allowedItemIds = extractChampionsItemIds(championsSetdexText, items)

  const allowedItems = Array.from(allowedItemIds)
    .map((id) => {
      const baseItem = items[id]
      const modItem = championsItems[id]
      const sourceItem = modItem || baseItem
      if (!sourceItem?.name && !baseItem?.name) return null
      if (modItem && modItem.isNonstandard !== 'Past' && modItem.isNonstandard !== null) return null
      const en = baseItem?.name || sourceItem.name
      const zh = ITEM_ZH_BY_ID[id] || en
      const py = buildPinyinVariants(zh)
      return {
        id,
        en,
        zh,
        search: [normalizeSearch(en), normalizeSearch(zh), py.full, py.initials, id].filter(Boolean).join(' '),
        isMegaStone: !!(baseItem?.megaStone || modItem?.megaStone),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a!.en.localeCompare(b!.en))

  const pokemonDetails = Object.fromEntries(
    pokemonIndex.map((pokemon) => {
      const moveSourceId = resolveLearnsetId(pokemon!.id, pokedex[pokemon!.id], learnsets, pokedex)
      const moveIds = Object.keys(learnsets[moveSourceId]?.learnset || {})
      const moveList = moveIds
        .map((moveId) => {
          const move = mergedMoves.get(moveId)
          if (!move) return null
          const zh = MOVE_ZH_BY_ID[moveId] || moveNames.get(String(move.num || '')) || move.name
          return {
            id: moveId,
            en: move.name,
            zh,
            pinyin: buildPinyinVariants(zh).full,
            type: move.type,
            category: move.category,
            basePower: move.basePower || 0,
            accuracy: move.accuracy,
          }
        })
        .filter(Boolean)
        .sort((a, b) => {
          const categoryOrder = { Status: 0, Physical: 1, Special: 2 }
          const diff = categoryOrder[a!.category] - categoryOrder[b!.category]
          if (diff !== 0) return diff
          if ((b!.basePower || 0) !== (a!.basePower || 0)) return (b!.basePower || 0) - (a!.basePower || 0)
          return a!.type.localeCompare(b!.type, 'zh-Hans-CN')
        })
      return [pokemon!.id, { ...pokemon, moves: moveList }]
    })
  )

  fs.writeFileSync(path.join(outputDir, 'pokemon-index.json'), JSON.stringify(pokemonIndex, null, 2))
  fs.writeFileSync(path.join(outputDir, 'pokemon-details.json'), JSON.stringify(pokemonDetails, null, 2))
  fs.writeFileSync(path.join(outputDir, 'items.json'), JSON.stringify(allowedItems, null, 2))

  console.log(`Built ${pokemonIndex.length} pokemon records.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
