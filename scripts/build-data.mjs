import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinyin } from 'pinyin-pro';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..', '..');
const showdownRoot = path.resolve(workspaceRoot, 'out', 'tmp', 'pokemon-showdown');
const outputDir = path.resolve(projectRoot, 'src', 'generated');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function stripTypeAnnotations(source) {
  return source
    .replace(/export const\s+(\w+)\s*:\s*[^=]+=/g, 'export const $1 =')
    .replace(/\blet\s+(\w+)\s*:\s*[^=;]+=/g, 'let $1 =')
    .replace(/\bconst\s+(\w+)\s*:\s*[^=;]+=/g, 'const $1 =')
    .replace(/\)\s*:\s*[^\{]+\{/g, ') {')
    .replace(/([\w\]\)\.])!([\[\.\)\+\-\*\/;,])/g, '$1$2');
}

function extractObjectLiteral(source, exportName) {
  const marker = `export const ${exportName}`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Cannot find export ${exportName}`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = braceStart; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];
    const prev = source[i - 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (char === stringChar && prev !== '\\') {
        inString = false;
        stringChar = '';
      }
      continue;
    }
    if (char === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      inString = true;
      stringChar = char;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(braceStart, i + 1);
      }
    }
  }
  throw new Error(`Unclosed object literal for ${exportName}`);
}

function evaluateExport(filePath, exportName) {
  const source = stripTypeAnnotations(readText(filePath));
  const objectLiteral = extractObjectLiteral(source, exportName);
  return Function(`return (${objectLiteral});`)();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function normalizeSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s'’`-]+/g, '')
    .replace(/[^\p{Script=Han}a-z0-9]/gu, '');
}

function buildPinyinVariants(zh) {
  if (!zh) return { full: '', initials: '' };
  const syllables = pinyin(zh, { toneType: 'none', type: 'array', nonZh: 'consecutive' });
  return {
    full: syllables.join('').toLowerCase(),
    initials: syllables.map((part) => part[0] || '').join('').toLowerCase(),
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadPokeApiNames(csvPath, idColumn, nameColumn, languageId = '12') {
  const rows = parseCsv(readText(csvPath));
  const header = rows.shift();
  const idIndex = header.indexOf(idColumn);
  const langIndex = header.indexOf('local_language_id');
  const nameIndex = header.indexOf(nameColumn);
  const map = new Map();
  for (const row of rows) {
    if (row[langIndex] !== languageId) continue;
    map.set(row[idIndex], row[nameIndex]);
  }
  return map;
}

const pokedex = evaluateExport(path.join(showdownRoot, 'data', 'pokedex.ts'), 'Pokedex');
const formatsData = evaluateExport(path.join(showdownRoot, 'data', 'mods', 'champions', 'formats-data.ts'), 'FormatsData');
const learnsets = evaluateExport(path.join(showdownRoot, 'data', 'mods', 'champions', 'learnsets.ts'), 'Learnsets');
const championsMoves = evaluateExport(path.join(showdownRoot, 'data', 'mods', 'champions', 'moves.ts'), 'Moves');
const baseMoves = evaluateExport(path.join(showdownRoot, 'data', 'moves.ts'), 'Moves');
const baseAbilities = evaluateExport(path.join(showdownRoot, 'data', 'abilities.ts'), 'Abilities');

const pokeApiRoot = path.resolve(workspaceRoot, 'out', 'tmp', 'pokeapi-cache');
ensureDir(pokeApiRoot);

const pokemonNames = loadPokeApiNames(path.join(pokeApiRoot, 'pokemon_species_names.csv'), 'pokemon_species_id', 'name');
const moveNames = loadPokeApiNames(path.join(pokeApiRoot, 'move_names.csv'), 'move_id', 'name');
const abilityNames = loadPokeApiNames(path.join(pokeApiRoot, 'ability_names.csv'), 'ability_id', 'name');

const abilityNameToId = new Map(
  Object.entries(baseAbilities).map(([id, value]) => [value.name, { id, num: value.num }])
);

const moveEntries = [];
for (const [id, overrides] of Object.entries(championsMoves)) {
  const base = baseMoves[id];
  if (!base) continue;
  moveEntries.push({
    id,
    en: overrides.name || base.name,
    zh: moveNames.get(String(overrides.num || base.num || '')) || overrides.name || base.name,
    type: overrides.type || base.type,
    category: overrides.category || base.category,
    basePower: overrides.basePower ?? base.basePower ?? 0,
    accuracy: overrides.accuracy ?? base.accuracy,
  });
}
const moveMap = new Map(moveEntries.map((move) => [move.id, move]));

const legalPokemon = Object.entries(formatsData)
  .filter(([, data]) => data.tier && data.tier !== 'Illegal')
  .map(([id, data]) => {
    const species = pokedex[id];
    if (!species) return null;
    const zh = pokemonNames.get(String(species.num || '')) || species.name;
    const { full, initials } = buildPinyinVariants(zh);
    const searchKeys = new Set([
      normalizeSearch(zh),
      normalizeSearch(species.name),
      normalizeSearch(full),
      normalizeSearch(initials),
    ]);
    return {
      id,
      num: species.num,
      name: species.name,
      zh,
      pinyin: full,
      initials,
      types: species.types || [],
      tier: data.tier,
      baseStats: species.baseStats,
      bst: Object.values(species.baseStats || {}).reduce((sum, stat) => sum + Number(stat || 0), 0),
      abilities: Object.values(species.abilities || {}).filter(Boolean).map((abilityName) => {
        const abilityMeta = abilityNameToId.get(abilityName);
        return {
          en: abilityName,
          zh: abilityNames.get(String(abilityMeta?.num || '')) || abilityName,
          id: abilityMeta?.id || normalizeSearch(abilityName),
        };
      }),
      hasMega: /mega/i.test(species.name) ? false : Array.isArray(species.otherFormes) && species.otherFormes.some((forme) => /mega/i.test(forme)),
      searchKeys: Array.from(searchKeys).filter(Boolean),
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.num - b.num);

const pokemonDetails = Object.fromEntries(
  legalPokemon.map((pokemon) => {
    const learnset = learnsets[pokemon.id]?.learnset || {};
    const availableMoves = Object.keys(learnset)
      .map((moveId) => moveMap.get(moveId))
      .filter(Boolean)
      .sort((a, b) => {
        const categoryOrder = { Status: 0, Physical: 1, Special: 2 };
        const catDiff = categoryOrder[a.category] - categoryOrder[b.category];
        if (catDiff !== 0) return catDiff;
        if (b.basePower !== a.basePower) return b.basePower - a.basePower;
        return a.type.localeCompare(b.type, 'zh-Hans-CN');
      });
    return [pokemon.id, {
      ...pokemon,
      moves: availableMoves,
    }];
  })
);

ensureDir(outputDir);
fs.writeFileSync(path.join(outputDir, 'pokemon-index.json'), JSON.stringify(legalPokemon, null, 2));
fs.writeFileSync(path.join(outputDir, 'pokemon-details.json'), JSON.stringify(pokemonDetails, null, 2));
fs.writeFileSync(path.join(outputDir, 'moves.json'), JSON.stringify(moveEntries, null, 2));

console.log(`Built ${legalPokemon.length} Pokemon entries and ${moveEntries.length} move entries.`);
