import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

type Dict<T> = Record<string, T>

type Species = {
  name: string
  baseSpecies?: string
  battleOnly?: string | string[]
}

type FormatData = {
  tier?: string
}

type FormatEntry = {
  name?: string
  section?: string
  mod?: string
  gameType?: string
}

type ItemData = {
  name: string
  isNonstandard?: string | null
  megaStone?: string
}

type GeneratedItem = {
  id: string
  en: string
  zh: string
}

type GeneratedMove = {
  id: string
  en: string
  zh: string
}

type GeneratedPokemonDetail = {
  id: string
  name: string
  zh: string
  baseSpeciesId: string
  baseSpeciesName: string
  moves?: GeneratedMove[]
}

type UsageDataset = {
  season: string
  rule: string
  count: number
  missingPokemon?: { key: string; rank: number; jpName: string }[]
  trainerRankingsAvailable?: boolean
  trainerRankings?: unknown[]
}

type UsageCollection = {
  defaultKey: string
  datasets: Record<string, UsageDataset>
}

const projectRoot = process.cwd()
const cacheRoot = path.resolve(process.env.CHAMPIONS_CACHE_ROOT ?? path.join(projectRoot, 'out', 'tmp'))
const showdownRoot = path.resolve(process.env.POKEMON_SHOWDOWN_ROOT ?? path.join(cacheRoot, 'pokemon-showdown'))
const outputDir = path.join(projectRoot, 'src', 'generated')
const reportPath = path.join(projectRoot, 'out', 'audit', 'champions-update-audit.json')
const showdownMod = process.env.CHAMPIONS_SHOWDOWN_MOD ?? 'champions'
const POKEMON_AUDIT_ID_ALIASES: Record<string, string> = {
  meowsticfmega: 'meowsticf',
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

async function importShowdownData<T>(relativePath: string, exportName: string): Promise<T> {
  const modulePath = pathToFileURL(path.join(showdownRoot, relativePath)).href
  const mod = await import(modulePath)
  return mod[exportName] as T
}

function sortedDifference(left: Iterable<string>, right: Set<string>) {
  return Array.from(left).filter((value) => !right.has(value)).sort()
}

function canonicalPokemonAuditId(id: string) {
  return POKEMON_AUDIT_ID_ALIASES[id] ?? id
}

function sample(values: string[], limit = 30) {
  return values.slice(0, limit)
}

function hasChinese(value: string) {
  return /[\u3400-\u9fff]/.test(value)
}

function isUntranslated(zh: string, en: string) {
  const cleanZh = zh.trim()
  const cleanEn = en.trim()
  return !cleanZh || !hasChinese(cleanZh) || cleanZh.toLowerCase() === cleanEn.toLowerCase()
}

function extractLegalItemIds(modItems: Dict<ItemData>, baseItems: Dict<ItemData>) {
  const ids = new Set<string>()
  for (const [id, item] of Object.entries(baseItems)) {
    const override = modItems[id]
    if (override?.isNonstandard === 'Past') continue
    if (override?.isNonstandard === null || (item.name && !item.isNonstandard)) ids.add(id)
  }
  for (const [id, item] of Object.entries(modItems)) {
    if (item.isNonstandard === null) ids.add(id)
  }
  return ids
}

function findSpeciesIdByName(pokedex: Dict<Species>, name: string) {
  return Object.entries(pokedex).find(([, species]) => species.name === name)?.[0]
}

function resolveLearnsetId(
  id: string,
  detail: GeneratedPokemonDetail,
  pokedex: Dict<Species>,
  learnsets: Dict<{ learnset?: Record<string, string[]> }>,
) {
  if (learnsets[id]?.learnset) return id
  const species = pokedex[id] ?? pokedex[findSpeciesIdByName(pokedex, detail.name) ?? '']
  const battleOnlyNames = Array.isArray(species?.battleOnly)
    ? species.battleOnly
    : species?.battleOnly ? [species.battleOnly] : []
  for (const battleOnlyName of battleOnlyNames) {
    const battleOnlyId = findSpeciesIdByName(pokedex, battleOnlyName)
    if (battleOnlyId && learnsets[battleOnlyId]?.learnset) return battleOnlyId
  }
  if (species?.baseSpecies) {
    const baseId = findSpeciesIdByName(pokedex, species.baseSpecies)
    if (baseId && learnsets[baseId]?.learnset) return baseId
  }
  if (detail.baseSpeciesId && learnsets[detail.baseSpeciesId]?.learnset) return detail.baseSpeciesId
  const dashedBaseId = id.replace(/mega.*$/i, '').replace(/gmax$/i, '')
  if (learnsets[dashedBaseId]?.learnset) return dashedBaseId
  return id
}

function parseList(value: string | undefined) {
  return (value ?? '').split(',').map((part) => part.trim()).filter(Boolean)
}

function usageTargets(usage: UsageCollection) {
  const seasons = parseList(process.env.CHAMPS_SEASONS ?? process.env.CHAMPS_SEASON)
  const rules = parseList(process.env.CHAMPS_RULES ?? process.env.CHAMPS_RULE)
  if (seasons.length && rules.length) {
    return seasons.flatMap((season) => rules.map((rule) => ({ season, rule })))
  }
  const defaultMatch = usage.defaultKey.match(/^champs-season-(.+)-rule-(.+)$/)
  if (defaultMatch) return [{ season: defaultMatch[1], rule: defaultMatch[2] }]
  return Object.values(usage.datasets).map((dataset) => ({ season: dataset.season, rule: dataset.rule }))
}

async function main() {
  const [formats, formatsData, learnsets, pokedex, baseItems, modItems] = await Promise.all([
    importShowdownData<FormatEntry[]>('config/formats.ts', 'Formats'),
    importShowdownData<Dict<FormatData>>(`data/mods/${showdownMod}/formats-data.ts`, 'FormatsData'),
    importShowdownData<Dict<{ learnset?: Record<string, string[]> }>>(`data/mods/${showdownMod}/learnsets.ts`, 'Learnsets'),
    importShowdownData<Dict<Species>>('data/pokedex.ts', 'Pokedex'),
    importShowdownData<Dict<ItemData>>('data/items.ts', 'Items'),
    importShowdownData<Dict<ItemData>>(`data/mods/${showdownMod}/items.ts`, 'Items'),
  ])

  const generatedItems = readJson<GeneratedItem[]>(path.join(outputDir, 'items.json'))
  const generatedDetails = readJson<Record<string, GeneratedPokemonDetail>>(path.join(outputDir, 'pokemon-details.json'))
  const usage = readJson<UsageCollection>(path.join(outputDir, 'usage-datasets.json'))

  const matchingFormats = formats
    .filter((format) => format.mod === showdownMod)
    .map((format) => ({
      name: format.name ?? '(unnamed)',
      mod: format.mod,
      gameType: format.gameType ?? 'singles',
    }))

  const legalPokemonIds = new Set(
    Object.entries(formatsData)
      .filter(([, data]) => data.tier && data.tier !== 'Illegal')
      .map(([id]) => canonicalPokemonAuditId(id)),
  )
  const generatedPokemonIds = new Set(Object.keys(generatedDetails).map((id) => canonicalPokemonAuditId(id)))
  const pokemonMissing = sortedDifference(legalPokemonIds, generatedPokemonIds)
  const pokemonExtra = sortedDifference(generatedPokemonIds, legalPokemonIds)

  const legalItemIds = extractLegalItemIds(modItems, baseItems)
  const generatedItemIds = new Set(generatedItems.map((item) => item.id))
  const itemMissing = sortedDifference(legalItemIds, generatedItemIds)
  const itemExtra = sortedDifference(generatedItemIds, legalItemIds)
  const untranslatedItems = generatedItems
    .filter((item) => isUntranslated(item.zh, item.en))
    .map((item) => ({ id: item.id, en: item.en, zh: item.zh }))

  const uniqueMoves = new Map<string, GeneratedMove>()
  for (const detail of Object.values(generatedDetails)) {
    for (const move of detail.moves ?? []) {
      if (!uniqueMoves.has(move.id)) uniqueMoves.set(move.id, move)
    }
  }
  const untranslatedMoves = Array.from(uniqueMoves.values())
    .filter((move) => isUntranslated(move.zh, move.en))
    .map((move) => ({ id: move.id, en: move.en, zh: move.zh }))

  const learnsetMismatches = Object.entries(generatedDetails).flatMap(([id, detail]) => {
    const sourceId = resolveLearnsetId(id, detail, pokedex, learnsets)
    const expectedIds = new Set(Object.keys(learnsets[sourceId]?.learnset ?? {}))
    const actualIds = new Set((detail.moves ?? []).map((move) => move.id))
    const missing = sortedDifference(expectedIds, actualIds)
    const extra = sortedDifference(actualIds, expectedIds)
    if (!missing.length && !extra.length) return []
    return [{
      id,
      name: detail.name,
      sourceId,
      expected: expectedIds.size,
      actual: actualIds.size,
      missing: sample(missing),
      extra: sample(extra),
    }]
  })

  const usageAudits = usageTargets(usage).map(({ season, rule }) => {
    const key = `champs-season-${season}-rule-${rule}`
    const dataset = usage.datasets[key]
    return {
      key,
      exists: Boolean(dataset),
      count: dataset?.count ?? 0,
      missingPokemon: dataset?.missingPokemon ?? [],
      trainerRankingsAvailable: dataset?.trainerRankingsAvailable ?? false,
      trainerRankingCount: dataset?.trainerRankings?.length ?? 0,
    }
  })

  const failures = [
    pokemonMissing.length ? `pokemon missing: ${pokemonMissing.length}` : '',
    pokemonExtra.length ? `pokemon extra: ${pokemonExtra.length}` : '',
    itemMissing.length ? `item missing: ${itemMissing.length}` : '',
    itemExtra.length ? `item extra: ${itemExtra.length}` : '',
    untranslatedItems.length ? `untranslated items: ${untranslatedItems.length}` : '',
    untranslatedMoves.length ? `untranslated moves: ${untranslatedMoves.length}` : '',
    learnsetMismatches.length ? `learnset mismatch: ${learnsetMismatches.length}` : '',
    ...usageAudits.flatMap((audit) => [
      !audit.exists ? `usage dataset missing: ${audit.key}` : '',
      audit.missingPokemon.length ? `usage missing pokemon in ${audit.key}: ${audit.missingPokemon.length}` : '',
      !audit.trainerRankingsAvailable || audit.trainerRankingCount === 0 ? `trainer rankings missing: ${audit.key}` : '',
    ]),
  ].filter(Boolean)

  const report = {
    showdownMod,
    matchingFormats,
    pokemonAuditAliases: POKEMON_AUDIT_ID_ALIASES,
    counts: {
      legalPokemon: legalPokemonIds.size,
      generatedPokemon: generatedPokemonIds.size,
      legalItems: legalItemIds.size,
      generatedItems: generatedItemIds.size,
      uniqueMoves: uniqueMoves.size,
    },
    pokemon: {
      missingCount: pokemonMissing.length,
      extraCount: pokemonExtra.length,
      missing: sample(pokemonMissing),
      extra: sample(pokemonExtra),
    },
    items: {
      missingCount: itemMissing.length,
      extraCount: itemExtra.length,
      untranslatedCount: untranslatedItems.length,
      missing: sample(itemMissing),
      extra: sample(itemExtra),
      untranslated: untranslatedItems.slice(0, 30),
    },
    moves: {
      uniqueCount: uniqueMoves.size,
      untranslatedCount: untranslatedMoves.length,
      untranslated: untranslatedMoves.slice(0, 30),
    },
    learnsets: {
      mismatchCount: learnsetMismatches.length,
      mismatches: learnsetMismatches.slice(0, 30),
    },
    usage: usageAudits,
    failures,
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(`Showdown mod: ${showdownMod}`)
  console.log(`Matching formats: ${matchingFormats.map((format) => format.name).join(', ') || '(none)'}`)
  console.log(`Pokemon: legal=${legalPokemonIds.size}, generated=${generatedPokemonIds.size}, missing=${pokemonMissing.length}, extra=${pokemonExtra.length}`)
  console.log(`Items: legal=${legalItemIds.size}, generated=${generatedItemIds.size}, missing=${itemMissing.length}, extra=${itemExtra.length}, untranslated=${untranslatedItems.length}`)
  console.log(`Moves: unique=${uniqueMoves.size}, untranslated=${untranslatedMoves.length}`)
  console.log(`Learnsets: mismatch=${learnsetMismatches.length}`)
  for (const audit of usageAudits) {
    console.log(`Usage ${audit.key}: exists=${audit.exists}, pokemon=${audit.count}, usageMissing=${audit.missingPokemon.length}, trainerRankings=${audit.trainerRankingCount}`)
  }
  console.log(`Audit report: ${reportPath}`)

  if (failures.length) {
    console.error(`Audit failed: ${failures.join('; ')}`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
