import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { championsPokemon, type PokemonRow } from './data/champions'
import { championsDetails, type PokemonDetail } from './data/championsDetails'
import { loadPokemonDetail } from './lib/loadPokemonDetail'
import { loadFavoriteMoves, saveFavoriteMoves } from './lib/favorites'
import { loadSavedPokemon, saveSavedPokemon, type SavedPokemonEntry } from './lib/savedPokemon'
import { loadSavedGroups, saveSavedGroups } from './lib/savedGroups'
import { loadTheme, saveTheme, type ThemeMode } from './lib/viewState'
import { pokemonDisplayName, pokemonSearchText } from './lib/pokemonDisplay'
import { getLatestTrainerRankingDataset, getPokemonUsageFromDataset, getUsageDataset, isTrainerRankingOutdated } from './data/usageStats'
import { PokemonDetailPanel } from './components/PokemonDetailPanel'
import { ruleItems } from './data/items'
import { teamShareSources, teamShares, teamSharesUpdatedAt, type TeamShare, type TeamShareMember, type TeamShareSource } from './data/teamShares'
import { TYPE_LABELS, TYPE_ORDER, typeBadgeClass, typeColorClass, typeLabel } from './lib/pokemonTypes'

function appItemLabel(itemValue: string) {
  const item = normalizeTeamItem(itemValue)
  if (item === '无') return '无'
  return ruleItems.find((i) => i.en === item)?.zh || item
}

const SP_LABELS: Record<string, string> = { hp: 'HP', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度' }
const TEAM_NATURE_LABELS: Record<string, string> = {
  Adamant: '固执',
  Bashful: '害羞',
  Bold: '大胆',
  Brave: '勇敢',
  Calm: '温和',
  Careful: '慎重',
  Docile: '坦率',
  Gentle: '温顺',
  Hardy: '勤奋',
  Hasty: '急躁',
  Impish: '淘气',
  Jolly: '爽朗',
  Lax: '乐天',
  Lonely: '怕寂寞',
  Mild: '慢吞吞',
  Modest: '内敛',
  Naive: '天真',
  Naughty: '顽皮',
  Quiet: '冷静',
  Quirky: '浮躁',
  Rash: '马虎',
  Relaxed: '悠闲',
  Sassy: '自大',
  Serious: '认真',
  Timid: '胆小',
}

function teamNatureLabel(nature: string) {
  return TEAM_NATURE_LABELS[nature] || nature
}

function teamFieldLabel(value: string | undefined, fallback: string) {
  return value && value !== '-' ? value : fallback
}

const FILTER_TYPE_OPTIONS = TYPE_ORDER.map(typeLabel)
const LIST_COLUMN_LABELS: Record<ListColumnKey, string> = {
  usage: '使用率',
  sprite: '图像',
  zh: '中文名称',
  name: '英文名称',
  types: '属性',
  hp: 'HP',
  atk: '攻击',
  def: '防御',
  spa: '特攻',
  spd: '特防',
  spe: '速度',
  bst: '总种族值',
}
const LIST_COLUMN_OPTIONS: ListColumnKey[] = ['usage', 'sprite', 'zh', 'name', 'types', 'hp', 'atk', 'def', 'spa', 'spd', 'spe', 'bst']

const LEGACY_RULE_META: Record<string, { label: string; seasons: { id: string; label: string }[] }> = {
  '1': { label: 'M-A', seasons: [{ id: '1', label: 'M-1：4/8 ~ 5/13' }] },
}



void LEGACY_RULE_META

const BATTLE_USAGE_RULE = '1'
const RULE_META: Record<string, { label: string; seasons: { id: string; label: string }[] }> = {
  'M-A': { label: 'M-A', seasons: [{ id: '1', label: 'M-1' }, { id: '2', label: 'M-2' }] },
  'M-B': { label: 'M-B', seasons: [{ id: '3', label: 'M-3' }] },
}

type HomeTab = 'list' | 'trainers' | 'teams' | 'damage'

type DraftConfig = {
  nature: string
  abilityId: string
  item: string
  sps: Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>
  boosts: Record<'atk' | 'def' | 'spa' | 'spd' | 'spe', number>
  blueFavoriteMoveIds?: string[]
  loadedConfigId?: string
}

const DRAFT_STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const
const DRAFT_BOOST_KEYS = ['atk', 'def', 'spa', 'spd', 'spe'] as const
const DEFAULT_TEAM_NATURE = 'Serious'

function emptyDraftSps(): DraftConfig['sps'] {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
}

function emptyDraftBoosts(): DraftConfig['boosts'] {
  return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
}

function stringArraysEqual(left: string[] | undefined, right: string[] | undefined) {
  const a = left || []
  const b = right || []
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function draftConfigEquals(a: DraftConfig | undefined, b: DraftConfig) {
  if (!a) return false
  if (a.nature !== b.nature || a.abilityId !== b.abilityId || a.item !== b.item) return false
  if (a.loadedConfigId !== b.loadedConfigId) return false
  if (DRAFT_STAT_KEYS.some((key) => a.sps[key] !== b.sps[key])) return false
  if (DRAFT_BOOST_KEYS.some((key) => a.boosts[key] !== b.boosts[key])) return false
  if (!stringArraysEqual(a.blueFavoriteMoveIds, b.blueFavoriteMoveIds)) return false
  return true
}

type SortKey = 'zh' | 'name' | 'types' | 'usageRank' | 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'bst'
type SortDirection = 'asc' | 'desc'

type FilterState = {
  types: string[]
  forms: ('normal' | 'mega')[]
  visibleColumns: ListColumnKey[]
  moveQuery: string
  moveQuery2: string
  selectedMoves: string[]
  statKey: 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
  statMin: string
  statMax: string
  bstMin: string
  bstMax: string
}

type TeamFilterState = {
  teamQuery: string
  fullSpreadOnly: boolean
  rankedOnly: boolean
  sources: string[]
  seasons: string[]
  eventNames: string[]
  eventTypes: string[]
  archetypes: string[]
  placementMax: string
  dateFrom: string
  dateTo: string
  pokemonQuery: string
  megaPokemonQuery: string
}

type ListColumnKey = 'usage' | 'sprite' | 'zh' | 'name' | 'types' | 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'bst'

type TeamPokemonOption = {
  id: string
  label: string
  subLabel: string
  search: string
}

const DEFAULT_FILTERS: FilterState = {
  types: [],
  forms: ['normal'],
  visibleColumns: ['usage', 'sprite', 'zh', 'types', 'hp', 'atk', 'def', 'spa', 'spd', 'spe', 'bst'],
  moveQuery: '',
  moveQuery2: '',
  selectedMoves: [],
  statKey: 'hp',
  statMin: '',
  statMax: '',
  bstMin: '',
  bstMax: '',
}

const DEFAULT_TEAM_FILTERS: TeamFilterState = {
  teamQuery: '',
  fullSpreadOnly: false,
  rankedOnly: false,
  sources: [],
  seasons: [],
  eventNames: [],
  eventTypes: [],
  archetypes: [],
  placementMax: '',
  dateFrom: '',
  dateTo: '',
  pokemonQuery: '',
  megaPokemonQuery: '',
}

function normalize(input: string) {
  return input
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s'’`‘＇\-_.·・/\\|:：()（）[\]【】]+/g, '')
    .replace(/[^\p{Script=Han}a-z0-9]/gu, '')
}

function typeKeyFromLabel(label: string) {
  return Object.entries(TYPE_LABELS).find(([, zh]) => zh === label)?.[0] || label
}

function typeSortValue(types: string[]) {
  const [first, second] = types
  const firstIndex = TYPE_ORDER.indexOf(first as typeof TYPE_ORDER[number])
  const secondIndex = second ? TYPE_ORDER.indexOf(second as typeof TYPE_ORDER[number]) : -1
  return `${String(firstIndex).padStart(2, '0')}-${String(secondIndex).padStart(2, '0')}`
}

function isMegaPokemon(pokemon: PokemonRow) {
  return pokemon.name.toLowerCase().includes('-mega')
}

function normalizeTeamItem(itemValue: string | undefined) {
  const item = itemValue?.trim()
  if (!item || item === '-' || item === '无' || /^none$/i.test(item)) return '无'
  const normalized = normalize(item)
  return ruleItems.find((entry) =>
    normalize(entry.en) === normalized ||
    normalize(entry.id) === normalized ||
    normalize(entry.zh) === normalized
  )?.en || item
}

function teamMemberPokemon(member: TeamShareMember) {
  return championsPokemon.find((pokemon) => pokemon.id === member.pokemonId)
}

function normalTeamDetailFor(pokemon?: PokemonRow) {
  if (!pokemon) return undefined
  const normalForm = championsPokemon.find((entry) => entry.baseSpeciesId === pokemon.baseSpeciesId && !isMegaPokemon(entry))
  return championsDetails[normalForm?.id || pokemon.id] ?? championsDetails[pokemon.id]
}

function findAbilityForMember(member: TeamShareMember, pokemon?: PokemonRow) {
  const normalizedAbility = normalize(member.ability)
  if (!normalizedAbility) return undefined
  const details = [normalTeamDetailFor(pokemon), championsDetails[member.pokemonId]].filter((detail): detail is PokemonDetail => Boolean(detail))
  for (const detail of details) {
    const matched = detail.abilities.find((ability) =>
      normalize(ability.en) === normalizedAbility ||
      normalize(ability.id) === normalizedAbility ||
      normalize(ability.zh) === normalizedAbility
    )
    if (matched) return matched
  }
  for (const detail of Object.values(championsDetails)) {
    const matched = detail.abilities.find((ability) =>
      normalize(ability.en) === normalizedAbility ||
      normalize(ability.id) === normalizedAbility ||
      normalize(ability.zh) === normalizedAbility
    )
    if (matched) return matched
  }
  return undefined
}

function teamAbilityLabel(member: TeamShareMember, pokemon?: PokemonRow) {
  return findAbilityForMember(member, pokemon)?.zh || member.ability
}

function teamAbilityId(member: TeamShareMember, pokemon?: PokemonRow) {
  return findAbilityForMember(member, pokemon)?.id || ''
}

function savedAbilityLabel(entry: SavedPokemonEntry, pokemon?: PokemonRow) {
  const normalizedAbility = normalize(entry.abilityId)
  if (!normalizedAbility) return ''
  const details = [normalTeamDetailFor(pokemon), championsDetails[entry.pokemonId]].filter((detail): detail is PokemonDetail => Boolean(detail))
  for (const detail of details) {
    const matched = detail.abilities.find((ability) => normalize(ability.id) === normalizedAbility)
    if (matched) return matched.zh
  }
  for (const detail of Object.values(championsDetails)) {
    const matched = detail.abilities.find((ability) => normalize(ability.id) === normalizedAbility)
    if (matched) return matched.zh
  }
  return entry.abilityId
}

function savedMegaAbilityLabel(entry: SavedPokemonEntry, pokemon?: PokemonRow) {
  if (!entry.isMega && !(pokemon && isMegaPokemon(pokemon))) return ''
  const detail = championsDetails[pokemon?.id || entry.pokemonId]
  return detail?.abilities[0]?.zh || ''
}

function savedAbilityDisplayLabel(entry: SavedPokemonEntry, pokemon?: PokemonRow) {
  const normalLabel = savedAbilityLabel(entry, pokemon)
  const megaLabel = savedMegaAbilityLabel(entry, pokemon)
  if (!megaLabel) return normalLabel
  if (!normalLabel || normalize(normalLabel) === normalize(megaLabel)) return megaLabel
  return `${normalLabel} / ${megaLabel}`
}

const TEAM_STAT_TOKEN_TO_KEY: Record<string, keyof DraftConfig['sps']> = {
  hp: 'hp',
  atk: 'atk',
  attack: 'atk',
  攻击: 'atk',
  def: 'def',
  defense: 'def',
  防御: 'def',
  spa: 'spa',
  spatk: 'spa',
  specialattack: 'spa',
  特攻: 'spa',
  spd: 'spd',
  spdef: 'spd',
  specialdefense: 'spd',
  特防: 'spd',
  spe: 'spe',
  speed: 'spe',
  速度: 'spe',
}

function statKeyFromTeamToken(token: string) {
  return TEAM_STAT_TOKEN_TO_KEY[token.toLowerCase().replace(/[^a-z\u4e00-\u9fa5]/g, '')]
}

function parseTeamSpread(spread: string | undefined) {
  const sps = emptyDraftSps()
  if (!spread || spread === '-') return sps
  spread.split('/').forEach((rawPart) => {
    const part = rawPart.trim()
    if (!part || /余|remainder/i.test(part)) return
    const valueFirst = part.match(/^(\d+)\s+(.+)$/)
    const statFirst = part.match(/^(.+?)\s+(\d+)$/)
    const value = Number(valueFirst?.[1] ?? statFirst?.[2])
    const statToken = valueFirst?.[2] ?? statFirst?.[1] ?? ''
    const statKey = statKeyFromTeamToken(statToken)
    if (!statKey || !Number.isFinite(value)) return
    sps[statKey] = Math.min(32, Math.max(0, Math.trunc(value)))
  })
  return sps
}

function teamSpreadLabel(spread: string | undefined, fallback: string) {
  const sps = parseTeamSpread(spread)
  const label = DRAFT_STAT_KEYS
    .filter((key) => sps[key] > 0)
    .map((key) => `${SP_LABELS[key]} ${sps[key]}`)
    .join(' / ')
  return label || teamFieldLabel(spread, fallback)
}

function teamMoveIds(member: TeamShareMember, pokemon?: PokemonRow) {
  const detail = championsDetails[pokemon?.id || member.pokemonId]
  if (!detail) return []
  return member.moves
    .map((moveName) => {
      const normalizedMove = normalize(moveName)
      return detail.moves.find((move) =>
        normalize(move.zh) === normalizedMove ||
        normalize(move.en) === normalizedMove ||
        normalize(move.id) === normalizedMove
      )?.id
    })
    .filter((moveId): moveId is string => Boolean(moveId))
}

function teamMemberDraftConfig(member: TeamShareMember, pokemon?: PokemonRow): DraftConfig {
  return {
    nature: teamFieldLabel(member.nature, DEFAULT_TEAM_NATURE),
    abilityId: teamAbilityId(member, pokemon),
    item: normalizeTeamItem(member.item),
    sps: parseTeamSpread(member.spread),
    boosts: emptyDraftBoosts(),
    blueFavoriteMoveIds: teamMoveIds(member, pokemon),
  }
}

function isMegaStoneItem(item: string) {
  return ruleItems.some((entry) => entry.en === item && entry.isMegaStone)
}

function memberMegaSuffix(member: TeamShareMember, pokemon?: PokemonRow) {
  const source = `${pokemon?.name ?? member.pokemonName} ${member.item}`
  if (/mega[-\s]?x| x$/i.test(source)) return 'Mega X'
  if (/mega[-\s]?y| y$/i.test(source)) return 'Mega Y'
  return 'Mega'
}

function isMegaTeamMember(member: TeamShareMember) {
  const pokemon = teamMemberPokemon(member)
  return Boolean((pokemon && isMegaPokemon(pokemon)) || isMegaStoneItem(member.item))
}

function teamMemberDisplaySearchText(member: TeamShareMember) {
  const pokemon = teamMemberPokemon(member)
  return normalize([
    member.pokemonName,
    member.pokemonId,
    member.item,
    pokemon ? pokemonSearchText(pokemon) : '',
    pokemon ? pokemonDisplayName(pokemon) : '',
  ].join(' '))
}

function teamHasFullSpreads(team: TeamShare) {
  return team.members.length > 0 && team.members.every((member) => Boolean(member.spread && member.spread !== '-'))
}

function teamHasPlacement(team: TeamShare) {
  return teamPlacementValue(team) !== undefined
}

function teamMatchesGeneralQuery(team: TeamShare, query: string) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return true
  const memberText = team.members.map((member) => {
    const pokemon = teamMemberPokemon(member)
    return [
      member.pokemonName,
      member.pokemonId,
      member.item,
      member.ability,
      member.nature,
      member.moves.join(' '),
      pokemon ? pokemonSearchText(pokemon) : '',
      pokemon ? pokemonDisplayName(pokemon) : '',
    ].join(' ')
  }).join(' ')
  return normalize([
    team.teamId,
    team.author,
    team.owner,
    team.title,
    team.eventName,
    team.summary,
    team.sourceUrl,
    team.platformUrl,
    memberText,
  ].join(' ')).includes(normalizedQuery)
}

function teamMatchesPokemonQuery(team: TeamShare, query: string, megaOnly = false) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return true
  return team.members.some((member) => {
    if (megaOnly && !isMegaTeamMember(member)) return false
    const pokemon = teamMemberPokemon(member)
    const megaLabel = pokemon && isMegaTeamMember(member) ? normalize(`${pokemonDisplayName(pokemon)} ${memberMegaSuffix(member, pokemon)}`) : ''
    return teamMemberDisplaySearchText(member).includes(normalizedQuery) || megaLabel.includes(normalizedQuery)
  })
}

