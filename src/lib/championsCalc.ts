// @ts-expect-error vendor ESM bundle has no local declaration file
import * as calc from '../../vendor/smogon-calc/index.mjs'
import type { PokemonDetail, PokemonMove } from '../data/championsDetails'

type NatureMode = string
type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
type BoostKey = 'atk' | 'def' | 'spa' | 'spd' | 'spe'
type WeatherMode = 'none' | 'sun' | 'rain' | 'sand' | 'snow' | 'harshSunshine' | 'heavyRain' | 'strongWinds'
type TerrainMode = 'none' | 'electric' | 'grassy' | 'misty' | 'psychic'
type GameType = 'Singles' | 'Doubles'
type StatusMode = '' | 'healthy' | 'poisoned' | 'badlyPoisoned' | 'burned' | 'paralyzed' | 'asleep' | 'frozen' | 'psn' | 'tox' | 'brn' | 'par' | 'slp' | 'frz'
type GenderMode = 'M' | 'F' | 'N' | ''

type SideState = Partial<{
  spikes: 0 | 1 | 2 | 3
  steelsurge: boolean
  vinelash: boolean
  wildfire: boolean
  cannonade: boolean
  volcalith: boolean
  isSR: boolean
  isReflect: boolean
  isLightScreen: boolean
  isProtected: boolean
  isSeeded: boolean
  isSaltCured: boolean
  isForesight: boolean
  isTailwind: boolean
  isHelpingHand: boolean
  isFlowerGift: boolean
  isPowerTrick: boolean
  isSteelySpirit: boolean
  isFriendGuard: boolean
  isAuroraVeil: boolean
  isBattery: boolean
  isPowerSpot: boolean
  isSwitching: 'out'
}>

type PokemonCalcState = Partial<{
  level: number
  gender: GenderMode
  abilityOn: boolean
  currentHp: number
  status: StatusMode
  toxicCounter: number
  alliesFainted: number
  boostedStat: StatKey
  teraType: string
  isDynamaxed: boolean
  sps: Record<StatKey, number>
  nature: NatureMode
  ability: string
  item: string
  boosts: Record<BoostKey, number>
}>

type MoveCalcState = Partial<{
  name: string
  move: PokemonMove
  type: string
  category: PokemonMove['category']
  basePower: number
  isCrit: boolean
  hits: number
  timesUsed: number
  timesUsedWithMetronome: number
  isStellarFirstUse: boolean
  useZ: boolean
  useMax: boolean
}>

type ChampionsMoveData = Partial<{
  bp: number
  type: string
  category: PokemonMove['category']
  multihit: number | [number, number]
  multiaccuracy: boolean
}>

type FieldState = Partial<{
  gameType: GameType
  weather: WeatherMode
  terrain: TerrainMode
  isMagicRoom: boolean
  isWonderRoom: boolean
  isGravity: boolean
  isBeadsOfRuin: boolean
  isTabletsOfRuin: boolean
  isSwordOfRuin: boolean
  isVesselOfRuin: boolean
  attackerSide: SideState
  defenderSide: SideState
}>

function normalizeNature(mode?: NatureMode) {
  return mode || 'Hardy'
}

function convertSpsToEvs(sps?: Record<StatKey, number>) {
  const source = sps || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
  return {
    hp: source.hp,
    atk: source.atk,
    def: source.def,
    spa: source.spa,
    spd: source.spd,
    spe: source.spe,
  }
}

