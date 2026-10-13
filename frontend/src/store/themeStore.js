import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const applyTheme = (theme) => {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export const useThemeStore = create(persist((set) => ({
  theme: 'light',
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  syncTheme: () => applyTheme(useThemeStore.getState().theme),
}), { name: 'etms-theme' }))
