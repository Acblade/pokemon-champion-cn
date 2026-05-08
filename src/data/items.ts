import items from '../generated/items.json'

export type ItemOption = {
  id: string
  en: string
  zh: string
  search: string
  note?: string
  group?: number
  isMegaStone?: boolean
}

export const ruleItems = items as ItemOption[]
