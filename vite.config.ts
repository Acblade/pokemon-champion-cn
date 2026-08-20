import { sites } from '@openai/sites-vite-plugin'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: process.env.GITHUB_PAGES === 'true' ? '/pokemon-champion-cn/' : '/',
  plugins: [react(), ...(mode === 'sites' ? [sites()] : [])],
}))
