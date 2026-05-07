export type PokemonRow = {
  id: string
  zh: string
  name: string
  pinyin: string
  types: string[]
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number }
  bst: number
  hasMega: boolean
}

export const samplePokemon: PokemonRow[] = [
  {
    id: 'snorlax',
    zh: '卡比兽',
    name: 'Snorlax',
    pinyin: 'kabishou',
    types: ['一般'],
    baseStats: { hp: 160, atk: 110, def: 65, spa: 65, spd: 110, spe: 30 },
    bst: 540,
    hasMega: false,
  },
  {
    id: 'venusaur',
    zh: '妙蛙花',
    name: 'Venusaur',
    pinyin: 'miaowahua',
    types: ['草', '毒'],
    baseStats: { hp: 80, atk: 82, def: 83, spa: 100, spd: 100, spe: 80 },
    bst: 525,
    hasMega: true,
  },
  {
    id: 'charizard',
    zh: '喷火龙',
    name: 'Charizard',
    pinyin: 'penhuolong',
    types: ['火', '飞行'],
    baseStats: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
    bst: 534,
    hasMega: true,
  },
  {
    id: 'slowbro',
    zh: '呆壳兽',
    name: 'Slowbro',
    pinyin: 'daikeshou',
    types: ['水', '超能力'],
    baseStats: { hp: 95, atk: 75, def: 110, spa: 100, spd: 80, spe: 30 },
    bst: 490,
    hasMega: true,
  },
  {
    id: 'lucario',
    zh: '路卡利欧',
    name: 'Lucario',
    pinyin: 'lukaliou',
    types: ['格斗', '钢'],
    baseStats: { hp: 70, atk: 110, def: 70, spa: 115, spd: 70, spe: 90 },
    bst: 525,
    hasMega: true,
  },
]
