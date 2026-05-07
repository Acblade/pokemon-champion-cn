import { pathToFileURL } from 'node:url'
import path from 'node:path'

const workspaceRoot = path.resolve(process.cwd(), '..', '..')
const showdownRoot = path.resolve(workspaceRoot, 'out', 'tmp', 'pokemon-showdown')

async function main() {
  const pokedexMod = await import(pathToFileURL(path.join(showdownRoot, 'data', 'pokedex.ts')).href)
  const formatsDataMod = await import(pathToFileURL(path.join(showdownRoot, 'data', 'mods', 'champions', 'formats-data.ts')).href)
  const learnsetsMod = await import(pathToFileURL(path.join(showdownRoot, 'data', 'mods', 'champions', 'learnsets.ts')).href)
  const movesMod = await import(pathToFileURL(path.join(showdownRoot, 'data', 'moves.ts')).href)
  const championsMovesMod = await import(pathToFileURL(path.join(showdownRoot, 'data', 'mods', 'champions', 'moves.ts')).href)
  const abilitiesMod = await import(pathToFileURL(path.join(showdownRoot, 'data', 'abilities.ts')).href)

  console.log({
    pokedex: Object.keys(pokedexMod.Pokedex || {}).length,
    formatsData: Object.keys(formatsDataMod.FormatsData || {}).length,
    learnsets: Object.keys(learnsetsMod.Learnsets || {}).length,
    moves: Object.keys(movesMod.Moves || {}).length,
    championsMoves: Object.keys(championsMovesMod.Moves || {}).length,
    abilities: Object.keys(abilitiesMod.Abilities || {}).length,
  })

  console.log('sample species', pokedexMod.Pokedex?.snorlax)
  console.log('sample format', formatsDataMod.FormatsData?.snorlax)
  console.log('sample learnset', Object.keys(learnsetsMod.Learnsets?.snorlax?.learnset || {}).slice(0, 10))
  console.log('sample move', movesMod.Moves?.bodyslam)
  console.log('sample champions override', championsMovesMod.Moves?.bodyslam)
  console.log('sample ability', abilitiesMod.Abilities?.immunity)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
