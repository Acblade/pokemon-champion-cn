// @ts-expect-error vendor CommonJS bundle has no local declaration file
import calc from '../vendor/smogon-calc/index.cjs'

console.log(Object.keys(calc).slice(0, 20))
console.log('Generations exists:', !!calc.Generations)
console.log('Pokemon exists:', !!calc.Pokemon)
console.log('Move exists:', !!calc.Move)