function teamSourceGroupName(team: TeamShare) {
  if (team.sourceGroup) return team.sourceGroup
  const sourceText = normalize(`${team.source} ${team.sourceUrl} ${team.platformUrl}`)
  if (sourceText.includes('pikalytics')) return 'Pikalytics Top Teams'
  if (sourceText.includes('limitlessvgc')) return 'Limitless VGC'
  if (sourceText.includes('gamewith')) return 'GameWith JP Party Posts'
  if (sourceText.includes('pokebase')) return 'PokéBase Community Teams'
  if (sourceText.includes('victoryroad')) return 'Victory Road Replica Teams'
  return team.source
}

function uniqueSorted(values: (string | undefined)[]) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
}

function sortTeamSeason(left: string, right: string) {
  const order = new Map([['M-A', 1], ['M-B', 2], ['未标注', 99]])
  return (order.get(left) ?? 50) - (order.get(right) ?? 50) || left.localeCompare(right, 'zh-Hans-CN')
}

function toggleFilterValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function teamPlacementValue(team: TeamShare) {
  const raw = team.placement ?? Number(team.metrics?.finalRanking)
  return Number.isFinite(raw) && raw > 0 ? raw : undefined
}

function teamMatchesPlacement(team: TeamShare, placementMax: string) {
  if (!placementMax) return true
  const placement = teamPlacementValue(team)
  return placement !== undefined && placement <= Number(placementMax)
}

function teamMatchesDateRange(team: TeamShare, dateFrom: string, dateTo: string) {
  const dateValue = team.eventDate || team.updatedAt
  const time = Date.parse(dateValue)
  if (Number.isNaN(time)) return false
  if (dateFrom) {
    const from = Date.parse(dateFrom)
    if (!Number.isNaN(from) && time < from) return false
  }
  if (dateTo) {
    const to = Date.parse(`${dateTo}T23:59:59`)
    if (!Number.isNaN(to) && time > to) return false
  }
  return true
}

function buildTeamPokemonOption(pokemon: PokemonRow): TeamPokemonOption {
  return {
    id: pokemon.id,
    label: pokemonDisplayName(pokemon),
    subLabel: pokemon.name,
    search: [pokemonSearchText(pokemon), pokemon.pinyin, pokemon.initials, pokemon.id, pokemon.name].join(' '),
  }
}

function filterTeamPokemonOptions(options: TeamPokemonOption[], query: string) {
  const normalizedQuery = normalize(query)
  const matched = normalizedQuery ? options.filter((option) => normalize(option.search).includes(normalizedQuery)) : options
  return matched.slice(0, 24)
}

function displayTeamTag(team: TeamShare, tag: string) {
  const normalizedTag = normalize(tag)
  const matchedMember = team.members.find((member) => {
    if (!isMegaTeamMember(member)) return false
    const pokemon = teamMemberPokemon(member)
    if (!pokemon) return normalize(member.pokemonName) === normalizedTag
    return [pokemon.name, pokemon.id, pokemon.zh, pokemonDisplayName(pokemon), member.pokemonName].some((value) => normalize(value).includes(normalizedTag) || normalizedTag.includes(normalize(value)))
  })
  if (!matchedMember) return tag
  const pokemon = teamMemberPokemon(matchedMember)
  if (!pokemon) return tag
  return `${pokemon.zh}（${memberMegaSuffix(matchedMember, pokemon)}）`
}

function visibleTeamTags(team: TeamShare) {
  return team.members
    .filter(isMegaTeamMember)
    .map((member) => displayTeamTag(team, member.pokemonName))
    .filter((label, index, values) => label && values.indexOf(label) === index)
}

function formatDatasetDate(date: string) {
  const datePart = date.includes('T') ? date.slice(0, 10) : date
  const [, month, day] = datePart.split('-')
  return month && day ? `${month} 月 ${day} 日` : date
}

