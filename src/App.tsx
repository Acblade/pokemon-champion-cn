import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { championsPokemon, type PokemonRow } from './data/champions'
import { championsDetails, type PokemonDetail } from './data/championsDetails'
import { loadPokemonDetail } from './lib/loadPokemonDetail'
import { loadFavoriteMoves, saveFavoriteMoves } from './lib/favorites'
import { loadSavedPokemon, saveSavedPokemon, type SavedPokemonEntry } from './lib/savedPokemon'
import { loadSavedGroups, saveSavedGroups } from './lib/savedGroups'
import { loadTheme, saveTheme, type ThemeMode } from './lib/viewState'
import { pokemonDisplayName, pokemonSearchText } from './lib/pokemonDisplay'
import { getPokemonUsageFromDataset, getUsageDataset } from './data/usageStats'
import { PokemonDetailPanel } from './components/PokemonDetailPanel'
import { ruleItems } from './data/items'

function appItemLabel(itemValue: string) {
  if (!itemValue || itemValue === '无') return '无'
  return ruleItems.find((i) => i.en === itemValue)?.zh || itemValue
}

const SP_LABELS: Record<string, string> = { hp: 'HP', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度' }

const TYPE_ORDER = ['一般', '火', '水', '电', '草', '冰', '格斗', '毒', '地面', '飞行', '超能', '虫', '岩石', '幽灵', '龙', '恶', '钢', '妖精']
const FILTER_TYPE_OPTIONS = [...TYPE_ORDER] as const
const TYPE_LABELS: Record<string, string> = {
  Normal: '一般', Fire: '火', Water: '水', Electric: '电', Grass: '草', Ice: '冰', Fighting: '格斗', Poison: '毒', Ground: '地面', Flying: '飞行', Psychic: '超能', Bug: '虫', Rock: '岩石', Ghost: '幽灵', Dragon: '龙', Dark: '恶', Steel: '钢', Fairy: '妖精'
}

const LEGACY_RULE_META: Record<string, { label: string; seasons: { id: string; label: string }[] }> = {
  '1': { label: 'M-A', seasons: [{ id: '1', label: 'M-1：4/8 ~ 5/13' }] },
}



void LEGACY_RULE_META

const BATTLE_USAGE_RULE = '1'
const RULE_META: Record<string, { label: string; seasons: { id: string; label: string }[] }> = {
  'M-A': { label: 'M-A', seasons: [{ id: '1', label: 'M-1' }, { id: '2', label: 'M-2' }] },
  'M-B': { label: 'M-B', seasons: [{ id: '3', label: 'M-3' }] },
}

type HomeTab = 'list' | 'trainers' | 'damage'

type SortKey = 'zh' | 'name' | 'types' | 'usageRank' | 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'bst'
type SortDirection = 'asc' | 'desc'

type FilterState = {
  types: string[]
  forms: ('normal' | 'mega')[]
  moveQuery: string
  moveQuery2: string
  selectedMoves: string[]
  statKey: 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
  statMin: string
  statMax: string
  bstMin: string
  bstMax: string
}

const DEFAULT_FILTERS: FilterState = {
  types: [],
  forms: ['normal'],
  moveQuery: '',
  moveQuery2: '',
  selectedMoves: [],
  statKey: 'hp',
  statMin: '',
  statMax: '',
  bstMin: '',
  bstMax: '',
}

function normalize(input: string) {
  return input
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s'’`‘＇\-_.·・/\\|:：()（）[\]【】]+/g, '')
    .replace(/[^\p{Script=Han}a-z0-9]/gu, '')
}

function typeLabel(type: string) {
  return TYPE_LABELS[type] || type
}

function typeKeyFromLabel(label: string) {
  return Object.entries(TYPE_LABELS).find(([, zh]) => zh === label)?.[0] || label
}

function typeSortValue(types: string[]) {
  const [first, second] = types
  const firstIndex = TYPE_ORDER.indexOf(TYPE_LABELS[first] ?? first)
  const secondIndex = second ? TYPE_ORDER.indexOf(TYPE_LABELS[second] ?? second) : -1
  return `${String(firstIndex).padStart(2, '0')}-${String(secondIndex).padStart(2, '0')}`
}

function isMegaPokemon(pokemon: PokemonRow) {
  return pokemon.name.toLowerCase().includes('-mega')
}

function formatDatasetDate(date: string) {
  const [, month, day] = date.split('-')
  return month && day ? `${month} 月 ${day} 日` : date
}

function trainerSourceUrl(dataset: { trainerSourceUrl?: string; sourceUrl: string }) {
  return dataset.trainerSourceUrl || dataset.sourceUrl.replace('/pokemon/list', '/trainer/list')
}

function slugify(value: string) {
  return encodeURIComponent(value)
}

function withBasePath(path: string) {
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base
  return `${normalizedBase}${path}` || '/'
}

function getPokemonHref(pokemon: PokemonRow) {
  return withBasePath(`/${slugify(pokemon.id)}`)
}

function getCurrentPath() {
  if (typeof window === 'undefined') return ''
  const base = import.meta.env.BASE_URL || '/'
  let pathname = window.location.pathname
  if (base !== '/' && pathname.startsWith(base)) {
    pathname = pathname.slice(base.length - 1)
  }
  return decodeURIComponent(pathname.replace(/^\//, ''))
}

function resolvePokemonFromPath(pathname = getCurrentPath()) {
  const slug = pathname
  if (!slug || slug === 'saved') return null
  const normalized = normalize(slug)

  const exactIdMatch = championsPokemon.find((pokemon) => normalize(pokemon.id) === normalized)
  if (exactIdMatch) return exactIdMatch

  const exactSlugMatch = championsPokemon.find((pokemon) => pokemon.slugVariants.some((value) => normalize(value) === normalized && normalize(value) !== normalize(pokemon.zh) && normalize(value) !== normalize(pokemon.pinyin)))
  if (exactSlugMatch) return exactSlugMatch

  return championsPokemon.find((pokemon) =>
    [pokemon.zh, pokemon.name, pokemon.pinyin].some((value) => normalize(value) === normalized),
  ) ?? null
}

function buildSavedLabel(baseName: string, baseId: string, entries: SavedPokemonEntry[]) {
  const sameBase = entries.filter((entry) => entry.baseId === baseId)
  return `${baseName} ${sameBase.length + 1}`
}

function sortIndicator(activeKey: SortKey, currentKey: SortKey, direction: SortDirection) {
  if (activeKey !== currentKey) return ''
  return direction === 'asc' ? ' ↑' : ' ↓'
}

function cleanGroupName(value: string) {
  return value.trim()
}

function moveSearchRank(move: { zh: string; en: string; id: string; pinyin: string }, q: string) {
  const fields = [move.pinyin, move.zh, move.en.toLowerCase(), move.id.toLowerCase()]
  const normalizedQ = q.toLowerCase()
  let best = 999
  for (const field of fields) {
    if (field === normalizedQ) best = Math.min(best, 0)
    else if (field.startsWith(normalizedQ)) best = Math.min(best, 1)
    else if (field.includes(normalizedQ)) best = Math.min(best, 2)
  }
  return best
}

function App() {
  const initialPath = getCurrentPath()
  const initialPokemon = resolvePokemonFromPath(initialPath)
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme())
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('usageRank')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [movePickerOpen, setMovePickerOpen] = useState<'move1' | 'move2' | null>(null)
  const [selectedPokemonId, setSelectedPokemonId] = useState<string | null>(initialPokemon?.id ?? championsPokemon[0]?.id ?? null)
  const [selectedPokemon, setSelectedPokemon] = useState<PokemonDetail | null>(null)
  const [compareTarget, setCompareTarget] = useState<PokemonDetail | null>(null)
  const [favoriteMoveIds, setFavoriteMoveIds] = useState<string[]>(() => loadFavoriteMoves())
  const [savedPokemon, setSavedPokemon] = useState<SavedPokemonEntry[]>(() => loadSavedPokemon())
  const [damageTargetId, setDamageTargetId] = useState<string>('')
  const [draftConfigs, setDraftConfigs] = useState<Record<string, { nature: string; abilityId: string; item: string; sps: Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>; boosts: Record<'atk' | 'def' | 'spa' | 'spd' | 'spe', number> }>>({})
  const [topbarVisible, setTopbarVisible] = useState(true)
  const [homeTab, setHomeTab] = useState<HomeTab>('list')
  const [currentRule, setCurrentRule] = useState('M-B')
  const [currentSeason, setCurrentSeason] = useState('3')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [newGroupName, setNewGroupName] = useState('')
  const [savedGroups, setSavedGroups] = useState<string[]>(() => loadSavedGroups())
  const [editingSavedNameId, setEditingSavedNameId] = useState<string | null>(null)
  const [groupPickerEntryId, setGroupPickerEntryId] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    saveTheme(theme)
  }, [theme])

  const selectedUsageDataset = useMemo(() => getUsageDataset(currentSeason, BATTLE_USAGE_RULE), [currentSeason])

  const filtered = useMemo(() => {
    const moveQ = normalize(filters.selectedMoves[0] || filters.moveQuery)
    const moveQ2 = normalize(filters.selectedMoves[1] || filters.moveQuery2)
    return championsPokemon
      .filter((pokemon) => {
        const detail = championsDetails[pokemon.id]
        const matchesType = filters.types.length === 0 || filters.types.some((type) => pokemon.types.includes(typeKeyFromLabel(type)))
        const targetStat = pokemon.baseStats[filters.statKey]
        const matchesStatMin = !filters.statMin || targetStat >= Number(filters.statMin)
        const matchesStatMax = !filters.statMax || targetStat <= Number(filters.statMax)
        const matchesBstMin = !filters.bstMin || pokemon.bst >= Number(filters.bstMin)
        const matchesBstMax = !filters.bstMax || pokemon.bst <= Number(filters.bstMax)
        const matchesMove = !moveQ || !!detail?.moves.some((move) => normalize([move.zh, move.en, move.id, move.pinyin].join(' ')).includes(moveQ))
        const matchesMove2 = !moveQ2 || !!detail?.moves.some((move) => normalize([move.zh, move.en, move.id, move.pinyin].join(' ')).includes(moveQ2))
        const formKey = isMegaPokemon(pokemon) ? 'mega' : 'normal'
        const matchesForm = filters.forms.includes(formKey)
        return matchesForm && matchesType && matchesStatMin && matchesStatMax && matchesBstMin && matchesBstMax && matchesMove && matchesMove2
      })
      .sort((a, b) => {
        const factor = sortDirection === 'asc' ? 1 : -1
        switch (sortKey) {
          case 'zh': return a.zh.localeCompare(b.zh, 'zh-Hans-CN') * factor
          case 'name': return a.name.localeCompare(b.name) * factor
          case 'types': return typeSortValue(a.types).localeCompare(typeSortValue(b.types)) * factor
          case 'usageRank': {
            const rankA = getPokemonUsageFromDataset(selectedUsageDataset, a.name, a.baseSpeciesName, a.id, a.baseSpeciesId)?.rank ?? Number.MAX_SAFE_INTEGER
            const rankB = getPokemonUsageFromDataset(selectedUsageDataset, b.name, b.baseSpeciesName, b.id, b.baseSpeciesId)?.rank ?? Number.MAX_SAFE_INTEGER
            return (rankA - rankB) * factor
          }
          case 'hp': return (a.baseStats.hp - b.baseStats.hp) * factor
          case 'atk': return (a.baseStats.atk - b.baseStats.atk) * factor
          case 'def': return (a.baseStats.def - b.baseStats.def) * factor
          case 'spa': return (a.baseStats.spa - b.baseStats.spa) * factor
          case 'spd': return (a.baseStats.spd - b.baseStats.spd) * factor
          case 'spe': return (a.baseStats.spe - b.baseStats.spe) * factor
          case 'bst': return (a.bst - b.bst) * factor
        }
      })
  }, [sortKey, sortDirection, filters, selectedUsageDataset])

  const searchSuggestions = useMemo(() => {
    const q = normalize(query)
    if (!q) return []
    return championsPokemon.filter((pokemon) => [pokemonSearchText(pokemon), pokemon.pinyin, pokemon.initials].some((value) => normalize(value).includes(q))).slice(0, 8)
  }, [query])

  const moveOptions = useMemo(() => {
    const map = new Map<string, { id: string; zh: string; en: string; pinyin: string }>()
    Object.values(championsDetails).forEach((detail) => {
      detail.moves.forEach((move) => {
        if (!map.has(move.id)) map.set(move.id, { id: move.id, zh: move.zh, en: move.en, pinyin: move.pinyin })
      })
    })
    return Array.from(map.values()).sort((a, b) => a.zh.localeCompare(b.zh, 'zh-Hans-CN'))
  }, [])

  const moveSuggestions1 = useMemo(() => {
    const q = normalize(filters.moveQuery)
    if (!q) return moveOptions
    return moveOptions
      .filter((move) => normalize(`${move.zh} ${move.en} ${move.id} ${move.pinyin}`).includes(q))
      .sort((a, b) => moveSearchRank(a, q) - moveSearchRank(b, q) || a.zh.localeCompare(b.zh, 'zh-Hans-CN'))
  }, [filters.moveQuery, moveOptions])

  const moveSuggestions2 = useMemo(() => {
    const q = normalize(filters.moveQuery2)
    if (!q) return moveOptions.filter((move) => move.id !== filters.selectedMoves[0])
    return moveOptions
      .filter((move) => move.id !== filters.selectedMoves[0] && normalize(`${move.zh} ${move.en} ${move.id} ${move.pinyin}`).includes(q))
      .sort((a, b) => moveSearchRank(a, q) - moveSearchRank(b, q) || a.zh.localeCompare(b.zh, 'zh-Hans-CN'))
  }, [filters.moveQuery2, filters.selectedMoves, moveOptions])

  const detailMode = !!currentPath && currentPath !== 'saved'
  const savedPageMode = currentPath === 'saved'
  const formFamilyOptions = useMemo(() => selectedPokemon ? championsPokemon.filter((entry) => entry.baseSpeciesId === selectedPokemon.baseSpeciesId) : [], [selectedPokemon])
  const damageTargetOptions = useMemo(() => championsPokemon, [])
  const effectiveDamageTargetId = damageTargetOptions.some((pokemon) => pokemon.id === damageTargetId) ? damageTargetId : (selectedPokemonId ?? damageTargetOptions[0]?.id ?? '')
  const savedGroupNames = useMemo(() => {
    const names = new Set<string>(savedGroups.map(cleanGroupName).filter(Boolean))
    savedPokemon.forEach((entry) => {
      ;(entry.groupNames || []).forEach((name) => {
        const cleaned = cleanGroupName(name)
        if (cleaned) names.add(cleaned)
      })
    })
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  }, [savedPokemon, savedGroups])

  const savedPokemonGroups = useMemo(() => {
    const grouped = new Map<string, SavedPokemonEntry[]>()
    savedGroupNames.forEach((name) => grouped.set(name, []))
    const ungrouped: SavedPokemonEntry[] = []
    savedPokemon.forEach((entry) => {
      const groups = (entry.groupNames || []).map(cleanGroupName).filter(Boolean)
      if (!groups.length) {
        ungrouped.push(entry)
        return
      }
      groups.forEach((name) => grouped.set(name, [...(grouped.get(name) || []), entry]))
    })
    const entries = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN'))
    if (ungrouped.length) entries.push(['未分组', ungrouped])
    return entries
  }, [savedPokemon, savedGroupNames])

  useEffect(() => {
    let active = true
    const targetId = effectiveDamageTargetId || (filtered.find((pokemon) => pokemon.id !== selectedPokemonId)?.id ?? selectedPokemonId)
    ;(async () => {
      const [selected, compare] = await Promise.all([
        selectedPokemonId ? loadPokemonDetail(selectedPokemonId) : Promise.resolve(null),
        targetId ? loadPokemonDetail(targetId) : Promise.resolve(null),
      ])
      if (!active) return
      setSelectedPokemon(selected)
      setCompareTarget(compare)
    })()
    return () => { active = false }
  }, [selectedPokemonId, filtered, effectiveDamageTargetId])

  useEffect(() => { saveFavoriteMoves(favoriteMoveIds) }, [favoriteMoveIds])
  useEffect(() => { saveSavedPokemon(savedPokemon) }, [savedPokemon])
  useEffect(() => { saveSavedGroups(savedGroupNames) }, [savedGroupNames])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-popover-root]')) return
      setFiltersOpen(false)
      setSavedOpen(false)
      setSearchOpen(false)
      setGroupPickerEntryId(null)
      window.dispatchEvent(new CustomEvent('pokemon-ui-close-popovers'))
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY
      if (currentY <= 24) {
        setTopbarVisible(true)
      } else {
        setTopbarVisible(false)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function handleUpdateSaved(id: string, payload: Omit<SavedPokemonEntry, 'id' | 'baseId' | 'label' | 'pokemonId'>) {
    setSavedPokemon((current) => current.map((entry) => entry.id === id ? { ...entry, ...payload } : entry))
  }

  function navigateToPokemon(pokemon: PokemonRow) {
    setSelectedPokemonId(pokemon.id)
    const href = getPokemonHref(pokemon)
    window.history.pushState({}, '', href)
    setCurrentPath(getCurrentPath())
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  function navigateToHome() {
    setSelectedPokemonId(championsPokemon[0]?.id ?? null)
    window.history.pushState({}, '', withBasePath('/'))
    setCurrentPath('')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  function navigateToSaved() {
    window.history.pushState({}, '', withBasePath('/saved'))
    setCurrentPath('saved')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  useEffect(() => {
    const onPopState = () => {
      const nextPath = getCurrentPath()
      setCurrentPath(nextPath)
      const next = resolvePokemonFromPath(nextPath)
      setSelectedPokemonId(next?.id ?? championsPokemon[0]?.id ?? null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  return (
    <div className="app-shell">
      <header className={topbarVisible ? 'topbar sticky-topbar topbar-visible' : 'topbar sticky-topbar topbar-hidden'} onMouseLeave={() => { if (window.scrollY > 24) setTopbarVisible(false) }}>
        <div className="rule-box">
          <div className="rule-season-row">
            <div className="rule-season-item">
              <label>规则</label>
              <select value={currentRule} onChange={(e) => { setCurrentRule(e.target.value); setCurrentSeason(RULE_META[e.target.value]?.seasons[0]?.id ?? '1') }}>
                {Object.entries(RULE_META).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
              </select>
            </div>
            <div className="rule-season-item">
              <label>赛季</label>
              <select value={currentSeason} onChange={(e) => setCurrentSeason(e.target.value)}>
                {(RULE_META[currentRule]?.seasons ?? []).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="search-box search-box-wrap" data-popover-root>
          <label>搜索宝可梦</label>
          <input
            value={query}
            onFocus={() => { setSearchOpen(true); setQuery('') }}
            onBlur={() => setTimeout(() => setSearchOpen(false), 120)}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入中文、拼音或英文，比如 ka / kabishou / snorlax"
          />
          {searchOpen && searchSuggestions.length > 0 && (
            <div className="search-dropdown">
              {searchSuggestions.map((pokemon) => (
                <button key={pokemon.id} className="search-option topbar-search-option" onMouseDown={() => navigateToPokemon(pokemon)}>
                  <strong>{pokemonDisplayName(pokemon)}</strong>
                  <small>{pokemon.name}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="action-box">
          <div className="floating-control" data-popover-root>
            <button className="ghost-button" onClick={() => setSavedOpen((value) => !value)}>盒子</button>
            {savedOpen && (
              <div className="popover wide-popover">
                <div className="popover-note strong-note">盒子中共 {savedPokemon.length} 条</div>
                <button className="ghost-button" onClick={() => { navigateToSaved(); setSavedOpen(false) }}>查看全部盒子</button>
                {savedPokemon.length > 0 ? savedPokemon.slice(0, 3).map((entry) => (
                  <div key={entry.id} className="saved-pokemon-item">
                    <button className="favorite-list-item" onClick={() => {
                      const target = championsPokemon.find((pokemon) => pokemon.id === entry.pokemonId)
                      if (target) navigateToPokemon(target)
                    }}>
                      <span>{entry.label}</span>
                      <strong>{entry.isMega ? 'Mega' : '普通'}</strong>
                    </button>
                    <button className="danger-text-button" onClick={() => setSavedPokemon((current) => current.filter((item) => item.id !== entry.id))}>取消</button>
                  </div>
                )) : <div className="popover-note">还没有保存任何宝可梦设定。</div>}
              </div>
            )}
          </div>
          <div className="theme-orb">
            <button className="icon-button theme-orb-button" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} title={theme === 'light' ? '切换到夜间' : '切换到日间'}>
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </div>
      </header>

      {!topbarVisible && <button type="button" className="topbar-reveal" onClick={() => setTopbarVisible(true)}>顶部栏</button>}

      {savedPageMode ? (
        <main className="content-card detail-page-layout">
          <section className="detail-card detail-page-full saved-page-card">
            <div className="detail-page-topline">
              <button className="ghost-button" onClick={navigateToHome}>← 返回列表</button>
            </div>
            <div className="detail-title-row">
              <div className="detail-title-main">
                <h1>盒子</h1>
              </div>
              <p>这里是你保存过的全部宝可梦配置。</p>
            </div>
            <div className="saved-group-toolbar">
              <input className="saved-inline-input" value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="创建新分组" />
              <button className="ghost-button" onClick={() => {
                const next = cleanGroupName(newGroupName)
                if (!next) return
                setSavedGroups((current) => current.includes(next) ? current : [...current, next])
                setCollapsedGroups((current) => ({ ...current, [next]: false }))
                setNewGroupName('')
              }}>创建分组</button>
            </div>
            <div className="saved-groups">
              {savedPokemonGroups.map(([groupName, entries]) => (
                <section key={groupName} className="saved-group-card">
                  <div className="saved-group-header">
                    <div>
                      <h2>{groupName}</h2>
                      <p>{entries.length} 只宝可梦</p>
                    </div>
                    <div className="saved-group-actions">
                      <button className="ghost-button" onClick={() => setCollapsedGroups((current) => ({ ...current, [groupName]: !current[groupName] }))}>{collapsedGroups[groupName] ? '展开' : '折叠'}</button>
                      {groupName !== '未分组' && <button className="danger-text-button" onClick={() => {
                        setSavedPokemon((current) => current.map((item) => ({ ...item, groupNames: (item.groupNames || []).filter((name) => cleanGroupName(name) !== groupName) })))
                        setSavedGroups((current) => current.filter((name) => cleanGroupName(name) !== groupName))
                      }}>删除分组</button>}
                    </div>
                  </div>
                  {!collapsedGroups[groupName] && <div className="table-wrapper responsive-table-card">
                    <table>
                      <thead>
                        <tr>
                          <th>名称</th>
                          <th>特性</th>
                          <th>努力值</th>
                          <th>道具</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((entry) => {
                          const pokemon = championsPokemon.find((item) => item.id === entry.pokemonId)
                          const ability = pokemon?.abilities.find((item) => item.id === entry.abilityId)
                          const spSummary = Object.entries(entry.sps).filter(([, value]) => value > 0).map(([key, value]) => `${SP_LABELS[key] ?? key.toUpperCase()} ${value}`).join(' / ') || '—'
                          return (
                            <tr key={`${groupName}-${entry.id}`}>
                              <td>
                                <div className="saved-table-name">
                                  <div className="saved-name-row">
                                    {editingSavedNameId === entry.id ? (
                                      <input
                                        autoFocus
                                        className="saved-inline-input saved-name-input"
                                        value={entry.customName ?? entry.label}
                                        onChange={(event) => setSavedPokemon((current) => current.map((item) => item.id === entry.id ? { ...item, customName: event.target.value } : item))}
                                        onBlur={() => setEditingSavedNameId(null)}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter' || event.key === 'Escape') setEditingSavedNameId(null)
                                        }}
                                      />
                                    ) : (
                                      <a className="link-button" href={pokemon ? getPokemonHref(pokemon) : '#'} onClick={(event) => { event.preventDefault(); if (pokemon) navigateToPokemon(pokemon) }}>{entry.customName || entry.label}</a>
                                    )}
                                    <button type="button" className="saved-edit-button" onClick={() => setEditingSavedNameId(entry.id)} title="改名">✐</button>
                                  </div>
                                  <small>{entry.isMega ? 'Mega' : '普通'}</small>
                                </div>
                              </td>
                              <td>{ability?.zh || entry.abilityId || '—'}</td>
                              <td>{spSummary}</td>
                              <td>{appItemLabel(entry.item)}</td>
                              <td>
                                <div className="saved-actions-inline" data-popover-root>
                                  <button className="ghost-button saved-group-trigger" type="button" onClick={() => setGroupPickerEntryId((current) => current === entry.id ? null : entry.id)}>分组</button>
                                  <button className="danger-text-button" onClick={() => setSavedPokemon((current) => current.filter((item) => item.id !== entry.id))}>取消</button>
                                  {groupPickerEntryId === entry.id && <div className="saved-group-picker search-dropdown compact-dropdown">
                                    {savedGroupNames.map((name) => {
                                      const active = (entry.groupNames || []).includes(name)
                                      return <button key={`${entry.id}-${name}`} type="button" className={active ? 'item-option-row active-option' : 'item-option-row'} onMouseDown={() => setSavedPokemon((current) => current.map((item) => item.id !== entry.id ? item : { ...item, groupNames: active ? (item.groupNames || []).filter((group) => group !== name) : [...(item.groupNames || []), name] }))}><span>{name}</span><small>{active ? '已加入' : '加入'}</small></button>
                                    })}
                                  </div>}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>}
                </section>
              ))}
            </div>
          </section>
        </main>
      ) : !detailMode ? (
        <main className={homeTab === 'damage' ? 'content-card detail-page-layout' : 'content-card main-layout'}>
          <div className="section-title">
            <div>
              <h1>Pokemon Champions 中文数据站</h1>
            </div>
            {homeTab === 'list' && (
              <div className="floating-control list-filter-control" data-popover-root>
                <button className="ghost-button" onClick={() => setFiltersOpen((value) => !value)}>筛选</button>
                {filtersOpen && (
                  <div className="popover filter-list-popover filter-grid">
                    <div className="popover-field"><span>属性（可多选）</span><div className="filter-chip-group">{FILTER_TYPE_OPTIONS.map((type) => <button key={type} type="button" className={filters.types.includes(type) ? 'filter-chip active' : 'filter-chip'} onClick={() => setFilters((current) => ({ ...current, types: current.types.includes(type) ? current.types.filter((item) => item !== type) : [...current.types, type] }))}>{type}</button>)}</div></div>
                    <div className="popover-field"><span>形态</span><div className="filter-chip-group"><button type="button" className={filters.forms.includes('normal') ? 'filter-chip active' : 'filter-chip'} onClick={() => setFilters((current) => ({ ...current, forms: current.forms.includes('normal') ? current.forms.filter((item) => item !== 'normal') : [...current.forms, 'normal'] }))}>普通形态</button><button type="button" className={filters.forms.includes('mega') ? 'filter-chip active' : 'filter-chip'} onClick={() => setFilters((current) => ({ ...current, forms: current.forms.includes('mega') ? current.forms.filter((item) => item !== 'mega') : [...current.forms, 'mega'] }))}>Mega形态</button></div></div>
                    <div className="filter-move-pair">
                      <div className="filter-move-item" data-popover-root><span>技能 1</span><div className="filter-input-wrap"><input value={movePickerOpen === 'move1' ? filters.moveQuery : (moveOptions.find((m) => m.id === filters.selectedMoves[0])?.zh ?? '')} onFocus={() => { setMovePickerOpen('move1'); setFilters((c) => ({ ...c, moveQuery: '' })) }} onBlur={() => setTimeout(() => setMovePickerOpen((current) => current === 'move1' ? null : current), 120)} onChange={(event) => setFilters((current) => ({ ...current, moveQuery: event.target.value }))} placeholder="输入中/英/拼音" />{movePickerOpen === 'move1' && <div className="search-dropdown compact-dropdown filter-suggestion-dropdown">{moveSuggestions1.map((move) => <button key={move.id} className="item-option-row" type="button" onMouseDown={() => { setFilters((current) => ({ ...current, moveQuery: '', selectedMoves: [move.id, current.selectedMoves[1] || ''].filter(Boolean) })); setMovePickerOpen(null) }}><span>{move.zh}</span><small>{move.en}</small></button>)}</div>}</div></div>
                      <div className="filter-move-item" data-popover-root><span>技能 2</span><div className="filter-input-wrap"><input value={movePickerOpen === 'move2' ? filters.moveQuery2 : (moveOptions.find((m) => m.id === filters.selectedMoves[1])?.zh ?? '')} onFocus={() => { setMovePickerOpen('move2'); setFilters((c) => ({ ...c, moveQuery2: '' })) }} onBlur={() => setTimeout(() => setMovePickerOpen((current) => current === 'move2' ? null : current), 120)} onChange={(event) => setFilters((current) => ({ ...current, moveQuery2: event.target.value }))} placeholder="可选" />{movePickerOpen === 'move2' && <div className="search-dropdown compact-dropdown filter-suggestion-dropdown">{moveSuggestions2.map((move) => <button key={move.id} className="item-option-row" type="button" onMouseDown={() => { setFilters((current) => ({ ...current, moveQuery2: '', selectedMoves: [current.selectedMoves[0] || '', move.id].filter(Boolean) })); setMovePickerOpen(null) }}><span>{move.zh}</span><small>{move.en}</small></button>)}</div>}</div></div>
                    </div>
                    {(() => {
                      const bMin = Number(filters.bstMin) || 0; const bMax = Number(filters.bstMax) || 720
                      const bMinZ = bMin >= bMax - 15 ? 3 : 1; const bMaxZ = bMin >= bMax - 15 ? 1 : 3
                      return (
                        <div className="inline-range-row">
                          <span className="inline-range-label">限制总种族</span>
                          <span className="range-display">{bMin}–{bMax}</span>
                          <div className="dual-range-wrap inline-dual-range">
                            <input type="range" className="range-min" style={{zIndex: bMinZ}} min={0} max={720} value={bMin} onChange={(e) => setFilters((c) => ({ ...c, bstMin: e.target.value === '0' ? '' : e.target.value }))} />
                            <input type="range" className="range-max" style={{zIndex: bMaxZ}} min={0} max={720} value={bMax} onChange={(e) => setFilters((c) => ({ ...c, bstMax: e.target.value === '720' ? '' : e.target.value }))} />
                          </div>
                        </div>
                      )
                    })()}
                    {(() => {
                      const sMin = Number(filters.statMin) || 0; const sMax = Number(filters.statMax) || 255
                      const sMinZ = sMin >= sMax - 10 ? 3 : 1; const sMaxZ = sMin >= sMax - 10 ? 1 : 3
                      return (
                        <div className="inline-range-row">
                          <span className="inline-range-label">限制<select className="narrow-stat-select" value={filters.statKey} onChange={(event) => setFilters((current) => ({ ...current, statKey: event.target.value as FilterState['statKey'] }))}><option value="hp">HP</option><option value="atk">攻击</option><option value="def">防御</option><option value="spa">特攻</option><option value="spd">特防</option><option value="spe">速度</option></select></span>
                          <span className="range-display">{sMin}–{sMax}</span>
                          <div className="dual-range-wrap inline-dual-range">
                            <input type="range" className="range-min" style={{zIndex: sMinZ}} min={0} max={255} value={sMin} onChange={(e) => setFilters((c) => ({ ...c, statMin: e.target.value === '0' ? '' : e.target.value }))} />
                            <input type="range" className="range-max" style={{zIndex: sMaxZ}} min={0} max={255} value={sMax} onChange={(e) => setFilters((c) => ({ ...c, statMax: e.target.value === '255' ? '' : e.target.value }))} />
                          </div>
                        </div>
                      )
                    })()}
                    <button onClick={() => { setFilters(DEFAULT_FILTERS); setMovePickerOpen(null); setFiltersOpen(false) }}>清空筛选</button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="home-tabs">
            <button type="button" className={homeTab === 'list' ? 'home-tab active' : 'home-tab'} onClick={() => setHomeTab('list')}>宝可梦列表</button>
            <button type="button" className={homeTab === 'trainers' ? 'home-tab active' : 'home-tab'} onClick={() => setHomeTab('trainers')}>玩家排名</button>
            <button type="button" className={homeTab === 'damage' ? 'home-tab active' : 'home-tab'} onClick={() => setHomeTab('damage')}>伤害计算器</button>
          </div>

          {homeTab === 'list' && (
            <div className="table-wrapper responsive-table-card pokemon-list-table-wrapper">
              <table className="pokemon-list-table">
                <thead>
                  <tr>
                    <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'usageRank') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('usageRank'); setSortDirection('asc') } }}>使用率{sortIndicator(sortKey, 'usageRank', sortDirection)}</button></th>
                    <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'zh') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('zh'); setSortDirection('asc') } }}>中文名称{sortIndicator(sortKey, 'zh', sortDirection)}</button></th>
                    <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'types') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('types'); setSortDirection('asc') } }}>属性{sortIndicator(sortKey, 'types', sortDirection)}</button></th>
                    <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'hp') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('hp'); setSortDirection('asc') } }}>HP{sortIndicator(sortKey, 'hp', sortDirection)}</button></th>
                    <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'atk') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('atk'); setSortDirection('asc') } }}>攻击{sortIndicator(sortKey, 'atk', sortDirection)}</button></th>
                    <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'def') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('def'); setSortDirection('asc') } }}>防御{sortIndicator(sortKey, 'def', sortDirection)}</button></th>
                    <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'spa') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('spa'); setSortDirection('asc') } }}>特攻{sortIndicator(sortKey, 'spa', sortDirection)}</button></th>
                    <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'spd') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('spd'); setSortDirection('asc') } }}>特防{sortIndicator(sortKey, 'spd', sortDirection)}</button></th>
                    <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'spe') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('spe'); setSortDirection('asc') } }}>速度{sortIndicator(sortKey, 'spe', sortDirection)}</button></th>
                    <th><button type="button" className="table-sort-button" onClick={() => { if (sortKey === 'bst') setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortKey('bst'); setSortDirection('asc') } }}>总种族值{sortIndicator(sortKey, 'bst', sortDirection)}</button></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pokemon) => {
                    const usage = getPokemonUsageFromDataset(selectedUsageDataset, pokemon.name, pokemon.baseSpeciesName, pokemon.id, pokemon.baseSpeciesId)
                    return (
                    <tr key={pokemon.id}>
                      <td>{usage ? <span className="usage-list-cell">#{usage.rank}</span> : '—'}</td>
                      <td><a className="link-button" href={getPokemonHref(pokemon)} onClick={(event) => { event.preventDefault(); navigateToPokemon(pokemon) }}>{pokemonDisplayName(pokemon)}</a></td>
                      <td><div className="type-list">{pokemon.types.map((type) => <span className="type-pill" key={type}>{typeLabel(type)}</span>)}</div></td>
                      <td>{pokemon.baseStats.hp}</td>
                      <td>{pokemon.baseStats.atk}</td>
                      <td>{pokemon.baseStats.def}</td>
                      <td>{pokemon.baseStats.spa}</td>
                      <td>{pokemon.baseStats.spd}</td>
                      <td>{pokemon.baseStats.spe}</td>
                      <td>{pokemon.bst}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {homeTab === 'trainers' && (
            <section className="trainer-rankings-section">
              <div className="data-source-line"><a href={trainerSourceUrl(selectedUsageDataset)} target="_blank" rel="noopener noreferrer">champs.pokedb.tokyo</a> · {formatDatasetDate(selectedUsageDataset.date)}</div>
              {selectedUsageDataset.trainerRankingsAvailable === false || selectedUsageDataset.trainerRankings.length === 0 ? (
                <div className="empty-detail trainer-empty-state">
                  <h2>M-{selectedUsageDataset.season} 玩家排名尚未开放</h2>
                  <p>{selectedUsageDataset.trainerRankingsNote || '当前赛季玩家排名页面暂无可同步数据。'}</p>
                </div>
              ) : (
                <div className="trainer-rankings-wrap table-wrapper responsive-table-card">
                  <table className="trainer-rankings-table">
                    <thead>
                      <tr>
                        <th>排名</th>
                        <th>名字</th>
                        <th>分数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedUsageDataset.trainerRankings.map((trainer) => {
                        return (
                          <tr key={trainer.rank}>
                            <td className="rank-cell">#{trainer.rank}</td>
                            <td>{trainer.name}</td>
                            <td className="rating-cell">{trainer.rating !== null ? trainer.rating.toFixed(3) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {homeTab === 'damage' && selectedPokemon && (
            <PokemonDetailPanel
              standaloneCalc
              pokemon={selectedPokemon}
              compareTarget={compareTarget}
              formOptions={formFamilyOptions}
              damageTargetOptions={damageTargetOptions}
              selectedCompareId={effectiveDamageTargetId}
              onChangeCompareId={setDamageTargetId}
              favoriteMoveIds={favoriteMoveIds}
              onToggleFavoriteMove={(moveId) => setFavoriteMoveIds((current) => current.includes(moveId) ? current.filter((id) => id !== moveId) : [...current, moveId])}
              onBack={() => setHomeTab('list')}
              onNavigateToPokemon={navigateToPokemon}
              draftConfig={draftConfigs[normalize(selectedPokemon.baseSpeciesName)]}
              onDraftChange={(payload) => setDraftConfigs((current) => ({ ...current, [normalize(selectedPokemon.baseSpeciesName)]: payload }))}
              savedPokemon={savedPokemon}
              onAfterSave={() => { setTopbarVisible(true); setSavedOpen(true) }}
              onUpdateSaved={handleUpdateSaved}
              usageDataset={selectedUsageDataset}
              onSaveCurrent={(payload) => {
                setDraftConfigs((current) => ({ ...current, [normalize(selectedPokemon.baseSpeciesName)]: { nature: payload.nature, abilityId: payload.abilityId, item: payload.item, sps: payload.sps, boosts: payload.boosts } }))
                setSavedPokemon((current) => [{ ...payload, id: `${Date.now()}-${Math.random()}`, baseId: normalize(selectedPokemon.baseSpeciesName), label: buildSavedLabel(selectedPokemon.zh, normalize(selectedPokemon.baseSpeciesName), current), pokemonId: selectedPokemon.id }, ...current])
              }}
            />
          )}
          {homeTab === 'damage' && !selectedPokemon && (
            <div className="empty-detail" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>加载中...</div>
          )}
        </main>
      ) : (
        <main className="content-card detail-page-layout">
          <PokemonDetailPanel
            pokemon={selectedPokemon}
            compareTarget={compareTarget}
            formOptions={formFamilyOptions}
            damageTargetOptions={damageTargetOptions}
            selectedCompareId={effectiveDamageTargetId}
            onChangeCompareId={setDamageTargetId}
            favoriteMoveIds={favoriteMoveIds}
            onToggleFavoriteMove={(moveId) => setFavoriteMoveIds((current) => current.includes(moveId) ? current.filter((id) => id !== moveId) : [...current, moveId])}
            onBack={navigateToHome}
            onNavigateToPokemon={(pokemon) => { navigateToPokemon(pokemon) }}
            draftConfig={selectedPokemon ? draftConfigs[normalize(selectedPokemon.baseSpeciesName)] : undefined}
            onDraftChange={(payload) => {
              if (!selectedPokemon) return
              setDraftConfigs((current) => ({ ...current, [normalize(selectedPokemon.baseSpeciesName)]: payload }))
            }}
            savedPokemon={savedPokemon}
            onAfterSave={() => { setTopbarVisible(true); setSavedOpen(true) }}
            onUpdateSaved={handleUpdateSaved}
            usageDataset={selectedUsageDataset}
            onSaveCurrent={(payload) => {
              if (!selectedPokemon) return
              setDraftConfigs((current) => ({ ...current, [normalize(selectedPokemon.baseSpeciesName)]: { nature: payload.nature, abilityId: payload.abilityId, item: payload.item, sps: payload.sps, boosts: payload.boosts } }))
              setSavedPokemon((current) => [{ ...payload, id: `${Date.now()}-${Math.random()}`, baseId: normalize(selectedPokemon.baseSpeciesName), label: buildSavedLabel(selectedPokemon.zh, normalize(selectedPokemon.baseSpeciesName), current), pokemonId: selectedPokemon.id }, ...current])
            }}
          />
        </main>
      )}
    </div>
  )
}

export default App
