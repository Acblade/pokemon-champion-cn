import pokemonDetails from '../generated/pokemon-details.json'

export type PokemonMove = {
  id: string
  en: string
  zh: string
  description?: string
  pinyin: string
  type: string
  category: 'Status' | 'Physical' | 'Special'
  basePower: number
  accuracy: number | true
}

export type PokemonDetail = {
  id: string
  num: number
  zh: string
  name: string
  pinyin: string
  initials: string
  slugVariants: string[]
  baseSpeciesName: string
  baseSpeciesId: string
  types: string[]
  tier: string
  hasMega: boolean
  abilities: { id: string; en: string; zh: string }[]
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number }
  bst: number
  searchKeys: string[]
  moves: PokemonMove[]
}

export const championsDetails = pokemonDetails as Record<string, PokemonDetail>
