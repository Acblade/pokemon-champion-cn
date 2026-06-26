# Pokemon Champion 中文数据站

面向 Pokemon Champions 规则环境的中文数据站，当前部署在 GitHub Pages：

https://acblade.github.io/pokemon-champion-cn/

站点包含宝可梦列表、详情页、当前使用率、伤害计算器、队伍分享和本地盒子配置管理。

## 本地开发

```bash
npm install
npm run dev
```

## 常用命令

```bash
npm run build
npm run lint
npx tsx scripts/test-champions-calc.ts
```

## 数据同步

主要数据由脚本生成，不建议手工改生成文件作为长期方案。

```bash
npm run build-data
npm run update-usage
npm run update-team-shares
```

规则或赛季更新时，按 `UPDATE_WORKFLOW.md` 执行完整同步和审计。

## 数据来源

- Pokemon Showdown / Champions mod：合法宝可梦、道具、招式池、Mega 形态。
- Smogon damage-calc：伤害计算底层逻辑。
- Battle Database Champions：使用率与玩家排名。
- VGCPastes Repository：队伍分享与 Pokepaste 配置。

## 部署

推送到 `main` 后，GitHub Actions 会构建并发布到 GitHub Pages。构建产物在 `dist/`，SPA 刷新回退由 `404.html` 复制流程处理。
