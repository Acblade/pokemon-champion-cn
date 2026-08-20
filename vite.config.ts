import { sites } from '@openai/sites-vite-plugin'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const base = process.env.GITHUB_PAGES === 'true' ? '/pokemon-champion-cn/' : '/'

  if (mode !== 'sites') {
    return {
      base,
      plugins: [react()],
    }
  }

  const { cloudflare } = await import('@cloudflare/vite-plugin')

  return {
    base: '/',
    plugins: [
      react(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'server' },
        config: {
          name: 'pokemon-champions-cn',
          main: './worker/index.js',
          compatibility_date: '2026-05-22',
          assets: {
            binding: 'ASSETS',
            not_found_handling: 'single-page-application',
          },
        },
      }),
    ],
  }
})
