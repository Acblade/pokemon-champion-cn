# Agent Instructions

This project is a Chinese Pokemon Champions site. When the user asks to update to a new season or rule, follow `UPDATE_WORKFLOW.md`.

For a requested season/rule update or a defect caused by incomplete season synchronization, complete the full synchronization and audit below. For an unrelated UI, wording, or focused logic change, preserve current season data and validate the affected behavior; do not refresh external datasets solely because this file contains the update workflow.

## Season and rule update workflow

Do not patch only the example when performing that update:

- Confirm the Pokemon Showdown format and mod from `out/tmp/pokemon-showdown/config/formats.ts`.
- Set `CHAMPIONS_SHOWDOWN_MOD=<mod>` before `npm run build-data` when the requested rule is not the default `champions` mod. Current known mapping: M-A = `championsregma`, M-B = `champions`.
- Sync legal Pokemon, legal items, per-Pokemon learnsets, moves, Mega forms, and damage-calc from Pokemon Showdown / damage-calc.
- Sync usage and trainer ranking data from `champs.pokedb.tokyo` for the requested season/rule.
- Fill Chinese translations for all generated moves and all generated items, including Mega stones.
- Run `npm run audit-data` and report audit counts: Pokemon missing/extra, item missing/extra, untranslated items, untranslated moves, learnset mismatch, usage missingPokemon, trainer ranking count.
- Run `npm run verify-update` for final validation.

Important historical bug: custom Champions Mega stones such as `raichunitex` / `raichunitey` can be legal in Showdown but display as English if `scripts/item-zh.json` is missing entries. Audit all items, not only non-Mega items.
