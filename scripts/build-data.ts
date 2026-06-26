import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { pinyin } from 'pinyin-pro'

type Dict<T> = Record<string, T>

type Species = {
  num: number
  name: string
  baseSpecies?: string
  battleOnly?: string | string[]
  types?: string[]
  baseStats?: Record<string, number>
  abilities?: Record<string, string>
  otherFormes?: string[]
}

type Move = {
  num?: number
  name: string
  type: string
  category: 'Status' | 'Physical' | 'Special'
  basePower?: number
  accuracy?: number | true
  desc?: string
  shortDesc?: string
  pp?: number
  priority?: number
  boosts?: Record<string, number>
  self?: { boosts?: Record<string, number> }
  secondary?: MoveSecondary | null
  secondaries?: MoveSecondary[]
  status?: string
  volatileStatus?: string
  drain?: [number, number]
  recoil?: [number, number]
  heal?: [number, number]
}

type MoveSecondary = {
  chance?: number
  boosts?: Record<string, number>
  self?: { boosts?: Record<string, number> }
  status?: string
  volatileStatus?: string
}

type FormatData = {
  tier?: string
}

type ItemData = {
  name: string
  num?: number
  isNonstandard?: string | null
  itemUser?: string[]
  megaStone?: string
  inherit?: boolean
}

const projectRoot = process.cwd()
const cacheRoot = path.resolve(process.env.CHAMPIONS_CACHE_ROOT ?? path.join(projectRoot, 'out', 'tmp'))
const showdownRoot = path.resolve(process.env.POKEMON_SHOWDOWN_ROOT ?? path.join(cacheRoot, 'pokemon-showdown'))
const damageCalcRoot = path.resolve(process.env.DAMAGE_CALC_ROOT ?? path.join(cacheRoot, 'damage-calc'))
const pokeApiRoot = path.resolve(process.env.POKEAPI_CACHE_ROOT ?? path.join(cacheRoot, 'pokeapi-cache'))
const outputDir = path.resolve(projectRoot, 'src', 'generated')

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

function ensureGitRepo(dir: string, url: string) {
  ensureDir(path.dirname(dir))
  if (fs.existsSync(path.join(dir, '.git'))) {
    execFileSync('git', ['-C', dir, 'pull', '--ff-only'], { stdio: 'inherit' })
    return
  }
  if (fs.existsSync(dir)) {
    throw new Error(`${dir} exists but is not a git checkout`)
  }
  execFileSync('git', ['clone', '--depth=1', url, dir], { stdio: 'inherit' })
}

function syncDamageCalcVendor() {
  const tempOutputDir = path.join(cacheRoot, 'calc-vendor-build')
  const tsupCli = path.join(projectRoot, 'node_modules', 'tsup', 'dist', 'cli-default.js')
  execFileSync(process.execPath, [
    tsupCli,
    path.join(damageCalcRoot, 'calc', 'src', 'index.ts'),
    '--format', 'esm',
    '--platform', 'browser',
    '--no-splitting',
    '--no-config',
    '--out-dir', tempOutputDir,
    '--clean',
  ], { stdio: 'inherit' })

  const bundledPath = path.join(tempOutputDir, 'index.js')
  let bundled = fs.readFileSync(bundledPath, 'utf8')
  bundled = bundled.replace(
    'var Acalculate = exports.calculate;',
    'var Acalculate = typeof exports !== "undefined" ? exports.calculate : void 0;',
  )
  ensureDir(path.join(projectRoot, 'vendor', 'smogon-calc'))
  fs.writeFileSync(path.join(projectRoot, 'vendor', 'smogon-calc', 'index.mjs'), bundled, 'utf8')
}

async function ensureTextFile(filePath: string, url: string) {
  if (fs.existsSync(filePath)) return
  ensureDir(path.dirname(filePath))
  const res = await fetch(url, { headers: { 'user-agent': 'pokemon-champion-cn/1.0' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  fs.writeFileSync(filePath, await res.text(), 'utf8')
}

async function ensureExternalSources() {
  ensureGitRepo(showdownRoot, 'https://github.com/smogon/pokemon-showdown.git')
  ensureGitRepo(damageCalcRoot, 'https://github.com/smogon/damage-calc.git')
  await Promise.all([
    ensureTextFile(
      path.join(pokeApiRoot, 'pokemon_species_names_full.csv'),
      'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv',
    ),
    ensureTextFile(
      path.join(pokeApiRoot, 'move_names_full.csv'),
      'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/move_names.csv',
    ),
    ensureTextFile(
      path.join(pokeApiRoot, 'move_flavor_text_full.csv'),
      'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/move_flavor_text.csv',
    ),
    ensureTextFile(
      path.join(pokeApiRoot, 'ability_names_full.csv'),
      'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/ability_names.csv',
    ),
  ])
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        value += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(value)
      value = ''
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''))
      rows.push(row)
      row = []
      value = ''
    } else {
      value += char
    }
  }
  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ''))
    rows.push(row)
  }
  return rows
}

