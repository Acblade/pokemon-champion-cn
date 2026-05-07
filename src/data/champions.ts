import pokemonIndex from '../generated/pokemon-index.json'

export type PokemonRow = {
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
}

export const championsPokemon = pokemonIndex as PokemonRow[]
