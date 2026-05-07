import { useEffect, useMemo, useRef, useState } from 'react'
import type { PokemonDetail, PokemonMove } from '../data/championsDetails'
import type { PokemonRow } from '../data/champions'
import { calculateChampionsDamage, type StatusMode } from '../lib/championsCalc'
import type { SavedPokemonEntry } from '../lib/savedPokemon'
import { ruleItems } from '../data/items'

type DraftConfig = {
  nature: string
  abilityId: string
  item: string
  sps: Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>
  boosts: Record<'atk' | 'def' | 'spa' | 'spd' | 'spe', number>
}

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
}

type MoveFilter = 'all' | 'status' | 'physical' | 'special' | 'favorites'
type MoveSortKey = 'category' | 'type' | 'basePower' | 'zh'
type MoveSortDirection = 'asc' | 'desc'
type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
type BoostKey = 'atk' | 'def' | 'spa' | 'spd' | 'spe'

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
  Normal: '一般', Fire: '火', Water: '水', Electric: '电', Grass: '草', Ice: '冰', Fighting: '格斗', Poison: '毒', Ground: '地面', Flying: '飞行', Psychic: '超能力', Bug: '虫', Rock: '岩石', Ghost: '幽灵', Dragon: '龙', Dark: '恶', Steel: '钢', Fairy: '妖精'
}

const BOOST_OPTIONS = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]
const DEFAULT_SPS: Record<StatKey, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
const DEFAULT_BOOTS: Record<BoostKey, number> = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
const ITEM_OPTIONS = [{ value: '无', label: '无', search: 'wu' }, ...ruleItems.map((item) => ({ value: item.en, label: item.zh, search: `${item.search} ${item.id}` }))]
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

function categoryLabel(category: PokemonMove['category']) {
  if (category === 'Status') return '变化'
  if (category === 'Physical') return '物理'
  return '特殊'
}

