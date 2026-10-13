import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useWorkspaceStore = create(persist((set) => ({
  selectedWorkspaceId: '',
  selectedProjectId: '',
  setSelectedWorkspaceId: (selectedWorkspaceId) => set({ selectedWorkspaceId, selectedProjectId: '' }),
  setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
  clearProject: () => set({ selectedProjectId: '' }),
}), { name: 'etms-workspace', partialize: (state) => ({ selectedWorkspaceId: state.selectedWorkspaceId, selectedProjectId: state.selectedProjectId }) }))
