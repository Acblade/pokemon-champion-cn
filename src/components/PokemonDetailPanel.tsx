import { useEffect, useMemo, useRef, useState } from 'react'
import { championsDetails, type PokemonDetail, type PokemonMove } from '../data/championsDetails'
import type { PokemonRow } from '../data/champions'
import { calculateChampionsDamage, type StatusMode } from '../lib/championsCalc'
import type { SavedPokemonEntry } from '../lib/savedPokemon'
import { ruleItems } from '../data/items'
import { getPokemonUsage, usageDataset, type UsageItem, type UsageSpread, type UsageTeammate } from '../data/usageStats'
import { pokemonDisplayName, pokemonSearchText } from '../lib/pokemonDisplay'

type DraftConfig = {
  nature: string
  abilityId: string
  item: string
  sps: Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>
  boosts: Record<'atk' | 'def' | 'spa' | 'spd' | 'spe', number>
}

const SP_LABELS: Record<string, string> = { hp: 'HP', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度' }

type Props = {
  pokemon: PokemonDetail | null
  compareTarget: PokemonDetail | null
  formOptions: PokemonRow[]
  damageTargetOptions: PokemonRow[]
  selectedCompareId: string
  onChangeCompareId: (id: string) => void
  favoriteMoveIds: string[]
  onToggleFavoriteMove: (moveId: string) => void
  onBack: () => void
  onNavigateToPokemon: (pokemon: PokemonRow) => void
  draftConfig?: DraftConfig
  onDraftChange: (payload: DraftConfig) => void
  onSaveCurrent: (payload: Omit<SavedPokemonEntry, 'id' | 'baseId' | 'label' | 'pokemonId'>) => void
  savedPokemon: SavedPokemonEntry[]
  onAfterSave: () => void
  onUpdateSaved: (id: string, payload: Omit<SavedPokemonEntry, 'id' | 'baseId' | 'label' | 'pokemonId'>) => void
  standaloneCalc?: boolean
}

type MoveSortKey = 'category' | 'type' | 'basePower' | 'zh'
type MoveSortDirection = 'asc' | 'desc'
type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
type BoostKey = 'atk' | 'def' | 'spa' | 'spd' | 'spe'
type DamageMoveConfig = {
  isCrit: boolean
  hits: number
  timesUsed: number
  metronomeTimes: number
  powerOverride: string
  typeOverride: string
  categoryOverride: string
}

const ALL_NATURES = [
  { value: 'Hardy', label: '勤奋' },
  { value: 'Lonely', label: '怕寂寞 攻击+ 防御-' },
  { value: 'Brave', label: '勇敢 攻击+ 速度-' },
  { value: 'Adamant', label: '固执 攻击+ 特攻-' },
  { value: 'Naughty', label: '顽皮 攻击+ 特防-' },
  { value: 'Bold', label: '大胆 防御+ 攻击-' },
  { value: 'Docile', label: '坦率' },
  { value: 'Relaxed', label: '悠闲 防御+ 速度-' },
  { value: 'Impish', label: '淘气 防御+ 特攻-' },
  { value: 'Lax', label: '乐天 防御+ 特防-' },
  { value: 'Timid', label: '胆小 速度+ 攻击-' },
  { value: 'Hasty', label: '急躁 速度+ 防御-' },
  { value: 'Serious', label: '认真' },
  { value: 'Jolly', label: '爽朗 速度+ 特攻-' },
  { value: 'Naive', label: '天真 速度+ 特防-' },
  { value: 'Modest', label: '内敛 特攻+ 攻击-' },
  { value: 'Mild', label: '马虎 特攻+ 防御-' },
  { value: 'Quiet', label: '冷静 特攻+ 速度-' },
  { value: 'Bashful', label: '害羞' },
  { value: 'Rash', label: '马大哈 特攻+ 特防-' },
  { value: 'Calm', label: '沉着 特防+ 攻击-' },
  { value: 'Gentle', label: '温顺 特防+ 防御-' },
  { value: 'Sassy', label: '自大 特防+ 速度-' },
  { value: 'Careful', label: '慎重 特防+ 特攻-' },
  { value: 'Quirky', label: '浮躁' },
] as const

const TYPE_LABELS: Record<string, string> = {
  Normal: '一般', Fire: '火', Water: '水', Electric: '电', Grass: '草', Ice: '冰', Fighting: '格斗', Poison: '毒', Ground: '地面', Flying: '飞行', Psychic: '超能', Bug: '虫', Rock: '岩石', Ghost: '幽灵', Dragon: '龙', Dark: '恶', Steel: '钢', Fairy: '妖精'
}

const BOOST_OPTIONS = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]
const DEFAULT_SPS: Record<StatKey, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
const DEFAULT_BOOTS: Record<BoostKey, number> = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
const DEFAULT_DAMAGE_MOVE_CONFIG: DamageMoveConfig = { isCrit: false, hits: 1, timesUsed: 1, metronomeTimes: 1, powerOverride: '', typeOverride: '', categoryOverride: '' }
const DEFAULT_CUSTOM_MOVE_CONFIG: DamageMoveConfig = { isCrit: false, hits: 1, timesUsed: 1, metronomeTimes: 1, powerOverride: '80', typeOverride: 'Normal', categoryOverride: 'Physical' }
const CUSTOM_DAMAGE_MOVE_ID = '__custom__'
const CUSTOM_DAMAGE_MOVE: PokemonMove = { id: CUSTOM_DAMAGE_MOVE_ID, en: 'Tackle', zh: '自定', pinyin: 'ziding zd custom', type: 'Normal', category: 'Physical', basePower: 80, accuracy: true }
const ITEM_OPTIONS = [{ value: '无', label: '无', search: 'wu', group: 0 }, ...ruleItems.map((item) => ({ value: item.en, label: item.zh, search: `${item.search} ${item.id}`, group: item.group ?? 9 }))]
const MEGA_STONE_MAP: Record<string, string> = {
  venusaur: 'Venusaurite',
  blastoise: 'Blastoisinite',
  alakazam: 'Alakazite',
  gengar: 'Gengarite',
  kangaskhan: 'Kangaskhanite',
  pinsir: 'Pinsirite',
  gyarados: 'Gyaradosite',
  aerodactyl: 'Aerodactylite',
  ampharos: 'Ampharosite',
  scizor: 'Scizorite',
  heracross: 'Heracronite',
  houndoom: 'Houndoominite',
  tyranitar: 'Tyranitarite',
  blaziken: 'Blazikenite',
  gardevoir: 'Gardevoirite',
  mawile: 'Mawilite',
  aggron: 'Aggronite',
  medicham: 'Medichamite',
  manectric: 'Manectite',
  absol: 'Absolite',
  garchomp: 'Garchompite',
  lucario: 'Lucarionite',
  abomasnow: 'Abomasite',
  salamence: 'Salamencite',
  metagross: 'Metagrossite',
  latias: 'Latiasite',
  latios: 'Latiosite',
  lopunny: 'Lopunnite',
}

function megaStoneForForm(form: Pick<PokemonRow | PokemonDetail, 'name' | 'baseSpeciesId'>) {
  const name = form.name.toLowerCase()
  if (name.includes('charizard-mega-x')) return 'Charizardite X'
  if (name.includes('charizard-mega-y')) return 'Charizardite Y'
  return MEGA_STONE_MAP[form.baseSpeciesId]
}

function itemLabel(itemValue: string) {
  return ITEM_OPTIONS.find((option) => option.value === itemValue)?.label || (itemValue === '无' ? '' : itemValue)
}


const STATUS_OPTIONS = [
  { value: 'healthy', label: '健康' }, { value: 'poisoned', label: '中毒' },
  { value: 'badlyPoisoned', label: '剧毒' }, { value: 'burned', label: '烧伤' },
  { value: 'paralyzed', label: '麻痹' }, { value: 'asleep', label: '睡眠' },
  { value: 'frozen', label: '冰冻' },
]
const WEATHER_OPTIONS = [
  { value: 'none', label: '无' }, { value: 'sun', label: '晴天' },
  { value: 'rain', label: '下雨' }, { value: 'sand', label: '沙暴' },
  { value: 'snow', label: '雪景' },
]
const TERRAIN_OPTIONS = [
  { value: 'none', label: '无' }, { value: 'electric', label: '电气场地' },
  { value: 'grassy', label: '青草场地' }, { value: 'misty', label: '薄雾场地' },
  { value: 'psychic', label: '精神场地' },
]

function filterOptions<T extends { value: string; label: string }>(options: T[], query: string) {
  const q = query.toLowerCase()
  return q ? options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) : options
}

function filterNatures(query: string) {
  const q = query.toLowerCase()
  if (!q) return ALL_NATURES
  return ALL_NATURES.filter(n => n.label.toLowerCase().includes(q) || n.value.toLowerCase().includes(q))
}

function categoryLabel(category: PokemonMove['category']) {
  if (category === 'Status') return '变化'
  if (category === 'Physical') return '物理'
  return '特殊'
}

function typeLabel(type: string) {
  return TYPE_LABELS[type] || type
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s'’`‘＇\-_.·・/\\|:：()（）[\]【】]+/g, '')
    .replace(/[^\p{Script=Han}a-z0-9]/gu, '')
}

function getNatureMultiplier(statKey: StatKey, nature: string) {
  const boosts: Record<string, [StatKey, StatKey]> = {
    Lonely: ['atk', 'def'],
    Brave: ['atk', 'spe'],
    Adamant: ['atk', 'spa'],
    Naughty: ['atk', 'spd'],
    Bold: ['def', 'atk'],
    Relaxed: ['def', 'spe'],
    Impish: ['def', 'spa'],
    Lax: ['def', 'spd'],
    Timid: ['spe', 'atk'],
    Hasty: ['spe', 'def'],
    Jolly: ['spe', 'spa'],
    Naive: ['spe', 'spd'],
    Modest: ['spa', 'atk'],
    Mild: ['spa', 'def'],
    Quiet: ['spa', 'spe'],
    Rash: ['spa', 'spd'],
    Calm: ['spd', 'atk'],
    Gentle: ['spd', 'def'],
    Sassy: ['spd', 'spe'],
    Careful: ['spd', 'spa'],
  }
  const pair = boosts[nature]
  if (!pair) return 1
  if (pair[0] === statKey) return 1.1
  if (pair[1] === statKey) return 0.9
  return 1
}

function calculateStat(base: number, sp: number, nature: number, isHp: boolean, boost = 0) {
  let raw = isHp ? base + sp + 75 : base + sp + 20
  if (!isHp) raw = Math.floor(raw * nature)
  if (isHp || boost === 0) return raw
  if (boost > 0) return Math.floor(raw * ((2 + boost) / 2))
  return Math.floor(raw * (2 / (2 - boost)))
}

function ruleMovesFor(detail: PokemonDetail | null) {
  return detail?.moves ?? []
}


function fmtPercent(p: number) {
  return `${p.toFixed(p >= 10 ? 1 : 2)}%`
}

