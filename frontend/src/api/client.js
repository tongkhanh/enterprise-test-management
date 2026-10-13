import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1',
  timeout: 120_000,
  headers: { Accept: 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token || localStorage.getItem('etms_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use((response) => response, async (error) => {
  // Download endpoints use responseType: 'blob'.  When the server returns a
  // JSON error Axios otherwise hides the useful reason inside that Blob.
  let data = error.response?.data
  if (typeof Blob !== 'undefined' && data instanceof Blob && data.type.includes('json')) {
    try {
      data = JSON.parse(await data.text())
    } catch (_) {
      // Preserve the original transport error if the error body is malformed.
    }
  }
  const message = data?.error || data?.message || (error.code === 'ECONNABORTED' ? 'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.' : error.message || 'Không thể kết nối máy chủ.')
  const normalized = new Error(message)
  normalized.status = error.response?.status
  normalized.details = data?.details
  if (normalized.status === 401) {
    useAuthStore.getState().clearSession()
    if (!location.pathname.endsWith('/login')) location.assign('/studio/login')
  }
  return Promise.reject(normalized)
})

const data = (response) => response.data.data
// Keep the normal payload shape intact while exposing the server's explicit
// quota-fallback marker to the E2E studio.  This is intentionally scoped to
// E2E generation endpoints so existing API consumers are unaffected.
const e2eData = (response) => {
  const result = response.data.data
  if (response.data.fallback && result && typeof result === 'object') {
    Object.defineProperty(result, '_e2eFallback', { value: true, enumerable: false })
  }
  return result
}
export const authApi = { register: (body) => api.post('/auth/register', body).then(data), login: (body) => api.post('/auth/login', body).then(data), me: () => api.get('/auth/me').then(data), logout: () => api.post('/auth/logout').then(data) }
export const dashboardApi = { overview: (project = '') => api.get(`/reports/overview${project ? `?project=${project}` : ''}`).then(data) }
export const workspaceApi = {
  workspaces: () => api.get('/workspaces?limit=100').then(data),
  createWorkspace: (body) => api.post('/workspaces', body).then(data),
  updateWorkspace: (id, body) => api.patch(`/workspaces/${id}`, body).then(data),
  workspaceMemberships: (id) => api.get(`/workspaces/${id}/memberships`).then(data),
  updateWorkspaceMembership: (workspace, membership, body) => api.patch(`/workspaces/${workspace}/memberships/${membership}`, body).then(data),
  removeWorkspaceMembership: (workspace, membership) => api.delete(`/workspaces/${workspace}/memberships/${membership}`).then(data),
  workspaceInvitations: (id) => api.get(`/workspaces/${id}/invitations`).then(data),
  inviteToWorkspace: (id, body) => api.post(`/workspaces/${id}/invitations`, body).then(data),
  projects: () => api.get('/projects?limit=100').then(data),
  project: (id) => api.get(`/projects/${id}`).then(data),
  createProject: (body) => api.post('/projects', body).then(data),
  updateProject: (id, body) => api.patch(`/projects/${id}`, body).then(data),
  teams: (project = '', workspace = '') => api.get('/teams', { params: { limit: 100, project: project || undefined, workspace: workspace || undefined } }).then(data),
  createTeam: (body) => api.post('/teams', body).then(data),
  updateTeam: (id, body) => api.patch(`/teams/${id}`, body).then(data),
  archiveTeam: (id) => api.delete(`/teams/${id}`).then(data),
  linkTeamToProject: (project, team) => api.post(`/projects/${project}/teams/${team}`).then(data),
  unlinkTeamFromProject: (project, team) => api.delete(`/projects/${project}/teams/${team}`).then(data),
  memberships: (project) => api.get(`/projects/${project}/memberships`).then(data),
  updateMembership: (project, membership, body) => api.patch(`/projects/${project}/memberships/${membership}`, body).then(data),
  removeMembership: (project, membership) => api.delete(`/projects/${project}/memberships/${membership}`).then(data),
  invitations: (project) => api.get(`/projects/${project}/invitations`).then(data),
  invite: (project, body) => api.post(`/projects/${project}/invitations`, body).then(data),
  resendInvitation: (id) => api.post(`/invitations/${id}/resend`).then(data),
  cancelInvitation: (id) => api.delete(`/invitations/${id}`).then(data),
  integrations: (project = '') => api.get(`/integrations?limit=100${project ? `&project=${project}` : ''}`).then(data),
  createIntegration: (body) => api.post('/integrations', body).then(data),
  testIntegration: (id) => api.post(`/integrations/${id}/test`).then(data),
  integrationLogs: (id) => api.get(`/integrations/${id}/logs?limit=50`).then(data),
  rotateIntegrationWebhook: (id) => api.post(`/integrations/${id}/webhook-secret/rotate`).then(data),
  deleteIntegration: (id) => api.delete(`/integrations/${id}`).then(data),
}
export const invitationApi = {
  get: (token) => api.get(`/invitations/${encodeURIComponent(token)}/public`).then(data),
  accept: (token, body) => api.post(`/invitations/${encodeURIComponent(token)}/accept`, body).then(data),
  myPending: () => api.get('/my-invitations').then(data),
  acceptMine: (id) => api.post(`/my-invitations/${id}/accept`).then(data),
}
export const workspaceInvitationApi = {
  get: (token) => api.get(`/workspace-invitations/${encodeURIComponent(token)}/public`).then(data),
  accept: (token, body) => api.post(`/workspace-invitations/${encodeURIComponent(token)}/accept`, body).then(data),
  myPending: () => api.get('/my-workspace-invitations').then(data),
  acceptMine: (id) => api.post(`/my-workspace-invitations/${id}/accept`).then(data),
}
export const bugApi = {
  list: (params = 'limit=100') => api.get(`/bugs?${params}`).then(data),
  decide: (id, body) => api.patch(`/bugs/${id}/decision`, body).then(data),
}
export const gamificationApi = { leaderboard: (params = 'period=all-time&limit=50') => api.get(`/leaderboard?${params}`).then(data) }
export const catalogApi = {
  projects: workspaceApi.projects,
  stories: (project) => api.get(`/user-stories?project=${project}&limit=100`).then(data),
  suites: (project) => api.get(`/test-suites?project=${project}`).then(data),
  members: (project) => api.get(`/projects/${project}/members`).then(data),
}
export const documentApi = {
  list: (storyId) => api.get(`/user-stories/${storyId}/documents`).then(data),
  upload: (storyId, file, onProgress) => {
    const body = new FormData()
    body.append('document', file)
    return api.post(`/user-stories/${storyId}/documents`, body, {
      timeout: 180_000,
      onUploadProgress: (event) => onProgress?.(event.total ? Math.round((event.loaded * 100) / event.total) : 0),
    }).then(data)
  },
  preview: (id) => api.get(`/user-story-documents/${id}/preview`).then(data),
  download: (id) => api.get(`/user-story-documents/${id}/download`, { responseType: 'blob' }),
  reprocess: (id) => api.post(`/user-story-documents/${id}/reprocess`).then(data),
  remove: (id) => api.delete(`/user-story-documents/${id}`).then(data),
}
export const agileApi = {
  cycles: (project = '') => api.get(`/cycles?limit=100${project ? `&project=${project}` : ''}`).then(data),
  createCycle: (body) => api.post('/cycles', body).then(data),
  updateCycle: (id, body) => api.patch(`/cycles/${id}`, body).then(data),
  deleteCycle: (id) => api.delete(`/cycles/${id}`).then(data),
  labels: (project) => api.get(`/labels?project=${project}&limit=100`).then(data),
  createLabel: (body) => api.post('/labels', body).then(data),
  updateLabel: (id, body) => api.patch(`/labels/${id}`, body).then(data),
  deleteLabel: (id) => api.delete(`/labels/${id}`).then(data),
  activity: (project) => api.get(`/projects/${project}/activity?limit=100`).then(data),
}
export const aiApi = {
  suggestUserStory: (body) => api.post('/ai/suggest-user-story', body).then(data),
  // Put the project in the query string as well: RBAC runs before multipart
  // fields are parsed, so it needs this value to resolve the workspace role.
  suggestUserStoryDocument: (projectId, file) => { const body = new FormData(); body.append('projectId', projectId); body.append('document', file); return api.post(`/ai/suggest-user-story/document?project=${encodeURIComponent(projectId)}`, body, { timeout: 180_000 }).then(data) },
  analyze: (body) => api.post('/ai/analyze-web-page', body).then(data),
  generate: (body) => api.post('/ai/generate-web-test-cases', body).then(data),
  suggestUserStoryGithub: (body) => api.post('/ai/suggest-user-story/github', body).then(data),
  artifact: (url) => api.get(url.replace(/^.*\/api\/v1/, ''), { responseType: 'blob' }).then((response) => response.data),
}
export const e2eApi = {
  profiles: (project = '') => api.get('/system-profiles', { params: { project: project || undefined } }).then(data),
  createProfile: (body) => api.post('/system-profiles', body).then(data),
  updateProfile: (id, body) => api.patch(`/system-profiles/${id}`, body).then(data),
  analyzeGithub: (body) => api.post('/system-profiles/github-analyze', body, { timeout: 180_000 }).then(data),
  useCases: (project = '', systemProfile = '') => api.get('/use-cases', { params: { project: project || undefined, systemProfile: systemProfile || undefined } }).then(data),
  createUseCase: (body) => api.post('/use-cases', body).then(data),
  updateUseCase: (id, body) => api.patch(`/use-cases/${id}`, body).then(data),
  decideUseCase: (id, body) => api.patch(`/use-cases/${id}/decision`, body).then(data),
  suggestUseCases: (profileId) => api.post(`/system-profiles/${profileId}/suggest-use-cases`, {}, { timeout: 180_000 }).then(e2eData),
  exportArtifact: (type, id, format) => {
    // Test Case is a tabular artifact, so it is always delivered as an Excel workbook.
    const resolvedFormat = type === 'test-case' ? 'xls' : format
    return api.get(`/e2e-artifacts/${type}/${id}/export`, { params: { format: resolvedFormat }, responseType: 'blob' })
  },
  generateStory: (useCaseId) => api.post(`/use-cases/${useCaseId}/generate-story`, {}, { timeout: 180_000 }).then(e2eData),
  generateCases: (useCaseId, body) => api.post(`/use-cases/${useCaseId}/generate-test-cases`, body, { timeout: 180_000 }).then(e2eData),
}
export const requirementApi = {
  pendingStories: () => api.get('/user-stories?approvalStatus=PendingApproval&limit=100').then(data),
  createStory: (body) => api.post('/user-stories', body).then(data),
  updateStory: (id, body) => api.patch(`/user-stories/${id}`, body).then(data),
  submitApproval: (id) => api.post(`/user-stories/${id}/submit-approval`).then(data),
  decideApproval: (id, body) => api.patch(`/user-stories/${id}/approval`, body).then(data),
}
export const testCaseApi = {
  list: (params = 'limit=100') => api.get(`/test-cases?${params}`).then(data),
  update: (id, body) => api.patch(`/test-cases/${id}`, body).then(data),
  reviews: (params = '') => api.get(`/review-requests?${params}`).then(data),
  submitReview: (id, body) => api.post(`/test-cases/${id}/review`, body).then(data),
  decide: (id, body) => api.patch(`/review-requests/${id}/decision`, body).then(data),
}
export const testSuiteApi = {
  create: (body) => api.post('/test-suites', body).then(data),
  update: (id, body) => api.patch(`/test-suites/${id}`, body).then(data),
  remove: (id) => api.delete(`/test-suites/${id}`).then(data),
}
export const boardApi = {
  get: ({ project, cycle, assignee = '', priority = '' }) => api.get('/board-items', { params: { project, cycle, assignee: assignee || undefined, priority: priority || undefined } }).then(data),
  item: (id) => api.get(`/board-items/${id}`).then(data),
  update: (id, body) => api.patch(`/board-items/${id}`, body).then(data),
  move: (id, body) => api.patch(`/board-items/${id}/move`, body).then(data),
  reorder: (body) => api.post('/board-items/reorder', body).then(data),
  createPlan: (body) => api.post('/board-items/create-plan', body).then(data),
}
export const automationLabApi = {
  dockerStatus: () => api.get('/automation-lab/docker-status').then(data),
  environments: (project) => api.get('/test-environments', { params: { project } }).then(data),
  createEnvironment: (body) => api.post('/test-environments', body).then(data),
  provision: (id) => api.post(`/test-environments/${id}/provision`).then(data),
  stop: (id) => api.post(`/test-environments/${id}/stop`).then(data),
  scripts: (project) => api.get('/automation-scripts', { params: { project } }).then(data),
  generateScript: (body) => api.post('/automation-scripts', body).then(data),
  validateScript: (id, body = {}) => api.post(`/automation-scripts/${id}/validate`, body).then(data),
  reviewScript: (id, body) => api.patch(`/automation-scripts/${id}/review`, body).then(data),
  downloadScript: (id) => api.get(`/automation-scripts/${id}/download`, { responseType: 'blob' }),
  githubRepos: (integrationId) => api.get(`/github/${integrationId}/repos`).then(data),
  githubBranches: (integrationId, owner, repo) => api.get(`/github/${integrationId}/repos/${owner}/${repo}/branches`).then(data),
  githubCommits: (integrationId, owner, repo, ref) => api.get(`/github/${integrationId}/repos/${owner}/${repo}/commits`, { params: { sha: ref } }).then(data),
  githubPulls: (integrationId, owner, repo) => api.get(`/github/${integrationId}/repos/${owner}/${repo}/pulls`).then(data),
  githubRuntimeFiles: (integrationId, owner, repo, ref) => api.get(`/github/${integrationId}/repos/${owner}/${repo}/runtime-files`, { params: { ref } }).then(data),
  githubSourceFiles: (integrationId, owner, repo, ref) => api.get(`/github/${integrationId}/repos/${owner}/${repo}/source-files`, { params: { ref } }).then(data),
  environmentBuilds: (id) => api.get(`/test-environments/${id}/builds`).then(data),
  environmentSecrets: (id) => api.get(`/test-environments/${id}/secrets`).then(data),
  upsertEnvironmentSecret: (id, body) => api.post(`/test-environments/${id}/secrets`, body).then(data),
  deleteEnvironmentSecret: (id, secretId) => api.delete(`/test-environments/${id}/secrets/${secretId}`).then(data),
  runs: (project) => api.get('/automation-runs', { params: { project } }).then(data),
  createRun: (body) => api.post('/automation-runs', body).then(data),
  run: (id) => api.get(`/automation-runs/${id}`).then(data),
  runTestCase: (testCaseId, body) => api.post(`/automation/run-test-case/${testCaseId}`, body).then(data),
  job: (id) => api.get(`/automation/jobs/${id}`).then(data),
}
export const issueApi = {
  list: (project) => api.get('/agile-issues', { params: { project } }).then(data),
  create: (body) => api.post('/agile-issues', body).then(data),
  update: (id, body) => api.patch(`/agile-issues/${id}`, body).then(data),
  decide: (id, body) => api.patch(`/agile-issues/${id}/decision`, body).then(data),
  generateFromPlan: (planId) => api.post(`/test-plans/${planId}/generate-issues`).then(data),
}
export const executionApi = {
  plans: (project) => api.get('/test-plans', { params: { project, limit: 100 } }).then(data),
  runs: (project) => api.get('/test-runs', { params: { project, limit: 100 } }).then(data),
  createPlan: (body) => api.post('/test-plans', body).then(data),
  createRun: (body) => api.post('/test-runs', body).then(data),
  suggestPlanFromRequirements: (body) => api.post('/test-plans/suggest-from-requirements', body).then(data),
  suggestPlan: (body) => api.post('/test-plans/suggest', body).then(data),
  decidePlan: (id, body) => api.patch(`/test-plans/${id}/decision`, body).then(data),
  exportPlan: (id, format) => api.get(`/test-plans/${id}/export`, { params: { format }, responseType: 'blob' }),
  reports: (project) => api.get('/test-reports', { params: { project } }).then(data),
  suggestReport: (testRunId) => api.post(`/test-runs/${testRunId}/reports/suggest`).then(data),
  decideReport: (id, body) => api.patch(`/test-reports/${id}/decision`, body).then(data),
  exportReport: (id, format) => api.get(`/test-reports/${id}/export`, { params: { format }, responseType: 'blob' }),
}