function convertBoosts(boosts?: Record<BoostKey, number>) {
  const source = boosts || { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
  return {
    atk: source.atk,
    def: source.def,
    spa: source.spa,
    spd: source.spd,
    spe: source.spe,
  }
}

function convertWeather(weather?: WeatherMode) {
  if (weather === 'sun') return 'Sun'
  if (weather === 'rain') return 'Rain'
  if (weather === 'sand') return 'Sand'
  if (weather === 'snow') return 'Snow'
  if (weather === 'harshSunshine') return 'Harsh Sunshine'
  if (weather === 'heavyRain') return 'Heavy Rain'
  if (weather === 'strongWinds') return 'Strong Winds'
  return undefined
}

function convertTerrain(terrain?: TerrainMode) {
  if (terrain === 'electric') return 'Electric'
  if (terrain === 'grassy') return 'Grassy'
  if (terrain === 'misty') return 'Misty'
  if (terrain === 'psychic') return 'Psychic'
  return undefined
}

function convertStatus(status?: StatusMode) {
  if (status === 'poisoned') return 'psn'
  if (status === 'badlyPoisoned') return 'tox'
  if (status === 'burned') return 'brn'
  if (status === 'paralyzed') return 'par'
  if (status === 'asleep') return 'slp'
  if (status === 'frozen') return 'frz'
  if (status === 'healthy') return ''
  return status || ''
}

function cleanItem(item?: string) {
  return item && item !== '无' ? item : undefined
}

function normalizeMoveId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function getRawChampionsMoveData(moveName?: string) {
  if (!moveName) return null
  const moveTable = calc.MOVES?.[0] as Record<string, ChampionsMoveData> | undefined
  if (!moveTable) return null
  if (moveTable[moveName]) return moveTable[moveName]
  const moveId = normalizeMoveId(moveName)
  const entry = Object.entries(moveTable).find(([name]) => normalizeMoveId(name) === moveId)
  return entry?.[1] ?? null
}

function integerRange(min: number, max: number) {
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => min + index)
}

export function getChampionsMoveHitOptions(moveName?: string) {
  const data = getRawChampionsMoveData(moveName)
  const multihit = data?.multihit
  if (Array.isArray(multihit)) {
    const [min, max] = multihit
    return integerRange(min, max)
  }
  if (typeof multihit === 'number' && data?.multiaccuracy) {
    return integerRange(1, multihit)
  }
  return []
}

export function getChampionsDefaultMoveHits(moveName?: string, ability?: string) {
  const data = getRawChampionsMoveData(moveName)
  const multihit = data?.multihit
  if (typeof multihit === 'number') return multihit
  if (Array.isArray(multihit)) {
    const [min, max] = multihit
    if (ability === 'Skill Link') return max
    return min === 1 ? max : min + 1
  }
  return 1
}

function getSpecialMoveBasePower(moveName: string, attackerState: PokemonCalcState) {
  if (moveName === 'Last Respects') {
    const alliesFainted = Math.min(5, Math.max(0, Math.floor(attackerState.alliesFainted ?? 0)))
    return 50 * (alliesFainted + 1)
  }
  return undefined
}

function convertSide(side?: SideState) {
  return new calc.Side({
    spikes: side?.spikes || 0,
    steelsurge: !!side?.steelsurge,
    vinelash: !!side?.vinelash,
    wildfire: !!side?.wildfire,
    cannonade: !!side?.cannonade,
    volcalith: !!side?.volcalith,
    isSR: !!side?.isSR,
    isReflect: !!side?.isReflect,
    isLightScreen: !!side?.isLightScreen,
    isProtected: !!side?.isProtected,
    isSeeded: !!side?.isSeeded,
    isSaltCured: !!side?.isSaltCured,
    isForesight: !!side?.isForesight,
    isTailwind: !!side?.isTailwind,
    isHelpingHand: !!side?.isHelpingHand,
    isFlowerGift: !!side?.isFlowerGift,
    isPowerTrick: !!side?.isPowerTrick,
    isSteelySpirit: !!side?.isSteelySpirit,
    isFriendGuard: !!side?.isFriendGuard,
    isAuroraVeil: !!side?.isAuroraVeil,
    isBattery: !!side?.isBattery,
    isPowerSpot: !!side?.isPowerSpot,
    isSwitching: side?.isSwitching,
  })
}

function createChampionsPokemon(detail: PokemonDetail, state: PokemonCalcState = {}) {
  return new calc.Pokemon(0, detail.name, {
    level: state.level || 50,
    ability: state.ability,
    abilityOn: state.abilityOn ?? true,
    item: cleanItem(state.item),
    gender: state.gender || undefined,
    nature: normalizeNature(state.nature),
    evs: convertSpsToEvs(state.sps),
    isDynamaxed: !!state.isDynamaxed,
    alliesFainted: state.alliesFainted,
    boostedStat: state.boostedStat,
    teraType: state.teraType,
    boosts: convertBoosts(state.boosts),
    curHP: state.currentHp,
    status: convertStatus(state.status),
    toxicCounter: state.status === 'badlyPoisoned' || state.status === 'tox' ? state.toxicCounter || 1 : 0,
    overrides: {
      baseStats: detail.baseStats,
      types: detail.types,
    },
  })
}

