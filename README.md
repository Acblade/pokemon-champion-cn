# 宝可梦冠军中文工具站

一个基于 React + TypeScript + Vite 的静态网站。推荐用 **GitHub 仓库 + Cloudflare Pages** 发布，这样发布后仍然可以继续编辑：本地改代码 → commit/push 到 GitHub → Cloudflare 自动重新构建并上线。

## 本地开发

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
```

构建产物输出到 `dist/`。

## 推荐部署方式：Cloudflare Pages + GitHub

不要用一次性上传 zip 作为长期方案；zip 适合临时预览，但后续编辑不会自动同步。

### 1. 创建独立 GitHub 仓库

建议把本项目作为独立仓库发布，不要把整个 OpenClaw workspace 推上 GitHub，避免泄露私人文件。

仓库内容应以本目录为根目录：

```txt
apps/pokemon-champion-cn/
```

也就是说 GitHub 仓库里应该直接看到 `package.json`、`src/`、`public/`、`vite.config.ts` 等文件。

### 2. Cloudflare Pages 连接 GitHub 仓库

Cloudflare Dashboard → Pages → Create project → Connect to Git → 选择该 GitHub 仓库。

构建设置：

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: 留空（如果仓库根目录就是本项目）
- Environment variable: `NODE_VERSION=24`

项目里也包含 `.node-version`，用于提示 Node 版本。

### 3. 后续编辑流程

```bash
git add .
git commit -m "Update site"
git push
```

推送后 Cloudflare Pages 会自动部署新版本。每次部署都有 Preview/Production 记录，可以回滚。

## SPA 路由支持

`public/_redirects` 已配置：

```txt
/* /index.html 200
```

这样直接访问 `/saved` 或某个宝可梦详情 URL 时，Cloudflare Pages 会回退到 `index.html`，避免刷新后 404。

## 域名绑定

部署成功后，在 Cloudflare Pages 项目里进入：

`Custom domains` → `Set up a custom domain`

添加你想使用的域名，例如：

- `pokemon.example.com`
- `dex.example.com`
- `example.com`

如果域名 DNS 已托管在 Cloudflare，Cloudflare 会自动创建所需记录；否则需要按提示在域名服务商处添加 CNAME / DNS 记录。
