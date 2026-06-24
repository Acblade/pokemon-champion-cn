export const TYPE_ORDER = [
  'Normal',
  'Fighting',
  'Flying',
  'Poison',
  'Ground',
  'Rock',
  'Bug',
  'Ghost',
  'Steel',
  'Fire',
  'Water',
  'Grass',
  'Electric',
  'Psychic',
  'Ice',
  'Dragon',
  'Dark',
  'Fairy',
] as const

export const TYPE_LABELS: Record<string, string> = {
  Normal: '一般',
  Fire: '火',
  Water: '水',
  Electric: '电',
  Grass: '草',
  Ice: '冰',
  Fighting: '格斗',
  Poison: '毒',
  Ground: '地面',
  Flying: '飞行',
  Psychic: '超能',
  Bug: '虫',
  Rock: '岩石',
  Ghost: '幽灵',
  Dragon: '龙',
  Dark: '恶',
  Steel: '钢',
  Fairy: '妖精',
}

const TYPE_EFFECTIVENESS: Record<string, Partial<Record<string, number>>> = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fighting: { Normal: 2, Flying: 0.5, Poison: 0.5, Rock: 2, Bug: 0.5, Ghost: 0, Steel: 2, Psychic: 0.5, Ice: 2, Dark: 2, Fairy: 0.5 },
  Flying: { Fighting: 2, Rock: 0.5, Bug: 2, Steel: 0.5, Grass: 2, Electric: 0.5 },
  Poison: { Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Grass: 2, Fairy: 2 },
  Ground: { Flying: 0, Poison: 2, Rock: 2, Bug: 0.5, Steel: 2, Fire: 2, Grass: 0.5, Electric: 2 },
  Rock: { Fighting: 0.5, Flying: 2, Ground: 0.5, Bug: 2, Steel: 0.5, Fire: 2, Ice: 2 },
  Bug: { Fighting: 0.5, Flying: 0.5, Poison: 0.5, Ghost: 0.5, Steel: 0.5, Fire: 0.5, Grass: 2, Psychic: 2, Dark: 2, Fairy: 0.5 },
  Ghost: { Normal: 0, Ghost: 2, Psychic: 2, Dark: 0.5 },
  Steel: { Rock: 2, Steel: 0.5, Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Fairy: 2 },
  Fire: { Rock: 0.5, Bug: 2, Steel: 2, Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Dragon: 0.5 },
  Water: { Ground: 2, Rock: 2, Fire: 2, Water: 0.5, Grass: 0.5, Dragon: 0.5 },
  Grass: { Flying: 0.5, Poison: 0.5, Ground: 2, Rock: 2, Bug: 0.5, Steel: 0.5, Fire: 0.5, Water: 2, Grass: 0.5, Dragon: 0.5 },
  Electric: { Flying: 2, Ground: 0, Water: 2, Grass: 0.5, Electric: 0.5, Dragon: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Steel: 0.5, Psychic: 0.5, Dark: 0 },
  Ice: { Flying: 2, Ground: 2, Steel: 0.5, Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Dragon: 2 },
  Dragon: { Steel: 0.5, Dragon: 2, Fairy: 0 },
  Dark: { Fighting: 0.5, Ghost: 2, Psychic: 2, Dark: 0.5, Fairy: 0.5 },
  Fairy: { Fighting: 2, Poison: 0.5, Steel: 0.5, Fire: 0.5, Dragon: 2, Dark: 2 },
}

export function typeLabel(type: string) {
  return TYPE_LABELS[type] || type
}

export function typeColorClass(type: string) {
  return `type-${type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

export function typeBadgeClass(type: string, base = 'type-pill') {
  return `${base} ${typeColorClass(type)}`
}

export function attackingMultiplier(attackType: string, defenderTypes: string[]) {
  return defenderTypes.reduce((multiplier, defenderType) => multiplier * (TYPE_EFFECTIVENESS[attackType]?.[defenderType] ?? 1), 1)
}

export function formatTypeMultiplier(value: number) {
  if (value === 0.25) return '¼'
  if (value === 0.5) return '½'
  if (value === 1) return '1'
  return String(value)
}

export function multiplierClass(value: number) {
  if (value === 0) return 'immune'
  if (value < 1) return 'resist'
  if (value > 1) return 'weak'
  return 'neutral'
}
