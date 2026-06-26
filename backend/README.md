# Manual Trainer Ranking Backend

This optional backend lets the static site write manually imported trainer rankings back to GitHub without exposing a GitHub token in the browser.

Recommended deployment: Cloudflare Workers.

## Secrets

Create a fine-grained GitHub token with access only to `Acblade/pokemon-champion-cn` and `Contents: Read and write`.

Configure this Worker secret:

```bash
wrangler secret put GITHUB_TOKEN
```

The public endpoint accepts valid 300-player ranking imports from the site and commits them with the Worker-held GitHub token. The token is never exposed to browser users.

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
  "rankingTimeIso": "2026-06-25T14:46:00.000Z",
  "rankingsText": "1 2273.111 べくと べくと ..."
}
```

`rankingTimeJst` is copied from Battle Database Champions and parsed as Japan time. The browser also sends the converted ISO timestamp so viewers in different regions can see the time in their local time zone.

On success, the Worker commits updated `src/generated/usage-datasets.json` and, for the default dataset, `src/generated/pikalytics-usage.json` to `main`. GitHub Pages then redeploys normally.
