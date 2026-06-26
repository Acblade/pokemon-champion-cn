# Manual Trainer Ranking Backend

This optional backend lets the static site write manually imported trainer rankings back to GitHub without exposing a GitHub token in the browser.

Recommended deployment: Cloudflare Workers.

## Secrets

Create a fine-grained GitHub token with access only to `Acblade/pokemon-champion-cn` and `Contents: Read and write`.

Configure these Worker secrets:

```bash
wrangler secret put GITHUB_TOKEN
wrangler secret put IMPORT_SECRET
```

`IMPORT_SECRET` is the import password you type in the site. It prevents random visitors from writing fake rankings to the repository.

## Deploy

```bash
cd backend
cp wrangler.example.toml wrangler.toml
wrangler deploy
```

After deployment, copy the Worker URL and set this GitHub repository variable:

```text
MANUAL_RANKING_API_URL=https://your-worker-name.your-subdomain.workers.dev
```

The GitHub Pages workflow passes that variable into the frontend build as `VITE_MANUAL_RANKING_API_URL`. After the next Pages deploy, the manual import panel will submit to the backend.

## Request

The site sends:

```json
{
  "datasetKey": "champs-season-3-rule-1",
  "rankingTimeJst": "2026/6/25 23:46",
  "rankingsText": "1 2273.111 べくと べくと ..."
}
```

The request must include:

```text
X-Import-Secret: your-import-secret
```

On success, the Worker commits updated `src/generated/usage-datasets.json` and, for the default dataset, `src/generated/pikalytics-usage.json` to `main`. GitHub Pages then redeploys normally.