function typeLabel(type: string) {
  return TYPE_LABELS[type] || type
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

export function PokemonDetailPanel({ pokemon, compareTarget, formOptions, damageTargetOptions, selectedCompareId, onChangeCompareId, favoriteMoveIds, onToggleFavoriteMove, onBack, onNavigateToPokemon, draftConfig, onDraftChange, onSaveCurrent }: Props) {
  const [moveFilter, setMoveFilter] = useState<MoveFilter>('all')
  const [nature, setNature] = useState<string>('Hardy')
  const [abilityId, setAbilityId] = useState('')
  const [item, setItem] = useState('无')
  const [sps, setSps] = useState<Record<StatKey, number>>(DEFAULT_SPS)
  const [boosts, setBoosts] = useState<Record<BoostKey, number>>(DEFAULT_BOOTS)
  const [isMega, setIsMega] = useState(false)
  const [moveFiltersOpen, setMoveFiltersOpen] = useState(false)
  const [favoritePanelOpen, setFavoritePanelOpen] = useState(false)
  const [moveTypeFilter, setMoveTypeFilter] = useState('all')
  const [movePowerMin, setMovePowerMin] = useState('')
  const [movePowerMax, setMovePowerMax] = useState('')
  const [moveSortKey, setMoveSortKey] = useState<MoveSortKey>('category')
  const [moveSortDirection, setMoveSortDirection] = useState<MoveSortDirection>('asc')
  const [itemQuery, setItemQuery] = useState('')
  const [itemOpen, setItemOpen] = useState(false)
  const [damageWeather, setDamageWeather] = useState('none')
  const [damageTerrain, setDamageTerrain] = useState('none')
  const [defenderAbilityId, setDefenderAbilityId] = useState('')
  const [defenderItem, setDefenderItem] = useState('无')
  const [defenderSps, setDefenderSps] = useState<Record<StatKey, number>>(DEFAULT_SPS)
  const [defenderBoosts, setDefenderBoosts] = useState<Record<BoostKey, number>>(DEFAULT_BOOTS)
  const [damageMoveId, setDamageMoveId] = useState('')
  const [damageGameType, setDamageGameType] = useState<'Singles' | 'Doubles'>('Doubles')
  const [damageCrit, setDamageCrit] = useState(false)
  const [damageHits, setDamageHits] = useState(1)
  const [damageTimesUsed, setDamageTimesUsed] = useState(1)
  const [damageMetronomeTimes, setDamageMetronomeTimes] = useState(1)
  const [damageMovePowerOverride, setDamageMovePowerOverride] = useState('')
  const [damageMoveTypeOverride, setDamageMoveTypeOverride] = useState('')
  const [damageMoveCategoryOverride, setDamageMoveCategoryOverride] = useState('')
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

  useEffect(() => {
    if (!pokemon) return
    if (lastPokemonIdRef.current === pokemon.id) return
    lastPokemonIdRef.current = pokemon.id
    setMoveFilter('all')
    setMoveTypeFilter('all')
    setMovePowerMin('')
    setMovePowerMax('')
    setMoveSortKey('category')
    setMoveSortDirection('asc')
    const defaultMegaStone = pokemon.name.toLowerCase().includes('mega') ? megaStoneForForm(pokemon) : undefined
    const nextItem = draftConfig?.item && draftConfig.item !== '无' ? draftConfig.item : (defaultMegaStone || '无')
    setNature((draftConfig?.nature as typeof nature) || 'Hardy')
    setItem(nextItem)
    setItemQuery(itemLabel(nextItem))
    setSps(draftConfig?.sps || DEFAULT_SPS)
    setBoosts(draftConfig?.boosts || DEFAULT_BOOTS)
    setIsMega(pokemon.name.toLowerCase().includes('mega'))
    setAbilityId(draftConfig?.abilityId || pokemon.abilities[0]?.id || '')
    setDamageWeather('none')
    setDamageTerrain('none')
    setDefenderItem('无')
    setDefenderSps(DEFAULT_SPS)
    setDefenderBoosts(DEFAULT_BOOTS)
    setDamageMoveId('')
    setDamageGameType('Doubles')
    setDamageCrit(false)
    setDamageHits(1)
    setDamageTimesUsed(1)
    setDamageMetronomeTimes(1)
    setDamageMovePowerOverride('')
    setDamageMoveTypeOverride('')
    setDamageMoveCategoryOverride('')
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

  const effectiveDefenderAbilityId = compareTarget?.abilities.some((ability) => ability.id === defenderAbilityId) ? defenderAbilityId : (compareTarget?.abilities[0]?.id || '')

  const totalSps = Object.values(sps).reduce((sum, value) => sum + value, 0)
  const favoriteMoves = useMemo(() => pokemon?.moves.filter((move) => favoriteMoveIds.includes(move.id)) ?? [], [pokemon, favoriteMoveIds])

  useEffect(() => {
    const close = () => {
      setItemOpen(false)
      setMoveFiltersOpen(false)
      setFavoritePanelOpen(false)
    }
    window.addEventListener('pokemon-ui-close-popovers', close as EventListener)
    return () => window.removeEventListener('pokemon-ui-close-popovers', close as EventListener)
  }, [])

  const filteredItemOptions = useMemo(() => {
    const q = itemQuery.trim().toLowerCase()
    if (!q) return ITEM_OPTIONS.filter((option) => option.value !== '无')
    return ITEM_OPTIONS.filter((option) => `${option.label} ${option.value} ${option.search}`.toLowerCase().includes(q)).slice(0, 20)
  }, [itemQuery])

  const filteredMoves = useMemo(() => {
    if (!pokemon) return []
    const categoryOrder: Record<PokemonMove['category'], number> = { Status: 0, Physical: 1, Special: 2 }
    return pokemon.moves
      .filter((move) => {
        const matchesPrimaryFilter = moveFilter === 'favorites'
          ? favoriteMoveIds.includes(move.id)
          : moveFilter === 'all'
            ? true
            : moveFilter === 'status'
              ? move.category === 'Status'
              : moveFilter === 'physical'
                ? move.category === 'Physical'
                : move.category === 'Special'
        const matchesType = moveTypeFilter === 'all' || move.type === moveTypeFilter
        const power = move.basePower || 0
        const matchesMin = !movePowerMin || power >= Number(movePowerMin)
        const matchesMax = !movePowerMax || power <= Number(movePowerMax)
        return matchesPrimaryFilter && matchesType && matchesMin && matchesMax
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
  }, [pokemon, moveFilter, favoriteMoveIds, moveTypeFilter, movePowerMin, movePowerMax, moveSortKey, moveSortDirection])

  useEffect(() => {
    onDraftChange({ nature, abilityId, item, sps, boosts })
  }, [nature, abilityId, item, sps, boosts, onDraftChange])

  const selectedDamageMove = useMemo(() => {
    if (!pokemon) return null
    return pokemon.moves.find((move) => move.id === damageMoveId) || filteredMoves.find((move) => move.category !== 'Status') || pokemon.moves.find((move) => move.category !== 'Status') || null
  }, [pokemon, damageMoveId, filteredMoves])

  const previewDamage = useMemo(() => {
    if (!pokemon || !compareTarget) return null
    if (!selectedDamageMove) return null
    const attackerMaxHp = calculateStat(pokemon.baseStats.hp, sps.hp, 1, true)
    const defenderMaxHp = calculateStat(compareTarget.baseStats.hp, defenderSps.hp, 1, true)
    try {
      return calculateChampionsDamage({
        attacker: pokemon,
        defender: compareTarget,
        moveName: selectedDamageMove.en,
        moveState: {
          move: selectedDamageMove,
          isCrit: damageCrit,
          hits: damageHits,
          timesUsed: damageTimesUsed,
          timesUsedWithMetronome: damageMetronomeTimes,
          basePower: damageMovePowerOverride ? Number(damageMovePowerOverride) : undefined,
          type: damageMoveTypeOverride || undefined,
          category: damageMoveCategoryOverride as PokemonMove['category'] || undefined,
        },
        attackerSps: sps,
        defenderSps,
        attackerNature: nature,
        defenderNature,
        attackerAbility: pokemon.abilities.find((entry) => entry.id === abilityId)?.en || pokemon.abilities[0]?.en,
        attackerItem: item,
        attackerBoosts: boosts,
        attackerState: { abilityOn: attackerAbilityOn, status: attackerStatus, toxicCounter: attackerToxicCounter, currentHp: Math.max(1, Math.round(attackerMaxHp * attackerHpPercent / 100)) },
        defenderAbility: compareTarget.abilities.find((entry) => entry.id === effectiveDefenderAbilityId)?.en || compareTarget.abilities[0]?.en,
        defenderItem,
        defenderBoosts,
        defenderState: { abilityOn: defenderAbilityOn, status: defenderStatus, toxicCounter: defenderToxicCounter, currentHp: Math.max(1, Math.round(defenderMaxHp * defenderHpPercent / 100)) },
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
          attackerSide: { spikes: attackerSpikes, isSR: attackerStealthRock, isReflect: attackerReflect, isLightScreen: attackerLightScreen, isAuroraVeil: attackerAuroraVeil, isTailwind: attackerTailwind, isHelpingHand: attackerHelpingHand, isProtected: attackerProtected, isSeeded: attackerSeeded, isSaltCured: attackerSaltCured, isForesight: attackerForesight, isFlowerGift: attackerFlowerGift, isPowerTrick: attackerPowerTrick, isSteelySpirit: attackerSteelySpirit, isFriendGuard: attackerFriendGuard, isBattery: attackerBattery, isPowerSpot: attackerPowerSpot, isSwitching: attackerSwitchingOut ? 'out' : undefined },
          defenderSide: { spikes: defenderSpikes, isSR: defenderStealthRock, isReflect: defenderReflect, isLightScreen: defenderLightScreen, isAuroraVeil: defenderAuroraVeil, isTailwind: defenderTailwind, isHelpingHand: defenderHelpingHand, isProtected: defenderProtected, isSeeded: defenderSeeded, isSaltCured: defenderSaltCured, isForesight: defenderForesight, isFlowerGift: defenderFlowerGift, isPowerTrick: defenderPowerTrick, isSteelySpirit: defenderSteelySpirit, isFriendGuard: defenderFriendGuard, isBattery: defenderBattery, isPowerSpot: defenderPowerSpot, isSwitching: defenderSwitchingOut ? 'out' : undefined },
        },
      })
    } catch {
      return null
    }
  }, [pokemon, compareTarget, selectedDamageMove, sps, defenderSps, nature, abilityId, item, boosts, damageCrit, damageHits, damageTimesUsed, damageMetronomeTimes, damageMovePowerOverride, damageMoveTypeOverride, damageMoveCategoryOverride, attackerAbilityOn, attackerStatus, attackerToxicCounter, attackerHpPercent, effectiveDefenderAbilityId, defenderItem, defenderBoosts, defenderAbilityOn, defenderNature, defenderStatus, defenderToxicCounter, defenderHpPercent, damageGameType, damageWeather, damageTerrain, isMagicRoom, isWonderRoom, isGravity, isBeadsOfRuin, isTabletsOfRuin, isSwordOfRuin, isVesselOfRuin, attackerSpikes, attackerStealthRock, attackerReflect, attackerLightScreen, attackerAuroraVeil, attackerTailwind, attackerHelpingHand, attackerProtected, attackerSeeded, attackerSaltCured, attackerForesight, attackerFlowerGift, attackerPowerTrick, attackerSteelySpirit, attackerFriendGuard, attackerBattery, attackerPowerSpot, attackerSwitchingOut, defenderSpikes, defenderStealthRock, defenderReflect, defenderLightScreen, defenderAuroraVeil, defenderTailwind, defenderHelpingHand, defenderProtected, defenderSeeded, defenderSaltCured, defenderForesight, defenderFlowerGift, defenderPowerTrick, defenderSteelySpirit, defenderFriendGuard, defenderBattery, defenderPowerSpot, defenderSwitchingOut])

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

  return (
    <section className="detail-card detail-page-full">
      <div className="detail-page-topline">
        <button className="ghost-button" onClick={onBack}>← 返回列表</button>
      </div>

      <div className="detail-title-row">
        <div className="detail-title-main">
          <h1>{displayPokemon.zh}</h1>
          <button className="icon-button" title="保存当前宝可梦配置" onClick={() => onSaveCurrent({ isMega, abilityId, item, nature, sps, boosts })}>＋</button>
        </div>
        <p>{displayPokemon.name} · {displayPokemon.types.map(typeLabel).join(' / ')}</p>
      </div>

      <section className="plain-section">
        <h2>基础信息</h2>
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
      </section>

      <section className="plain-section">
        <h2>能力设定</h2>
        <div className="setting-row compact-setting-row"><label>性格</label><select value={nature} onChange={(event) => setNature(event.target.value as typeof nature)}>{ALL_NATURES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
        <div className="setting-row compact-setting-row"><label>道具</label><div className="item-picker" data-popover-root><input value={itemQuery} onFocus={() => setItemOpen(true)} onChange={(event) => { setItemQuery(event.target.value); setItemOpen(true) }} placeholder="输入部分中文、拼音或英文筛选道具" />{itemOpen && <div className="search-dropdown item-dropdown compact-dropdown">{filteredItemOptions.map((option) => <button key={option.value} className="item-option-row" onMouseDown={() => { setItem(option.value); setItemQuery(option.label); setItemOpen(false) }}><span>{option.label}</span><small>{option.value}</small></button>)}</div>}</div></div>

        <div className="stats-setting-table-wrap">
          <table className="stats-setting-table">
            <thead>
              <tr><th>能力</th><th>种族值</th><th>SP</th><th>修正</th><th>最终能力值</th></tr>
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
                        <input type="range" min={0} max={32} value={sps[row.key]} onChange={(event) => {
                          const nextValue = Number(event.target.value)
                          setSps((current) => {
                            const next = { ...current, [row.key]: nextValue }
                            const sum = Object.values(next).reduce((acc, value) => acc + value, 0)
                            return sum > 66 ? current : next
                          })
                        }} />
                        <span>{sps[row.key]}</span>
                      </div>
                    </td>
                    <td>{row.boostKey ? <select value={boost} onChange={(event) => setBoosts((current) => ({ ...current, [row.boostKey!]: Number(event.target.value) }))}>{BOOST_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select> : '—'}</td>
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
        <div className="sp-summary">已分配 SPs: <strong>{totalSps}</strong> / 66</div>
      </section>

      {compareTarget && (
        <section className="plain-section damage-panel-section">
          <div className="damage-panel-head">
            <div>
              <h2>伤害计算</h2>
              <p>分为我方、对方、场地三组；常用项直接显示，高级项折叠。</p>
            </div>
            {previewDamage && <div className="damage-preview-box compact-damage-result"><strong>{previewDamage.range[0]} - {previewDamage.range[1]}</strong><small>{previewDamage.desc}</small></div>}
          </div>

          <div className="damage-subpanel-grid">
            <section className="damage-subpanel">
              <div className="damage-subpanel-title"><h3>我方</h3><span>{displayPokemon.zh}</span></div>
              <div className="damage-config-grid">
                <label className="popover-field"><span>计算招式</span><select value={damageMoveId} onChange={(event) => setDamageMoveId(event.target.value)}><option value="">自动选择首个攻击招式</option>{pokemon.moves.map((move) => <option key={move.id} value={move.id}>{move.zh} / {move.en}</option>)}</select></label>
                <label className="popover-field"><span>性格</span><select value={nature} onChange={(event) => setNature(event.target.value)}>{ALL_NATURES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="popover-field"><span>特性</span><select value={abilityId} onChange={(event) => setAbilityId(event.target.value)}>{displayPokemon.abilities.map((ability) => <option key={ability.id} value={ability.id}>{ability.zh}</option>)}</select></label>
                <label className="popover-field"><span>道具</span><select value={item} onChange={(event) => { setItem(event.target.value); setItemQuery(itemLabel(event.target.value)) }}>{ITEM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="popover-field"><span>状态</span><select value={attackerStatus} onChange={(event) => setAttackerStatus(event.target.value as StatusMode)}><option value="healthy">健康</option><option value="poisoned">中毒</option><option value="badlyPoisoned">剧毒</option><option value="burned">烧伤</option><option value="paralyzed">麻痹</option><option value="asleep">睡眠</option><option value="frozen">冰冻</option></select></label>
                <label className="popover-field"><span>当前 HP%</span><input type="number" min={1} max={100} value={attackerHpPercent} onChange={(event) => setAttackerHpPercent(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /></label>
              </div>
              <div className="damage-stats-table-wrap">
                <table className="stats-setting-table damage-stats-table">
                  <thead><tr><th>能力</th><th>种族值</th><th>SP</th><th>修正</th><th>最终</th></tr></thead>
                  <tbody>
                    {statRows.map((row) => {
                      const boost = row.boostKey ? boosts[row.boostKey] : 0
                      const total = calculateStat(displayPokemon.baseStats[row.key], sps[row.key], getNatureMultiplier(row.key, nature), row.key === 'hp', boost)
                      return (
                        <tr key={`atk-stat-${row.key}`}>
                          <td>{row.label}</td>
                          <td>{displayPokemon.baseStats[row.key]}</td>
                          <td><div className="inline-slider-cell"><input type="range" min={0} max={32} value={sps[row.key]} onChange={(event) => {
                            const nextValue = Number(event.target.value)
                            setSps((current) => {
                              const next = { ...current, [row.key]: nextValue }
                              const sum = Object.values(next).reduce((acc, value) => acc + value, 0)
                              return sum > 66 ? current : next
                            })
                          }} /><span>{sps[row.key]}</span></div></td>
                          <td>{row.boostKey ? <select value={boost} onChange={(event) => setBoosts((current) => ({ ...current, [row.boostKey!]: Number(event.target.value) }))}>{BOOST_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select> : '—'}</td>
                          <td>{total}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="sp-summary compact-sp-summary">已分配 SPs: <strong>{totalSps}</strong> / 66</div>
              </div>
              <div className="damage-side-grid compact-side-grid">
                <label className="toggle-chip"><input type="checkbox" checked={attackerStealthRock} onChange={(event) => setAttackerStealthRock(event.target.checked)} />隐形岩</label>
                <label className="popover-field"><span>撒菱</span><select value={attackerSpikes} onChange={(event) => setAttackerSpikes(Number(event.target.value) as 0 | 1 | 2 | 3)}><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
              </div>
              <details className="damage-advanced">
                <summary>展开我方高级项</summary>
                <div className="damage-config-grid">
                  {attackerStatus === 'badlyPoisoned' && <label className="popover-field"><span>剧毒回合</span><select value={attackerToxicCounter} onChange={(event) => setAttackerToxicCounter(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((value) => <option key={value} value={value}>{value}/16</option>)}</select></label>}
                  <label className="popover-field"><span>命中次数</span><select value={damageHits} onChange={(event) => setDamageHits(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label className="popover-field"><span>连续使用</span><select value={damageTimesUsed} onChange={(event) => setDamageTimesUsed(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label className="popover-field"><span>节拍器次数</span><select value={damageMetronomeTimes} onChange={(event) => setDamageMetronomeTimes(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label className="popover-field"><span>覆盖威力</span><input type="number" min={0} value={damageMovePowerOverride} onChange={(event) => setDamageMovePowerOverride(event.target.value)} placeholder={selectedDamageMove?.basePower ? String(selectedDamageMove.basePower) : '默认'} /></label>
                  <label className="popover-field"><span>覆盖属性</span><select value={damageMoveTypeOverride} onChange={(event) => setDamageMoveTypeOverride(event.target.value)}><option value="">默认</option>{Object.keys(TYPE_LABELS).map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}</select></label>
                  <label className="popover-field"><span>覆盖分类</span><select value={damageMoveCategoryOverride} onChange={(event) => setDamageMoveCategoryOverride(event.target.value)}><option value="">默认</option><option value="Physical">物理</option><option value="Special">特殊</option><option value="Status">变化</option></select></label>
                </div>
                <div className="damage-side-grid">
                  <label className="toggle-chip"><input type="checkbox" checked={damageCrit} onChange={(event) => setDamageCrit(event.target.checked)} />CT / 暴击</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerAbilityOn} onChange={(event) => setAttackerAbilityOn(event.target.checked)} />特性生效</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerReflect} onChange={(event) => setAttackerReflect(event.target.checked)} />反射壁</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerLightScreen} onChange={(event) => setAttackerLightScreen(event.target.checked)} />光墙</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerAuroraVeil} onChange={(event) => setAttackerAuroraVeil(event.target.checked)} />极光幕</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerHelpingHand} onChange={(event) => setAttackerHelpingHand(event.target.checked)} />帮助</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerProtected} onChange={(event) => setAttackerProtected(event.target.checked)} />守住</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerTailwind} onChange={(event) => setAttackerTailwind(event.target.checked)} />顺风</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerSeeded} onChange={(event) => setAttackerSeeded(event.target.checked)} />寄生种子</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerSaltCured} onChange={(event) => setAttackerSaltCured(event.target.checked)} />盐腌</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerForesight} onChange={(event) => setAttackerForesight(event.target.checked)} />识破</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerFlowerGift} onChange={(event) => setAttackerFlowerGift(event.target.checked)} />花之礼</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerPowerTrick} onChange={(event) => setAttackerPowerTrick(event.target.checked)} />力量戏法</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerSteelySpirit} onChange={(event) => setAttackerSteelySpirit(event.target.checked)} />钢之意志</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerFriendGuard} onChange={(event) => setAttackerFriendGuard(event.target.checked)} />友情防守</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerBattery} onChange={(event) => setAttackerBattery(event.target.checked)} />蓄电池</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerPowerSpot} onChange={(event) => setAttackerPowerSpot(event.target.checked)} />能量点</label>
                  <label className="toggle-chip"><input type="checkbox" checked={attackerSwitchingOut} onChange={(event) => setAttackerSwitchingOut(event.target.checked)} />换下</label>
                </div>
              </details>
            </section>

            <section className="damage-subpanel">
              <div className="damage-subpanel-title"><h3>对方</h3><span>{compareTarget.zh}</span></div>
              <div className="damage-config-grid">
                <label className="popover-field"><span>目标宝可梦</span><select value={selectedCompareId} onChange={(event) => onChangeCompareId(event.target.value)}>{damageTargetOptions.map((target) => <option key={target.id} value={target.id}>{target.zh}</option>)}</select></label>
                <label className="popover-field"><span>特性</span><select value={effectiveDefenderAbilityId} onChange={(event) => setDefenderAbilityId(event.target.value)}>{compareTarget.abilities.map((ability) => <option key={ability.id} value={ability.id}>{ability.zh}</option>)}</select></label>
                <label className="popover-field"><span>性格</span><select value={defenderNature} onChange={(event) => setDefenderNature(event.target.value)}>{ALL_NATURES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="popover-field"><span>道具</span><select value={defenderItem} onChange={(event) => setDefenderItem(event.target.value)}>{ITEM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="popover-field"><span>状态</span><select value={defenderStatus} onChange={(event) => setDefenderStatus(event.target.value as StatusMode)}><option value="healthy">健康</option><option value="poisoned">中毒</option><option value="badlyPoisoned">剧毒</option><option value="burned">烧伤</option><option value="paralyzed">麻痹</option><option value="asleep">睡眠</option><option value="frozen">冰冻</option></select></label>
                <label className="popover-field"><span>当前 HP%</span><input type="number" min={1} max={100} value={defenderHpPercent} onChange={(event) => setDefenderHpPercent(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /></label>
              </div>
              <div className="damage-stats-table-wrap">
                <table className="stats-setting-table damage-stats-table">
                  <thead><tr><th>能力</th><th>种族值</th><th>SP</th><th>修正</th><th>最终</th></tr></thead>
                  <tbody>
                    {statRows.map((row) => {
                      const boost = row.boostKey ? defenderBoosts[row.boostKey] : 0
                      const total = calculateStat(compareTarget.baseStats[row.key], defenderSps[row.key], getNatureMultiplier(row.key, defenderNature), row.key === 'hp', boost)
                      return (
                        <tr key={`def-stat-${row.key}`}>
                          <td>{row.label}</td>
                          <td>{compareTarget.baseStats[row.key]}</td>
                          <td><div className="inline-slider-cell"><input type="range" min={0} max={32} value={defenderSps[row.key]} onChange={(event) => {
                            const nextValue = Number(event.target.value)
                            setDefenderSps((current) => {
                              const next = { ...current, [row.key]: nextValue }
                              const sum = Object.values(next).reduce((acc, value) => acc + value, 0)
                              return sum > 66 ? current : next
                            })
                          }} /><span>{defenderSps[row.key]}</span></div></td>
                          <td>{row.boostKey ? <select value={boost} onChange={(event) => setDefenderBoosts((current) => ({ ...current, [row.boostKey!]: Number(event.target.value) }))}>{BOOST_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select> : '—'}</td>
                          <td>{total}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="sp-summary compact-sp-summary">已分配 SPs: <strong>{Object.values(defenderSps).reduce((sum, value) => sum + value, 0)}</strong> / 66</div>
              </div>
              <div className="damage-side-grid compact-side-grid">
                <label className="toggle-chip"><input type="checkbox" checked={defenderStealthRock} onChange={(event) => setDefenderStealthRock(event.target.checked)} />隐形岩</label>
                <label className="popover-field"><span>撒菱</span><select value={defenderSpikes} onChange={(event) => setDefenderSpikes(Number(event.target.value) as 0 | 1 | 2 | 3)}><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
              </div>
              <details className="damage-advanced">
                <summary>展开对方高级项</summary>
                <div className="damage-boost-grid compact-stat-grid">
                  {defenderStatus === 'badlyPoisoned' && <label className="popover-field"><span>剧毒回合</span><select value={defenderToxicCounter} onChange={(event) => setDefenderToxicCounter(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((value) => <option key={value} value={value}>{value}/16</option>)}</select></label>}
                </div>
                <div className="damage-side-grid">
                  <label className="toggle-chip"><input type="checkbox" checked={defenderAbilityOn} onChange={(event) => setDefenderAbilityOn(event.target.checked)} />特性生效</label>
                  <label className="toggle-chip"><input type="checkbox" checked={defenderReflect} onChange={(event) => setDefenderReflect(event.target.checked)} />反射壁</label>
                  <label className="toggle-chip"><input type="checkbox" checked={defenderLightScreen} onChange={(event) => setDefenderLightScreen(event.target.checked)} />光墙</label>
                  <label className="toggle-chip"><input type="checkbox" checked={defenderAuroraVeil} onChange={(event) => setDefenderAuroraVeil(event.target.checked)} />极光幕</label>
                  <label className="toggle-chip"><input type="checkbox" checked={defenderHelpingHand} onChange={(event) => setDefenderHelpingHand(event.target.checked)} />帮助</label>
                  <label className="toggle-chip"><input type="checkbox" checked={defenderProtected} onChange={(event) => setDefenderProtected(event.target.checked)} />守住</label>
                  <label className="toggle-chip"><input type="checkbox" checked={defenderTailwind} onChange={(event) => setDefenderTailwind(event.target.checked)} />顺风</label>
                  <label className="toggle-chip"><input type="checkbox" checked={defenderSeeded} onChange={(event) => setDefenderSeeded(event.target.checked)} />寄生种子</label>
                  <label className="toggle-chip"><input type="checkbox" checked={defenderSaltCured} onChange={(event) => setDefenderSaltCured(event.target.checked)} />盐腌</label>
                  <label className="toggle-chip"><input type="checkbox" checked={defenderForesight} onChange={(event) => setDefenderForesight(event.target.checked)} />识破</label>
                  <label className="toggle-chip"><input type="checkbox" checked={defenderFlowerGift} onChange={(event) => setDefenderFlowerGift(event.target.checked)} />花之礼</label>
                  <label className="toggle-chip"><input type="checkbox" checked={defenderPowerTrick} onChange={(event) => setDefenderPowerTrick(event.target.checked)} />力量戏法</label>
                  <label className="toggle-chip"><input type="checkbox" checked={defenderSteelySpirit} onChange={(event) => setDefenderSteelySpirit(event.target.checked)} />钢之意志</label>
                  <label className="toggle-chip"><input type="checkbox" checked={defenderFriendGuard} onChange={(event) => setDefenderFriendGuard(event.target.checked)} />友情防守</label>
                  <label className="toggle-chip"><input type="checkbox" checked={defenderBattery} onChange={(event) => setDefenderBattery(event.target.checked)} />蓄电池</label>
                  <label className="toggle-chip"><input type="checkbox" checked={defenderPowerSpot} onChange={(event) => setDefenderPowerSpot(event.target.checked)} />能量点</label>
                  <label className="toggle-chip"><input type="checkbox" checked={defenderSwitchingOut} onChange={(event) => setDefenderSwitchingOut(event.target.checked)} />换下</label>
                </div>
              </details>
            </section>

            <section className="damage-subpanel field-subpanel">
              <div className="damage-subpanel-title"><h3>场地信息</h3><select className="battle-mode-toggle" value={damageGameType} onChange={(event) => setDamageGameType(event.target.value as 'Singles' | 'Doubles')}><option value="Singles">单打</option><option value="Doubles">双打</option></select></div>
              <div className="damage-config-grid">
                <label className="popover-field"><span>天气</span><select value={damageWeather} onChange={(event) => setDamageWeather(event.target.value)}><option value="none">无</option><option value="sun">晴天</option><option value="rain">下雨</option><option value="sand">沙暴</option><option value="snow">雪景</option></select></label>
                <label className="popover-field"><span>场地</span><select value={damageTerrain} onChange={(event) => setDamageTerrain(event.target.value)}><option value="none">无</option><option value="electric">电气场地</option><option value="grassy">青草场地</option><option value="misty">薄雾场地</option><option value="psychic">精神场地</option></select></label>
              </div>
              <details className="damage-advanced">
                <summary>展开场地高级项</summary>
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
        </section>
      )}

      <section className="plain-section">
        <div className="moves-headline">
          <h2>招式列表</h2>
          <div className="moves-head-actions">
            <div className="floating-control" data-popover-root>
              <button className="ghost-button" onClick={() => setMoveFiltersOpen((value) => !value)}>筛选</button>
              {moveFiltersOpen && (
                <div className="popover">
                  <button onClick={() => setMoveFilter('all')}>全部</button>
                  <button onClick={() => setMoveFilter('status')}>只看变化</button>
                  <button onClick={() => setMoveFilter('physical')}>只看物理</button>
                  <button onClick={() => setMoveFilter('special')}>只看特殊</button>
                  <button onClick={() => setMoveFilter('favorites')}>只看收藏</button>
                  <label className="popover-field"><span>属性</span><select value={moveTypeFilter} onChange={(event) => setMoveTypeFilter(event.target.value)}><option value="all">全部</option>{Object.keys(TYPE_LABELS).map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}</select></label>
                  <label className="popover-field"><span>威力下限</span><input value={movePowerMin} onChange={(event) => setMovePowerMin(event.target.value)} /></label>
                  <label className="popover-field"><span>威力上限</span><input value={movePowerMax} onChange={(event) => setMovePowerMax(event.target.value)} /></label>
                </div>
              )}
            </div>
            <div className="floating-control" data-popover-root>
              <button className="ghost-button" onClick={() => setFavoritePanelOpen((value) => !value)}>{favoritePanelOpen ? '收藏夹' : '收藏'}</button>
              {favoritePanelOpen && (
                <div className="popover wide-popover">
                  <button onClick={() => setFavoritePanelOpen(false)}>恢复为收藏按钮</button>
                  {favoriteMoves.length > 0 ? favoriteMoves.map((move) => <button key={move.id} className="favorite-list-item" onClick={() => onToggleFavoriteMove(move.id)}><span>{move.zh}</span><strong>移除</strong></button>) : <div className="popover-note">当前没有已收藏招式。</div>}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="moves-full-list">
          <table>
            <thead><tr><th><button type="button" className="table-sort-button" onClick={() => { if (moveSortKey === 'zh') setMoveSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setMoveSortKey('zh'); setMoveSortDirection('asc') } }}>名称{moveSortKey === 'zh' ? moveSortDirection === 'asc' ? ' ↑' : ' ↓' : ''}</button></th><th><button type="button" className="table-sort-button" onClick={() => { if (moveSortKey === 'type') setMoveSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setMoveSortKey('type'); setMoveSortDirection('asc') } }}>属性{moveSortKey === 'type' ? moveSortDirection === 'asc' ? ' ↑' : ' ↓' : ''}</button></th><th><button type="button" className="table-sort-button" onClick={() => { if (moveSortKey === 'category') setMoveSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setMoveSortKey('category'); setMoveSortDirection('asc') } }}>分类{moveSortKey === 'category' ? moveSortDirection === 'asc' ? ' ↑' : ' ↓' : ''}</button></th><th><button type="button" className="table-sort-button" onClick={() => { if (moveSortKey === 'basePower') setMoveSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setMoveSortKey('basePower'); setMoveSortDirection('asc') } }}>威力{moveSortKey === 'basePower' ? moveSortDirection === 'asc' ? ' ↑' : ' ↓' : ''}</button></th><th>命中</th></tr></thead>
            <tbody>
              {filteredMoves.map((move) => (
                <tr key={move.id}>
                  <td><div className="move-name-cell"><span>{move.zh}</span><button className="star-button" onClick={() => onToggleFavoriteMove(move.id)}>{favoriteMoveIds.includes(move.id) ? '★' : '☆'}</button></div></td>
                  <td>{typeLabel(move.type)}</td>
                  <td>{categoryLabel(move.category)}</td>
                  <td>{move.basePower || '—'}</td>
                  <td>{move.accuracy === true ? '必中' : move.accuracy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
