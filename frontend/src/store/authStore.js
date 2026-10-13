import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(persist((set) => ({
  token: localStorage.getItem('etms_token') || null,
  user: null,
  setSession: ({ token, user }) => { localStorage.setItem('etms_token', token); set({ token, user }) },
  setUser: (user) => set({ user }),
  clearSession: () => { localStorage.removeItem('etms_token'); set({ token: null, user: null }) },
}), { name: 'etms-react-auth', partialize: (state) => ({ token: state.token, user: state.user }) }))