function renderUsageChips(items: UsageItem[], title: string, limit = 6) {
  const visible = items.slice(0, limit)
  if (!visible.length) return null
  return (
    <div className="usage-stat-group">
      <h3>{title}</h3>
      <div className="usage-chip-list">
        {visible.map((item, i) => (
          <div className="usage-chip" key={i}>
            <span>{item.zh}</span>
            <strong>{fmtPercent(item.percent)}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function renderUsageSpreads(spreads: UsageSpread[], limit = 5) {
  const visible = spreads.slice(0, limit)
  if (!visible.length) return null
  return (
    <div className="usage-stat-group">
      <h3>努力值</h3>
      <div className="usage-chip-list">
        {visible.map((entry, i) => {
          const spread = entry.spread.split(' / ').filter(p => !p.includes('余り')).join(' / ').trim()
          if (!spread) return null
          return (
            <div className="usage-chip" key={i}>
              <span>{spread}</span>
              <strong>{fmtPercent(entry.percent)}</strong>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function renderUsageTeammates(teammates: UsageTeammate[]) {
  if (!teammates.length) return null
  return (
    <div className="usage-stat-group">
      <h3>队友</h3>
      <div className="usage-chip-list">
        {teammates.map((tm, i) => (
          <div className="usage-chip" key={i}>
            <span>{tm.zh}</span>
          </div>
        ))}
      </div>
    </div>
  )
}


function emptyMoveLoadout() {
  return { ids: ['', '', '', ''], labels: ['', '', '', ''] }
}

const LONGEST_NATURE_LABEL = ALL_NATURES.reduce((a, b) => a.label.length >= b.label.length ? a : b).label
const LONGEST_STATUS_LABEL = STATUS_OPTIONS.reduce((a, b) => a.label.length >= b.label.length ? a : b).label
const LONGEST_WEATHER_LABEL = WEATHER_OPTIONS.reduce((a, b) => a.label.length >= b.label.length ? a : b).label
const LONGEST_TERRAIN_LABEL = TERRAIN_OPTIONS.reduce((a, b) => a.label.length >= b.label.length ? a : b).label
const LONGEST_ITEM_LABEL = ITEM_OPTIONS.reduce((a, b) => a.label.length >= b.label.length ? a : b).label
export function PokemonDetailPanel({ pokemon, compareTarget, formOptions, damageTargetOptions, onChangeCompareId, favoriteMoveIds, onToggleFavoriteMove, onBack, onNavigateToPokemon, draftConfig, onDraftChange, onSaveCurrent, savedPokemon, onAfterSave, onUpdateSaved, standaloneCalc }: Props) {
  const [nature, setNature] = useState<string>('Hardy')
  const [mainNatureQuery, setMainNatureQuery] = useState('')
  const [mainNatureOpen, setMainNatureOpen] = useState(false)
  const [attackerNatureQuery, setAttackerNatureQuery] = useState('')
  const [attackerNatureOpen, setAttackerNatureOpen] = useState(false)
  const [defenderNatureQuery, setDefenderNatureQuery] = useState('')
  const [defenderNatureOpen, setDefenderNatureOpen] = useState(false)
  const [attackerAbilityQuery, setAttackerAbilityQuery] = useState('')
  const [attackerAbilityOpen, setAttackerAbilityOpen] = useState(false)
  const [defenderAbilityQuery, setDefenderAbilityQuery] = useState('')
  const [defenderAbilityOpen, setDefenderAbilityOpen] = useState(false)
  const [attackerStatusQuery, setAttackerStatusQuery] = useState('')
  const [attackerStatusOpen, setAttackerStatusOpen] = useState(false)
  const [defenderStatusQuery, setDefenderStatusQuery] = useState('')
  const [defenderStatusOpen, setDefenderStatusOpen] = useState(false)
  const [weatherQuery, setWeatherQuery] = useState('')
  const [weatherOpen, setWeatherOpen] = useState(false)
  const [terrainQuery, setTerrainQuery] = useState('')
  const [terrainOpen, setTerrainOpen] = useState(false)
  const [abilityId, setAbilityId] = useState('')
  const [item, setItem] = useState('无')
  const [sps, setSps] = useState<Record<StatKey, number>>(DEFAULT_SPS)
  const [boosts, setBoosts] = useState<Record<BoostKey, number>>(DEFAULT_BOOTS)
  const [isMega, setIsMega] = useState(false)
  const [moveFiltersOpen, setMoveFiltersOpen] = useState(false)
  const [favoritePanelOpen, setFavoritePanelOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState({ status: true, physical: true, special: true })
  const [moveOnlyYellowFav, setMoveOnlyYellowFav] = useState(false)
  const [moveOnlyBlueFav, setMoveOnlyBlueFav] = useState(false)
  const [moveTypeFilters, setMoveTypeFilters] = useState<string[]>([])
  const [movePowerMin, setMovePowerMin] = useState(0)
  const [movePowerMax, setMovePowerMax] = useState(250)
  const [blueFavoriteMoveIds, setBlueFavoriteMoveIds] = useState<string[]>([])
  const [loadedConfigId, setLoadedConfigId] = useState<string | null>(null)
  const [loadPopoverOpenAt, setLoadPopoverOpenAt] = useState<'title' | 'stats' | 'attacker' | 'moves' | null>(null)
  const [moveSortKey, setMoveSortKey] = useState<MoveSortKey>('category')
  const [moveSortDirection, setMoveSortDirection] = useState<MoveSortDirection>('asc')
  const [itemQuery, setItemQuery] = useState('')
  const [itemOpen, setItemOpen] = useState(false)
  const [attackerPokemonId, setAttackerPokemonId] = useState('')
  const [defenderPokemonId, setDefenderPokemonId] = useState('')
  const [attackerPokemonQuery, setAttackerPokemonQuery] = useState('')
  const [defenderPokemonQuery, setDefenderPokemonQuery] = useState('')
  const [attackerDamageItemQuery, setAttackerDamageItemQuery] = useState('')
  const [defenderDamageItemQuery, setDefenderDamageItemQuery] = useState('')
  const [openPokemonPicker, setOpenPokemonPicker] = useState<'attacker' | 'defender' | null>(null)
  const [openDamageItemPicker, setOpenDamageItemPicker] = useState<'attacker' | 'defender' | null>(null)
  const [attackerMoveIds, setAttackerMoveIds] = useState<string[]>(['', '', '', ''])
  const [defenderMoveIds, setDefenderMoveIds] = useState<string[]>(['', '', '', ''])
  const [attackerMoveQueries, setAttackerMoveQueries] = useState<string[]>(['', '', '', ''])
  const [defenderMoveQueries, setDefenderMoveQueries] = useState<string[]>(['', '', '', ''])
  const [openMovePicker, setOpenMovePicker] = useState<string | null>(null)
  const [damageWeather, setDamageWeather] = useState('none')
  const [damageTerrain, setDamageTerrain] = useState('none')
  const [defenderAbilityId, setDefenderAbilityId] = useState('')
  const [defenderItem, setDefenderItem] = useState('无')
  const [defenderSps, setDefenderSps] = useState<Record<StatKey, number>>(DEFAULT_SPS)
  const [defenderBoosts, setDefenderBoosts] = useState<Record<BoostKey, number>>(DEFAULT_BOOTS)
  const [damageGameType, setDamageGameType] = useState<'Singles' | 'Doubles'>('Doubles')
  const [visibleMoveCounts, setVisibleMoveCounts] = useState<Record<'attacker' | 'defender', number>>({ attacker: 1, defender: 1 })
  const [expandedDamageResults, setExpandedDamageResults] = useState<Record<string, boolean>>({})
  const [damageMoveConfigs, setDamageMoveConfigs] = useState<Record<string, DamageMoveConfig>>({})
  const [attackerAbilityOn, setAttackerAbilityOn] = useState(true)
  const [defenderAbilityOn, setDefenderAbilityOn] = useState(true)
  const [defenderNature, setDefenderNature] = useState<string>('Hardy')
  const [attackerStatus, setAttackerStatus] = useState<StatusMode>('healthy')
  const [defenderStatus, setDefenderStatus] = useState<StatusMode>('healthy')
  const [attackerToxicCounter, setAttackerToxicCounter] = useState(1)
  const [defenderToxicCounter, setDefenderToxicCounter] = useState(1)
  const [attackerHpPercent, setAttackerHpPercent] = useState(100)
  const [defenderHpPercent, setDefenderHpPercent] = useState(100)
  const [isMagicRoom, setIsMagicRoom] = useState(false)
  const [isWonderRoom, setIsWonderRoom] = useState(false)
  const [isGravity, setIsGravity] = useState(false)
  const [attackerStealthRock, setAttackerStealthRock] = useState(false)
  const [defenderStealthRock, setDefenderStealthRock] = useState(false)
  const [attackerSpikes, setAttackerSpikes] = useState<0 | 1 | 2 | 3>(0)
  const [defenderSpikes, setDefenderSpikes] = useState<0 | 1 | 2 | 3>(0)
  const [isBeadsOfRuin, setIsBeadsOfRuin] = useState(false)
  const [isTabletsOfRuin, setIsTabletsOfRuin] = useState(false)
  const [isSwordOfRuin, setIsSwordOfRuin] = useState(false)
  const [isVesselOfRuin, setIsVesselOfRuin] = useState(false)
  const [attackerReflect, setAttackerReflect] = useState(false)
  const [attackerLightScreen, setAttackerLightScreen] = useState(false)
  const [attackerAuroraVeil, setAttackerAuroraVeil] = useState(false)
  const [attackerHelpingHand, setAttackerHelpingHand] = useState(false)
  const [attackerProtected, setAttackerProtected] = useState(false)
  const [attackerSeeded, setAttackerSeeded] = useState(false)
  const [attackerSaltCured, setAttackerSaltCured] = useState(false)
  const [attackerForesight, setAttackerForesight] = useState(false)
  const [attackerFlowerGift, setAttackerFlowerGift] = useState(false)
  const [attackerPowerTrick, setAttackerPowerTrick] = useState(false)
  const [attackerSteelySpirit, setAttackerSteelySpirit] = useState(false)
  const [attackerFriendGuard, setAttackerFriendGuard] = useState(false)
  const [attackerBattery, setAttackerBattery] = useState(false)
  const [attackerPowerSpot, setAttackerPowerSpot] = useState(false)
  const [attackerSwitchingOut, setAttackerSwitchingOut] = useState(false)
  const [attackerTailwind, setAttackerTailwind] = useState(false)
  const [defenderReflect, setDefenderReflect] = useState(false)
  const [defenderLightScreen, setDefenderLightScreen] = useState(false)
  const [defenderAuroraVeil, setDefenderAuroraVeil] = useState(false)
  const [defenderHelpingHand, setDefenderHelpingHand] = useState(false)
  const [defenderProtected, setDefenderProtected] = useState(false)
  const [defenderSeeded, setDefenderSeeded] = useState(false)
  const [defenderSaltCured, setDefenderSaltCured] = useState(false)
  const [defenderForesight, setDefenderForesight] = useState(false)
  const [defenderFlowerGift, setDefenderFlowerGift] = useState(false)
  const [defenderPowerTrick, setDefenderPowerTrick] = useState(false)
  const [defenderSteelySpirit, setDefenderSteelySpirit] = useState(false)
  const [defenderFriendGuard, setDefenderFriendGuard] = useState(false)
  const [defenderBattery, setDefenderBattery] = useState(false)
  const [defenderPowerSpot, setDefenderPowerSpot] = useState(false)
  const [defenderSwitchingOut, setDefenderSwitchingOut] = useState(false)
  const [defenderTailwind, setDefenderTailwind] = useState(false)
  const lastPokemonIdRef = useRef<string | null>(null)

  const familyForms = useMemo(() => formOptions, [formOptions])
  const normalForm = useMemo(() => familyForms.find((entry) => !entry.name.toLowerCase().includes('mega')) ?? null, [familyForms])
  const megaForms = useMemo(() => familyForms.filter((entry) => entry.name.toLowerCase().includes('mega')), [familyForms])
  const currentFormId = pokemon?.id ?? ''
  const isCurrentMega = pokemon?.name.toLowerCase().includes('mega') || false
  const displayPokemon = pokemon
  const usage = useMemo(() => pokemon ? getPokemonUsage(pokemon.name, pokemon.baseSpeciesName, pokemon.id, pokemon.baseSpeciesId) : null, [pokemon])

  const [infoOpen, setInfoOpen] = useState(true)
  const [statsOpen, setStatsOpen] = useState(true)
  const [usageOpen, setUsageOpen] = useState(false)
  const [damageOpen, setDamageOpen] = useState(() => standaloneCalc === true)
  const [movesOpen, setMovesOpen] = useState(true)

  useEffect(() => {
    if (!pokemon) return
    if (lastPokemonIdRef.current === pokemon.id) return
    lastPokemonIdRef.current = pokemon.id
    setCategoryFilter({ status: true, physical: true, special: true })
    setMoveOnlyYellowFav(false)
    setMoveOnlyBlueFav(false)
    setMoveTypeFilters([])
    setMovePowerMin(0)
    setMovePowerMax(250)
    setBlueFavoriteMoveIds([])
    setLoadedConfigId(null)
    setLoadPopoverOpenAt(null)
    setMoveSortKey('category')
    setMoveSortDirection('asc')
    const defaultMegaStone = pokemon.name.toLowerCase().includes('mega') ? megaStoneForForm(pokemon) : undefined
    const nextItem = draftConfig?.item && draftConfig.item !== '无' ? draftConfig.item : (defaultMegaStone || '无')
    setNature((draftConfig?.nature as typeof nature) || 'Hardy')
    setItem(nextItem)
    setItemQuery(nextItem === '无' ? '' : itemLabel(nextItem))
    setSps(draftConfig?.sps || DEFAULT_SPS)
    setBoosts(draftConfig?.boosts || DEFAULT_BOOTS)
    setIsMega(pokemon.name.toLowerCase().includes('mega'))
    setAbilityId(draftConfig?.abilityId || pokemon.abilities[0]?.id || '')
    setAttackerPokemonId(pokemon.id)
    setDefenderPokemonId(pokemon.id)
    setAttackerPokemonQuery(pokemonDisplayName(pokemon))
    setDefenderPokemonQuery(pokemonDisplayName(pokemon))
    setAttackerDamageItemQuery(nextItem === '无' ? '' : itemLabel(nextItem))
    setDefenderDamageItemQuery(nextItem === '无' ? '' : itemLabel(nextItem))
    const defaultLoadout = emptyMoveLoadout()
    setAttackerMoveIds(defaultLoadout.ids)
    setDefenderMoveIds(defaultLoadout.ids)
    setAttackerMoveQueries(defaultLoadout.labels)
    setDefenderMoveQueries(defaultLoadout.labels)
    setOpenMovePicker(null)
    setOpenPokemonPicker(null)
    setOpenDamageItemPicker(null)
    setDamageWeather('none')
    setDamageTerrain('none')
    setDefenderAbilityId(draftConfig?.abilityId || pokemon.abilities[0]?.id || '')
    setDefenderItem(nextItem)
    setDefenderSps(draftConfig?.sps || DEFAULT_SPS)
    setDefenderBoosts(draftConfig?.boosts || DEFAULT_BOOTS)
    setDamageGameType('Doubles')
    setVisibleMoveCounts({ attacker: 1, defender: 1 })
    setExpandedDamageResults({})
    setDamageMoveConfigs({})
    setAttackerAbilityOn(true)
    setDefenderAbilityOn(true)
    setDefenderNature('Hardy')
    setAttackerStatus('healthy')
    setDefenderStatus('healthy')
    setAttackerToxicCounter(1)
    setDefenderToxicCounter(1)
    setAttackerHpPercent(100)
    setDefenderHpPercent(100)
    setIsMagicRoom(false)
    setIsWonderRoom(false)
    setIsGravity(false)
    setAttackerStealthRock(false)
    setDefenderStealthRock(false)
    setAttackerSpikes(0)
    setDefenderSpikes(0)
    setIsBeadsOfRuin(false)
    setIsTabletsOfRuin(false)
    setIsSwordOfRuin(false)
    setIsVesselOfRuin(false)
    setAttackerReflect(false)
    setAttackerLightScreen(false)
    setAttackerAuroraVeil(false)
    setAttackerHelpingHand(false)
    setAttackerProtected(false)
    setAttackerSeeded(false)
    setAttackerSaltCured(false)
    setAttackerForesight(false)
    setAttackerFlowerGift(false)
    setAttackerPowerTrick(false)
    setAttackerSteelySpirit(false)
    setAttackerFriendGuard(false)
    setAttackerBattery(false)
    setAttackerPowerSpot(false)
    setAttackerSwitchingOut(false)
    setAttackerTailwind(false)
    setDefenderReflect(false)
    setDefenderLightScreen(false)
    setDefenderAuroraVeil(false)
    setDefenderHelpingHand(false)
    setDefenderProtected(false)
    setDefenderSeeded(false)
    setDefenderSaltCured(false)
    setDefenderForesight(false)
    setDefenderFlowerGift(false)
    setDefenderPowerTrick(false)
    setDefenderSteelySpirit(false)
    setDefenderFriendGuard(false)
    setDefenderBattery(false)
    setDefenderPowerSpot(false)
    setDefenderSwitchingOut(false)
    setDefenderTailwind(false)
  }, [draftConfig?.abilityId, draftConfig?.boosts, draftConfig?.item, draftConfig?.nature, draftConfig?.sps, pokemon])

  const attackerDetail = useMemo(() => championsDetails[attackerPokemonId] ?? pokemon, [attackerPokemonId, pokemon])
  const defenderDetail = useMemo(() => championsDetails[defenderPokemonId] ?? compareTarget ?? pokemon, [compareTarget, defenderPokemonId, pokemon])
  const effectiveAttackerAbilityId = attackerDetail?.abilities.some((ability) => ability.id === abilityId) ? abilityId : (attackerDetail?.abilities[0]?.id || '')
  const effectiveDefenderAbilityId = defenderDetail?.abilities.some((ability) => ability.id === defenderAbilityId) ? defenderAbilityId : (defenderDetail?.abilities[0]?.id || '')

  const totalSps = Object.values(sps).reduce((sum, value) => sum + value, 0)
  const favoriteMoves = useMemo(() => pokemon?.moves.filter((move) => favoriteMoveIds.includes(move.id)) ?? [], [pokemon, favoriteMoveIds])

  useEffect(() => {
    const close = () => {
      setItemOpen(false)
      setMoveFiltersOpen(false)
      setFavoritePanelOpen(false)
      setOpenPokemonPicker(null)
      setOpenDamageItemPicker(null)
      setLoadPopoverOpenAt(null)
    }
    window.addEventListener('pokemon-ui-close-popovers', close as EventListener)
    return () => window.removeEventListener('pokemon-ui-close-popovers', close as EventListener)
  }, [])

  const filteredItemOptions = useMemo(() => {
    const q = normalizeSearch(itemQuery)
    if (!q) return ITEM_OPTIONS
    return ITEM_OPTIONS.filter((option) => normalizeSearch(`${option.label} ${option.value} ${option.search}`).includes(q))
  }, [itemQuery])

  const filteredMoves = useMemo(() => {
    if (!pokemon) return []
    const categoryOrder: Record<PokemonMove['category'], number> = { Status: 0, Physical: 1, Special: 2 }
    return ruleMovesFor(pokemon)
      .filter((move) => {
        if (!categoryFilter.status && move.category === 'Status') return false
        if (!categoryFilter.physical && move.category === 'Physical') return false
        if (!categoryFilter.special && move.category === 'Special') return false
        if (moveOnlyYellowFav && !favoriteMoveIds.includes(move.id)) return false
        if (moveOnlyBlueFav && !blueFavoriteMoveIds.includes(move.id)) return false
        if (moveTypeFilters.length > 0 && !moveTypeFilters.includes(move.type)) return false
        const power = move.basePower || 0
        if (power < movePowerMin || power > movePowerMax) return false
        return true
      })
      .sort((a, b) => {
        if (moveSortKey === 'category') {
          const categoryDiff = categoryOrder[a.category] - categoryOrder[b.category]
          if (categoryDiff !== 0) return moveSortDirection === 'asc' ? categoryDiff : -categoryDiff
          const powerDiff = (a.basePower || 0) - (b.basePower || 0)
          if (powerDiff !== 0) return moveSortDirection === 'asc' ? powerDiff : -powerDiff
          const typeDiff = a.type.localeCompare(b.type)
          if (typeDiff !== 0) return moveSortDirection === 'asc' ? typeDiff : -typeDiff
          return a.zh.localeCompare(b.zh, 'zh-Hans-CN')
        }
        if (moveSortKey === 'basePower') {
          return moveSortDirection === 'asc' ? (a.basePower || 0) - (b.basePower || 0) : (b.basePower || 0) - (a.basePower || 0)
        }
        if (moveSortKey === 'type') {
          return moveSortDirection === 'asc' ? a.type.localeCompare(b.type) : b.type.localeCompare(a.type)
        }
        return moveSortDirection === 'asc' ? a.zh.localeCompare(b.zh, 'zh-Hans-CN') : b.zh.localeCompare(a.zh, 'zh-Hans-CN')
      })
  }, [pokemon, categoryFilter, favoriteMoveIds, blueFavoriteMoveIds, moveOnlyYellowFav, moveOnlyBlueFav, moveTypeFilters, movePowerMin, movePowerMax, moveSortKey, moveSortDirection])

  useEffect(() => {
    onDraftChange({ nature, abilityId, item, sps, boosts })
  }, [nature, abilityId, item, sps, boosts, onDraftChange])

  function toggleBlueFavorite(moveId: string) {
    const isBlue = blueFavoriteMoveIds.includes(moveId)
    if (!isBlue && !favoriteMoveIds.includes(moveId)) {
      onToggleFavoriteMove(moveId)
    }
    setBlueFavoriteMoveIds((current) =>
      current.includes(moveId) ? current.filter((id) => id !== moveId) : [...current, moveId]
    )
  }

  function loadConfig(entry: SavedPokemonEntry) {
    setNature((entry.nature as string) || 'Hardy')
    setAbilityId(entry.abilityId)
    setItem(entry.item)
    setItemQuery(entry.item === '无' ? '' : itemLabel(entry.item))
    setSps(entry.sps)
    setBoosts(entry.boosts)
    setBlueFavoriteMoveIds(entry.blueFavorites || [])
    setLoadedConfigId(entry.id)
    setLoadPopoverOpenAt(null)
  }

  function handleSave() {
    onSaveCurrent({ isMega, abilityId, item, nature, sps, boosts, blueFavorites: blueFavoriteMoveIds })
    onAfterSave()
  }

  function handleSaveBack() {
    if (!loadedConfigId) return
    onUpdateSaved(loadedConfigId, { isMega, abilityId, item, nature, sps, boosts, blueFavorites: blueFavoriteMoveIds })
  }

  function renderConfigActions(anchor: 'title' | 'stats' | 'attacker' | 'moves') {
    return (
      <div className="config-actions" data-popover-root>
        <button type="button" className="config-btn" title="保存当前配置到盒子" onClick={handleSave}>↓</button>
        {loadedConfigId && <button type="button" className="config-btn" title="覆盖保存回原配置" onClick={handleSaveBack}>↑</button>}
        <button type="button" className={`config-btn${loadPopoverOpenAt === anchor ? ' config-btn-active' : ''}`} title="从盒子加载配置" onClick={() => setLoadPopoverOpenAt((a) => a === anchor ? null : anchor)}>＋</button>
        {loadPopoverOpenAt === anchor && renderLoadPopup()}
      </div>
    )
  }

  function renderLoadPopup() {
    const configs = savedPokemon.filter((e) =>
      e.pokemonId === pokemon?.id ||
      (pokemon && normalizeSearch(pokemon.baseSpeciesName) === e.baseId)
    )
    return (
      <div className="load-config-popup" data-popover-root>
        <div className="load-config-title">加载已保存配置</div>
        {configs.length === 0
          ? <div className="popover-note">还没有为这只宝可梦保存过配置。<br />点击 ⬇ 可保存当前配置。</div>
          : configs.map((entry) => {
            const name = entry.customName || entry.label
            const spSummary = Object.entries(entry.sps).filter(([, v]) => v > 0).map(([k, v]) => `${SP_LABELS[k] ?? k} ${v}`).join(' / ') || '无努力值'
            return (
              <button key={entry.id} type="button" className={`load-config-item${loadedConfigId === entry.id ? ' active' : ''}`} onClick={() => loadConfig(entry)}>
                <span className="load-config-name">{name}</span>
                <span className="load-config-sp">{spSummary}</span>
              </button>
            )
          })
        }
      </div>
    )
  }

  function sideState(side: 'attacker' | 'defender') {
    const source = side === 'attacker'
    return {
      sps: source ? sps : defenderSps,
      nature: source ? nature : defenderNature,
      abilityId: source ? effectiveAttackerAbilityId : effectiveDefenderAbilityId,
      item: source ? item : defenderItem,
      boosts: source ? boosts : defenderBoosts,
      abilityOn: source ? attackerAbilityOn : defenderAbilityOn,
      status: source ? attackerStatus : defenderStatus,
      toxicCounter: source ? attackerToxicCounter : defenderToxicCounter,
      hpPercent: source ? attackerHpPercent : defenderHpPercent,
      side: source
        ? { spikes: attackerSpikes, isSR: attackerStealthRock, isReflect: attackerReflect, isLightScreen: attackerLightScreen, isAuroraVeil: attackerAuroraVeil, isTailwind: attackerTailwind, isHelpingHand: attackerHelpingHand, isProtected: attackerProtected, isSeeded: attackerSeeded, isSaltCured: attackerSaltCured, isForesight: attackerForesight, isFlowerGift: attackerFlowerGift, isPowerTrick: attackerPowerTrick, isSteelySpirit: attackerSteelySpirit, isFriendGuard: attackerFriendGuard, isBattery: attackerBattery, isPowerSpot: attackerPowerSpot, isSwitching: attackerSwitchingOut ? ('out' as const) : undefined }
        : { spikes: defenderSpikes, isSR: defenderStealthRock, isReflect: defenderReflect, isLightScreen: defenderLightScreen, isAuroraVeil: defenderAuroraVeil, isTailwind: defenderTailwind, isHelpingHand: defenderHelpingHand, isProtected: defenderProtected, isSeeded: defenderSeeded, isSaltCured: defenderSaltCured, isForesight: defenderForesight, isFlowerGift: defenderFlowerGift, isPowerTrick: defenderPowerTrick, isSteelySpirit: defenderSteelySpirit, isFriendGuard: defenderFriendGuard, isBattery: defenderBattery, isPowerSpot: defenderPowerSpot, isSwitching: defenderSwitchingOut ? ('out' as const) : undefined },
    }
  }

  function calculateMoveDamage(move: PokemonMove | null | undefined, sourceSide: 'attacker' | 'defender', config: DamageMoveConfig = DEFAULT_DAMAGE_MOVE_CONFIG) {
    if (!attackerDetail || !defenderDetail || !move || move.category === 'Status') return null
    const customMove = move.id === CUSTOM_DAMAGE_MOVE_ID
    const effectiveMove = customMove
      ? { ...move, basePower: Number(config.powerOverride) || 80, type: config.typeOverride || 'Normal', category: (config.categoryOverride || 'Physical') as PokemonMove['category'] }
      : move
    const sourcePokemon = sourceSide === 'attacker' ? attackerDetail : defenderDetail
    const targetPokemon = sourceSide === 'attacker' ? defenderDetail : attackerDetail
    const source = sideState(sourceSide)
    const target = sideState(sourceSide === 'attacker' ? 'defender' : 'attacker')
    const sourceMaxHp = calculateStat(sourcePokemon.baseStats.hp, source.sps.hp, 1, true)
    const targetMaxHp = calculateStat(targetPokemon.baseStats.hp, target.sps.hp, 1, true)
    try {
      return calculateChampionsDamage({
        attacker: sourcePokemon,
        defender: targetPokemon,
        moveName: move.en,
        moveState: {
          move: effectiveMove,
          isCrit: config.isCrit,
          hits: config.hits,
          timesUsed: config.timesUsed,
          timesUsedWithMetronome: config.metronomeTimes,
          basePower: customMove ? effectiveMove.basePower : undefined,
          type: customMove ? effectiveMove.type : undefined,
          category: customMove ? effectiveMove.category : undefined,
        },
        attackerSps: source.sps,
        defenderSps: target.sps,
        attackerNature: source.nature,
        defenderNature: target.nature,
        attackerAbility: sourcePokemon.abilities.find((entry) => entry.id === source.abilityId)?.en || sourcePokemon.abilities[0]?.en,
        attackerItem: source.item,
        attackerBoosts: source.boosts,
        attackerState: { abilityOn: source.abilityOn, status: source.status, toxicCounter: source.toxicCounter, currentHp: Math.max(1, Math.round(sourceMaxHp * source.hpPercent / 100)) },
        defenderAbility: targetPokemon.abilities.find((entry) => entry.id === target.abilityId)?.en || targetPokemon.abilities[0]?.en,
        defenderItem: target.item,
        defenderBoosts: target.boosts,
        defenderState: { abilityOn: target.abilityOn, status: target.status, toxicCounter: target.toxicCounter, currentHp: Math.max(1, Math.round(targetMaxHp * target.hpPercent / 100)) },
        field: {
          gameType: damageGameType,
          weather: damageWeather as 'none' | 'sun' | 'rain' | 'sand' | 'snow',
          terrain: damageTerrain as 'none' | 'electric' | 'grassy' | 'misty' | 'psychic',
          isMagicRoom,
          isWonderRoom,
          isGravity,
          isBeadsOfRuin,
          isTabletsOfRuin,
          isSwordOfRuin,
          isVesselOfRuin,
          attackerSide: source.side,
          defenderSide: target.side,
        },
      })
    } catch {
      return null
    }
  }

  if (!pokemon || !displayPokemon) {
    return <section className="detail-card empty-detail"><h2>宝可梦详情</h2><p>正在加载详情。</p></section>
  }

  const statRows: { key: StatKey; label: string; boostKey?: BoostKey }[] = [
    { key: 'hp', label: 'HP' },
    { key: 'atk', label: '攻击', boostKey: 'atk' },
    { key: 'def', label: '防御', boostKey: 'def' },
    { key: 'spa', label: '特攻', boostKey: 'spa' },
    { key: 'spd', label: '特防', boostKey: 'spd' },
    { key: 'spe', label: '速度', boostKey: 'spe' },
  ]



  function formatDamageResult(result: ReturnType<typeof calculateChampionsDamage> | null, expanded = false) {
    if (!result) return '—'
    if (expanded) return result.desc.replace(/Possible damage amounts:/g, '可能伤害值：').replace(/--/g, '—')
    const percentMatch = result.desc.match(/\(([^)]+%)\)/)
    const percentText = percentMatch ? ` (${percentMatch[1]})` : ''
    return `${result.range[0]}-${result.range[1]}${percentText}`
  }

  function damageMoveKey(side: 'attacker' | 'defender', index: number) {
    return `${side}-${index}`
  }

  function damageMoveConfig(key: string, move?: PokemonMove | null) {
    return damageMoveConfigs[key] || (move?.id === CUSTOM_DAMAGE_MOVE_ID ? DEFAULT_CUSTOM_MOVE_CONFIG : DEFAULT_DAMAGE_MOVE_CONFIG)
  }

  function updateDamageMoveConfig(key: string, patch: Partial<DamageMoveConfig>) {
    setDamageMoveConfigs((current) => ({ ...current, [key]: { ...DEFAULT_DAMAGE_MOVE_CONFIG, ...(current[key] || {}), ...patch } }))
  }

  function shouldShowMoveAdvanced(move: PokemonMove | null, config: DamageMoveConfig) {
    if (!move) return false
    return move.id === CUSTOM_DAMAGE_MOVE_ID || move.en === 'Triple Kick' || move.en === 'Population Bomb' || move.en === 'Last Respects' || move.en === 'Metronome' || move.category !== 'Status' || config.isCrit || config.powerOverride || config.typeOverride || config.categoryOverride
  }

  function moveSuggestionsFor(detail: PokemonDetail | null, query: string, selectedIds: string[]) {
    const ruleMoves = ruleMovesFor(detail)
    if (!ruleMoves.length) return []
    const q = normalizeSearch(query)
    const moves = q
      ? ruleMoves.filter((move) => normalizeSearch(`${move.zh} ${move.en} ${move.id} ${move.pinyin}`).includes(q))
      : ruleMoves
    return [CUSTOM_DAMAGE_MOVE, ...moves
      .slice()
      .sort((a, b) => {
        const aSelected = selectedIds.includes(a.id) ? 1 : 0
        const bSelected = selectedIds.includes(b.id) ? 1 : 0
        return aSelected - bSelected || a.zh.localeCompare(b.zh, 'zh-Hans-CN')
      })]
  }

  function pokemonSuggestionsFor(query: string) {
    const q = normalizeSearch(query)
    const candidates = q
      ? damageTargetOptions.filter((target) => normalizeSearch(`${pokemonSearchText(target)} ${target.pinyin} ${target.initials}`).includes(q))
      : damageTargetOptions
    return candidates
      .slice()
      .sort((a, b) => a.zh.localeCompare(b.zh, 'zh-Hans-CN') || a.name.localeCompare(b.name))
  }

  function itemSuggestionsFor(query: string) {
    const q = normalizeSearch(query)
    const candidates = q
      ? ITEM_OPTIONS.filter((option) => normalizeSearch(`${option.label} ${option.value} ${option.search}`).includes(q))
      : ITEM_OPTIONS
    return candidates
  }

  function selectDamagePokemon(side: 'attacker' | 'defender', target: PokemonRow) {
    const nextDetail = championsDetails[target.id] ?? null
    const loadout = emptyMoveLoadout()
    if (side === 'attacker') {
      setAttackerPokemonId(target.id)
      setAttackerPokemonQuery(pokemonDisplayName(target))
      setAbilityId(nextDetail?.abilities[0]?.id || '')
      setAttackerMoveIds(loadout.ids)
      setAttackerMoveQueries(loadout.labels)
    } else {
      setDefenderPokemonId(target.id)
      setDefenderPokemonQuery(pokemonDisplayName(target))
      setDefenderAbilityId(nextDetail?.abilities[0]?.id || '')
      setDefenderMoveIds(loadout.ids)
      setDefenderMoveQueries(loadout.labels)
      onChangeCompareId(target.id)
    }
    setOpenPokemonPicker(null)
  }

  function selectDamageItem(side: 'attacker' | 'defender', option: typeof ITEM_OPTIONS[number]) {
    if (side === 'attacker') {
      setItem(option.value)
      setItemQuery(option.value === '无' ? '' : option.label)
      setAttackerDamageItemQuery(option.value === '无' ? '' : option.label)
    } else {
      setDefenderItem(option.value)
      setDefenderDamageItemQuery(option.value === '无' ? '' : option.label)
    }
    setOpenDamageItemPicker(null)
  }

  function addMoveGroup() {
    setVisibleMoveCounts((current) => ({ attacker: Math.min(4, current.attacker + 1), defender: Math.min(4, current.defender + 1) }))
  }

  function removeMoveSlot(side: 'attacker' | 'defender', index: number) {
    const setMoveIds = side === 'attacker' ? setAttackerMoveIds : setDefenderMoveIds
    const setQueries = side === 'attacker' ? setAttackerMoveQueries : setDefenderMoveQueries
    setMoveIds((current) => [...current.slice(0, index), ...current.slice(index + 1), ''].slice(0, 4))
    setQueries((current) => [...current.slice(0, index), ...current.slice(index + 1), ''].slice(0, 4))
    setVisibleMoveCounts((current) => ({ ...current, [side]: Math.max(1, current[side] - 1) }))
    setOpenMovePicker((current) => current === damageMoveKey(side, index) ? null : current)
    setExpandedDamageResults((current) => {
      const next = { ...current }
      delete next[damageMoveKey(side, index)]
      return next
    })
    setDamageMoveConfigs((current) => {
      const next = { ...current }
      delete next[damageMoveKey(side, index)]
      return next
    })
  }

  function renderMovePicker(side: 'attacker' | 'defender', index: number) {
    const detail = side === 'attacker' ? attackerDetail : defenderDetail
    const moveIds = side === 'attacker' ? attackerMoveIds : defenderMoveIds
    const queries = side === 'attacker' ? attackerMoveQueries : defenderMoveQueries
    const setMoveIds = side === 'attacker' ? setAttackerMoveIds : setDefenderMoveIds
    const setQueries = side === 'attacker' ? setAttackerMoveQueries : setDefenderMoveQueries
    const pickerId = damageMoveKey(side, index)
    const ruleMoves = ruleMovesFor(detail)
    const selectedMove = moveIds[index] === CUSTOM_DAMAGE_MOVE_ID ? CUSTOM_DAMAGE_MOVE : (ruleMoves.find((move) => move.id === moveIds[index]) || null)
    const config = damageMoveConfig(pickerId, selectedMove)
    const damage = calculateMoveDamage(selectedMove, side, config)
    const suggestions = moveSuggestionsFor(detail, queries[index], moveIds)
    const expanded = !!expandedDamageResults[pickerId]
    const isDamagingMove = !!selectedMove && selectedMove.category !== 'Status'
    const isCustomMove = selectedMove?.id === CUSTOM_DAMAGE_MOVE_ID
    const showHits = !!selectedMove && (isCustomMove || ['Triple Kick', 'Population Bomb'].includes(selectedMove.en))
    const showTimesUsed = isCustomMove || selectedMove?.en === 'Last Respects'
    const showMetronome = isCustomMove || (side === 'attacker' ? item : defenderItem) === 'Metronome'
    const showAdvanced = shouldShowMoveAdvanced(selectedMove, config)
    const canExpand = !!damage || showAdvanced
    const canRemove = visibleMoveCounts[side] > 1
    return (
      <div className="damage-move-row" key={pickerId} data-popover-root>
        <div className="damage-move-picker-row">
          <div className="damage-move-picker">
            <input
              value={openMovePicker === pickerId ? queries[index] : (selectedMove?.zh ?? '')}
              placeholder={`技能 ${index + 1}`}
              onFocus={() => {
                setQueries((current) => current.map((entry, i) => i === index ? '' : entry))
                setOpenMovePicker(pickerId)
              }}
              onChange={(event) => {
                const value = event.target.value
                setQueries((current) => current.map((entry, i) => i === index ? value : entry))
                setOpenMovePicker(pickerId)
              }}
              onBlur={() => setTimeout(() => setOpenMovePicker((current) => current === pickerId ? null : current), 120)}
            />
            {openMovePicker === pickerId && (
              <div className="search-dropdown move-damage-dropdown compact-dropdown">
                {suggestions.map((move) => (
                  <button key={move.id} className="item-option-row" onMouseDown={() => {
                    setMoveIds((current) => current.map((entry, i) => i === index ? move.id : entry))
                    setQueries((current) => current.map((entry, i) => i === index ? move.zh : entry))
                    if (move.id === CUSTOM_DAMAGE_MOVE_ID) {
                      updateDamageMoveConfig(pickerId, DEFAULT_CUSTOM_MOVE_CONFIG)
                      setExpandedDamageResults((current) => ({ ...current, [pickerId]: true }))
                    }
                    setOpenMovePicker(null)
                  }}>
                    <span>{move.zh}</span>
                    {move.id !== CUSTOM_DAMAGE_MOVE_ID && <small>{typeLabel(move.type)} · {categoryLabel(move.category)} · {move.basePower || '—'}</small>}
                  </button>
                ))}
                {suggestions.length === 0 && <div className="popover-note">没有匹配的技能。</div>}
              </div>
            )}
          </div>
          {canRemove && <button className="tiny-icon-button remove-move-button" type="button" aria-label="移除技能" onClick={() => removeMoveSlot(side, index)}>−</button>}
        </div>
        <div className="damage-move-result">
          <span>{selectedMove?.category === 'Status' ? '变化招式' : formatDamageResult(damage, expanded)}</span>
          {canExpand && <button className="tiny-icon-button" type="button" aria-label="展开技能详情" onClick={() => setExpandedDamageResults((current) => ({ ...current, [pickerId]: !current[pickerId] }))}>{expanded ? '▴' : '▾'}</button>}
        </div>
        {expanded && showAdvanced && (
          <div className="damage-move-advanced-grid">
            {showHits && <label className="popover-field compact-number-field"><span>命中次数</span><input type="number" min={1} step={1} value={config.hits} onChange={(event) => updateDamageMoveConfig(pickerId, { hits: Math.max(1, Math.floor(Number(event.target.value) || 1)) })} /></label>}
            {showTimesUsed && <label className="popover-field"><span>已倒下队友</span><select value={config.timesUsed} onChange={(event) => updateDamageMoveConfig(pickerId, { timesUsed: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
            {showMetronome && <label className="popover-field"><span>节拍器叠加</span><select value={config.metronomeTimes} onChange={(event) => updateDamageMoveConfig(pickerId, { metronomeTimes: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
            {isDamagingMove && <label className="toggle-chip"><input type="checkbox" checked={config.isCrit} onChange={(event) => updateDamageMoveConfig(pickerId, { isCrit: event.target.checked })} />暴击</label>}
            {isCustomMove && <label className="popover-field compact-power-field"><span>威力</span><input type="number" min={0} value={config.powerOverride} onChange={(event) => updateDamageMoveConfig(pickerId, { powerOverride: event.target.value })} placeholder="80" /></label>}
            {isCustomMove && <label className="popover-field"><span>属性</span><select value={config.typeOverride} onChange={(event) => updateDamageMoveConfig(pickerId, { typeOverride: event.target.value })}>{Object.keys(TYPE_LABELS).map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}</select></label>}
            {isCustomMove && <label className="popover-field"><span>分类</span><select value={config.categoryOverride} onChange={(event) => updateDamageMoveConfig(pickerId, { categoryOverride: event.target.value })}><option value="Physical">物理</option><option value="Special">特殊</option><option value="Status">变化</option></select></label>}
          </div>
        )}
      </div>
    )
  }

  function renderStatsTable(side: 'attacker' | 'defender') {
    const detail = side === 'attacker' ? attackerDetail : defenderDetail
    const statSps = side === 'attacker' ? sps : defenderSps
    const setStatSps = side === 'attacker' ? setSps : setDefenderSps
    const statBoosts = side === 'attacker' ? boosts : defenderBoosts
    const setStatBoosts = side === 'attacker' ? setBoosts : setDefenderBoosts
    const statNature = side === 'attacker' ? nature : defenderNature
    if (!detail) return null
    return (
      <div className="damage-stats-table-wrap">
        <table className="stats-setting-table damage-stats-table">
          <thead><tr><th>能力</th><th>种族值</th><th>努力值</th><th>修正</th><th>最终</th></tr></thead>
          <tbody>
            {statRows.map((row) => {
              const boost = row.boostKey ? statBoosts[row.boostKey] : 0
              const total = calculateStat(detail.baseStats[row.key], statSps[row.key], getNatureMultiplier(row.key, statNature), row.key === 'hp', boost)
              return (
                <tr key={`${side}-stat-${row.key}`}>
                  <td>{row.label}</td>
                  <td>{detail.baseStats[row.key]}</td>
                  <td><div className="ev-input-cell"><input type="number" min={0} max={32} value={statSps[row.key]} onChange={(event) => { const v = Math.min(32, Math.max(0, Number(event.target.value) || 0)); setStatSps((c) => { const next = { ...c, [row.key]: v }; return Object.values(next).reduce((a, b) => a + b, 0) > 66 ? c : next }) }} /><div className="ev-adj-col"><button type="button" className="ev-adj-btn" onClick={() => setStatSps((c) => { const next = { ...c, [row.key]: Math.min(32, c[row.key] + 1) }; return Object.values(next).reduce((a, b) => a + b, 0) > 66 ? c : next })}>＋</button><button type="button" className="ev-adj-btn" onClick={() => setStatSps((c) => { const next = { ...c, [row.key]: Math.max(0, c[row.key] - 1) }; return Object.values(next).reduce((a, b) => a + b, 0) > 66 ? c : next })}>−</button></div></div></td>
                  <td>{row.boostKey ? <select className="boost-select" value={boost} onChange={(event) => setStatBoosts((current) => ({ ...current, [row.boostKey!]: Number(event.target.value) }))}>{BOOST_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select> : '—'}</td>
                  <td>{total}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="sp-summary compact-sp-summary">已分配努力值: <strong>{Object.values(statSps).reduce((sum, value) => sum + value, 0)}</strong> / 66</div>
      </div>
    )
  }

  function renderBattleSide(side: 'attacker' | 'defender') {
    const isAttacker = side === 'attacker'
    const detail = isAttacker ? attackerDetail : defenderDetail
    if (!detail) return null
    const pokemonId = isAttacker ? attackerPokemonId : defenderPokemonId
    const sidePokemonQuery = isAttacker ? attackerPokemonQuery : defenderPokemonQuery
    const setSidePokemonQuery = isAttacker ? setAttackerPokemonQuery : setDefenderPokemonQuery
    const sideItemQuery = isAttacker ? attackerDamageItemQuery : defenderDamageItemQuery
    const setSideItemQuery = isAttacker ? setAttackerDamageItemQuery : setDefenderDamageItemQuery
    const pokemonPickerOpen = openPokemonPicker === side
    const damageItemPickerOpen = openDamageItemPicker === side
    const pokemonSuggestions = pokemonSuggestionsFor(sidePokemonQuery)
    const itemSuggestions = itemSuggestionsFor(sideItemQuery)
    const sideNature = isAttacker ? nature : defenderNature
    const setSideNature = isAttacker ? setNature : setDefenderNature
    const sideNatureQuery = isAttacker ? attackerNatureQuery : defenderNatureQuery
    const setSideNatureQuery = isAttacker ? setAttackerNatureQuery : setDefenderNatureQuery
    const sideNatureOpen = isAttacker ? attackerNatureOpen : defenderNatureOpen
    const setSideNatureOpen = isAttacker ? setAttackerNatureOpen : setDefenderNatureOpen
    const longestAbilityLabel = detail.abilities.reduce((a, b) => a.zh.length >= b.zh.length ? a : b, detail.abilities[0])?.zh ?? ''
    const longestPokemonName = damageTargetOptions.reduce((longest, p) => pokemonDisplayName(p).length > longest.length ? pokemonDisplayName(p) : longest, '')
    const sideAbilityQuery = isAttacker ? attackerAbilityQuery : defenderAbilityQuery
    const setSideAbilityQuery = isAttacker ? setAttackerAbilityQuery : setDefenderAbilityQuery
    const sideAbilityOpen = isAttacker ? attackerAbilityOpen : defenderAbilityOpen
    const setSideAbilityOpen = isAttacker ? setAttackerAbilityOpen : setDefenderAbilityOpen
    const sideStatusQuery = isAttacker ? attackerStatusQuery : defenderStatusQuery
    const setSideStatusQuery = isAttacker ? setAttackerStatusQuery : setDefenderStatusQuery
    const sideStatusOpen = isAttacker ? attackerStatusOpen : defenderStatusOpen
    const setSideStatusOpen = isAttacker ? setAttackerStatusOpen : setDefenderStatusOpen
    const sideAbilityId = isAttacker ? effectiveAttackerAbilityId : effectiveDefenderAbilityId
    const setSideAbilityId = isAttacker ? setAbilityId : setDefenderAbilityId
    const sideItem = isAttacker ? item : defenderItem
    const sideStatus = isAttacker ? attackerStatus : defenderStatus
    const setSideStatus = isAttacker ? setAttackerStatus : setDefenderStatus
    const sideHpPercent = isAttacker ? attackerHpPercent : defenderHpPercent
    const setSideHpPercent = isAttacker ? setAttackerHpPercent : setDefenderHpPercent
    const sideToxicCounter = isAttacker ? attackerToxicCounter : defenderToxicCounter
    const setSideToxicCounter = isAttacker ? setAttackerToxicCounter : setDefenderToxicCounter
    const sideSpikes = isAttacker ? attackerSpikes : defenderSpikes
    const setSideSpikes = isAttacker ? setAttackerSpikes : setDefenderSpikes
    const sideStealthRock = isAttacker ? attackerStealthRock : defenderStealthRock
    const setSideStealthRock = isAttacker ? setAttackerStealthRock : setDefenderStealthRock
    const abilityOn = isAttacker ? attackerAbilityOn : defenderAbilityOn
    const setAbilityOn = isAttacker ? setAttackerAbilityOn : setDefenderAbilityOn
    const reflect = isAttacker ? attackerReflect : defenderReflect
    const setReflect = isAttacker ? setAttackerReflect : setDefenderReflect
    const lightScreen = isAttacker ? attackerLightScreen : defenderLightScreen
    const setLightScreen = isAttacker ? setAttackerLightScreen : setDefenderLightScreen
    const auroraVeil = isAttacker ? attackerAuroraVeil : defenderAuroraVeil
    const setAuroraVeil = isAttacker ? setAttackerAuroraVeil : setDefenderAuroraVeil
    const helpingHand = isAttacker ? attackerHelpingHand : defenderHelpingHand
    const setHelpingHand = isAttacker ? setAttackerHelpingHand : setDefenderHelpingHand
    const protectedSide = isAttacker ? attackerProtected : defenderProtected
    const setProtectedSide = isAttacker ? setAttackerProtected : setDefenderProtected
    const tailwind = isAttacker ? attackerTailwind : defenderTailwind
    const setTailwind = isAttacker ? setAttackerTailwind : setDefenderTailwind
    const seeded = isAttacker ? attackerSeeded : defenderSeeded
    const setSeeded = isAttacker ? setAttackerSeeded : setDefenderSeeded
    const saltCured = isAttacker ? attackerSaltCured : defenderSaltCured
    const setSaltCured = isAttacker ? setAttackerSaltCured : setDefenderSaltCured
    const foresight = isAttacker ? attackerForesight : defenderForesight
    const setForesight = isAttacker ? setAttackerForesight : setDefenderForesight
    const flowerGift = isAttacker ? attackerFlowerGift : defenderFlowerGift
    const setFlowerGift = isAttacker ? setAttackerFlowerGift : setDefenderFlowerGift
    const powerTrick = isAttacker ? attackerPowerTrick : defenderPowerTrick
    const setPowerTrick = isAttacker ? setAttackerPowerTrick : setDefenderPowerTrick
    const steelySpirit = isAttacker ? attackerSteelySpirit : defenderSteelySpirit
    const setSteelySpirit = isAttacker ? setAttackerSteelySpirit : setDefenderSteelySpirit
    const friendGuard = isAttacker ? attackerFriendGuard : defenderFriendGuard
    const setFriendGuard = isAttacker ? setAttackerFriendGuard : setDefenderFriendGuard
    const battery = isAttacker ? attackerBattery : defenderBattery
    const setBattery = isAttacker ? setAttackerBattery : setDefenderBattery
    const powerSpot = isAttacker ? attackerPowerSpot : defenderPowerSpot
    const setPowerSpot = isAttacker ? setAttackerPowerSpot : setDefenderPowerSpot
    const switchingOut = isAttacker ? attackerSwitchingOut : defenderSwitchingOut
    const setSwitchingOut = isAttacker ? setAttackerSwitchingOut : setDefenderSwitchingOut
    return (
      <section className="damage-subpanel">
        <div className="damage-subpanel-title"><div className="title-with-actions"><h3>{isAttacker ? '我方' : '对方'}</h3>{isAttacker && renderConfigActions('attacker')}</div><span>{pokemonDisplayName(detail)}</span></div>
        <div className="damage-config-grid">
          <label className="popover-field" data-popover-root><span>宝可梦</span><div className="damage-search-picker auto-size-picker"><span className="sizer" aria-hidden="true">{longestPokemonName}</span><input value={pokemonPickerOpen ? sidePokemonQuery : pokemonDisplayName(detail)} onFocus={() => { setOpenPokemonPicker(side); setSidePokemonQuery('') }} onBlur={() => setTimeout(() => setOpenPokemonPicker((current) => current === side ? null : current), 120)} onChange={(event) => { setSidePokemonQuery(event.target.value); setOpenPokemonPicker(side) }} placeholder="输入中文、拼音或英文" />{pokemonPickerOpen && <div className="search-dropdown move-damage-dropdown compact-dropdown">{pokemonSuggestions.map((target) => <button key={target.id} className="item-option-row" type="button" onMouseDown={() => selectDamagePokemon(side, target)}><span>{pokemonDisplayName(target)}</span></button>)}{pokemonSuggestions.length === 0 && <div className="popover-note">没有匹配的宝可梦。</div>}{(() => { const q = normalizeSearch(sidePokemonQuery); const cfgs = savedPokemon.filter((e) => { const name = e.customName || e.label; return !q || normalizeSearch(name).includes(q) }); return cfgs.length > 0 ? <><div className="picker-group-label">盒子</div>{cfgs.map((e) => { const pkmRow = damageTargetOptions.find((p) => p.id === e.pokemonId); return <button key={e.id} className="item-option-row" type="button" onMouseDown={() => { if (pkmRow) selectDamagePokemon(side, pkmRow); if (side === 'attacker') { setNature((e.nature as string) || 'Hardy'); setAbilityId(e.abilityId); setItem(e.item); setItemQuery(e.item === '无' ? '' : itemLabel(e.item)); setSps(e.sps); setBoosts(e.boosts) } else { setDefenderNature((e.nature as string) || 'Hardy'); setDefenderAbilityId(e.abilityId); setDefenderItem(e.item); setDefenderSps(e.sps); setDefenderBoosts(e.boosts) }; setOpenPokemonPicker(null) }}><span>{e.customName || e.label}</span><small>配置</small></button> })}</> : null })()}</div>}</div><input type="hidden" value={pokemonId} readOnly /></label>
          <label className="popover-field" data-popover-root><span>性格</span><div className="nature-picker auto-size-picker"><span className="sizer" aria-hidden="true">{LONGEST_NATURE_LABEL}</span><input value={sideNatureOpen ? sideNatureQuery : (ALL_NATURES.find(n => n.value === sideNature)?.label ?? sideNature)} onFocus={() => { setSideNatureOpen(true); setSideNatureQuery('') }} onBlur={() => setTimeout(() => setSideNatureOpen(false), 120)} onChange={(event) => setSideNatureQuery(event.target.value)} placeholder="性格" />{sideNatureOpen && <div className="search-dropdown nature-dropdown compact-dropdown">{filterNatures(sideNatureQuery).map(option => <button key={option.value} className="item-option-row" type="button" onMouseDown={() => { setSideNature(option.value); setSideNatureOpen(false); setSideNatureQuery('') }}><span>{option.label}</span></button>)}</div>}</div></label>
          <label className="popover-field" data-popover-root><span>特性</span><div className="inline-picker auto-size-picker"><span className="sizer" aria-hidden="true">{longestAbilityLabel}</span><input value={sideAbilityOpen ? sideAbilityQuery : (detail.abilities.find(a => a.id === sideAbilityId)?.zh ?? '')} onFocus={() => { setSideAbilityOpen(true); setSideAbilityQuery('') }} onBlur={() => setTimeout(() => setSideAbilityOpen(false), 120)} onChange={(e) => setSideAbilityQuery(e.target.value)} placeholder="特性" />{sideAbilityOpen && <div className="search-dropdown inline-picker-dropdown compact-dropdown">{filterOptions(detail.abilities.map(a => ({ value: a.id, label: a.zh })), sideAbilityQuery).map(opt => <button key={opt.value} className="item-option-row" type="button" onMouseDown={() => { setSideAbilityId(opt.value); setSideAbilityOpen(false); setSideAbilityQuery('') }}><span>{opt.label}</span></button>)}</div>}</div></label>
          <label className="popover-field" data-popover-root><span>道具</span><div className="damage-search-picker auto-size-picker"><span className="sizer" aria-hidden="true">{LONGEST_ITEM_LABEL}</span><input value={damageItemPickerOpen ? sideItemQuery : (sideItem !== '无' ? itemLabel(sideItem) : '')} onFocus={() => { setOpenDamageItemPicker(side); setSideItemQuery('') }} onBlur={() => setTimeout(() => setOpenDamageItemPicker((current) => current === side ? null : current), 120)} onChange={(event) => { setSideItemQuery(event.target.value); setOpenDamageItemPicker(side) }} placeholder="输入中文、拼音或英文" />{damageItemPickerOpen && <div className="search-dropdown move-damage-dropdown compact-dropdown">{itemSuggestions.map((option) => <button key={option.value} className="item-option-row" type="button" onMouseDown={() => selectDamageItem(side, option)}><span>{option.label}</span></button>)}{itemSuggestions.length === 0 && <div className="popover-note">没有匹配的道具。</div>}</div>}</div><input type="hidden" value={sideItem} readOnly /></label>
          <label className="popover-field" data-popover-root><span>状态</span><div className="inline-picker auto-size-picker"><span className="sizer" aria-hidden="true">{LONGEST_STATUS_LABEL}</span><input value={sideStatusOpen ? sideStatusQuery : (STATUS_OPTIONS.find(o => o.value === sideStatus)?.label ?? '')} onFocus={() => { setSideStatusOpen(true); setSideStatusQuery('') }} onBlur={() => setTimeout(() => setSideStatusOpen(false), 120)} onChange={(e) => setSideStatusQuery(e.target.value)} placeholder="状态" />{sideStatusOpen && <div className="search-dropdown inline-picker-dropdown compact-dropdown">{filterOptions(STATUS_OPTIONS, sideStatusQuery).map(opt => <button key={opt.value} className="item-option-row" type="button" onMouseDown={() => { setSideStatus(opt.value as StatusMode); setSideStatusOpen(false); setSideStatusQuery('') }}><span>{opt.label}</span></button>)}</div>}</div></label>
          <label className="popover-field"><span>当前 HP%</span><input type="number" min={1} max={100} value={sideHpPercent} onChange={(event) => setSideHpPercent(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /></label>
        </div>
        {renderStatsTable(side)}
        <details className="damage-advanced">
          <summary>展开</summary>
          <div className="damage-config-grid">
            {sideStatus === 'badlyPoisoned' && <label className="popover-field"><span>剧毒回合</span><select value={sideToxicCounter} onChange={(event) => setSideToxicCounter(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((value) => <option key={value} value={value}>{value}/16</option>)}</select></label>}
            <label className="popover-field"><span>撒菱</span><select value={sideSpikes} onChange={(event) => setSideSpikes(Number(event.target.value) as 0 | 1 | 2 | 3)}><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
            <label className="toggle-chip"><input type="checkbox" checked={sideStealthRock} onChange={(event) => setSideStealthRock(event.target.checked)} />隐形岩</label>
          </div>
          <div className="damage-side-grid">
            <label className="toggle-chip"><input type="checkbox" checked={abilityOn} onChange={(event) => setAbilityOn(event.target.checked)} />特性生效</label>
            <label className="toggle-chip"><input type="checkbox" checked={reflect} onChange={(event) => setReflect(event.target.checked)} />反射壁</label>
            <label className="toggle-chip"><input type="checkbox" checked={lightScreen} onChange={(event) => setLightScreen(event.target.checked)} />光墙</label>
            <label className="toggle-chip"><input type="checkbox" checked={auroraVeil} onChange={(event) => setAuroraVeil(event.target.checked)} />极光幕</label>
            <label className="toggle-chip"><input type="checkbox" checked={helpingHand} onChange={(event) => setHelpingHand(event.target.checked)} />帮助</label>
            <label className="toggle-chip"><input type="checkbox" checked={protectedSide} onChange={(event) => setProtectedSide(event.target.checked)} />守住</label>
            <label className="toggle-chip"><input type="checkbox" checked={tailwind} onChange={(event) => setTailwind(event.target.checked)} />顺风</label>
            <label className="toggle-chip"><input type="checkbox" checked={seeded} onChange={(event) => setSeeded(event.target.checked)} />寄生种子</label>
            <label className="toggle-chip"><input type="checkbox" checked={saltCured} onChange={(event) => setSaltCured(event.target.checked)} />盐腌</label>
            <label className="toggle-chip"><input type="checkbox" checked={foresight} onChange={(event) => setForesight(event.target.checked)} />识破</label>
            <label className="toggle-chip"><input type="checkbox" checked={flowerGift} onChange={(event) => setFlowerGift(event.target.checked)} />花之礼</label>
            <label className="toggle-chip"><input type="checkbox" checked={powerTrick} onChange={(event) => setPowerTrick(event.target.checked)} />力量戏法</label>
            <label className="toggle-chip"><input type="checkbox" checked={steelySpirit} onChange={(event) => setSteelySpirit(event.target.checked)} />钢之意志</label>
            <label className="toggle-chip"><input type="checkbox" checked={friendGuard} onChange={(event) => setFriendGuard(event.target.checked)} />友情防守</label>
            <label className="toggle-chip"><input type="checkbox" checked={battery} onChange={(event) => setBattery(event.target.checked)} />蓄电池</label>
            <label className="toggle-chip"><input type="checkbox" checked={powerSpot} onChange={(event) => setPowerSpot(event.target.checked)} />能量点</label>
            <label className="toggle-chip"><input type="checkbox" checked={switchingOut} onChange={(event) => setSwitchingOut(event.target.checked)} />换下</label>
          </div>
        </details>
      </section>
    )
  }

  return (
    <section className="detail-card detail-page-full">
      {!standaloneCalc && <div className="detail-page-topline">
        <button className="ghost-button" onClick={onBack}>← 返回列表</button>
      </div>}

      {!standaloneCalc && <div className="detail-title-row">
        <div className="detail-title-main">
          <div className="title-with-actions">
            <h1>{pokemonDisplayName(displayPokemon)}</h1>
            {renderConfigActions('title')}
          </div>
        </div>
        <p>{displayPokemon.name} · {displayPokemon.types.map(typeLabel).join(' / ')}</p>
      </div>}

      {!standaloneCalc && <section className="plain-section">
        <button type="button" className={`section-toggle-btn${infoOpen ? ' open' : ''}`} onClick={() => setInfoOpen((v) => !v)} aria-label={infoOpen ? '收起' : '展开'} />
        <div className="section-head">
          <h2>基础信息</h2>
        </div>
        {infoOpen && (
        <div className="plain-info-list">
          <div className="info-row"><span>图鉴编号</span><strong>#{String(displayPokemon.num).padStart(4, '0')}</strong></div>
          <div className="info-row"><span>属性</span><strong>{displayPokemon.types.map(typeLabel).join(' / ')}</strong></div>
          <div className="info-row"><span>特性</span><div className="ability-list">{displayPokemon.abilities.map((ability, index) => <button key={ability.id} className={abilityId === ability.id ? 'ability-chip active' : 'ability-chip'} onClick={() => setAbilityId(ability.id)}>{ability.zh}{index < displayPokemon.abilities.length - 1 ? ' /' : ''}</button>)}</div></div>
          {(pokemon.hasMega || isCurrentMega) && <div className="info-row"><span>形态</span><div className="form-switcher" data-popover-root>{normalForm && <button type="button" className={currentFormId === normalForm.id ? 'form-chip active' : 'form-chip'} onMouseDown={(event) => event.preventDefault()} onClick={() => {
            setIsMega(false)
            if (normalForm.id !== currentFormId) onNavigateToPokemon(normalForm)
            if (megaForms.some((form) => item === megaStoneForForm(form))) {
              setItem('无')
              setItemQuery('')
            }
          }}>普通</button>}{megaForms.map((form) => <button type="button" key={form.id} className={currentFormId === form.id ? 'form-chip active' : 'form-chip'} onMouseDown={(event) => event.preventDefault()} onClick={() => {
            setIsMega(true)
            if (form.id !== currentFormId) onNavigateToPokemon(form)
            const megaStone = megaStoneForForm(form)
            if (megaStone) {
              setItem(megaStone)
              setItemQuery(itemLabel(megaStone))
            }
          }}>{form.name.toLowerCase().includes('mega-x') ? 'Mega X' : form.name.toLowerCase().includes('mega-y') ? 'Mega Y' : 'Mega'}</button>)}</div></div>}
          {(pokemon.hasMega || isCurrentMega) && <div className="info-row"><span>Mega特性</span><strong>{megaForms.find((form) => form.id === currentFormId)?.abilities[0]?.zh || megaForms[0]?.abilities[0]?.zh || displayPokemon.abilities[0]?.zh || '—'}</strong></div>}
        </div>
        )}
      </section>}

      {!standaloneCalc && <section className="plain-section">
        <button type="button" className={`section-toggle-btn${statsOpen ? ' open' : ''}`} onClick={() => setStatsOpen((v) => !v)} aria-label={statsOpen ? '收起' : '展开'} />
        <div className="section-head">
          <div className="title-with-actions">
            <h2>能力设定</h2>
            {renderConfigActions('stats')}
          </div>
        </div>
        {statsOpen && (<>
        <div className="setting-row compact-setting-row"><label>性格</label><div className="nature-picker auto-size-picker" data-popover-root><span className="sizer" aria-hidden="true">{LONGEST_NATURE_LABEL}</span><input value={mainNatureOpen ? mainNatureQuery : (ALL_NATURES.find(n => n.value === nature)?.label ?? nature)} onFocus={() => { setMainNatureOpen(true); setMainNatureQuery('') }} onBlur={() => setTimeout(() => setMainNatureOpen(false), 120)} onChange={(event) => setMainNatureQuery(event.target.value)} placeholder="性格" />{mainNatureOpen && <div className="search-dropdown nature-dropdown compact-dropdown">{filterNatures(mainNatureQuery).map(option => <button key={option.value} className="item-option-row" type="button" onMouseDown={() => { setNature(option.value as typeof nature); setMainNatureOpen(false); setMainNatureQuery('') }}><span>{option.label}</span></button>)}</div>}</div></div>
        <div className="setting-row compact-setting-row"><label>道具</label><div className="item-picker auto-size-picker" data-popover-root><span className="sizer" aria-hidden="true">{LONGEST_ITEM_LABEL}</span><input value={itemOpen ? itemQuery : (item === '无' ? '' : itemLabel(item))} onFocus={() => { setItemOpen(true); setItemQuery('') }} onChange={(event) => { setItemQuery(event.target.value); setItemOpen(true) }} placeholder="输入部分中文、拼音或英文筛选道具" />{itemOpen && <div className="search-dropdown item-dropdown compact-dropdown">{filteredItemOptions.map((option) => <button key={option.value} className="item-option-row" onMouseDown={() => { setItem(option.value); setItemQuery(option.value === '无' ? '' : option.label); setAttackerDamageItemQuery(option.value === '无' ? '' : option.label); setItemOpen(false) }}><span>{option.label}</span></button>)}</div>}</div></div>

        <div className="stats-setting-table-wrap">
          <table className="stats-setting-table">
            <thead>
              <tr><th>能力</th><th>种族值</th><th>努力值</th><th>修正</th><th>最终能力值</th></tr>
            </thead>
            <tbody>
              {statRows.map((row) => {
                const boost = row.boostKey ? boosts[row.boostKey] : 0
                const total = calculateStat(displayPokemon.baseStats[row.key], sps[row.key], getNatureMultiplier(row.key, nature), row.key === 'hp', boost)
                return (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>{displayPokemon.baseStats[row.key]}</td>
                    <td>
                      <div className="inline-slider-cell">
                        <input type="range" min={0} max={32} value={sps[row.key]} onChange={(event) => { const v = Number(event.target.value); setSps((c) => { const next = { ...c, [row.key]: v }; return Object.values(next).reduce((a, b) => a + b, 0) > 66 ? c : next }) }} />
                        <span>{sps[row.key]}</span>
                      </div>
                    </td>
                    <td>{row.boostKey ? <select className="boost-select" value={boost} onChange={(event) => setBoosts((current) => ({ ...current, [row.boostKey!]: Number(event.target.value) }))}>{BOOST_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select> : '—'}</td>
                    <td>{total}</td>
                  </tr>
                )
              })}
              <tr>
                <td>总种族值</td>
                <td>{displayPokemon.bst}</td>
                <td>—</td>
                <td>—</td>
                <td>{statRows.reduce((sum, row) => sum + calculateStat(displayPokemon.baseStats[row.key], sps[row.key], getNatureMultiplier(row.key, nature), row.key === 'hp', row.boostKey ? boosts[row.boostKey] : 0), 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="sp-summary">已分配努力值: <strong>{totalSps}</strong> / 66</div>
        </>)}
      </section>}

      {!standaloneCalc && usage && (
        <section className="plain-section usage-section">
          <button type="button" className={`section-toggle-btn${usageOpen ? ' open' : ''}`} onClick={() => setUsageOpen((v) => !v)} aria-label={usageOpen ? '收起' : '展开'} />
          <div className="usage-section-head">
            <div>
              <h2>当前使用率</h2>
              <p><a href="https://champs.pokedb.tokyo/" target="_blank" rel="noopener noreferrer">champs.pokedb.tokyo</a> · {usageDataset.date.slice(5).replace('-', ' 月 ')} 日</p>
            </div>
            <div className="usage-rank-badge">
              <span>排名</span>
              <strong>{usage.rank ? `#${usage.rank}` : '—'}</strong>
            </div>
          </div>
          {usageOpen && (
          <div className="usage-stat-grid">
            {renderUsageChips(usage.items, '道具')}
            {renderUsageChips(usage.moves, '招式', 8)}
            {renderUsageChips(usage.natures, '性格')}
            {renderUsageChips(usage.abilities, '特性')}
            {renderUsageSpreads(usage.spreads)}
            {renderUsageTeammates(usage.teammates)}
          </div>
          )}
        </section>
      )}

      {attackerDetail && defenderDetail && (
        <section className="plain-section damage-panel-section">
          <button type="button" className={`section-toggle-btn${damageOpen ? ' open' : ''}`} onClick={() => setDamageOpen((v) => !v)} aria-label={damageOpen ? '收起' : '展开'} />
          <div className="damage-panel-head">
            <div>
              <h2>伤害计算</h2>
              <p>技能与结果集中在中间面板；两侧只保留双方配置。</p>
            </div>
          </div>
          {damageOpen && (
          <div className="damage-subpanel-grid damage-three-column-grid">
            {renderBattleSide('attacker')}

            <div className="damage-center-stack">
              <section className="damage-subpanel moves-damage-subpanel">
                <div className="damage-subpanel-title"><h3>技能</h3><button type="button" className="add-move-group-button" disabled={visibleMoveCounts.attacker >= 4 && visibleMoveCounts.defender >= 4} onClick={addMoveGroup}>添加技能组</button></div>
                <div className="damage-move-columns">
                  <div className="damage-move-column">
                    <div className="damage-move-column-head"><h4>我方技能</h4></div>
                    {Array.from({ length: visibleMoveCounts.attacker }, (_, index) => renderMovePicker('attacker', index))}
                  </div>
                  <div className="damage-move-column">
                    <div className="damage-move-column-head"><h4>对方技能</h4></div>
                    {Array.from({ length: visibleMoveCounts.defender }, (_, index) => renderMovePicker('defender', index))}
                  </div>
                </div>
              </section>

              <section className="damage-subpanel field-subpanel">
                <div className="damage-subpanel-title"><h3>场地信息</h3><button type="button" className="battle-mode-toggle" onClick={() => setDamageGameType((current) => current === 'Doubles' ? 'Singles' : 'Doubles')}><span>⇄</span>{damageGameType === 'Doubles' ? '双打' : '单打'}</button></div>
                <div className="damage-config-grid">
                  <label className="popover-field" data-popover-root><span>天气</span><div className="inline-picker auto-size-picker"><span className="sizer" aria-hidden="true">{LONGEST_WEATHER_LABEL}</span><input value={weatherOpen ? weatherQuery : (WEATHER_OPTIONS.find(o => o.value === damageWeather)?.label ?? '')} onFocus={() => { setWeatherOpen(true); setWeatherQuery('') }} onBlur={() => setTimeout(() => setWeatherOpen(false), 120)} onChange={(e) => setWeatherQuery(e.target.value)} placeholder="天气" />{weatherOpen && <div className="search-dropdown inline-picker-dropdown compact-dropdown">{filterOptions(WEATHER_OPTIONS, weatherQuery).map(opt => <button key={opt.value} className="item-option-row" type="button" onMouseDown={() => { setDamageWeather(opt.value); setWeatherOpen(false); setWeatherQuery('') }}><span>{opt.label}</span></button>)}</div>}</div></label>
                  <label className="popover-field" data-popover-root><span>场地</span><div className="inline-picker auto-size-picker"><span className="sizer" aria-hidden="true">{LONGEST_TERRAIN_LABEL}</span><input value={terrainOpen ? terrainQuery : (TERRAIN_OPTIONS.find(o => o.value === damageTerrain)?.label ?? '')} onFocus={() => { setTerrainOpen(true); setTerrainQuery('') }} onBlur={() => setTimeout(() => setTerrainOpen(false), 120)} onChange={(e) => setTerrainQuery(e.target.value)} placeholder="场地" />{terrainOpen && <div className="search-dropdown inline-picker-dropdown compact-dropdown">{filterOptions(TERRAIN_OPTIONS, terrainQuery).map(opt => <button key={opt.value} className="item-option-row" type="button" onMouseDown={() => { setDamageTerrain(opt.value); setTerrainOpen(false); setTerrainQuery('') }}><span>{opt.label}</span></button>)}</div>}</div></label>
                </div>
                <details className="damage-advanced">
                  <summary>展开</summary>
                  <div className="damage-side-grid">
                    <label className="toggle-chip"><input type="checkbox" checked={isMagicRoom} onChange={(event) => setIsMagicRoom(event.target.checked)} />魔法空间</label>
                    <label className="toggle-chip"><input type="checkbox" checked={isWonderRoom} onChange={(event) => setIsWonderRoom(event.target.checked)} />奇妙空间</label>
                    <label className="toggle-chip"><input type="checkbox" checked={isGravity} onChange={(event) => setIsGravity(event.target.checked)} />重力</label>
                    <label className="toggle-chip"><input type="checkbox" checked={isBeadsOfRuin} onChange={(event) => setIsBeadsOfRuin(event.target.checked)} />灾祸之玉</label>
                    <label className="toggle-chip"><input type="checkbox" checked={isTabletsOfRuin} onChange={(event) => setIsTabletsOfRuin(event.target.checked)} />灾祸之简</label>
                    <label className="toggle-chip"><input type="checkbox" checked={isSwordOfRuin} onChange={(event) => setIsSwordOfRuin(event.target.checked)} />灾祸之剑</label>
                    <label className="toggle-chip"><input type="checkbox" checked={isVesselOfRuin} onChange={(event) => setIsVesselOfRuin(event.target.checked)} />灾祸之鼎</label>
                  </div>
                </details>
              </section>
            </div>

            {renderBattleSide('defender')}
          </div>
          )}
        </section>
      )}

      {!standaloneCalc && <section className="plain-section">
        <button type="button" className={`section-toggle-btn${movesOpen ? ' open' : ''}`} onClick={() => setMovesOpen((v) => !v)} aria-label={movesOpen ? '收起' : '展开'} />
        <div className="moves-headline">
          <div className="title-with-actions">
            <h2>招式列表</h2>
            {renderConfigActions('moves')}
          </div>
          <div className="moves-head-actions">
            <div className="floating-control" data-popover-root>
              <button className="ghost-button" onClick={() => setMoveFiltersOpen((value) => !value)}>筛选</button>
              {moveFiltersOpen && (
                <div className="popover wide-popover move-filter-popover">
                  <div className="filter-section">
                    <div className="filter-section-label">分类</div>
                    <div className="filter-chip-group">
                      <button type="button" className={categoryFilter.status ? 'filter-chip active' : 'filter-chip'} onClick={() => setCategoryFilter((f) => ({ ...f, status: !f.status }))}>变化</button>
                      <button type="button" className={categoryFilter.physical ? 'filter-chip active' : 'filter-chip'} onClick={() => setCategoryFilter((f) => ({ ...f, physical: !f.physical }))}>物理</button>
                      <button type="button" className={categoryFilter.special ? 'filter-chip active' : 'filter-chip'} onClick={() => setCategoryFilter((f) => ({ ...f, special: !f.special }))}>特殊</button>
                    </div>
                  </div>
                  <div className="filter-section">
                    <div className="filter-section-label">收藏</div>
                    <div className="filter-chip-group">
                      <button type="button" className={moveOnlyYellowFav ? 'filter-chip active' : 'filter-chip'} onClick={() => { setMoveOnlyYellowFav((v) => !v); setMoveOnlyBlueFav(false) }}>只看<span className="star-yellow">★</span></button>
                      <button type="button" className={moveOnlyBlueFav ? 'filter-chip active' : 'filter-chip'} onClick={() => { setMoveOnlyBlueFav((v) => !v); setMoveOnlyYellowFav(false) }}>只看<span className="star-blue">★</span></button>
                    </div>
                  </div>
                  <div className="filter-section">
                    <div className="filter-section-label">属性</div>
                    <div className="filter-chip-group">
                      {Object.entries(TYPE_LABELS).map(([en, zh]) => (
                        <button key={en} type="button" className={moveTypeFilters.includes(en) ? 'filter-chip active' : 'filter-chip'} onClick={() => setMoveTypeFilters((f) => f.includes(en) ? f.filter((t) => t !== en) : [...f, en])}>{zh}</button>
                      ))}
                    </div>
                  </div>
                  <div className="filter-section">
                    <div className="filter-section-label">威力 <span className="range-display">{movePowerMin} – {movePowerMax}</span></div>
                    <div className="dual-range-wrap">
                      <input type="range" className="range-min" style={{zIndex: movePowerMin >= movePowerMax - 5 ? 3 : 1}} min={0} max={250} value={movePowerMin} onChange={(e) => setMovePowerMin(Math.min(Number(e.target.value), movePowerMax))} />
                      <input type="range" className="range-max" style={{zIndex: movePowerMin >= movePowerMax - 5 ? 1 : 3}} min={0} max={250} value={movePowerMax} onChange={(e) => setMovePowerMax(Math.max(Number(e.target.value), movePowerMin))} />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="floating-control" data-popover-root>
              <button className="ghost-button" onClick={() => setFavoritePanelOpen((value) => !value)}>收藏</button>
              {favoritePanelOpen && (
                <div className="popover wide-popover">
                  {favoriteMoves.length > 0 ? favoriteMoves.map((move) => <button key={move.id} className="favorite-list-item" onClick={() => onToggleFavoriteMove(move.id)}><span>{move.zh}</span><strong>移除</strong></button>) : <div className="popover-note">当前没有已收藏招式（黄色星标）。</div>}
                </div>
              )}
            </div>
          </div>
        </div>
        {movesOpen && (
        <div className="moves-full-list">
          <table>
            <thead><tr><th><button type="button" className="table-sort-button" onClick={() => { if (moveSortKey === 'zh') setMoveSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setMoveSortKey('zh'); setMoveSortDirection('asc') } }}>名称{moveSortKey === 'zh' ? moveSortDirection === 'asc' ? ' ↑' : ' ↓' : ''}</button></th><th><button type="button" className="table-sort-button" onClick={() => { if (moveSortKey === 'type') setMoveSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setMoveSortKey('type'); setMoveSortDirection('asc') } }}>属性{moveSortKey === 'type' ? moveSortDirection === 'asc' ? ' ↑' : ' ↓' : ''}</button></th><th><button type="button" className="table-sort-button" onClick={() => { if (moveSortKey === 'category') setMoveSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setMoveSortKey('category'); setMoveSortDirection('asc') } }}>分类{moveSortKey === 'category' ? moveSortDirection === 'asc' ? ' ↑' : ' ↓' : ''}</button></th><th><button type="button" className="table-sort-button" onClick={() => { if (moveSortKey === 'basePower') setMoveSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setMoveSortKey('basePower'); setMoveSortDirection('asc') } }}>威力{moveSortKey === 'basePower' ? moveSortDirection === 'asc' ? ' ↑' : ' ↓' : ''}</button></th><th>命中</th></tr></thead>
            <tbody>
              {filteredMoves.map((move) => (
                <tr key={move.id}>
                  <td><div className="move-name-cell"><span>{move.zh}</span><div className="move-stars"><button className="star-button star-blue" title="配置收藏" onClick={() => toggleBlueFavorite(move.id)}>{blueFavoriteMoveIds.includes(move.id) ? '★' : '☆'}</button><button className="star-button star-yellow" title="全局收藏" onClick={() => onToggleFavoriteMove(move.id)}>{favoriteMoveIds.includes(move.id) ? '★' : '☆'}</button></div></div></td>
                  <td>{typeLabel(move.type)}</td>
                  <td>{categoryLabel(move.category)}</td>
                  <td>{move.basePower || '—'}</td>
                  <td>{move.accuracy === true ? '必中' : move.accuracy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>}
    </section>
  )
}
