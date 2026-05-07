export type SavedPokemonEntry = {
  id: string
  baseId: string
  label: string
  customName?: string
  groupNames?: string[]
  pokemonId: string
  isMega: boolean
  abilityId: string
  item: string
  nature: string
  sps: Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>
  boosts: Record<'atk' | 'def' | 'spa' | 'spd' | 'spe', number>
}

const STORAGE_KEY = 'pokemon-champion-cn:saved-pokemon'

export function loadSavedPokemon(): SavedPokemonEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.map((entry) => ({
          ...entry,
          groupNames: Array.isArray(entry.groupNames)
            ? entry.groupNames
            : entry.groupName
              ? [entry.groupName]
              : [],
        }))
      : []
  } catch {
    return []
  }
}

export function saveSavedPokemon(entries: SavedPokemonEntry[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}