function readCsvMap(filePath: string, idColumn: string, nameColumn: string, languageId = '12') {
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'))
  const header = rows.shift() || []
  const idIndex = header.indexOf(idColumn)
  const langIndex = header.indexOf('local_language_id')
  const nameIndex = header.indexOf(nameColumn)
  const map = new Map<string, string>()
  for (const row of rows) {
    if (row[langIndex] !== languageId) continue
    map.set(row[idIndex], row[nameIndex])
  }
  return map
}

function cleanFlavorText(value: string) {
  return value
    .replace(/\u00ad/g, '')
    .replace(/\f/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function readMoveDescriptionMap(filePath: string, languageId = '12') {
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'))
  const header = rows.shift() || []
  const moveIndex = header.indexOf('move_id')
  const versionGroupIndex = header.indexOf('version_group_id')
  const langIndex = header.indexOf('language_id')
  const textIndex = header.indexOf('flavor_text')
  const latest = new Map<string, { versionGroup: number; text: string }>()
  for (const row of rows) {
    if (row[langIndex] !== languageId) continue
    const moveId = row[moveIndex]
    const versionGroup = Number(row[versionGroupIndex])
    const text = cleanFlavorText(row[textIndex] ?? '')
    if (!moveId || !text) continue
    const current = latest.get(moveId)
    if (!current || versionGroup >= current.versionGroup) {
      latest.set(moveId, { versionGroup, text })
    }
  }
  return new Map([...latest].map(([moveId, entry]) => [moveId, entry.text]))
}

const MOVE_TYPE_LABELS: Record<string, string> = {
  Bug: '虫',
  Dark: '恶',
  Dragon: '龙',
  Electric: '电',
  Fairy: '妖精',
  Fighting: '格斗',
  Fire: '火',
  Flying: '飞行',
  Ghost: '幽灵',
  Grass: '草',
  Ground: '地面',
  Ice: '冰',
  Normal: '一般',
  Poison: '毒',
  Psychic: '超能力',
  Rock: '岩石',
  Steel: '钢',
  Water: '水',
}

const MOVE_CATEGORY_LABELS: Record<Move['category'], string> = {
  Physical: '物理',
  Special: '特殊',
  Status: '变化',
}

const MOVE_STAT_LABELS: Record<string, string> = {
  atk: '攻击',
  def: '防御',
  spa: '特攻',
  spd: '特防',
  spe: '速度',
  accuracy: '命中率',
  evasion: '闪避率',
}

const MOVE_STATUS_LABELS: Record<string, string> = {
  brn: '灼伤',
  frz: '冰冻',
  par: '麻痹',
  psn: '中毒',
  slp: '睡眠',
  tox: '剧毒',
}

const MOVE_VOLATILE_LABELS: Record<string, string> = {
  confusion: '混乱',
  flinch: '畏缩',
  leechseed: '寄生种子',
  taunt: '挑衅',
  trapped: '无法替换',
}

function formatBoosts(boosts: Record<string, number>, target: '使用者' | '目标') {
  const parts = Object.entries(boosts)
    .filter(([, value]) => value !== 0)
    .map(([stat, value]) => `${MOVE_STAT_LABELS[stat] ?? stat}${value > 0 ? `提升 ${value} 级` : `降低 ${Math.abs(value)} 级`}`)
  return parts.length ? `令${target}${parts.join('、')}。` : ''
}

function formatSecondary(secondary: MoveSecondary) {
  const chance = secondary.chance && secondary.chance < 100 ? `${secondary.chance}%几率` : ''
  const parts = [
    secondary.boosts ? formatBoosts(secondary.boosts, '目标') : '',
    secondary.self?.boosts ? formatBoosts(secondary.self.boosts, '使用者') : '',
    secondary.status ? `令目标陷入${MOVE_STATUS_LABELS[secondary.status] ?? secondary.status}状态。` : '',
    secondary.volatileStatus ? `令目标陷入${MOVE_VOLATILE_LABELS[secondary.volatileStatus] ?? secondary.volatileStatus}状态。` : '',
  ].filter(Boolean)
  if (!parts.length) return ''
  return chance ? parts.map((part) => `${chance}${part}`).join('') : parts.join('')
}

function buildMoveDescription(move: Move) {
  const typeLabel = MOVE_TYPE_LABELS[move.type] ?? move.type
  const categoryLabel = MOVE_CATEGORY_LABELS[move.category] ?? move.category
  const basics = [`${typeLabel}属性${categoryLabel}招式`]
  if (move.category !== 'Status' && (move.basePower ?? 0) > 0) basics.push(`威力 ${move.basePower}`)
  basics.push(move.accuracy === true ? '必中' : `命中 ${move.accuracy ?? '-'}`)
  if (move.pp) basics.push(`PP ${move.pp}`)

  const effects = [
    move.priority ? `优先度 ${move.priority > 0 ? `+${move.priority}` : move.priority}。` : '',
    move.boosts ? formatBoosts(move.boosts, '目标') : '',
    move.self?.boosts ? formatBoosts(move.self.boosts, '使用者') : '',
    move.status ? `令目标陷入${MOVE_STATUS_LABELS[move.status] ?? move.status}状态。` : '',
    move.volatileStatus ? `令目标陷入${MOVE_VOLATILE_LABELS[move.volatileStatus] ?? move.volatileStatus}状态。` : '',
    move.secondary ? formatSecondary(move.secondary) : '',
    ...(move.secondaries ?? []).map(formatSecondary),
    move.drain ? '吸取造成伤害的一部分回复自身 HP。' : '',
    move.recoil ? '使用者会受到反作用力伤害。' : '',
    move.heal ? '回复自身 HP。' : '',
  ].filter(Boolean)

  return `${basics.join('，')}。${effects.join('')}`
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s'’`-]+/g, '')
    .replace(/[^\p{Script=Han}a-z0-9]/gu, '')
}

const MOVE_ZH_BY_ID: Record<string, string> = {
  barbbarrage: '毒千针',
  makeitrain: '淘金潮',
  ragefist: '愤怒之拳',
  soak: '浸水',
  accelerock: '冲岩',
  acidarmor: '溶化',
  acidspray: '酸液炸弹',
  acrobatics: '杂技',
  acupressure: '点穴',
  aerialace: '燕返',
  afteryou: '您先请',
  agility: '高速移动',
  aircutter: '空气利刃',
  airslash: '空气斩',
  alluringvoice: '魅诱之声',
  allyswitch: '交换场地',
  amnesia: '瞬间失忆',
  ancientpower: '原始之力',
  appleacid: '苹果酸',
  aquacutter: '水波刀',
  aquajet: '水流喷射',
  aquaring: '水流环',
  aquastep: '流水旋舞',
  aquatail: '水流尾',
  armorcannon: '铠农炮',
  aromaticmist: '芳香薄雾',
  assurance: '恶意追击',
  attract: '迷人',
  aurasphere: '波导弹',
  aurawheel: '气场轮',
  auroraveil: '极光幕',
  avalanche: '雪崩',
  axekick: '下压踢',
  babydolleyes: '圆瞳',
  banefulbunker: '碉堡',
  batonpass: '接棒',
  beakblast: '鸟嘴加农炮',
  beatup: '围攻',
  belch: '打嗝',
  bellydrum: '腹鼓',
  bind: '绑紧',
  bite: '咬住',
  bitterblade: '悔念剑',
  bittermalice: '冤冤相报',
  blastburn: '爆炸烈焰',
  blazekick: '火焰踢',
  blizzard: '暴风雪',
  block: '挡路',
  bodypress: '扑击',
  bodyslam: '泰山压顶',
  bonerush: '骨棒乱打',
  boomburst: '爆音波',
  bounce: '弹跳',
  bravebird: '勇鸟猛攻',
  breakingswipe: '广域破坏',
  brickbreak: '劈瓦',
  brutalswing: '狂舞挥打',
  bugbite: '虫咬',
  bugbuzz: '虫鸣',
  bulkup: '健美',
  bulldoze: '重踏',
  bulletpunch: '子弹拳',
  bulletseed: '种子机关枪',
  burningjealousy: '妒火',
  burnup: '燃尽',
  calmmind: '冥想',
  ceaselessedge: '秘剑·千重涛',
  charge: '充电',
  chargebeam: '充电光束',
  charm: '撒娇',
  chillingwater: '泼冷水',
  chillyreception: '冷笑话',
  circlethrow: '巴投',
  clangingscales: '鳞片噪音',
  clangoroussoul: '魂舞烈音爆',
  clearsmog: '清除之烟',
  closecombat: '近身战',
  coaching: '指导',
  coil: '盘蜷',
  comeuppance: '复仇',
  confuseray: '奇异之光',
  copycat: '仿效',
  corrosivegas: '腐蚀气体',
  cosmicpower: '宇宙力量',
  cottonguard: '棉花防守',
  cottonspore: '棉孢子',
  counter: '双倍奉还',
  covet: '渴望',
  crabhammer: '蟹钳锤',
  crosschop: '十字劈',
  crosspoison: '十字毒刃',
  crunch: '咬碎',
  crushclaw: '撕裂爪',
  curse: '诅咒',
  darkestlariat: 'ＤＤ金勾臂',
  darkpulse: '恶之波动',
  dazzlinggleam: '魔法闪耀',
  decorate: '装饰',
  defog: '清除浓雾',
  destinybond: '同命',
  detect: '看穿',
  dig: '挖洞',
  direclaw: '克命爪',
  disable: '定身法',
  discharge: '放电',
  dive: '潜水',
  doubleedge: '舍身冲撞',
  doublehit: '二连击',
  doubleteam: '影子分身',
  dracometeor: '流星群',
  dragoncheer: '龙声鼓舞',
  dragonclaw: '龙爪',
  dragondance: '龙之舞',
  dragondarts: '龙箭',
  dragonpulse: '龙之波动',
  dragonrush: '龙之俯冲',
  dragontail: '龙尾',
  drainingkiss: '吸取之吻',
  drainpunch: '吸取拳',
  drillpeck: '啄钻',
  drillrun: '直冲钻',
  dualwingbeat: '双翼',
  dynamicpunch: '爆裂拳',
  earthpower: '大地之力',
  earthquake: '地震',
  eerieimpulse: '怪异电波',
  eeriespell: '诡异咒语',
  electricterrain: '电气场地',
  electrify: '输电',
  electroball: '电球',
  electroshot: '电光束',
  electroweb: '电网',
  encore: '再来一次',
  endeavor: '蛮干',
  endure: '挺住',
  energyball: '能量球',
  entrainment: '找伙伴',
  eruption: '喷火',
  expandingforce: '广域战力',
  explosion: '大爆炸',
  extrasensory: '神通力',
  extremespeed: '神速',
  facade: '硬撑',
  fairylock: '妖精之锁',
  fakeout: '击掌奇袭',
  faketears: '假哭',
  featherdance: '羽毛舞',
  feint: '佯攻',
  fellstinger: '致命针刺',
  ficklebeam: '随机光',
  fierydance: '火之舞',
  finalgambit: '搏命',
  fireblast: '大字爆炎',
  firefang: '火焰牙',
  firelash: '火焰鞭',
  firepunch: '火焰拳',
  firespin: '火焰旋涡',
  firstimpression: '迎头一击',
  fissure: '地裂',
  flail: '抓狂',
  flamecharge: '蓄能焰袭',
  flamethrower: '喷射火焰',
  flareblitz: '闪焰冲锋',
  flashcannon: '加农光炮',
  flatter: '吹捧',
  fling: '投掷',
  flipturn: '快速折返',
  flowertrick: '千变万花',
  fly: '飞翔',
  flyingpress: '飞身重压',
  focusblast: '真气弹',
  focusenergy: '聚气',
  focuspunch: '真气拳',
  followme: '看我嘛',
  forestscurse: '森林诅咒',
  foulplay: '欺诈',
  freezedry: '冷冻干燥',
  frenzyplant: '疯狂植物',
  frostbreath: '冰息',
  futuresight: '预知未来',
  gastroacid: '胃液',
  gigadrain: '终极吸取',
  gigaimpact: '终极冲击',
  gigatonhammer: '巨力锤',
  glare: '大蛇瞪眼',
  grassknot: '打草结',
  grassyglide: '青草滑梯',
  grassyterrain: '青草场地',
  gravapple: '万有引力',
  gravity: '重力',
  growth: '生长',
  guardsplit: '防守平分',
  guardswap: '防守互换',
  guillotine: '断头钳',
  gunkshot: '垃圾射击',
  gyroball: '陀螺球',
  hammerarm: '臂锤',
  hardpress: '硬压',
  haze: '黑雾',
  headlongrush: '突飞猛扑',
  headsmash: '双刃头锤',
  healbell: '治愈铃声',
  healingwish: '治愈之愿',
  healpulse: '治愈波动',
  heatcrash: '高温重压',
  heatwave: '热风',
  heavyslam: '重磅冲撞',
  helpinghand: '帮助',
  hex: '祸不单行',
  highhorsepower: '十万马力',
  highjumpkick: '飞膝踢',
  horndrill: '角钻',
  hornleech: '木角',
  howl: '长嚎',
  hurricane: '暴风',
  hydrocannon: '加农水炮',
  hydropump: '水炮',
  hyperbeam: '破坏光线',
  hypervoice: '巨声',
  hypnosis: '催眠术',
  icebeam: '冰冻光束',
  icefang: '冰冻牙',
  icehammer: '冰锤',
  icepunch: '冰冻拳',
  iceshard: '冰砾',
  icespinner: '冰旋',
  iciclecrash: '冰柱坠击',
  iciclespear: '冰锥',
  icywind: '冰冻之风',
  imprison: '封印',
  infernalparade: '群魔乱舞',
  inferno: '炼狱',
  infestation: '死缠烂打',
  ingrain: '扎根',
  instruct: '号令',
  irondefense: '铁壁',
  ironhead: '铁头',
  irontail: '铁尾',
  jetpunch: '喷射拳',
  kingsshield: '王者盾牌',
  knockoff: '拍落',
  kowtowcleave: '仆刀',
  lashout: '泄愤',
  lastresort: '珍藏',
  lastrespects: '扫墓',
  lavaplume: '喷烟',
  leafblade: '叶刃',
  leafstorm: '飞叶风暴',
  leechlife: '吸血',
  leechseed: '寄生种子',
  lifedew: '生命水滴',
  lightofruin: '破灭之光',
  lightscreen: '光墙',
  liquidation: '水流裂破',
  lockon: '锁定',
  lowkick: '踢倒',
  lowsweep: '下盘踢',
  luminacrash: '琉光冲激',
  lunge: '猛扑',
  machpunch: '音速拳',
  magicpowder: '魔法粉',
  magicroom: '魔法空间',
  magneticflux: '磁场操控',
  magnetrise: '电磁飘浮',
  matchagotcha: '刷刷茶炮',
  meanlook: '黑色目光',
  megahorn: '超级角击',
  megakick: '百万吨重踢',
  memento: '临别礼物',
  metalburst: '金属爆炸',
  metalsound: '金属音',
  meteorbeam: '流星光束',
  meteormash: '彗星拳',
  minimize: '变小',
  mirrorcoat: '镜面反射',
  mistyexplosion: '薄雾炸裂',
  mistyterrain: '薄雾场地',
  moonblast: '月亮之力',
  moonlight: '月光',
  morningsun: '晨光',
  mortalspin: '晶光转转',
  mountaingale: '冰山风',
  muddywater: '浊流',
  mudshot: '泥巴射击',
  mudslap: '掷泥',
  mysticalfire: '魔法火焰',
  nastyplot: '诡计',
  nightdaze: '暗黑爆破',
  nightshade: '黑夜魔影',
  nightslash: '暗袭要害',
  nobleroar: '战吼',
  nuzzle: '蹭蹭脸颊',
  outrage: '逆鳞',
  overheat: '过热',
  painsplit: '分担痛楚',
  paraboliccharge: '抛物面充电',
  partingshot: '抛下狠话',
  payback: '以牙还牙',
  perishsong: '灭亡之歌',
  petalblizzard: '落英缤纷',
  petaldance: '花瓣舞',
  phantomforce: '潜灵奇袭',
  pinmissile: '飞弹针',
  playrough: '嬉闹',
  pluck: '啄食',
  poisonfang: '剧毒牙',
  poisonjab: '毒击',
  poisonpowder: '毒粉',
  pollenpuff: '花粉团',
  poltergeist: '灵骚',
  populationbomb: '鼠数儿',
  pounce: '虫扑',
  pound: '拍击',
  powergem: '力量宝石',
  powersplit: '力量平分',
  powerswap: '力量互换',
  powertrick: '力量戏法',
  powertrip: '嚣张',
  powerwhip: '强力鞭打',
  protect: '守住',
  psychic: '精神强念',
  psychicfangs: '精神之牙',
  psychicnoise: '精神噪音',
  psychicterrain: '精神场地',
  psychocut: '精神利刃',
  psychup: '自我暗示',
  psyshieldbash: '屏障猛攻',
  psyshock: '精神冲击',
  quash: '延后',
  quickattack: '电光一闪',
  quickguard: '快速防守',
  quiverdance: '蝶舞',
  ragepowder: '愤怒粉',
  ragingbull: '怒牛',
  ragingfury: '大愤慨',
  raindance: '求雨',
  rapidspin: '高速旋转',
  razorshell: '贝壳刃',
  recover: '自我再生',
  recycle: '回收利用',
  reflect: '反射壁',
  reflecttype: '镜面属性',
  rest: '睡觉',
  reversal: '起死回生',
  risingvoltage: '电力上升',
  roar: '吼叫',
  rockblast: '岩石爆击',
  rockpolish: '岩石打磨',
  rockslide: '岩崩',
  rocktomb: '岩石封锁',
  rockwrecker: '岩石炮',
  roleplay: '扮演',
  roost: '羽栖',
  round: '轮唱',
  sacredsword: '圣剑',
  safeguard: '神秘守护',
  saltcure: '盐腌',
  sandstorm: '沙暴',
  sandtomb: '流沙地狱',
  scald: '热水',
  scaleshot: '鳞射',
  scaryface: '鬼面',
  scorchingsands: '热沙大地',
  screech: '刺耳声',
  seedbomb: '种子炸弹',
  seismictoss: '地球上投',
  selfdestruct: '自爆',
  shadowball: '暗影球',
  shadowclaw: '暗影爪',
  shadowpunch: '暗影拳',
  shadowsneak: '影子偷袭',
  shedtail: '断尾',
  sheercold: '绝对零度',
  shellsidearm: '臂贝武器',
  shellsmash: '破壳',
  shelter: '闭关',
  simplebeam: '单纯光束',
  sing: '唱歌',
  skillswap: '特性互换',
  skittersmack: '爬击',
  skyattack: '神鸟猛击',
  slackoff: '偷懒',
  sleeppowder: '催眠粉',
  sleeptalk: '梦话',
  sludgebomb: '污泥炸弹',
  sludgewave: '污泥波',
  smackdown: '击落',
  smartstrike: '修长之角',
  snaptrap: '捕兽夹',
  snarl: '大声咆哮',
  snore: '打鼾',
  snowscape: '雪景',
  solarbeam: '日光束',
  solarblade: '日光刃',
  sparklingaria: '泡影的咏叹调',
  speedswap: '速度互换',
  spicyextract: '辣椒精华',
  spikes: '撒菱',
  spikyshield: '尖刺防守',
  spiritshackle: '缝影',
  spite: '怨恨',
  spitup: '喷出',
  stealthrock: '隐形岩',
  steelbeam: '铁蹄光线',
  steelroller: '铁滚轮',
  steelwing: '钢翼',
  stickyweb: '黏黏网',
  stockpile: '蓄力',
  stompingtantrum: '跺脚',
  stoneaxe: '岩斧',
  stoneedge: '尖石攻击',
  storedpower: '辅助力量',
  stormthrow: '山岚摔',
  strengthsap: '吸取力量',
  stringshot: '吐丝',
  strugglebug: '虫之抵抗',
  stuffcheeks: '大快朵颐',
  stunspore: '麻痹粉',
  substitute: '替身',
  suckerpunch: '突袭',
  sunnyday: '大晴天',
  supercellslam: '闪电强袭',
  superfang: '愤怒门牙',
  superpower: '蛮力',
  surf: '冲浪',
  swagger: '虚张声势',
  swallow: '吞下',
  sweetkiss: '天使之吻',
  sweetscent: '甜甜香气',
  switcheroo: '掉包',
  swordsdance: '剑舞',
  synthesis: '光合作用',
  syrupbomb: '糖浆炸弹',
  tailslap: '扫尾拍打',
  tailwind: '顺风',
  taunt: '挑衅',
  tearfullook: '泪眼汪汪',
  teatime: '茶会',
  teeterdance: '摇晃舞',
  temperflare: '豁出去',
  terrainpulse: '大地波动',
  thief: '小偷',
  thrash: '大闹一番',
  throatchop: '地狱突刺',
  thunder: '打雷',
  thunderbolt: '十万伏特',
  thunderfang: '雷电牙',
  thunderpunch: '雷电拳',
  thunderwave: '电磁波',
  tickle: '挠痒',
  tidyup: '大扫除',
  torchsong: '闪焰高歌',
  torment: '无理取闹',
  toxic: '剧毒',
  toxicspikes: '毒菱',
  toxicthread: '毒丝',
  trailblaze: '起草',
  transform: '变身',
  triattack: '三重攻击',
  trick: '戏法',
  trickortreat: '万圣夜',
  trickroom: '戏法空间',
  triplearrows: '三连箭',
  tripleaxel: '三旋击',
  tropkick: '热带踢',
  twinbeam: '双光束',
  upperhand: '快手还击',
  uproar: '吵闹',
  uturn: '急速折返',
  vacuumwave: '真空波',
  venoshock: '毒液冲击',
  voltswitch: '伏特替换',
  volttackle: '伏特攻击',
  waterfall: '攀瀑',
  waterpulse: '水之波动',
  watershuriken: '飞水手里剑',
  waterspout: '喷水',
  wavecrash: '波动冲',
  weatherball: '气象球',
  whirlpool: '潮旋',
  whirlwind: '吹飞',
  wideguard: '广域防守',
  wildcharge: '疯狂伏特',
  willowisp: '鬼火',
  wish: '祈愿',
  wonderroom: '奇妙空间',
  woodhammer: '木槌',
  worryseed: '烦恼种子',
  wrap: '紧束',
  xscissor: '十字剪',
  yawn: '哈欠',
  zapcannon: '电磁炮',
  zenheadbutt: '意念头锤',
}

const MOVE_DESC_ZH_BY_ID: Record<string, string> = {
  direclaw: '有 30% 几率令目标陷入睡眠、中毒或麻痹状态。',
  makeitrain: '攻击对方全体，使用后自己的特攻降低 2 级。',
  ragefist: '每当使用者受到攻击，威力提升 50，最高提升 6 次；替换下场后重新计算。',
  saltcure: '令目标每回合损失最大 HP 的 1/16；目标为钢属性或水属性时改为 1/8。',
}

function extractChampionsItemIds(championsItems: Dict<ItemData>, items: Dict<ItemData>) {
  const ids = new Set<string>()
  for (const [id, item] of Object.entries(items)) {
    const override = championsItems[id]
    if (override?.isNonstandard === 'Past') continue
    if (override?.isNonstandard === null || (item.name && !item.isNonstandard)) ids.add(id)
  }
  for (const [id, item] of Object.entries(championsItems)) {
    if (item.isNonstandard === null) ids.add(id)
  }
  return ids
}

const ITEM_ZH_BY_ID = JSON.parse(fs.readFileSync(path.join(projectRoot, 'scripts', 'item-zh.json'), 'utf8')) as Record<string, string>

function buildPinyinVariants(zh: string) {
  const syllables = pinyin(zh, { toneType: 'none', type: 'array', nonZh: 'consecutive' })
  return {
    full: syllables.join('').toLowerCase(),
    initials: syllables.map((part) => part[0] || '').join('').toLowerCase(),
  }
}

const RESIST_BERRY_NOTES: Record<string, string> = {
  occaberry: '抗火', passhoberry: '抗水', wacanberry: '抗电', rindoberry: '抗草', yacheberry: '抗冰', chopleberry: '抗格斗', kebiaberry: '抗毒', shucaberry: '抗地面', cobaberry: '抗飞行', payapaberry: '抗超能力', tangaberry: '抗虫', chartiberry: '抗岩石', kasibberry: '抗幽灵', habanberry: '抗龙', colburberry: '抗恶', babiriberry: '抗钢', roseliberry: '抗妖精', chilanberry: '抗一般'
}

const STATUS_BERRY_NOTES: Record<string, string> = {
  aspearberry: '解冰冻', cheriberry: '解麻痹', chestoberry: '解睡眠', pechaberry: '解中毒', persimberry: '解混乱', rawstberry: '解灼伤', lumberry: '解异常', leppaberry: '回复PP', oranberry: '回复HP', sitrusberry: '回复HP'
}

const TYPE_BOOST_ITEM_NOTES: Record<string, string> = {
  blackbelt: '强化格斗', blackglasses: '强化恶', charcoal: '强化火', dragonfang: '强化龙', fairyfeather: '强化妖精', hardstone: '强化岩石', magnet: '强化电', metalcoat: '强化钢', miracleseed: '强化草', mysticwater: '强化水', nevermeltice: '强化冰', poisonbarb: '强化毒', sharpbeak: '强化飞行', silkscarf: '强化一般', silverpowder: '强化虫', softsand: '强化地面', spelltag: '强化幽灵', twistedspoon: '强化超能力'
}

function itemNote(id: string) {
  return RESIST_BERRY_NOTES[id] || STATUS_BERRY_NOTES[id] || TYPE_BOOST_ITEM_NOTES[id] || ''
}

function itemGroup(id: string, isMegaStone: boolean) {
  if (RESIST_BERRY_NOTES[id]) return 2
  if (STATUS_BERRY_NOTES[id]) return 3
  if (TYPE_BOOST_ITEM_NOTES[id]) return 4
  if (id.includes('choice')) return 5
  if (['leftovers', 'shellbell'].includes(id)) return 6
  if (isMegaStone) return 99
  return 9
}

async function importData<T>(relativePath: string, exportName: string): Promise<T> {
  const modulePath = pathToFileURL(path.join(showdownRoot, relativePath)).href
  const mod = await import(modulePath)
  return mod[exportName] as T
}

function buildSlugVariants(zh: string, name: string, pinyinValue: string) {
  return Array.from(new Set([zh, name, pinyinValue].map((value) => normalizeSearch(value)).filter(Boolean)))
}

function resolveLearnsetId(id: string, species: Species, learnsets: Dict<{ learnset?: Record<string, string[]> }>, pokedex: Dict<Species>) {
  if (learnsets[id]?.learnset) return id
  const battleOnlyNames = Array.isArray(species.battleOnly) ? species.battleOnly : species.battleOnly ? [species.battleOnly] : []
  for (const battleOnlyName of battleOnlyNames) {
    const battleOnlyEntry = Object.entries(pokedex).find(([, data]) => data.name === battleOnlyName)
    if (battleOnlyEntry && learnsets[battleOnlyEntry[0]]?.learnset) return battleOnlyEntry[0]
  }
  const baseSpeciesName = species.baseSpecies
  if (baseSpeciesName) {
    const baseEntry = Object.entries(pokedex).find(([, data]) => data.name === baseSpeciesName)
    if (baseEntry && learnsets[baseEntry[0]]?.learnset) return baseEntry[0]
  }
  const dashedBaseId = id.replace(/mega.*$/i, '').replace(/gmax$/i, '')
  if (learnsets[dashedBaseId]?.learnset) return dashedBaseId
  return id
}

async function main() {
  ensureDir(outputDir)
  await ensureExternalSources()
  syncDamageCalcVendor()

  const [pokedex, formatsData, learnsets, moves, championsMoves, abilities, items, championsItems] = await Promise.all([
    importData<Dict<Species>>('data/pokedex.ts', 'Pokedex'),
    importData<Dict<FormatData>>('data/mods/champions/formats-data.ts', 'FormatsData'),
    importData<Dict<{ learnset?: Record<string, string[]> }>>('data/mods/champions/learnsets.ts', 'Learnsets'),
    importData<Dict<Move>>('data/moves.ts', 'Moves'),
    importData<Dict<Partial<Move>>>('data/mods/champions/moves.ts', 'Moves'),
    importData<Dict<{ name: string; num: number }>>('data/abilities.ts', 'Abilities'),
    importData<Dict<ItemData>>('data/items.ts', 'Items'),
    importData<Dict<ItemData>>('data/mods/champions/items.ts', 'Items'),
  ])

  const pokemonNames = readCsvMap(path.join(pokeApiRoot, 'pokemon_species_names_full.csv'), 'pokemon_species_id', 'name')
  const moveNames = readCsvMap(path.join(pokeApiRoot, 'move_names_full.csv'), 'move_id', 'name')
  const moveDescriptions = readMoveDescriptionMap(path.join(pokeApiRoot, 'move_flavor_text_full.csv'))
  const abilityNames = readCsvMap(path.join(pokeApiRoot, 'ability_names_full.csv'), 'ability_id', 'name')

  const abilityNameToMeta = new Map(Object.entries(abilities).map(([id, value]) => [value.name, { id, num: value.num }]))

  const mergedMoves = new Map<string, Move>()
  for (const [id, baseMove] of Object.entries(moves)) {
    const override = championsMoves[id]
    mergedMoves.set(id, {
      ...baseMove,
      ...override,
      name: override?.name || baseMove.name,
      type: override?.type || baseMove.type,
      category: override?.category || baseMove.category,
      basePower: override?.basePower ?? baseMove.basePower ?? 0,
      accuracy: override?.accuracy ?? baseMove.accuracy,
    })
  }

  let pokemonIndex = Object.entries(formatsData)
    .filter(([, data]) => data.tier && data.tier !== 'Illegal')
    .map(([id, format]) => {
      const species = pokedex[id]
      if (!species) return null
      const zh = pokemonNames.get(String(species.num)) || species.name
      const { full, initials } = buildPinyinVariants(zh)
      const baseStats = {
        hp: species.baseStats?.hp || 0,
        atk: species.baseStats?.atk || 0,
        def: species.baseStats?.def || 0,
        spa: species.baseStats?.spa || 0,
        spd: species.baseStats?.spd || 0,
        spe: species.baseStats?.spe || 0,
      }
      const slugVariants = buildSlugVariants(zh, species.name, full)
      return {
        id,
        num: species.num,
        zh,
        name: species.name,
        pinyin: full,
        initials,
        slugVariants,
        baseSpeciesName: species.baseSpecies || species.name,
        baseSpeciesId: normalizeSearch(species.baseSpecies || species.name),
        types: species.types || [],
        tier: format.tier,
        hasMega: (species.otherFormes || []).some((forme) => forme.toLowerCase().includes('mega')),
        abilities: Object.values(species.abilities || {})
          .filter(Boolean)
          .map((abilityName) => {
            const meta = abilityNameToMeta.get(abilityName)
            return {
              id: meta?.id || normalizeSearch(abilityName),
              en: abilityName,
              zh: abilityNames.get(String(meta?.num || '')) || abilityName,
            }
          }),
        baseStats,
        bst: Object.values(baseStats).reduce((sum, stat) => sum + stat, 0),
        searchKeys: [zh, species.name, full, initials].map(normalizeSearch).filter(Boolean),
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a?.num || 0) - (b?.num || 0))

  const meowsticBase = pokemonIndex.find((entry) => entry?.id === 'meowstic')
  if (meowsticBase && !pokemonIndex.some((entry) => entry?.id === 'meowsticf')) {
    pokemonIndex.push({
      ...meowsticBase,
      id: 'meowsticf',
      name: 'Meowstic-F',
      slugVariants: Array.from(new Set([...meowsticBase.slugVariants, 'meowsticf', 'meowstic-f'])),
      abilities: meowsticBase.abilities.map((ability) => ability.en === 'Prankster' ? { id: 'competitive', en: 'Competitive', zh: abilityNames.get(String(abilityNameToMeta.get('Competitive')?.num || '')) || '好胜' } : ability),
    })
  }
  pokemonIndex = pokemonIndex
    .filter((entry) => entry?.id !== 'meowsticfmega')
    .map((entry) => entry?.id === 'meowsticmmega' ? { ...entry, name: 'Meowstic-Mega' } : entry)
    .sort((a, b) => (a?.num || 0) - (b?.num || 0) || (a?.name || '').localeCompare(b?.name || ''))

  const allowedItemIds = extractChampionsItemIds(championsItems, items)

  const allowedItems = Array.from(allowedItemIds)
    .map((id) => {
      const baseItem = items[id]
      const modItem = championsItems[id]
      const sourceItem = modItem || baseItem
      if (!sourceItem?.name && !baseItem?.name) return null
      if (modItem?.isNonstandard && modItem.isNonstandard !== 'Past') return null
      const en = baseItem?.name || sourceItem.name
      const baseZh = ITEM_ZH_BY_ID[id] || en
      const note = itemNote(id)
      const zh = note ? `${baseZh} (${note})` : baseZh
      const py = buildPinyinVariants(baseZh)
      const notePy = buildPinyinVariants(note)
      const isMegaStone = !!(baseItem?.megaStone || modItem?.megaStone)
      return {
        id,
        en,
        zh,
        search: [normalizeSearch(en), normalizeSearch(baseZh), normalizeSearch(zh), normalizeSearch(note), py.full, py.initials, notePy.full, notePy.initials, id].filter(Boolean).join(' '),
        note: note || undefined,
        group: itemGroup(id, isMegaStone),
        isMegaStone,
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a!.group - b!.group) || a!.zh.localeCompare(b!.zh, 'zh-Hans-CN'))

  const pokemonDetails = Object.fromEntries(
    pokemonIndex.map((pokemon) => {
      const moveSourceId = resolveLearnsetId(pokemon!.id, pokedex[pokemon!.id], learnsets, pokedex)
      const moveIds = Object.keys(learnsets[moveSourceId]?.learnset || {})
      const moveList = moveIds
        .map((moveId) => {
          const move = mergedMoves.get(moveId)
          if (!move) return null
          const zh = MOVE_ZH_BY_ID[moveId] || moveNames.get(String(move.num || '')) || move.name
          const showdownDescription = move.shortDesc || move.desc || ''
          const description = MOVE_DESC_ZH_BY_ID[moveId] ||
            moveDescriptions.get(String(move.num || '')) ||
            (/[\u4e00-\u9fff]/.test(showdownDescription) ? showdownDescription : buildMoveDescription(move))
          return {
            id: moveId,
            en: move.name,
            zh,
            description,
            pinyin: buildPinyinVariants(zh).full,
            type: move.type,
            category: move.category,
            basePower: move.basePower || 0,
            accuracy: move.accuracy,
          }
        })
        .filter(Boolean)
        .sort((a, b) => {
          const categoryOrder = { Status: 0, Physical: 1, Special: 2 }
          const diff = categoryOrder[a!.category] - categoryOrder[b!.category]
          if (diff !== 0) return diff
          if ((b!.basePower || 0) !== (a!.basePower || 0)) return (b!.basePower || 0) - (a!.basePower || 0)
          return a!.type.localeCompare(b!.type, 'zh-Hans-CN')
        })
      return [pokemon!.id, { ...pokemon, moves: moveList }]
    })
  )

  fs.writeFileSync(path.join(outputDir, 'pokemon-index.json'), JSON.stringify(pokemonIndex, null, 2))
  fs.writeFileSync(path.join(outputDir, 'pokemon-details.json'), JSON.stringify(pokemonDetails, null, 2))
  fs.writeFileSync(path.join(outputDir, 'items.json'), JSON.stringify(allowedItems, null, 2))

  console.log(`Built ${pokemonIndex.length} pokemon records.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
