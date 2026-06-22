# Agent Instructions

This project is a Chinese Pokemon Champions site. When the user asks to update to a new season or rule, follow `UPDATE_WORKFLOW.md`.

Do not patch only the example the user mentions. Always perform full synchronization and audit:

- Confirm the Pokemon Showdown format and mod from `out/tmp/pokemon-showdown/config/formats.ts`.
- Sync legal Pokemon, legal items, per-Pokemon learnsets, moves, Mega forms, and damage-calc from Pokemon Showdown / damage-calc.
- Sync usage and trainer ranking data from `champs.pokedb.tokyo` for the requested season/rule.
- Fill Chinese translations for all generated moves and all generated items, including Mega stones.
- Report audit counts: item missing/extra, untranslated items, untranslated moves, learnset mismatch.
- Run `npm run build`, `npm run lint`, and `npx tsx scripts/test-champions-calc.ts`.

Important historical bug: custom Champions Mega stones such as `raichunitex` / `raichunitey` can be legal in Showdown but display as English if `scripts/item-zh.json` is missing entries. Audit all items, not only non-Mega items.
