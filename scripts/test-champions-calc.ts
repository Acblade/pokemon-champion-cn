// @ts-expect-error vendor CommonJS bundle has no local declaration file
import calc from '../vendor/smogon-calc/index.cjs'

const attacker = new calc.Pokemon(0, 'Meganium-Mega', {
  ability: 'Mega Sol',
  item: 'Meganiumite',
})
const defender = new calc.Pokemon(0, 'Tyranitar', {
  ability: 'Sand Stream',
})
const move = new calc.Move(0, 'Weather Ball')
const field = new calc.Field({ weather: 'Sand' })

const result = calc.calculate(0, attacker, defender, move, field)

console.log({
  moveType: result.move.type,
  range: result.range(),
  desc: result.desc(),
})
