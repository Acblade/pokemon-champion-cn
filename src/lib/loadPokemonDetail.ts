import { championsDetails } from '../data/championsDetails'

export async function loadPokemonDetail(id: string) {
  return championsDetails[id] ?? null
}
