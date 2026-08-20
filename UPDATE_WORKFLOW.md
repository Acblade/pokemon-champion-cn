# Champions 新赛季 / 新规则更新流程

以后可以直接说：

```text
更新到赛季 M-n，规则 M-X。按 UPDATE_WORKFLOW.md 和 AGENTS.md 的完整流程执行。
```

执行时不要只修某个举例问题。每次规则或赛季更新都按“全量同步 + 全量审计”处理。

## 目标

- 从 Pokemon Showdown 当前规则 mod 同步合法宝可梦、合法道具、每只宝可梦招式池、Mega 形态。
- 从 damage-calc 同步 Champions 伤害计算逻辑。
- 从 `champs.pokedb.tokyo` 同步目标赛季/规则的使用率和玩家排名。
- 补齐生成后所有道具、招式中文名，特别是自定义 Mega 石。
- 输出审计数字：宝可梦 missing/extra、道具 missing/extra、未翻译道具、未翻译招式、learnset mismatch。
- 最后跑构建、代码检查、伤害计算测试。

## 规则和 mod

必须先从 `out/tmp/pokemon-showdown/config/formats.ts` 确认目标规则对应的 Showdown mod，不要凭旧经验假设。

当前已知：

- M-A: `championsregma`
- M-B: `champions`

生成脚本默认使用 `champions`。如果目标规则不是默认 mod，先设置：

```powershell
$env:CHAMPIONS_SHOWDOWN_MOD='<mod>'
```

例如 M-A：

```powershell
$env:CHAMPIONS_SHOWDOWN_MOD='championsregma'
```

## 固定数据源

- 规则和 mod 对应关系：`out/tmp/pokemon-showdown/config/formats.ts`
- 合法宝可梦：`out/tmp/pokemon-showdown/data/mods/<mod>/formats-data.ts`
- 每只宝可梦合法招式：`out/tmp/pokemon-showdown/data/mods/<mod>/learnsets.ts`
- 招式数据：`out/tmp/pokemon-showdown/data/moves.ts` + `out/tmp/pokemon-showdown/data/mods/<mod>/moves.ts`
- 道具数据：`out/tmp/pokemon-showdown/data/items.ts` + `out/tmp/pokemon-showdown/data/mods/<mod>/items.ts`
- 伤害计算器：`out/tmp/damage-calc/calc/src/mechanics/champions.ts`
- 使用率：`https://champs.pokedb.tokyo/pokemon/list?season=<season>&rule=<rule>`
- 玩家排名首选：`https://champs.pokedb.tokyo/trainer/list?season=<season>&rule=<rule>`
- 玩家排名实时 fallback：`https://op.gg/pokemon-champions/leaderboards?format=<single|double>&season=m-<season>`

当 Battle Database 返回 403、旧赛季重定向或空数据时，可以使用 OP.GG 的公开实时榜 fallback。必须明确标记来源为 OP.GG 和“实时榜（非最终排名）”，并严格校验目标 season、single/double、页码、总数和 top 300 的完整性。OP.GG 当前没有已验证的玩家榜 API，因此 HTML/RSC schema 任一断言失败时必须保留最近一次成功排名，不得写入部分数据。赛季结束后再抓取最终快照，并优先与恢复可用的 Battle Database 交叉核对后冻结。

## 推荐命令

设置目标赛季、规则和默认显示赛季：

```powershell
$env:CHAMPS_SEASONS='<season>'
$env:CHAMPS_RULES='<rule>'
$env:CHAMPS_DEFAULT_SEASON='<season>'
```

同步规则数据、damage-calc、使用率：

```powershell
npm run build-data
npm run update-usage
```

如果队伍分享也要更新：

```powershell
npm run update-team-shares
```

补齐翻译后，跑审计：

```powershell
npm run audit-data
```

最终验收：

```powershell
npm run verify-update
```

`verify-update` 会依次执行：

- `npm run audit-data`
- `npm run build`
- `npm run lint`
- `npx tsx scripts/test-champions-calc.ts`

## 翻译补齐

- 道具中文：`scripts/item-zh.json`
- Showdown 自定义招式中文：`MOVE_ZH_BY_ID` in `scripts/build-data.ts`

所有生成后的道具和招式都不能残留英文显示名。历史上 `raichunitex` / `raichunitey` 这类 Champions 自定义 Mega 石容易漏翻译，所以审计必须覆盖所有道具，不能只看非 Mega 道具。

## 审计口径

`npm run audit-data` 会输出并写入 `out/audit/champions-update-audit.json`。

必须为 0：

- 宝可梦 missing / extra
- 道具 missing / extra
- 未翻译道具
- 未翻译招式
- learnset mismatch
- 使用率中的 missingPokemon

必须存在：

- 目标 `champs-season-<season>-rule-<rule>` 使用率数据集
- 目标规则的玩家排名数据

审计失败时先修数据或翻译，再重新运行 `npm run build-data` 和 `npm run audit-data`。

## 验收口径

- 合法宝可梦来自当前 Showdown mod。
- 合法道具来自当前 Showdown mod + base items 合并结果，包括所有 Mega 石。
- 每只宝可梦招式池来自当前 Showdown mod 的 `learnsets.ts`。
- damage-calc 来自最新 Champions 计算逻辑。
- 使用率和玩家排名来自目标 season/rule。
- 中文翻译无遗漏。
- 最终回复用户时给出审计数字和验证命令结果。
