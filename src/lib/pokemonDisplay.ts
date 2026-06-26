type DisplayPokemon = {
  zh: string
  name: string
  id: string
  baseSpeciesName?: string
}

const REGION_LABELS: Record<string, string> = {
  Alola: '阿罗拉',
  Galar: '伽勒尔',
  Hisui: '洗翠',
  Paldea: '帕底亚',
}

const FORM_LABELS: Record<string, string> = {
  Attack: '攻击形态',
  Defense: '防御形态',
  Speed: '速度形态',
  Origin: '起源形态',
  Altered: '别种形态',
  Therian: '灵兽形态',
  Incarnate: '化身形态',
  Wash: '清洗',
  Heat: '加热',
  Frost: '结冰',
  Fan: '旋转',
  Mow: '切割',
  Combat: '斗战种',
  Blaze: '火炽种',
  Aqua: '水澜种',
}

function collectFormParts(name: string) {
  if (name === 'Floette-Eternal') return []
  if (name === 'Floette-Mega') return ['Mega']

  const parts: string[] = []
  const tokens = name.split('-').slice(1)
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token === 'Mega') {
      const next = tokens[i + 1]
      if (next === 'X' || next === 'Y') {
        parts.push(`Mega ${next}`)
        i += 1
      } else {
        parts.push('Mega')
      }
      continue
    }
    if (token === 'M') {
      parts.push('雄性')
      continue
    }
    if (token === 'F') {
      parts.push('雌性')
      continue
    }
    parts.push(REGION_LABELS[token] || FORM_LABELS[token] || token)
  }
  if (name === 'Meowstic') parts.push('雄性')
  return Array.from(new Set(parts))
}

export function pokemonDisplayName(pokemon: DisplayPokemon | null | undefined) {
  if (!pokemon) return ''
  const parts = collectFormParts(pokemon.name)
  if (parts.length && pokemon.zh.includes(`（${parts.join('·')}）`)) return pokemon.zh
  return parts.length ? `${pokemon.zh}（${parts.join('·')}）` : pokemon.zh
}

export function pokemonSearchText(pokemon: DisplayPokemon) {
  return `${pokemonDisplayName(pokemon)} ${pokemon.zh} ${pokemon.name} ${pokemon.id}`
}
