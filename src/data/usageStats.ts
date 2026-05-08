import usageData from '../generated/pikalytics-usage.json'

export type UsageItem = { zh: string; en: string; percent: number }
export type UsageSpread = { nature: string; spread: string; percent: number }
export type UsageTeammate = { zh: string; en: string; key: string }

export type UsageEntry = {
  id: string
  name: string
  zh: string
  rank: number
  items: UsageItem[]
  moves: UsageItem[]
  abilities: UsageItem[]
  natures: UsageItem[]
  spreads: UsageSpread[]
  teammates: UsageTeammate[]
}

export type TrainerRankingEntry = {
  rank: number
  rating: number | null
  name: string
}

export type UsageDataset = {
  source: string
  sourceUrl: string
  format: string
  season: string
  rule: string
  date: string
  updatedAt: string
  count: number
  trainerRankings: TrainerRankingEntry[]
  entries: Record<string, UsageEntry>
}

export const usageDataset = usageData as unknown as UsageDataset

function normalizeId(name: string) {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '')
}

export function getPokemonUsage(...names: string[]): UsageEntry | null {
  for (const name of names) {
    const hit = usageDataset.entries[normalizeId(name)]
    if (hit) return hit
  }
  return null
}
