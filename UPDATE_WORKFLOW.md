# Champions 数据更新流程

以后新聊天里，可以直接说：

```text
更新到赛季 M-n，规则 M-X。按 UPDATE_WORKFLOW.md 和 AGENTS.md 的完整流程执行。
```

如果想更保险，可以说：

```text
更新到赛季 M-n，规则 M-X。请从 Pokemon Showdown 同步当前规则下全部合法宝可梦、全部合法道具、每个宝可梦的合法招式、Mega 形态和 damage-calc；从 champs.pokedb.tokyo 同步使用率和玩家排名；补齐中文翻译；最后给我 missing/extra/未翻译/learnset mismatch 审计结果。
```

## 固定数据源

- 规则和 mod 对应关系：`out/tmp/pokemon-showdown/config/formats.ts`
- 合法宝可梦：`out/tmp/pokemon-showdown/data/mods/<mod>/formats-data.ts`
- 每只宝可梦合法招式：`out/tmp/pokemon-showdown/data/mods/<mod>/learnsets.ts`
- 招式数据：`out/tmp/pokemon-showdown/data/moves.ts` + `out/tmp/pokemon-showdown/data/mods/<mod>/moves.ts`
- 道具数据：`out/tmp/pokemon-showdown/data/items.ts` + `out/tmp/pokemon-showdown/data/mods/<mod>/items.ts`
- 伤害计算器：`out/tmp/damage-calc/calc/src/mechanics/champions.ts`
- 使用率：`https://champs.pokedb.tokyo/pokemon/list?season=<season>&rule=<rule>`
- 玩家排名：`https://champs.pokedb.tokyo/trainer/list?season=<season>&rule=<rule>`

当前 M-B 使用 Pokemon Showdown 的 `champions` mod。未来规则更新时，必须先从 `config/formats.ts` 确认新规则对应的 mod，不要假设仍然是 `champions`。

## 必须执行

1. 运行 `npm run build-data`。
   - 该脚本会拉取 Pokemon Showdown 和 damage-calc。
   - 该脚本会重新生成本地 `vendor/smogon-calc/index.mjs`。
   - 该脚本会重新生成宝可梦、招式、道具、Mega 形态数据。

2. 运行使用率同步，例如当前规则：

```bash
npm run update-usage
```

必要时设置：

```bash
CHAMPS_SEASONS=<season> CHAMPS_RULES=<rule> CHAMPS_DEFAULT_SEASON=<season> npm run update-usage
```

Windows PowerShell 可用：

```powershell
$env:CHAMPS_SEASONS='<season>'; $env:CHAMPS_RULES='<rule>'; $env:CHAMPS_DEFAULT_SEASON='<season>'; npm run update-usage
```

3. 补齐翻译。
   - 道具中文：`scripts/item-zh.json`
   - Showdown 自定义招式中文：`MOVE_ZH_BY_ID` in `scripts/build-data.ts`
   - 所有生成后的道具和招式都不能残留英文名。

4. 跑完整审计。

道具审计必须确认：

- Showdown 当前规则合法道具数量
- 本站生成道具数量
- `missing` 必须为空
- `extra` 必须为空
- `untranslatedItems` 必须为 `0`

招式审计必须确认：

- 全站唯一招式数量
- `untranslatedMoves` 必须为 `0`

learnset 审计必须确认：

- 每个生成宝可梦的招式数量与 Showdown `learnsets.ts` 一致
- `mismatchCount` 必须为 `0`

5. 跑验证。

```bash
npm run build
npm run lint
npx tsx scripts/test-champions-calc.ts
```

## 验收口径

不要只修用户举的例子。任何一次规则或赛季更新，都必须按全量同步验收：

- 合法宝可梦来自当前 Showdown mod
- 合法道具来自当前 Showdown mod + base items 合并结果，包括所有 Mega 石
- 每只宝可梦招式来自当前 Showdown mod learnsets
- damage-calc 来自最新 Champions 计算逻辑
- champs.pokedb.tokyo 使用率和玩家排名来自目标 season/rule
- 中文翻译无遗漏
- 审计结果给出具体数字
