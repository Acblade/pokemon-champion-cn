import assert from 'node:assert/strict'
import { championsDetails, type PokemonDetail, type PokemonMove } from '../src/data/championsDetails'
import { ruleItems } from '../src/data/items'
import { calculateChampionsDamage, getChampionsDefaultMoveHits, getChampionsMoveHitOptions } from '../src/lib/championsCalc'

function detail(id: string): PokemonDetail {
  const pokemon = championsDetails[id]
  assert.ok(pokemon, `missing generated detail for ${id}`)
  return pokemon
}

function fallbackMove(en: string, type: string, category: PokemonMove['category'], basePower: number): PokemonMove {
  return {
    id: en.toLowerCase().replace(/[^a-z0-9]+/g, ''),
    en,
    zh: en,
    pinyin: en.toLowerCase(),
    type,
    category,
    basePower,
    accuracy: true,
  }
}

function moveFor(detail: PokemonDetail, en: string, type: string, category: PokemonMove['category'], basePower: number): PokemonMove {
  return detail.moves.find((move) => move.en === en) ?? fallbackMove(en, type, category, basePower)
}

const garchomp = detail('garchomp')
const tyranitar = detail('tyranitar')
const basculegion = detail('basculegion')

const scaleShot = moveFor(garchomp, 'Scale Shot', 'Dragon', 'Physical', 25)
const dragonClaw = moveFor(garchomp, 'Dragon Claw', 'Dragon', 'Physical', 80)
assert.deepEqual(getChampionsMoveHitOptions('Scale Shot'), [2, 3, 4, 5])
assert.equal(getChampionsDefaultMoveHits('Scale Shot'), 3)
assert.equal(getChampionsDefaultMoveHits('Scale Shot', 'Skill Link'), 5)
assert.deepEqual(getChampionsMoveHitOptions('Triple Axel'), [1, 2, 3])
assert.equal(getChampionsDefaultMoveHits('Triple Axel'), 3)
assert.deepEqual(getChampionsMoveHitOptions('Population Bomb'), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
assert.equal(getChampionsDefaultMoveHits('Population Bomb'), 10)

const scaleShotTwoHits = calculateChampionsDamage({
  attacker: garchomp,
  defender: tyranitar,
  moveName: 'Scale Shot',
  moveState: { move: scaleShot, hits: 2 },
})

const scaleShotFiveHits = calculateChampionsDamage({
  attacker: garchomp,
  defender: tyranitar,
  moveName: 'Scale Shot',
  moveState: { move: scaleShot, hits: 5 },
})

assert.equal(scaleShotTwoHits.move.hits, 2)
assert.equal(scaleShotFiveHits.move.hits, 5)
assert.ok(scaleShotFiveHits.range[0] > scaleShotTwoHits.range[0], 'Scale Shot 5 hits should outdamage 2 hits')

assert.ok(ruleItems.some((item) => item.id === 'lifeorb' && item.en === 'Life Orb'), 'Life Orb should be a generated legal item')

const dragonClawNoItem = calculateChampionsDamage({
  attacker: garchomp,
  defender: tyranitar,
  moveName: 'Dragon Claw',
  moveState: { move: dragonClaw },
})

const dragonClawLifeOrb = calculateChampionsDamage({
  attacker: garchomp,
  defender: tyranitar,
  moveName: 'Dragon Claw',
  moveState: { move: dragonClaw },
  attackerItem: 'Life Orb',
})

assert.ok(dragonClawLifeOrb.range[0] > dragonClawNoItem.range[0], 'Life Orb should boost damage')

const lastRespects = moveFor(basculegion, 'Last Respects', 'Ghost', 'Physical', 50)
const lastRespectsZero = calculateChampionsDamage({
  attacker: basculegion,
  defender: tyranitar,
  moveName: 'Last Respects',
  moveState: { move: lastRespects },
  attackerState: { alliesFainted: 0 },
})

const lastRespectsOne = calculateChampionsDamage({
  attacker: basculegion,
  defender: tyranitar,
  moveName: 'Last Respects',
  moveState: { move: lastRespects },
  attackerState: { alliesFainted: 1 },
})

assert.equal(lastRespectsZero.move.bp, 50)
assert.equal(lastRespectsOne.move.bp, 100)
assert.ok(lastRespectsOne.range[0] > lastRespectsZero.range[0], 'Last Respects should gain power with fainted allies')

console.log({
  scaleShot: {
    hitOptions: getChampionsMoveHitOptions('Scale Shot'),
    twoHits: scaleShotTwoHits.range,
    fiveHits: scaleShotFiveHits.range,
  },
  lifeOrb: {
    noItem: dragonClawNoItem.range,
    lifeOrb: dragonClawLifeOrb.range,
  },
  lastRespects: {
    zeroFainted: { bp: lastRespectsZero.move.bp, range: lastRespectsZero.range },
    oneFainted: { bp: lastRespectsOne.move.bp, range: lastRespectsOne.range },
  },
})