function formatLocalDateTime(iso: string | undefined, fallbackDate: string) {
  if (!iso) return formatDatasetDate(fallbackDate)
  const syncDate = new Date(iso)
  if (Number.isNaN(syncDate.getTime())) return formatDatasetDate(fallbackDate)
  const parts = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).formatToParts(syncDate)
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  const dateText = month && day ? `${month} 月 ${day} 日` : formatDatasetDate(fallbackDate)
  return `${dateText} ${syncDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

function teamSourceLineSource(sources: TeamShareSource[], rule: string) {
  return sources.find((source) => source.season === rule) ?? sources[0]
}

function showdownSpriteSlug(pokemon: PokemonRow) {
  return pokemon.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function pokemonDbSpriteSlug(pokemon: PokemonRow) {
  const name = pokemon.name
    .replace(/-Alola$/, '-Alolan')
    .replace(/-Galar$/, '-Galarian')
    .replace(/-Hisui$/, '-Hisuian')
    .replace(/-Paldea-/, '-Paldean-')
    .replace(/-F$/, '-Female')
    .replace(/-M$/, '-Male')
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function pokemonSpriteUrl(pokemon: PokemonRow) {
  return `https://img.pokemondb.net/sprites/home/normal/${pokemonDbSpriteSlug(pokemon)}.png`
}

function pokemonSpriteFallbackUrl(pokemon: PokemonRow) {
  return `https://play.pokemonshowdown.com/sprites/dex/${showdownSpriteSlug(pokemon)}.png`
}

function trainerSourceUrl(dataset: { trainerSourceUrl?: string; sourceUrl: string }) {
  return dataset.trainerSourceUrl || dataset.sourceUrl
}

function sourceLabel(dataset: { source?: string; sourceUrl: string }) {
  if (dataset.source) return dataset.source
  try {
    return new URL(dataset.sourceUrl).hostname.replace(/^www\./, '')
  } catch {
    return dataset.sourceUrl
  }
}

function trainerRankingSourceLabel(dataset: { trainerSource?: string; source?: string; sourceUrl: string }) {
  return dataset.trainerSource || sourceLabel(dataset)
}

function slugify(value: string) {
  return encodeURIComponent(value)
}

function withBasePath(path: string) {
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base
  return `${normalizedBase}${path}` || '/'
}

function getPokemonHref(pokemon: PokemonRow) {
  return withBasePath(`/${slugify(pokemon.id)}`)
}

