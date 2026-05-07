export type ThemeMode = 'light' | 'dark'

const THEME_KEY = 'pokemon-champion-cn:theme'

export function loadTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  const saved = window.localStorage.getItem(THEME_KEY)
  return saved === 'dark' ? 'dark' : 'light'
}

export function saveTheme(theme: ThemeMode) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THEME_KEY, theme)
}
