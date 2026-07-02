type SpritePokemon = {
  id?: string
  name: string
}

const LOCAL_SPRITE_IDS = new Set([
  'barbaraclemega',
  'chandeluremega',
  'chesnaughtmega',
  'chimechomega',
  'clefablemega',
  'crabominablemega',
  'delphoxmega',
  'dragonitemega',
  'dragalgemega',
  'drampamega',
  'eelektrossmega',
  'emboarmega',
  'excadrillmega',
  'falinksmega',
  'feraligatrmega',
  'floettemega',
  'froslassmega',
  'glimmoramega',
  'golurkmega',
  'greninjamega',
  'hawluchamega',
  'malamarmega',
  'meganiummega',
  'meowsticmmega',
  'pyroarmega',
  'raichumegax',
  'raichumegay',
  'scovillainmega',
  'scraftymega',
  'skarmorymega',
  'scolipedemega',
  'staraptormega',
  'starmiemega',
  'victreebelmega',
])

function showdownSpriteSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function pokemonDbSpriteSlug(name: string) {
  const normalizedName = name
    .replace(/-Alola$/, '-Alolan')
    .replace(/-Galar$/, '-Galarian')
    .replace(/-Hisui$/, '-Hisuian')
    .replace(/-Paldea-/, '-Paldean-')
    .replace(/-F$/, '-Female')
    .replace(/-M$/, '-Male')
  return showdownSpriteSlug(normalizedName)
}

function withBasePath(path: string) {
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base
  return `${normalizedBase}${path}` || '/'
}

function unique(values: string[]) {
  return Array.from(new Set(values))
}

export function pokemonSpriteUrls(pokemon: SpritePokemon) {
  return unique([
    ...(pokemon.id && LOCAL_SPRITE_IDS.has(pokemon.id) ? [withBasePath(`/pokemon-sprites/${pokemon.id}.png`)] : []),
    `https://img.pokemondb.net/sprites/home/normal/${pokemonDbSpriteSlug(pokemon.name)}.png`,
    `https://play.pokemonshowdown.com/sprites/dex/${showdownSpriteSlug(pokemon.name)}.png`,
  ])
}

export function handlePokemonSpriteError(event: { currentTarget: HTMLImageElement }) {
  const image = event.currentTarget
  const fallbacks = image.dataset.fallbackSrcs?.split('|').filter(Boolean) ?? []
  const [nextFallback, ...remainingFallbacks] = fallbacks
  if (nextFallback) {
    image.dataset.fallbackSrcs = remainingFallbacks.join('|')
    image.style.visibility = 'visible'
    image.src = nextFallback
    return
  }
  image.style.visibility = 'hidden'
}
