import usageData from '../generated/usage-datasets.json'

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
  trainerSourceUrl?: string
  format: string
  regulation: string
  battle: string
  season: string
  rule: string
  date: string
  updatedAt: string
  count: number
  missingPokemon?: { key: string; rank: number; jpName: string }[]
  trainerRankingsAvailable?: boolean
  trainerRankingsNote?: string
  trainerRankings: TrainerRankingEntry[]
  entries: Record<string, UsageEntry>
}

export type UsageCollection = {
  source: string
  sourceUrl: string
  defaultKey: string
  updatedAt: string
  datasets: Record<string, UsageDataset>
}

export const usageCollection = usageData as unknown as UsageCollection
export const usageDataset = usageCollection.datasets[usageCollection.defaultKey] ?? Object.values(usageCollection.datasets)[0]

function normalizeId(name: string) {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '')
}

export function getPokemonUsage(...names: string[]): UsageEntry | null {
  return getPokemonUsageFromDataset(usageDataset, ...names)
}

export function getUsageDataset(season: string, battleRule = '1'): UsageDataset {
  return usageCollection.datasets[`champs-season-${season}-rule-${battleRule}`] ?? usageDataset
}

export function getLatestTrainerRankingDataset(battleRule = '1'): UsageDataset | null {
  return Object.values(usageCollection.datasets)
    .filter((dataset) =>
      dataset.rule === battleRule &&
      dataset.source === 'Battle Database Champions' &&
      dataset.trainerRankings.length > 0,
    )
    .sort((a, b) => {
      const updatedDiff = Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
      if (updatedDiff !== 0) return updatedDiff
      return Number(b.season) - Number(a.season)
    })[0] ?? null
}

export function isTrainerRankingOutdated(currentDataset: UsageDataset, trainerDataset: UsageDataset | null) {
  if (!trainerDataset) return true
  if (currentDataset.format !== trainerDataset.format) return true
  if (currentDataset.source !== 'Battle Database Champions') return true
  if (currentDataset.trainerRankingsAvailable === false) return true
  return currentDataset.trainerRankings.length === 0
}

export function getPokemonUsageFromDataset(dataset: UsageDataset, ...names: string[]): UsageEntry | null {
  for (const name of names) {
    const hit = dataset.entries[normalizeId(name)]
    if (hit) return hit
  }
  return null
}
