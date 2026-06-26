import teamShareData from '../generated/team-shares.json'

export type TeamShareMember = {
  pokemonId: string
  pokemonName: string
  item: string
  ability: string
  nature: string
  spread: string
  moves: string[]
  note?: string
}

export type TeamShareSource = {
  name: string
  season?: string
  url: string
  homeUrl?: string
  note: string
  updatedAt: string
  count?: number
}

export type TeamShare = {
  id: string
  title: string
  author: string
  owner?: string
  teamId: string
  source: string
  sourceGroup?: string
  sourceUrl: string
  platformUrl: string
  season: string
  format: string
  updatedAt: string
  eventDate?: string
  eventName?: string
  eventType?: string
  region?: string
  category?: string
  placement?: number
  ranking?: number
  record?: string
  wins?: number
  losses?: number
  archetypes?: string[]
  detailLevel?: 'full' | 'sets' | 'members'
  tags: string[]
  summary: string
  members: TeamShareMember[]
  metrics?: {
    likes?: number
    comments?: number
    finalRanking?: string
  }
}

type TeamShareData = {
  updatedAt: string
  sources: TeamShareSource[]
  teams: TeamShare[]
}

const data = teamShareData as TeamShareData

export const teamSharesUpdatedAt = data.updatedAt
export const teamShareSources = data.sources
export const teamShares = data.teams