function createChampionsMove(moveName: string, moveState: MoveCalcState = {}, attackerState: PokemonCalcState = {}, attacker?: PokemonDetail) {
  const move = moveState.move
  const resolvedName = moveState.name || move?.en || moveName
  const basePower = moveState.basePower ?? getSpecialMoveBasePower(resolvedName, attackerState) ?? move?.basePower
  const calcMove = new calc.Move(0, resolvedName, {
    ability: attackerState.ability,
    item: cleanItem(attackerState.item),
    species: attacker?.name,
    isCrit: !!moveState.isCrit,
    hits: moveState.hits ?? getChampionsDefaultMoveHits(resolvedName, attackerState.ability),
    timesUsed: moveState.timesUsed || 1,
    timesUsedWithMetronome: moveState.timesUsedWithMetronome || 1,
    isStellarFirstUse: !!moveState.isStellarFirstUse,
    useZ: !!moveState.useZ,
    useMax: !!moveState.useMax,
    overrides: {
      basePower,
      type: moveState.type || move?.type,
      category: moveState.category || move?.category,
    },
  })
  calcMove.flags ||= {}
  const clone = calcMove.clone.bind(calcMove)
  calcMove.clone = () => {
    const cloned = clone()
    cloned.flags ||= {}
    return cloned
  }
  return calcMove
}

function createChampionsField(field: FieldState = {}) {
  return new calc.Field({
    gameType: field.gameType || 'Singles',
    terrain: convertTerrain(field.terrain),
    weather: convertWeather(field.weather),
    isMagicRoom: !!field.isMagicRoom,
    isWonderRoom: !!field.isWonderRoom,
    isGravity: !!field.isGravity,
    isBeadsOfRuin: !!field.isBeadsOfRuin,
    isTabletsOfRuin: !!field.isTabletsOfRuin,
    isSwordOfRuin: !!field.isSwordOfRuin,
    isVesselOfRuin: !!field.isVesselOfRuin,
    attackerSide: convertSide(field.attackerSide),
    defenderSide: convertSide(field.defenderSide),
  })
}

export function calculateChampionsDamage(options: {
  attacker: PokemonDetail
  defender: PokemonDetail
  moveName: string
  attackerSps?: Record<StatKey, number>
  defenderSps?: Record<StatKey, number>
  attackerNature?: NatureMode
  defenderNature?: NatureMode
  attackerAbility?: string
  defenderAbility?: string
  attackerItem?: string
  defenderItem?: string
  attackerBoosts?: Record<BoostKey, number>
  defenderBoosts?: Record<BoostKey, number>
  attackerState?: PokemonCalcState
  defenderState?: PokemonCalcState
  moveState?: MoveCalcState
  field?: FieldState
  weather?: WeatherMode
  terrain?: TerrainMode
  attackerSide?: SideState
  defenderSide?: SideState
}) {
  const attackerState: PokemonCalcState = {
    sps: options.attackerSps,
    nature: options.attackerNature,
    ability: options.attackerAbility,
    item: options.attackerItem,
    boosts: options.attackerBoosts,
    ...options.attackerState,
  }
  const defenderState: PokemonCalcState = {
    sps: options.defenderSps,
    nature: options.defenderNature,
    ability: options.defenderAbility,
    item: options.defenderItem,
    boosts: options.defenderBoosts,
    ...options.defenderState,
  }
  const fieldState: FieldState = {
    weather: options.weather,
    terrain: options.terrain,
    attackerSide: options.attackerSide,
    defenderSide: options.defenderSide,
    ...options.field,
  }

  const attacker = createChampionsPokemon(options.attacker, attackerState)
  const defender = createChampionsPokemon(options.defender, defenderState)
  const move = createChampionsMove(options.moveName, options.moveState, attackerState, options.attacker)
  const field = createChampionsField(fieldState)
  const result = calc.calculate(0, attacker, defender, move, field)

  return {
    range: result.range(),
    desc: result.desc(),
    fullDesc: result.fullDesc('%'),
    damage: result.damage,
    attacker,
    defender,
    move,
    field,
  }
}

export type { FieldState, MoveCalcState, PokemonCalcState, SideState, StatKey, BoostKey, WeatherMode, TerrainMode, StatusMode }
