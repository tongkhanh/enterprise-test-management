import { useEffect } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import WelcomePage from '@/pages/WelcomePage'
import AcceptInvitationPage from '@/pages/AcceptInvitationPage'
import InvitationsPage from '@/pages/InvitationsPage'
import DashboardPage from '@/features/dashboard/DashboardPage'
import ProjectsPage from '@/features/projects/ProjectsPage'
import WorkspaceManagementPage from '@/features/projects/WorkspaceManagementPage'
import ProjectWorkspacePage from '@/features/projects/ProjectWorkspaceHubPage'
import TeamsPage from '@/features/teams/TeamDirectoryPage'
import CyclesPage from '@/features/cycles/CyclesPage'
import E2EStudioPage from '@/features/e2e/E2EStudioPage'
import ApprovalInboxPage from '@/features/approvals/ApprovalInboxPage'
import KanbanBoardPage from '@/features/board/KanbanBoardPage'
import BugTrackingPage from '@/features/bugs/BugTrackingPage'
import GamificationPage from '@/features/gamification/GamificationPage'
import SettingsPage from '@/features/settings/SettingsPage'
import AutomationLabPage from '@/features/automation/AutomationLabPage'
import AgileIssuesPage from '@/features/issues/AgileIssuesPage'
import TestReportsPage from '@/features/reports/TestReportsPage'
import AutomationOperationsPage from '@/features/automation/AutomationOperationsPage'
import { authApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'

function ThemeSync() {
  const syncTheme = useThemeStore((state) => state.syncTheme)
  useEffect(() => { syncTheme() }, [syncTheme])
  return null
}

function AuthGuard() {
  const token = useAuthStore((state) => state.token)
  const setUser = useAuthStore((state) => state.setUser)
  const user = useAuthStore((state) => state.user)
  // Revalidate on every fresh application load.  Workspace roles can change
  // while a user still has a persisted browser session (for example after
  // accepting an invitation from an email link).
  const query = useQuery({ queryKey: ['me'], queryFn: authApi.me, enabled: Boolean(token) })
  useEffect(() => { if (query.data) setUser(query.data) }, [query.data, setUser])
  if (!token) return <Navigate to="/login" replace />
  // Do not render Workspace-scoped pages with the persisted profile first.
  // A browser may have an old "User" snapshot while the server already
  // granted QA Manager membership through an accepted invitation.
  if (query.isPending) return <div className="grid min-h-screen place-items-center bg-background dark:bg-[#101114]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" /></div>
  return <Outlet />
}

export default function App() {
  return <><ThemeSync /><Routes>
    <Route path="/" element={<WelcomePage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/accept-invite" element={<AcceptInvitationPage />} />
    <Route element={<AuthGuard />}>
      <Route element={<AppLayout />}>
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="workspace-management" element={<WorkspaceManagementPage />} />
        <Route path="projects/:projectId" element={<ProjectWorkspacePage />} />
        <Route path="invitations" element={<InvitationsPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="cycles" element={<CyclesPage />} />
        <Route path="issues" element={<AgileIssuesPage />} />
        <Route path="ai-generator" element={<E2EStudioPage />} />
        <Route path="approvals" element={<ApprovalInboxPage />} />
        <Route path="board" element={<KanbanBoardPage />} />
        <Route path="automation" element={<AutomationLabPage />} />
        <Route path="bugs" element={<BugTrackingPage />} />
        <Route path="reports" element={<TestReportsPage />} />
        <Route path="automation-operations" element={<AutomationOperationsPage />} />
        <Route path="gamification" element={<GamificationPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></>
}