function getCurrentPath() {
  if (typeof window === 'undefined') return ''
  const base = import.meta.env.BASE_URL || '/'
  let pathname = window.location.pathname
  if (base !== '/' && pathname.startsWith(base)) {
    pathname = pathname.slice(base.length - 1)
  }
  return decodeURIComponent(pathname.replace(/^\//, ''))
}

function resolvePokemonFromPath(pathname = getCurrentPath()) {
  const slug = pathname
  if (!slug || slug === 'saved') return null
  const normalized = normalize(slug)

  const exactIdMatch = championsPokemon.find((pokemon) => normalize(pokemon.id) === normalized)
  if (exactIdMatch) return exactIdMatch

  const exactSlugMatch = championsPokemon.find((pokemon) => pokemon.slugVariants.some((value) => normalize(value) === normalized && normalize(value) !== normalize(pokemon.zh) && normalize(value) !== normalize(pokemon.pinyin)))
  if (exactSlugMatch) return exactSlugMatch

  return championsPokemon.find((pokemon) =>
    [pokemon.zh, pokemon.name, pokemon.pinyin].some((value) => normalize(value) === normalized),
  ) ?? null
}

function buildSavedLabel(baseName: string, baseId: string, entries: SavedPokemonEntry[]) {
  const sameBase = entries.filter((entry) => entry.baseId === baseId)
  return `${baseName} ${sameBase.length + 1}`
}

function teamSavedGroupBaseName(team: TeamShare) {
  return [team.season, team.teamId, team.author].filter(Boolean).join(' · ') || team.title
}

function savedEntryDraftConfig(entry: SavedPokemonEntry): DraftConfig {
  return {
    nature: entry.nature,
    abilityId: entry.abilityId,
    item: entry.item,
    sps: entry.sps,
    boosts: entry.boosts,
    blueFavoriteMoveIds: entry.blueFavorites || [],
    loadedConfigId: entry.id,
  }
}

function uniqueSavedGroupName(baseName: string, existingNames: string[]) {
  const cleanedBase = cleanGroupName(baseName) || '队伍分享'
  const existing = new Set(existingNames.map(cleanGroupName))
  if (!existing.has(cleanedBase)) return cleanedBase
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${cleanedBase} (${index})`
    if (!existing.has(candidate)) return candidate
  }
  return `${cleanedBase} (${Date.now()})`
}

function savedEntryFromTeamMember(team: TeamShare, member: TeamShareMember, index: number, groupName: string): SavedPokemonEntry | null {
  const pokemon = teamMemberPokemon(member)
  if (!pokemon) return null
  const config = teamMemberDraftConfig(member, pokemon)
  return {
    id: `${team.id}-${index}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    baseId: normalize(pokemon.baseSpeciesName),
    label: `${pokemonDisplayName(pokemon)} · ${team.teamId}`,
    groupNames: [groupName],
    pokemonId: pokemon.id,
    isMega: isMegaTeamMember(member),
    abilityId: config.abilityId,
    item: config.item,
    nature: config.nature,
    sps: config.sps,
    boosts: config.boosts,
    blueFavorites: config.blueFavoriteMoveIds,
  }
}

function teamTagItems(team: TeamShare) {
  return [
    { label: `编号 ${team.teamId}`, tone: 'meta' },
    team.owner ? { label: team.owner, tone: 'meta' } : null,
    { label: formatDatasetDate(team.eventDate || team.updatedAt), tone: 'meta' },
    ...visibleTeamTags(team).map((label) => ({ label, tone: 'mega' })),
  ].filter((item): item is { label: string; tone: string } => Boolean(item))
}

function sortIndicator(activeKey: SortKey, currentKey: SortKey, direction: SortDirection) {
  if (activeKey !== currentKey) return ''
  return direction === 'asc' ? ' ↑' : ' ↓'
}

function cleanGroupName(value: string) {
  return value.trim()
}

function moveSearchRank(move: { zh: string; en: string; id: string; pinyin: string }, q: string) {
  const fields = [move.pinyin, move.zh, move.en.toLowerCase(), move.id.toLowerCase()]
  const normalizedQ = q.toLowerCase()
  let best = 999
  for (const field of fields) {
    if (field === normalizedQ) best = Math.min(best, 0)
    else if (field.startsWith(normalizedQ)) best = Math.min(best, 1)
    else if (field.includes(normalizedQ)) best = Math.min(best, 2)
  }
  return best
}

function App() {
  const initialPath = getCurrentPath()
  const initialPokemon = resolvePokemonFromPath(initialPath)
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme())
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('usageRank')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [teamFiltersOpen, setTeamFiltersOpen] = useState(false)
  const [listTypesOpen, setListTypesOpen] = useState(false)
  const [listColumnsOpen, setListColumnsOpen] = useState(false)
  const [teamEventsOpen, setTeamEventsOpen] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [movePickerOpen, setMovePickerOpen] = useState<'move1' | 'move2' | null>(null)
  const [teamPokemonPickerOpen, setTeamPokemonPickerOpen] = useState<'pokemon' | 'mega' | null>(null)
  const [selectedPokemonId, setSelectedPokemonId] = useState<string | null>(initialPokemon?.id ?? championsPokemon[0]?.id ?? null)
  const [selectedPokemon, setSelectedPokemon] = useState<PokemonDetail | null>(null)
  const [compareTarget, setCompareTarget] = useState<PokemonDetail | null>(null)
  const [favoriteMoveIds, setFavoriteMoveIds] = useState<string[]>(() => loadFavoriteMoves())
  const [savedPokemon, setSavedPokemon] = useState<SavedPokemonEntry[]>(() => loadSavedPokemon())
  const [damageTargetId, setDamageTargetId] = useState<string>('')
  const [draftConfigs, setDraftConfigs] = useState<Record<string, DraftConfig>>({})
  const [topbarVisible, setTopbarVisible] = useState(true)
  const [homeTab, setHomeTab] = useState<HomeTab>('list')
  const [currentRule, setCurrentRule] = useState('M-B')
  const [currentSeason, setCurrentSeason] = useState('3')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [newGroupName, setNewGroupName] = useState('')
  const [savedGroups, setSavedGroups] = useState<string[]>(() => loadSavedGroups())
  const [editingSavedNameId, setEditingSavedNameId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null)
  const [editingGroupValue, setEditingGroupValue] = useState('')
  const [groupPickerEntryId, setGroupPickerEntryId] = useState<string | null>(null)
  const [teamFilters, setTeamFilters] = useState<TeamFilterState>(DEFAULT_TEAM_FILTERS)
  const [addedTeamGroups, setAddedTeamGroups] = useState<Record<string, string>>({})
  const [draftLoadVersion, setDraftLoadVersion] = useState(0)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    saveTheme(theme)
  }, [theme])

  const selectedUsageDataset = useMemo(() => getUsageDataset(currentSeason, BATTLE_USAGE_RULE), [currentSeason])
  const latestTrainerRankingDataset = useMemo(() => getLatestTrainerRankingDataset(BATTLE_USAGE_RULE), [])
  const currentTrainerRankingDataset = selectedUsageDataset.trainerRankings.length > 0 ? selectedUsageDataset : null
  const trainerRankingDataset = currentTrainerRankingDataset ?? latestTrainerRankingDataset
  const trainerRankingUnupdated = isTrainerRankingOutdated(selectedUsageDataset, currentTrainerRankingDataset)

  const filtered = useMemo(() => {
    const moveQ = normalize(filters.selectedMoves[0] || filters.moveQuery)
    const moveQ2 = normalize(filters.selectedMoves[1] || filters.moveQuery2)
    return championsPokemon
      .filter((pokemon) => {
        const detail = championsDetails[pokemon.id]
        const matchesType = filters.types.length === 0 || filters.types.some((type) => pokemon.types.includes(typeKeyFromLabel(type)))
        const targetStat = pokemon.baseStats[filters.statKey]
        const matchesStatMin = !filters.statMin || targetStat >= Number(filters.statMin)
        const matchesStatMax = !filters.statMax || targetStat <= Number(filters.statMax)
        const matchesBstMin = !filters.bstMin || pokemon.bst >= Number(filters.bstMin)
        const matchesBstMax = !filters.bstMax || pokemon.bst <= Number(filters.bstMax)
        const matchesMove = !moveQ || !!detail?.moves.some((move) => normalize([move.zh, move.en, move.id, move.pinyin].join(' ')).includes(moveQ))
        const matchesMove2 = !moveQ2 || !!detail?.moves.some((move) => normalize([move.zh, move.en, move.id, move.pinyin].join(' ')).includes(moveQ2))
        const formKey = isMegaPokemon(pokemon) ? 'mega' : 'normal'
        const matchesForm = filters.forms.includes(formKey)
        return matchesForm && matchesType && matchesStatMin && matchesStatMax && matchesBstMin && matchesBstMax && matchesMove && matchesMove2
      })
      .sort((a, b) => {
        const factor = sortDirection === 'asc' ? 1 : -1
        switch (sortKey) {
          case 'zh': return a.zh.localeCompare(b.zh, 'zh-Hans-CN') * factor
          case 'name': return a.name.localeCompare(b.name) * factor
          case 'types': return typeSortValue(a.types).localeCompare(typeSortValue(b.types)) * factor
          case 'usageRank': {
            const rankA = getPokemonUsageFromDataset(selectedUsageDataset, a.name, a.baseSpeciesName, a.id, a.baseSpeciesId)?.rank ?? Number.MAX_SAFE_INTEGER
            const rankB = getPokemonUsageFromDataset(selectedUsageDataset, b.name, b.baseSpeciesName, b.id, b.baseSpeciesId)?.rank ?? Number.MAX_SAFE_INTEGER
            return (rankA - rankB) * factor
          }
          case 'hp': return (a.baseStats.hp - b.baseStats.hp) * factor
          case 'atk': return (a.baseStats.atk - b.baseStats.atk) * factor
          case 'def': return (a.baseStats.def - b.baseStats.def) * factor
          case 'spa': return (a.baseStats.spa - b.baseStats.spa) * factor
          case 'spd': return (a.baseStats.spd - b.baseStats.spd) * factor
          case 'spe': return (a.baseStats.spe - b.baseStats.spe) * factor
          case 'bst': return (a.bst - b.bst) * factor
        }
      })
  }, [sortKey, sortDirection, filters, selectedUsageDataset])

  const filteredTeamShares = useMemo(() => {
    const effectiveRules = teamFilters.seasons.length > 0 ? teamFilters.seasons : [currentRule]
    return teamShares.filter((team) => {
      if (!teamMatchesGeneralQuery(team, teamFilters.teamQuery)) return false
      if (teamFilters.fullSpreadOnly && !teamHasFullSpreads(team)) return false
      if (teamFilters.rankedOnly && !teamHasPlacement(team)) return false
      if (teamFilters.sources.length > 0 && !teamFilters.sources.includes(teamSourceGroupName(team))) return false
      if (!effectiveRules.includes(team.season)) return false
      if (teamFilters.eventNames.length > 0 && !teamFilters.eventNames.includes(team.eventName || '其它')) return false
      if (teamFilters.eventTypes.length > 0 && !teamFilters.eventTypes.includes(team.eventType || '其它')) return false
      if (teamFilters.archetypes.length > 0 && !teamFilters.archetypes.every((archetype) => (team.archetypes || []).includes(archetype))) return false
      if (!teamMatchesPlacement(team, teamFilters.placementMax)) return false
      if (!teamMatchesDateRange(team, teamFilters.dateFrom, teamFilters.dateTo)) return false
      if (!teamMatchesPokemonQuery(team, teamFilters.pokemonQuery)) return false
      if (!teamMatchesPokemonQuery(team, teamFilters.megaPokemonQuery, true)) return false
      return true
    })
  }, [currentRule, teamFilters])

  const teamSeasonOptions = useMemo(() => uniqueSorted(teamShares.map((team) => team.season)).sort(sortTeamSeason), [])
  const teamEventNameOptions = useMemo(() => uniqueSorted(teamShares.filter((team) => (teamFilters.seasons.length ? teamFilters.seasons : [currentRule]).includes(team.season)).map((team) => team.eventName || '其它')), [currentRule, teamFilters.seasons])
  const teamPokemonOptions = useMemo(() => championsPokemon.map(buildTeamPokemonOption), [])
  const teamMegaPokemonOptions = useMemo(() => championsPokemon.filter((pokemon) => pokemon.hasMega || isMegaPokemon(pokemon)).map(buildTeamPokemonOption), [])
  const teamPokemonSuggestions = useMemo(() => filterTeamPokemonOptions(teamPokemonOptions, teamFilters.pokemonQuery), [teamPokemonOptions, teamFilters.pokemonQuery])
  const teamMegaPokemonSuggestions = useMemo(() => filterTeamPokemonOptions(teamMegaPokemonOptions, teamFilters.megaPokemonQuery), [teamMegaPokemonOptions, teamFilters.megaPokemonQuery])
  const teamFilterBaseCount = teamShares.filter((team) => (teamFilters.seasons.length ? teamFilters.seasons : [currentRule]).includes(team.season)).length
  const teamFilterResultLabel = `${filteredTeamShares.length}/${teamFilterBaseCount} 队`
  const teamFilterButtonLabel = '筛选'
  const currentTeamSource = teamSourceLineSource(teamShareSources, currentRule)
  const showListColumn = (column: ListColumnKey) => filters.visibleColumns.includes(column)

  const searchSuggestions = useMemo(() => {
    const q = normalize(query)
    if (!q) return []
    return championsPokemon.filter((pokemon) => [pokemonSearchText(pokemon), pokemon.pinyin, pokemon.initials].some((value) => normalize(value).includes(q))).slice(0, 8)
  }, [query])

  const moveOptions = useMemo(() => {
    const map = new Map<string, { id: string; zh: string; en: string; pinyin: string }>()
    Object.values(championsDetails).forEach((detail) => {
      detail.moves.forEach((move) => {
        if (!map.has(move.id)) map.set(move.id, { id: move.id, zh: move.zh, en: move.en, pinyin: move.pinyin })
      })
    })
    return Array.from(map.values()).sort((a, b) => a.zh.localeCompare(b.zh, 'zh-Hans-CN'))
  }, [])

  const moveSuggestions1 = useMemo(() => {
    const q = normalize(filters.moveQuery)
    if (!q) return moveOptions
    return moveOptions
      .filter((move) => normalize(`${move.zh} ${move.en} ${move.id} ${move.pinyin}`).includes(q))
      .sort((a, b) => moveSearchRank(a, q) - moveSearchRank(b, q) || a.zh.localeCompare(b.zh, 'zh-Hans-CN'))
  }, [filters.moveQuery, moveOptions])

  const moveSuggestions2 = useMemo(() => {
    const q = normalize(filters.moveQuery2)
    if (!q) return moveOptions.filter((move) => move.id !== filters.selectedMoves[0])
    return moveOptions
      .filter((move) => move.id !== filters.selectedMoves[0] && normalize(`${move.zh} ${move.en} ${move.id} ${move.pinyin}`).includes(q))
      .sort((a, b) => moveSearchRank(a, q) - moveSearchRank(b, q) || a.zh.localeCompare(b.zh, 'zh-Hans-CN'))
  }, [filters.moveQuery2, filters.selectedMoves, moveOptions])

  const detailMode = !!currentPath && currentPath !== 'saved'
  const savedPageMode = currentPath === 'saved'
  const formFamilyOptions = useMemo(() => selectedPokemon ? championsPokemon.filter((entry) => entry.baseSpeciesId === selectedPokemon.baseSpeciesId) : [], [selectedPokemon])
  const damageTargetOptions = useMemo(() => championsPokemon, [])
  const effectiveDamageTargetId = damageTargetOptions.some((pokemon) => pokemon.id === damageTargetId) ? damageTargetId : (selectedPokemonId ?? damageTargetOptions[0]?.id ?? '')
  const selectedDraftKey = selectedPokemon ? normalize(selectedPokemon.baseSpeciesName) : ''
  const selectedDraftConfig = selectedDraftKey ? draftConfigs[selectedDraftKey] : undefined
  const handleDraftChange = useCallback((payload: DraftConfig) => {
    if (!selectedDraftKey) return
    setDraftConfigs((current) => (
      draftConfigEquals(current[selectedDraftKey], payload)
        ? current
        : { ...current, [selectedDraftKey]: payload }
    ))
  }, [selectedDraftKey])
  const savedGroupNames = useMemo(() => {
    const names = new Set<string>(savedGroups.map(cleanGroupName).filter(Boolean))
    savedPokemon.forEach((entry) => {
      ;(entry.groupNames || []).forEach((name) => {
        const cleaned = cleanGroupName(name)
        if (cleaned) names.add(cleaned)
      })
    })
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  }, [savedPokemon, savedGroups])

  const savedPokemonGroups = useMemo(() => {
    const grouped = new Map<string, SavedPokemonEntry[]>()
    savedGroupNames.forEach((name) => grouped.set(name, []))
    const ungrouped: SavedPokemonEntry[] = []
    savedPokemon.forEach((entry) => {
      const groups = (entry.groupNames || []).map(cleanGroupName).filter(Boolean)
      if (!groups.length) {
        ungrouped.push(entry)
        return
      }
      groups.forEach((name) => grouped.set(name, [...(grouped.get(name) || []), entry]))
    })
    const entries = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN'))
    if (ungrouped.length) entries.push(['未分组', ungrouped])
    return entries
  }, [savedPokemon, savedGroupNames])

  useEffect(() => {
    let active = true
    const targetId = effectiveDamageTargetId || (filtered.find((pokemon) => pokemon.id !== selectedPokemonId)?.id ?? selectedPokemonId)
    ;(async () => {
      const [selected, compare] = await Promise.all([
        selectedPokemonId ? loadPokemonDetail(selectedPokemonId) : Promise.resolve(null),
        targetId ? loadPokemonDetail(targetId) : Promise.resolve(null),
      ])
      if (!active) return
      setSelectedPokemon(selected)
      setCompareTarget(compare)
    })()
    return () => { active = false }
  }, [selectedPokemonId, filtered, effectiveDamageTargetId])

  useEffect(() => { saveFavoriteMoves(favoriteMoveIds) }, [favoriteMoveIds])
  useEffect(() => { saveSavedPokemon(savedPokemon) }, [savedPokemon])
  useEffect(() => { saveSavedGroups(savedGroupNames) }, [savedGroupNames])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-popover-root]')) {
        if (!target.closest('.list-filter-control')) {
          setFiltersOpen(false)
          setMovePickerOpen(null)
        }
        if (!target.closest('.team-title-filter-control')) {
          setTeamFiltersOpen(false)
          setTeamPokemonPickerOpen(null)
        }
        if (!target.closest('.search-box-wrap')) setSearchOpen(false)
        if (!target.closest('.saved-actions-inline')) setGroupPickerEntryId(null)
        if (!target.closest('.action-box [data-popover-root]')) setSavedOpen(false)
        return
      }
      setFiltersOpen(false)
      setMovePickerOpen(null)
      setTeamFiltersOpen(false)
      setTeamPokemonPickerOpen(null)
      setSavedOpen(false)
      setSearchOpen(false)
      setGroupPickerEntryId(null)
      window.dispatchEvent(new CustomEvent('pokemon-ui-close-popovers'))
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY
      if (currentY <= 24) {
        setTopbarVisible(true)
      } else {
        setTopbarVisible(false)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function handleUpdateSaved(id: string, payload: Omit<SavedPokemonEntry, 'id' | 'baseId' | 'label' | 'pokemonId'>) {
    setSavedPokemon((current) => current.map((entry) => entry.id === id ? { ...entry, ...payload } : entry))
  }

  function loadSavedEntry(entry: SavedPokemonEntry) {
    const target = championsPokemon.find((pokemon) => pokemon.id === entry.pokemonId)
    if (!target) return
    setDraftConfigs((current) => ({ ...current, [normalize(target.baseSpeciesName)]: savedEntryDraftConfig(entry) }))
    setDraftLoadVersion((value) => value + 1)
    setSelectedPokemon(championsDetails[target.id] ?? null)
    navigateToPokemon(target)
  }

  function openTeamMemberConfig(member: TeamShareMember, pokemon: PokemonRow) {
    const config = teamMemberDraftConfig(member, pokemon)
    setDraftConfigs((current) => ({ ...current, [normalize(pokemon.baseSpeciesName)]: config }))
    setDraftLoadVersion((value) => value + 1)
    setSelectedPokemon(championsDetails[pokemon.id] ?? null)
    navigateToPokemon(pokemon)
  }

  function renameSavedGroup(oldName: string, rawNextName: string) {
    const nextName = cleanGroupName(rawNextName)
    const fromName = cleanGroupName(oldName)
    if (!nextName || nextName === fromName) {
      setEditingGroupName(null)
      return
    }
    setSavedGroups((current) => Array.from(new Set(current.map((name) => cleanGroupName(name) === fromName ? nextName : name))))
    setSavedPokemon((current) => current.map((entry) => ({
      ...entry,
      groupNames: (entry.groupNames || []).map((name) => cleanGroupName(name) === fromName ? nextName : name),
    })))
    setCollapsedGroups((current) => {
      const next = { ...current, [nextName]: current[fromName] ?? false }
      delete next[fromName]
      return next
    })
    setEditingGroupName(null)
  }

  function addTeamToSavedGroup(team: TeamShare) {
    const groupName = uniqueSavedGroupName(teamSavedGroupBaseName(team), savedGroupNames)
    const entries = team.members
      .map((member, index) => savedEntryFromTeamMember(team, member, index, groupName))
      .filter((entry): entry is SavedPokemonEntry => Boolean(entry))
    if (!entries.length) return
    setSavedGroups((current) => current.includes(groupName) ? current : [...current, groupName])
    setSavedPokemon((current) => [...entries, ...current])
    setCollapsedGroups((current) => ({ ...current, [groupName]: false }))
    setAddedTeamGroups((current) => ({ ...current, [team.id]: groupName }))
    setTopbarVisible(true)
    setSavedOpen(true)
  }

  function navigateToPokemon(pokemon: PokemonRow) {
    setSelectedPokemonId(pokemon.id)
    const href = getPokemonHref(pokemon)
    window.history.pushState({}, '', href)
    setCurrentPath(getCurrentPath())
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  function navigateToHome() {
    setSelectedPokemonId(championsPokemon[0]?.id ?? null)
    window.history.pushState({}, '', withBasePath('/'))
    setCurrentPath('')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  function navigateToSaved() {
    window.history.pushState({}, '', withBasePath('/saved'))
    setCurrentPath('saved')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  useEffect(() => {
    const onPopState = () => {
      const nextPath = getCurrentPath()
      setCurrentPath(nextPath)
      const next = resolvePokemonFromPath(nextPath)
      setSelectedPokemonId(next?.id ?? championsPokemon[0]?.id ?? null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  return (
    <div className="app-shell">
      <header className={topbarVisible ? 'topbar sticky-topbar topbar-visible' : 'topbar sticky-topbar topbar-hidden'} onMouseLeave={() => { if (window.scrollY > 24) setTopbarVisible(false) }}>
        <div className="rule-box">
          <div className="rule-season-row">
            <div className="rule-season-item">
              <label>规则</label>
              <select value={currentRule} onChange={(e) => { setCurrentRule(e.target.value); setCurrentSeason(RULE_META[e.target.value]?.seasons[0]?.id ?? '1') }}>
                {Object.entries(RULE_META).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
              </select>
            </div>
            <div className="rule-season-item">
              <label>赛季</label>
              <select value={currentSeason} onChange={(e) => setCurrentSeason(e.target.value)}>
                {(RULE_META[currentRule]?.seasons ?? []).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="search-box search-box-wrap" data-popover-root>
          <label>搜索宝可梦</label>
          <input
            value={query}
            onFocus={() => { setSearchOpen(true); setQuery('') }}
            onBlur={() => setTimeout(() => setSearchOpen(false), 120)}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入中文、拼音或英文，比如 ka / kabishou / snorlax"
          />
          {searchOpen && searchSuggestions.length > 0 && (
            <div className="search-dropdown">
              {searchSuggestions.map((pokemon) => (
                <button key={pokemon.id} className="search-option topbar-search-option" onMouseDown={() => navigateToPokemon(pokemon)}>
                  <strong>{pokemonDisplayName(pokemon)}</strong>
                  <small>{pokemon.name}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="action-box">
          <div className="floating-control" data-popover-root>
            <button className="ghost-button" onClick={() => setSavedOpen((value) => !value)}>盒子</button>
            {savedOpen && (
              <div className="popover wide-popover">
                <div className="popover-note strong-note">盒子中共 {savedPokemon.length} 条</div>
                <button className="ghost-button" onClick={() => { navigateToSaved(); setSavedOpen(false) }}>查看全部盒子</button>
                {savedPokemon.length > 0 ? savedPokemon.slice(0, 3).map((entry) => (
                  <div key={entry.id} className="saved-pokemon-item">
                    <button className="favorite-list-item" onClick={() => {
                      const target = championsPokemon.find((pokemon) => pokemon.id === entry.pokemonId)
                      if (target) loadSavedEntry(entry)
                    }}>
                      <span>{entry.label}</span>
                      <strong>{entry.isMega ? 'Mega' : '普通'}</strong>
                    </button>
                    <button className="danger-text-button" onClick={() => setSavedPokemon((current) => current.filter((item) => item.id !== entry.id))}>取消</button>
                  </div>
                )) : <div className="popover-note">还没有保存任何宝可梦设定。</div>}
              </div>
            )}
          </div>
          <div className="theme-orb">
            <button className="icon-button theme-orb-button" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} title={theme === 'light' ? '切换到夜间' : '切换到日间'}>
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </div>
      </header>

      {!topbarVisible && <button type="button" className="topbar-reveal" onClick={() => setTopbarVisible(true)}>顶部栏</button>}

      {savedPageMode ? (
        <main className="content-card detail-page-layout">
          <section className="detail-card detail-page-full saved-page-card">
            <div className="detail-page-topline">
              <button className="ghost-button" onClick={navigateToHome}>← 返回列表</button>
            </div>
            <div className="detail-title-row">
              <div className="detail-title-main">
                <h1>盒子</h1>
              </div>
              <p>这里是你保存过的全部宝可梦配置。</p>
            </div>
            <div className="saved-group-toolbar">
              <input className="saved-inline-input" value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="创建新分组" />
              <button className="ghost-button" onClick={() => {
                const next = cleanGroupName(newGroupName)
                if (!next) return
                setSavedGroups((current) => current.includes(next) ? current : [...current, next])
                setCollapsedGroups((current) => ({ ...current, [next]: false }))
                setNewGroupName('')
              }}>创建分组</button>
            </div>
            <div className="saved-groups">
              {savedPokemonGroups.map(([groupName, entries]) => (
                <section key={groupName} className="saved-group-card">
                  <div className="saved-group-header">
                    <div className="saved-group-title-block">
                      <div className="saved-group-name-row">
                        {editingGroupName === groupName ? (
                          <input
                            autoFocus
                            className="saved-inline-input saved-group-name-input"
                            value={editingGroupValue}
                            onChange={(event) => setEditingGroupValue(event.target.value)}
                            onBlur={() => renameSavedGroup(groupName, editingGroupValue)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') renameSavedGroup(groupName, editingGroupValue)
                              if (event.key === 'Escape') setEditingGroupName(null)
                            }}
                          />
                        ) : (
                          <h2>{groupName}</h2>
                        )}
                        {groupName !== '未分组' && editingGroupName !== groupName && (
                          <button type="button" className="saved-edit-button saved-group-edit-button" onClick={() => { setEditingGroupName(groupName); setEditingGroupValue(groupName) }} title="改名">✐</button>
                        )}
                      </div>
                      <p>{entries.length} 只宝可梦</p>
                    </div>
                    <div className="saved-group-actions">
                      <button className="ghost-button" onClick={() => setCollapsedGroups((current) => ({ ...current, [groupName]: !current[groupName] }))}>{collapsedGroups[groupName] ? '展开' : '折叠'}</button>
                      {groupName !== '未分组' && <button className="danger-text-button" onClick={() => {
                        setSavedPokemon((current) => current.map((item) => ({ ...item, groupNames: (item.groupNames || []).filter((name) => cleanGroupName(name) !== groupName) })))
                        setSavedGroups((current) => current.filter((name) => cleanGroupName(name) !== groupName))
                      }}>删除分组</button>}
                    </div>
                  </div>
                  {!collapsedGroups[groupName] && <div className="saved-roster-list">
                    {entries.map((entry) => {
                      const pokemon = championsPokemon.find((item) => item.id === entry.pokemonId)
                      const detail = championsDetails[entry.pokemonId]
                      const natureLabel = teamFieldLabel(teamNatureLabel(entry.nature), '性格未保存')
                      const itemLabel = teamFieldLabel(appItemLabel(entry.item), '道具未保存')
                      const abilityLabel = teamFieldLabel(savedAbilityDisplayLabel(entry, pokemon), '特性未保存')
                      const spSummary = Object.entries(entry.sps).filter(([, value]) => value > 0).map(([key, value]) => `${SP_LABELS[key] ?? key.toUpperCase()} ${value}`).join(' / ') || '努力值未保存'
                      const moveSummary = (entry.blueFavorites || []).map((moveId) => detail?.moves.find((move) => move.id === moveId)?.zh || moveId).filter(Boolean).join(' / ') || '技能未保存'
                      return (
                        <article className="saved-roster-item" key={`${groupName}-${entry.id}`}>
                          <div className="saved-table-name">
                            <div className="saved-name-row">
                              {editingSavedNameId === entry.id ? (
                                <input
                                  autoFocus
                                  className="saved-inline-input saved-name-input"
                                  value={entry.customName ?? entry.label}
                                  onChange={(event) => setSavedPokemon((current) => current.map((item) => item.id === entry.id ? { ...item, customName: event.target.value } : item))}
                                  onBlur={() => setEditingSavedNameId(null)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === 'Escape') setEditingSavedNameId(null)
                                  }}
                                />
                              ) : (
                                <a className="link-button" href={pokemon ? getPokemonHref(pokemon) : '#'} onClick={(event) => { event.preventDefault(); loadSavedEntry(entry) }}>{entry.customName || entry.label}</a>
                              )}
                              {editingSavedNameId !== entry.id && <button type="button" className="saved-edit-button" onClick={() => setEditingSavedNameId(entry.id)} title="改名">✐</button>}
                            </div>
                          </div>
                          <span className="saved-roster-field">{natureLabel}</span>
                          <span className="saved-roster-field">{itemLabel}</span>
                          <span className="saved-roster-field">{abilityLabel}</span>
                          <span className="saved-roster-field saved-roster-spread">{spSummary}</span>
                          <span className="saved-roster-field saved-roster-moves">{moveSummary}</span>
                          <div className="saved-actions-inline" data-popover-root>
                            <button className="ghost-button saved-group-trigger" type="button" onClick={() => setGroupPickerEntryId((current) => current === entry.id ? null : entry.id)}>分组</button>
                            <button className="danger-text-button" onClick={() => setSavedPokemon((current) => current.filter((item) => item.id !== entry.id))}>取消</button>
                            {groupPickerEntryId === entry.id && <div className="saved-group-picker search-dropdown compact-dropdown">
                              {savedGroupNames.map((name) => {
                                const active = (entry.groupNames || []).includes(name)
                                return <button key={`${entry.id}-${name}`} type="button" className={active ? 'item-option-row active-option' : 'item-option-row'} onMouseDown={() => setSavedPokemon((current) => current.map((item) => item.id !== entry.id ? item : { ...item, groupNames: active ? (item.groupNames || []).filter((group) => group !== name) : [...(item.groupNames || []), name] }))}><span>{name}</span><small>{active ? '已加入' : '加入'}</small></button>
                              })}
                            </div>}
                          </div>
                        </article>
                      )
                    })}
                  </div>}
                </section>
              ))}
            </div>
          </section>
        </main>
      ) : !detailMode ? (
        <main className="content-card main-layout">
          <div className="section-title">
            <div className="home-title-block">
              <div className="home-title-line">
                <h1>Pokemon Champions 中文数据站</h1>
                <div className="home-title-nav">
                  <button type="button" className={homeTab === 'trainers' ? 'title-nav-button active' : 'title-nav-button'} onClick={() => setHomeTab('trainers')}>玩家排名{trainerRankingUnupdated ? '（未更新）' : ''}</button>
                  <button type="button" className={homeTab === 'teams' ? 'title-nav-button active' : 'title-nav-button'} onClick={() => setHomeTab('teams')}>队伍分享</button>
                </div>
              </div>
            </div>
            {homeTab === 'list' && (
              <div className="floating-control list-filter-control" data-popover-root>
                <button className="ghost-button" onClick={() => setFiltersOpen((value) => !value)}>筛选</button>
                {filtersOpen && (
                  <div className="popover filter-list-popover filter-grid">
                    <div className="popover-field">
                      <span className="collapsible-filter-label">
                        <span>属性</span>
                        <button type="button" className={`mini-toggle-btn borderless-toggle${listTypesOpen ? ' open' : ''}`} onClick={() => setListTypesOpen((value) => !value)} aria-label={listTypesOpen ? '收起属性筛选' : '展开属性筛选'} />
                      </span>
                      {listTypesOpen && <div className="filter-chip-group">{FILTER_TYPE_OPTIONS.map((type) => <button key={type} type="button" className={`${filters.types.includes(type) ? 'filter-chip active' : 'filter-chip'} type-filter-chip ${typeColorClass(typeKeyFromLabel(type))}`} onClick={() => setFilters((current) => ({ ...current, types: current.types.includes(type) ? current.types.filter((item) => item !== type) : [...current.types, type] }))}>{type}</button>)}</div>}
                    </div>
                    <div className="popover-field"><span>形态</span><div className="filter-chip-group"><button type="button" className={filters.forms.includes('normal') ? 'filter-chip active' : 'filter-chip'} onClick={() => setFilters((current) => ({ ...current, forms: current.forms.includes('normal') ? current.forms.filter((item) => item !== 'normal') : [...current.forms, 'normal'] }))}>普通形态</button><button type="button" className={filters.forms.includes('mega') ? 'filter-chip active' : 'filter-chip'} onClick={() => setFilters((current) => ({ ...current, forms: current.forms.includes('mega') ? current.forms.filter((item) => item !== 'mega') : [...current.forms, 'mega'] }))}>Mega形态</button></div></div>
                    <div className="popover-field">
                      <span className="collapsible-filter-label">
                        <span>显示项目</span>
                        <button type="button" className={`mini-toggle-btn borderless-toggle${listColumnsOpen ? ' open' : ''}`} onClick={() => setListColumnsOpen((value) => !value)} aria-label={listColumnsOpen ? '收起显示项目' : '展开显示项目'} />
                      </span>
                      {listColumnsOpen && <div className="filter-chip-group">
                        {LIST_COLUMN_OPTIONS.map((column) => (
                          <button
                            key={column}
                            type="button"
                            className={filters.visibleColumns.includes(column) ? 'filter-chip active' : 'filter-chip'}
                            onClick={() => setFilters((current) => {
                              const visibleColumns = toggleFilterValue(current.visibleColumns, column)
                              return { ...current, visibleColumns: visibleColumns.length ? visibleColumns as ListColumnKey[] : current.visibleColumns }
                            })}
                          >
                            {LIST_COLUMN_LABELS[column]}
                          </button>
                        ))}
                      </div>}
                    </div>
                    <div className="filter-move-pair">
                      <div className="filter-move-item" data-popover-root><span>技能 1</span><div className="filter-input-wrap"><input value={movePickerOpen === 'move1' ? filters.moveQuery : (moveOptions.find((m) => m.id === filters.selectedMoves[0])?.zh ?? '')} onFocus={() => { setMovePickerOpen('move1'); setFilters((c) => ({ ...c, moveQuery: '' })) }} onBlur={() => setTimeout(() => setMovePickerOpen((current) => current === 'move1' ? null : current), 120)} onChange={(event) => setFilters((current) => ({ ...current, moveQuery: event.target.value }))} placeholder="输入中/英/拼音" />{movePickerOpen === 'move1' && <div className="search-dropdown compact-dropdown filter-suggestion-dropdown">{moveSuggestions1.map((move) => <button key={move.id} className="item-option-row" type="button" onMouseDown={() => { setFilters((current) => ({ ...current, moveQuery: '', selectedMoves: [move.id, current.selectedMoves[1] || ''].filter(Boolean) })); setMovePickerOpen(null) }}><span>{move.zh}</span><small>{move.en}</small></button>)}</div>}</div></div>
                      <div className="filter-move-item" data-popover-root><span>技能 2</span><div className="filter-input-wrap"><input value={movePickerOpen === 'move2' ? filters.moveQuery2 : (moveOptions.find((m) => m.id === filters.selectedMoves[1])?.zh ?? '')} onFocus={() => { setMovePickerOpen('move2'); setFilters((c) => ({ ...c, moveQuery2: '' })) }} onBlur={() => setTimeout(() => setMovePickerOpen((current) => current === 'move2' ? null : current), 120)} onChange={(event) => setFilters((current) => ({ ...current, moveQuery2: event.target.value }))} placeholder="可选" />{movePickerOpen === 'move2' && <div className="search-dropdown compact-dropdown filter-suggestion-dropdown">{moveSuggestions2.map((move) => <button key={move.id} className="item-option-row" type="button" onMouseDown={() => { setFilters((current) => ({ ...current, moveQuery2: '', selectedMoves: [current.selectedMoves[0] || '', move.id].filter(Boolean) })); setMovePickerOpen(null) }}><span>{move.zh}</span><small>{move.en}</small></button>)}</div>}</div></div>
                    </div>
                    {(() => {
                      const bMin = Number(filters.bstMin) || 0; const bMax = Number(filters.bstMax) || 720
                      const bMinZ = bMin >= bMax - 15 ? 3 : 1; const bMaxZ = bMin >= bMax - 15 ? 1 : 3
                      return (
                        <div className="inline-range-row">
                          <span className="inline-range-label">限制总种族</span>
                          <span className="range-display">{bMin}–{bMax}</span>
                          <div className="dual-range-wrap inline-dual-range">
                            <input type="range" className="range-min" style={{zIndex: bMinZ}} min={0} max={720} value={bMin} onChange={(e) => setFilters((c) => ({ ...c, bstMin: e.target.value === '0' ? '' : e.target.value }))} />
                            <input type="range" className="range-max" style={{zIndex: bMaxZ}} min={0} max={720} value={bMax} onChange={(e) => setFilters((c) => ({ ...c, bstMax: e.target.value === '720' ? '' : e.target.value }))} />
                          </div>
                        </div>
                      )
                    })()}
                    {(() => {
                      const sMin = Number(filters.statMin) || 0; const sMax = Number(filters.statMax) || 255
                      const sMinZ = sMin >= sMax - 10 ? 3 : 1; const sMaxZ = sMin >= sMax - 10 ? 1 : 3
                      return (
                        <div className="inline-range-row">
                          <span className="inline-range-label">限制<select className="narrow-stat-select" value={filters.statKey} onChange={(event) => setFilters((current) => ({ ...current, statKey: event.target.value as FilterState['statKey'] }))}><option value="hp">HP</option><option value="atk">攻击</option><option value="def">防御</option><option value="spa">特攻</option><option value="spd">特防</option><option value="spe">速度</option></select></span>
                          <span className="range-display">{sMin}–{sMax}</span>
                          <div className="dual-range-wrap inline-dual-range">
                            <input type="range" className="range-min" style={{zIndex: sMinZ}} min={0} max={255} value={sMin} onChange={(e) => setFilters((c) => ({ ...c, statMin: e.target.value === '0' ? '' : e.target.value }))} />
                            <input type="range" className="range-max" style={{zIndex: sMaxZ}} min={0} max={255} value={sMax} onChange={(e) => setFilters((c) => ({ ...c, statMax: e.target.value === '255' ? '' : e.target.value }))} />
                          </div>
                        </div>
                      )
                    })()}
                    <button onClick={() => { setFilters(DEFAULT_FILTERS); setMovePickerOpen(null); setFiltersOpen(false) }}>清空筛选</button>
                  </div>
                )}
              </div>
            )}
            {homeTab === 'teams' && (
              <div className="floating-control list-filter-control team-title-filter-control" data-popover-root>
                <button className="ghost-button" onClick={() => setTeamFiltersOpen((value) => !value)}>{teamFilterButtonLabel}</button>
                {teamFiltersOpen && (
                  <div className="popover filter-list-popover filter-grid team-filter-popover">
                    <div className="popover-note strong-note">当前显示 {teamFilterResultLabel}</div>
                    <label className="popover-field team-filter-wide-field">
                      <span>{'\u961f\u4f0d\u68c0\u7d22'}</span>
                      <input
                        value={teamFilters.teamQuery}
                        onChange={(event) => setTeamFilters((current) => ({ ...current, teamQuery: event.target.value }))}
                        placeholder={'\u961f\u4f0d ID\u3001\u6301\u6709\u8005\u3001\u4f5c\u8005\u3001\u8d5b\u4e8b\u3001\u5b9d\u53ef\u68a6\u3001\u9053\u5177\u6216\u62db\u5f0f'}
                      />
                    </label>
                    {teamSeasonOptions.length > 1 && (
                      <div className="popover-field">
                        <span>{'\u89c4\u5219'}</span>
                        <div className="filter-chip-group">
                          {teamSeasonOptions.map((season) => (
                            <button
                              key={season}
                              type="button"
                              className={(teamFilters.seasons.length ? teamFilters.seasons.includes(season) : season === currentRule) ? 'filter-chip active' : 'filter-chip'}
                              onClick={() => setTeamFilters((current) => {
                                const base = current.seasons.length ? current.seasons : [currentRule]
                                const next = toggleFilterValue(base, season)
                                return { ...current, seasons: next.length ? next : [season] }
                              })}
                            >
                              {season}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {teamEventNameOptions.length > 0 && (
                      <div className="popover-field">
                        <span className="collapsible-filter-label">
                          <span>赛事</span>
                          <button
                            type="button"
                            className={`mini-toggle-btn borderless-toggle${teamEventsOpen ? ' open' : ''}`}
                            onClick={() => setTeamEventsOpen((value) => !value)}
                            aria-label={teamEventsOpen ? '收起赛事' : '展开赛事'}
                          />
                        </span>
                        {teamEventsOpen && <div className="filter-chip-group team-event-chip-group">
                          {teamEventNameOptions.map((eventName) => {
                            const active = teamFilters.eventNames.length === 0 || teamFilters.eventNames.includes(eventName)
                            return (
                              <button
                                key={eventName}
                                type="button"
                                className={active ? 'filter-chip active' : 'filter-chip'}
                                onClick={() => setTeamFilters((current) => {
                                  const base = current.eventNames.length ? current.eventNames : teamEventNameOptions
                                  const next = toggleFilterValue(base, eventName)
                                  return { ...current, eventNames: next.length === teamEventNameOptions.length ? [] : next }
                                })}
                              >
                                {eventName}
                              </button>
                            )
                          })}
                        </div>}
                      </div>
                    )}
                    <label className="popover-field team-filter-wide-field">
                      <span>名次</span>
                      <input
                        type="number"
                        min={1}
                        value={teamFilters.placementMax}
                        onChange={(event) => setTeamFilters((current) => ({ ...current, placementMax: event.target.value }))}
                        placeholder="前多少名"
                      />
                    </label>
                    <div className="team-filter-date-grid">
                      <label className="popover-field">
                        <span>开始日期</span>
                        <input type="text" inputMode="numeric" value={teamFilters.dateFrom} onChange={(event) => setTeamFilters((current) => ({ ...current, dateFrom: event.target.value }))} placeholder="2026-06-20" />
                      </label>
                      <label className="popover-field">
                        <span>结束日期</span>
                        <input type="text" inputMode="numeric" value={teamFilters.dateTo} onChange={(event) => setTeamFilters((current) => ({ ...current, dateTo: event.target.value }))} placeholder="2026-06-25" />
                      </label>
                    </div>
                    <label className="team-filter-check">
                      <input
                        type="checkbox"
                        checked={teamFilters.fullSpreadOnly}
                        onChange={(event) => setTeamFilters((current) => ({ ...current, fullSpreadOnly: event.target.checked }))}
                      />
                      <span>{'\u53ea\u770b\u5b8c\u6574\u52aa\u529b\u503c'}</span>
                    </label>
                    <label className="team-filter-check">
                      <input
                        type="checkbox"
                        checked={teamFilters.rankedOnly}
                        onChange={(event) => setTeamFilters((current) => ({ ...current, rankedOnly: event.target.checked }))}
                      />
                      <span>{'\u53ea\u770b\u6709\u540d\u6b21'}</span>
                    </label>
                    <div className="filter-move-pair team-filter-pokemon-pair">
                      <div className="filter-move-item" data-popover-root>
                        <span>包含宝可梦</span>
                        <div className="filter-input-wrap team-filter-picker">
                          <input
                            value={teamFilters.pokemonQuery}
                            onFocus={() => setTeamPokemonPickerOpen('pokemon')}
                            onBlur={() => setTimeout(() => setTeamPokemonPickerOpen((current) => current === 'pokemon' ? null : current), 120)}
                            onChange={(event) => {
                              setTeamPokemonPickerOpen('pokemon')
                              setTeamFilters((current) => ({ ...current, pokemonQuery: event.target.value }))
                            }}
                            placeholder="输入名称或拼音"
                          />
                          {teamPokemonPickerOpen === 'pokemon' && (
                            <div className="search-dropdown compact-dropdown filter-suggestion-dropdown team-filter-suggestion-dropdown">
                              {teamPokemonSuggestions.map((option) => (
                                <button
                                  key={option.id}
                                  className="item-option-row"
                                  type="button"
                                  onMouseDown={() => {
                                    setTeamFilters((current) => ({ ...current, pokemonQuery: option.label }))
                                    setTeamPokemonPickerOpen(null)
                                  }}
                                >
                                  <span>{option.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="filter-move-item" data-popover-root>
                        <span>包含 Mega 宝可梦</span>
                        <div className="filter-input-wrap team-filter-picker">
                          <input
                            value={teamFilters.megaPokemonQuery}
                            onFocus={() => setTeamPokemonPickerOpen('mega')}
                            onBlur={() => setTimeout(() => setTeamPokemonPickerOpen((current) => current === 'mega' ? null : current), 120)}
                            onChange={(event) => {
                              setTeamPokemonPickerOpen('mega')
                              setTeamFilters((current) => ({ ...current, megaPokemonQuery: event.target.value }))
                            }}
                            placeholder="输入名称或拼音"
                          />
                          {teamPokemonPickerOpen === 'mega' && (
                            <div className="search-dropdown compact-dropdown filter-suggestion-dropdown team-filter-suggestion-dropdown">
                              {teamMegaPokemonSuggestions.map((option) => (
                                <button
                                  key={option.id}
                                  className="item-option-row"
                                  type="button"
                                  onMouseDown={() => {
                                    setTeamFilters((current) => ({ ...current, megaPokemonQuery: option.label }))
                                    setTeamPokemonPickerOpen(null)
                                  }}
                                >
                                  <span>{option.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="team-filter-actions">
                      <button type="button" className="ghost-button" onClick={() => { setTeamFilters(DEFAULT_TEAM_FILTERS); setTeamPokemonPickerOpen(null); setTeamFiltersOpen(false) }}>清空</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="home-tabs">
            <button type="button" className={homeTab === 'list' ? 'home-tab active' : 'home-tab'} onClick={() => setHomeTab('list')}>宝可梦列表</button>
            <button type="button" className={homeTab === 'damage' ? 'home-tab active' : 'home-tab'} onClick={() => setHomeTab('damage')}>伤害计算器</button>
          </div>

          {homeTab === 'list' && (
            <div className="table-wrapper responsive-table-card pokemon-list-table-wrapper">
              <table className="pokemon-list-table">
                <thead>
                  <tr>
                    {showListColumn('usage') && <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'usageRank') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('usageRank'); setSortDirection('asc') } }}>使用率{sortIndicator(sortKey, 'usageRank', sortDirection)}</button></th>}
                    {showListColumn('sprite') && <th className="pokemon-sprite-head" aria-label="图像"></th>}
                    {showListColumn('zh') && <th className="pokemon-name-column"><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'zh') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('zh'); setSortDirection('asc') } }}>名称{sortIndicator(sortKey, 'zh', sortDirection)}</button></th>}
                    {showListColumn('name') && <th className={showListColumn('zh') ? undefined : 'pokemon-name-column'}><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'name') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('name'); setSortDirection('asc') } }}>英文名称{sortIndicator(sortKey, 'name', sortDirection)}</button></th>}
                    {showListColumn('types') && <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'types') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('types'); setSortDirection('asc') } }}>属性{sortIndicator(sortKey, 'types', sortDirection)}</button></th>}
                    {showListColumn('hp') && <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'hp') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('hp'); setSortDirection('asc') } }}>HP{sortIndicator(sortKey, 'hp', sortDirection)}</button></th>}
                    {showListColumn('atk') && <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'atk') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('atk'); setSortDirection('asc') } }}>攻击{sortIndicator(sortKey, 'atk', sortDirection)}</button></th>}
                    {showListColumn('def') && <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'def') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('def'); setSortDirection('asc') } }}>防御{sortIndicator(sortKey, 'def', sortDirection)}</button></th>}
                    {showListColumn('spa') && <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'spa') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('spa'); setSortDirection('asc') } }}>特攻{sortIndicator(sortKey, 'spa', sortDirection)}</button></th>}
                    {showListColumn('spd') && <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'spd') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('spd'); setSortDirection('asc') } }}>特防{sortIndicator(sortKey, 'spd', sortDirection)}</button></th>}
                    {showListColumn('spe') && <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'spe') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('spe'); setSortDirection('asc') } }}>速度{sortIndicator(sortKey, 'spe', sortDirection)}</button></th>}
                    {showListColumn('bst') && <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'bst') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('bst'); setSortDirection('asc') } }}>总种族值{sortIndicator(sortKey, 'bst', sortDirection)}</button></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pokemon) => {
                    const usage = getPokemonUsageFromDataset(selectedUsageDataset, pokemon.name, pokemon.baseSpeciesName, pokemon.id, pokemon.baseSpeciesId)
                    return (
                    <tr key={pokemon.id}>
                      {showListColumn('usage') && <td>{usage ? <span className="usage-list-cell">#{usage.rank}</span> : '—'}</td>}
                      {showListColumn('sprite') && <td className="pokemon-sprite-cell"><img src={pokemonSpriteUrl(pokemon)} data-fallback-src={pokemonSpriteFallbackUrl(pokemon)} alt="" loading="lazy" onError={(event) => {
                        const image = event.currentTarget
                        const fallbackSrc = image.dataset.fallbackSrc
                        if (fallbackSrc && image.src !== fallbackSrc) {
                          image.dataset.fallbackSrc = ''
                          image.src = fallbackSrc
                          return
                        }
                        image.style.visibility = 'hidden'
                      }} /></td>}
                      {showListColumn('zh') && <td className="pokemon-name-column"><a className="link-button" href={getPokemonHref(pokemon)} onClick={(event) => { event.preventDefault(); navigateToPokemon(pokemon) }}>{pokemonDisplayName(pokemon)}</a></td>}
                      {showListColumn('name') && <td className={showListColumn('zh') ? undefined : 'pokemon-name-column'}><a className="link-button muted-link" href={getPokemonHref(pokemon)} onClick={(event) => { event.preventDefault(); navigateToPokemon(pokemon) }}>{pokemon.name}</a></td>}
                      {showListColumn('types') && <td><div className="type-list">{pokemon.types.map((type) => <span className={typeBadgeClass(type)} key={type}>{typeLabel(type)}</span>)}</div></td>}
                      {showListColumn('hp') && <td>{pokemon.baseStats.hp}</td>}
                      {showListColumn('atk') && <td>{pokemon.baseStats.atk}</td>}
                      {showListColumn('def') && <td>{pokemon.baseStats.def}</td>}
                      {showListColumn('spa') && <td>{pokemon.baseStats.spa}</td>}
                      {showListColumn('spd') && <td>{pokemon.baseStats.spd}</td>}
                      {showListColumn('spe') && <td>{pokemon.baseStats.spe}</td>}
                      {showListColumn('bst') && <td>{pokemon.bst}</td>}
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {homeTab === 'trainers' && (
            <section className="trainer-rankings-section">
              {trainerRankingDataset && (
                <>
                  <div className="data-source-line">
                    <a href={trainerSourceUrl(trainerRankingDataset)} target="_blank" rel="noopener noreferrer">{trainerRankingSourceLabel(trainerRankingDataset)}</a> · {formatLocalDateTime(trainerRankingDataset.trainerRankingsUpdatedAt || trainerRankingDataset.updatedAt, trainerRankingDataset.date)}
                  </div>
                  {trainerRankingUnupdated && <div className="data-fallback-note">玩家排名未更新，显示最近一次成功同步的数据。</div>}
                </>
              )}
              {!trainerRankingDataset ? (
                <div className="empty-detail trainer-empty-state">
                  <h2>暂无可展示的玩家排名</h2>
                  <p>还没有成功从 champs.pokedb.tokyo 同步过玩家排名数据。</p>
                </div>
              ) : (
                <div className="trainer-rankings-wrap table-wrapper responsive-table-card">
                  <table className="trainer-rankings-table">
                    <thead>
                      <tr>
                        <th>排名</th>
                        <th>名字</th>
                        <th>分数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trainerRankingDataset.trainerRankings.map((trainer, index) => {
                        return (
                          <tr key={`${trainer.rank}-${trainer.name}-${index}`}>
                            <td className="rank-cell">#{trainer.rank}</td>
                            <td>{trainer.name}</td>
                            <td className="rating-cell">{trainer.rating !== null ? trainer.rating.toFixed(3) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {homeTab === 'teams' && (
            <section className="team-share-section">
              <div className="data-source-line team-source-line">
                {currentTeamSource
                  ? <><a href={currentTeamSource.homeUrl || currentTeamSource.url} target="_blank" rel="noopener noreferrer">{currentTeamSource.name}</a> · {formatDatasetDate(currentTeamSource.updatedAt)} 更新 · {formatDatasetDate(teamSharesUpdatedAt)} 同步</>
                  : <>VGCPastes Repository · {formatDatasetDate(teamSharesUpdatedAt)} 同步</>}
              </div>
              <div className="team-share-list">
                {filteredTeamShares.length === 0 && (
                  <div className="empty-detail team-empty-state">
                    <h2>没有符合筛选的队伍</h2>
                    <p>放宽宝可梦或完整配置条件后再查看。</p>
                  </div>
                )}
                {filteredTeamShares.map((team) => {
                  const showTeamSpread = team.members.some((member) => Boolean(member.spread && member.spread !== '-'))
                  const tags = teamTagItems(team)
                  return (
                  <article className="team-share-card" key={team.id}>
                    <div className="team-card-head">
                      <div>
                        <h3>{team.title}</h3>
                        <p>{team.summary}</p>
                      </div>
                      <span>{team.season}</span>
                    </div>
                    {tags.length > 0 && <div className="team-tag-row">
                      {tags.map((tag) => <span key={`${team.id}-${tag.label}`} className={tag.tone === 'mega' ? 'team-tag-mega' : ''}>{tag.label}</span>)}
                    </div>}
                    <div className="team-roster-list">
                      {team.members.map((member, index) => {
                        const pokemon = championsPokemon.find((entry) => entry.id === member.pokemonId)
                        const natureLabel = teamFieldLabel(teamNatureLabel(member.nature), '性格未公开')
                        const itemLabel = teamFieldLabel(appItemLabel(member.item), '道具未公开')
                        const visibleAbilityLabel = teamFieldLabel(teamAbilityLabel(member, pokemon), '特性未公开')
                        const spreadLabel = teamSpreadLabel(member.spread, '努力值未公开')
                        return (
                          <a
                            key={`${team.id}-${member.pokemonId}-${index}`}
                            className={showTeamSpread ? 'team-roster-item' : 'team-roster-item no-spread'}
                            href={pokemon ? getPokemonHref(pokemon) : '#'}
                            onClick={(event) => { event.preventDefault(); if (pokemon) openTeamMemberConfig(member, pokemon) }}
                          >
                            <span className="team-slot-number">{index + 1}</span>
                            <span className="team-member-main">
                              <span className="team-member-name">{pokemon ? pokemonDisplayName(pokemon) : member.pokemonName}</span>
                              <small>{natureLabel}</small>
                            </span>
                            <span className="team-member-item">{itemLabel}</span>
                            <span className="team-member-ability">{visibleAbilityLabel}</span>
                            {showTeamSpread && <span className="team-member-spread">{spreadLabel}</span>}
                            <span className="team-member-moves">{member.moves.length > 0 ? member.moves.join(' / ') : '招式未公开'}</span>
                          </a>
                        )
                      })}
                    </div>
                    <div className="team-card-foot">
                      <button type="button" className="ghost-button team-save-button" onClick={() => addTeamToSavedGroup(team)}>
                        {addedTeamGroups[team.id] ? '已加入盒子' : '加入盒子'}
                      </button>
                      <a href={team.sourceUrl} target="_blank" rel="noopener noreferrer">玩家来源</a>
                      <a href={team.platformUrl} target="_blank" rel="noopener noreferrer">队伍详情</a>
                    </div>
                  </article>
                  )
                })}
              </div>
            </section>
          )}

          {homeTab === 'damage' && selectedPokemon && (
            <PokemonDetailPanel
              standaloneCalc
              pokemon={selectedPokemon}
              compareTarget={compareTarget}
              formOptions={formFamilyOptions}
              damageTargetOptions={damageTargetOptions}
              selectedCompareId={effectiveDamageTargetId}
              onChangeCompareId={setDamageTargetId}
              favoriteMoveIds={favoriteMoveIds}
              onToggleFavoriteMove={(moveId) => setFavoriteMoveIds((current) => current.includes(moveId) ? current.filter((id) => id !== moveId) : [...current, moveId])}
              onBack={() => setHomeTab('list')}
              onNavigateToPokemon={navigateToPokemon}
              draftConfig={selectedDraftConfig}
              draftConfigVersion={draftLoadVersion}
              onDraftChange={handleDraftChange}
              savedPokemon={savedPokemon}
              onAfterSave={() => { setTopbarVisible(true); setSavedOpen(true) }}
              onUpdateSaved={handleUpdateSaved}
              usageDataset={selectedUsageDataset}
              onSaveCurrent={(payload) => {
                setDraftConfigs((current) => ({ ...current, [normalize(selectedPokemon.baseSpeciesName)]: { nature: payload.nature, abilityId: payload.abilityId, item: payload.item, sps: payload.sps, boosts: payload.boosts, blueFavoriteMoveIds: payload.blueFavorites || [] } }))
                setSavedPokemon((current) => [{ ...payload, id: `${Date.now()}-${Math.random()}`, baseId: normalize(selectedPokemon.baseSpeciesName), label: buildSavedLabel(selectedPokemon.zh, normalize(selectedPokemon.baseSpeciesName), current), pokemonId: selectedPokemon.id }, ...current])
              }}
            />
          )}
          {homeTab === 'damage' && !selectedPokemon && (
            <div className="empty-detail" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>加载中...</div>
          )}
        </main>
      ) : (
        <main className="content-card detail-page-layout">
          <PokemonDetailPanel
            pokemon={selectedPokemon}
            compareTarget={compareTarget}
            formOptions={formFamilyOptions}
            damageTargetOptions={damageTargetOptions}
            selectedCompareId={effectiveDamageTargetId}
            onChangeCompareId={setDamageTargetId}
            favoriteMoveIds={favoriteMoveIds}
            onToggleFavoriteMove={(moveId) => setFavoriteMoveIds((current) => current.includes(moveId) ? current.filter((id) => id !== moveId) : [...current, moveId])}
            onBack={navigateToHome}
            onNavigateToPokemon={(pokemon) => { navigateToPokemon(pokemon) }}
            draftConfig={selectedDraftConfig}
            draftConfigVersion={draftLoadVersion}
            onDraftChange={handleDraftChange}
            savedPokemon={savedPokemon}
            onAfterSave={() => { setTopbarVisible(true); setSavedOpen(true) }}
            onUpdateSaved={handleUpdateSaved}
            usageDataset={selectedUsageDataset}
            onSaveCurrent={(payload) => {
              if (!selectedPokemon) return
              setDraftConfigs((current) => ({ ...current, [normalize(selectedPokemon.baseSpeciesName)]: { nature: payload.nature, abilityId: payload.abilityId, item: payload.item, sps: payload.sps, boosts: payload.boosts, blueFavoriteMoveIds: payload.blueFavorites || [] } }))
              setSavedPokemon((current) => [{ ...payload, id: `${Date.now()}-${Math.random()}`, baseId: normalize(selectedPokemon.baseSpeciesName), label: buildSavedLabel(selectedPokemon.zh, normalize(selectedPokemon.baseSpeciesName), current), pokemonId: selectedPokemon.id }, ...current])
            }}
          />
        </main>
      )}
    </div>
  )
}

export default App
