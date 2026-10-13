import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const emptyGeneratorForm = {
  projectId: '', userStoryId: '', testSuiteId: '', documentIds: [], targetUrl: '',
  viewportWidth: 1440, viewportHeight: 900,
}

export const useGeneratorStore = create(persist((set) => ({
  ownerId: '',
  form: emptyGeneratorForm,
  analysis: null,
  setForm: (ownerId, form) => set({ ownerId, form }),
  setAnalysis: (ownerId, analysis) => set({ ownerId, analysis }),
  reset: (ownerId) => set({ ownerId, form: emptyGeneratorForm, analysis: null }),
}), {
  name: 'etms-ai-generator-context',
  partialize: ({ ownerId, form, analysis }) => ({ ownerId, form, analysis }),
}))
