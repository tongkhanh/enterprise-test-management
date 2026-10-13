import { Link, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Bot, Bug, CheckSquare2, Columns3, FileBarChart, FileText, FolderKanban, PlayCircle, Settings2, UsersRound } from 'lucide-react'
import { workspaceApi } from '@/api/client'
import { Badge, Button, Card, Skeleton } from '@/components/ui'
import { EmptyState, PageHeader } from '@/components/common/PageKit'
import { formatDate, roleLabel } from '@/lib/utils'
import { useWorkspaceStore } from '@/store/workspaceStore'

const items = [
  ['E2E Use Cases', 'Tạo System Profile hoặc phân tích GitHub để thiết kế hành trình E2E.', '/ai-generator', FileText, 'bg-sky-100 text-sky-700'],
  ['E2E Test Generator', 'Sinh User Story và Test Case theo Use Case đã duyệt.', '/ai-generator', Bot, 'bg-violet-100 text-violet-700'],
  ['Approval Inbox', 'QA Manager duyệt Test Case và Test Plan.', '/approvals', CheckSquare2, 'bg-amber-100 text-amber-700'],
  ['Test Board', 'Cycle, backlog và Kanban execution.', '/board', Columns3, 'bg-emerald-100 text-emerald-700'],
  ['Automation Operations', 'Dataset, fixture, schedule, flaky và traceability.', '/automation-operations', Settings2, 'bg-indigo-100 text-indigo-700'],
  ['Automation Lab', 'Environment, runner và evidence.', '/automation', PlayCircle, 'bg-rose-100 text-rose-700'],
  ['Bug Tracking', 'RCA, triage và Jira synchronization.', '/bugs', Bug, 'bg-orange-100 text-orange-700'],
  ['Test Reports', 'Duyệt và export báo cáo.', '/reports', FileBarChart, 'bg-cyan-100 text-cyan-700'],
]
const metrics = [['User Stories', 'userStories'], ['Test Cases', 'testCases'], ['Test Plans', 'testPlans'], ['Test Runs', 'testRuns'], ['Automation Runs', 'automationRuns'], ['Bugs', 'bugs']]

export default function ProjectWorkspaceHubPage() {
  const { projectId } = useParams()
  const setSelectedProjectId = useWorkspaceStore((state) => state.setSelectedProjectId)
  const setSelectedWorkspaceId = useWorkspaceStore((state) => state.setSelectedWorkspaceId)
  const query = useQuery({ queryKey: ['project-hub', projectId], queryFn: () => workspaceApi.project(projectId), enabled: Boolean(projectId) })
  useEffect(() => {
    const workspaceId = query.data?.workspace?._id || query.data?.workspace
    if (workspaceId) setSelectedWorkspaceId(workspaceId)
    if (projectId) setSelectedProjectId(projectId)
  }, [projectId, query.data, setSelectedProjectId, setSelectedWorkspaceId])
  if (query.isLoading) return <div className="space-y-4"><Skeleton className="h-36" /><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
  if (query.isError || !query.data) return <EmptyState title="Không thể mở Project" description="Project không tồn tại hoặc bạn chưa có quyền truy cập." action={<Button asChild><Link to="/projects">Quay lại Projects</Link></Button>} />
  const project = query.data; const summary = project.summary || {}; const teams = project.teams || []; const manager = ['Owner', 'QA_Manager'].includes(project.currentRole); const projectQuery = `?project=${projectId}`
  return <div className="space-y-6">
    <PageHeader eyebrow={`${project.workspace?.name || 'Workspace'} / ${project.key}`} title={project.name} description={project.description || 'Project context cho toàn bộ vòng đời kiểm thử.'} actions={<div className="flex gap-2"><Button variant="outline" asChild><Link to="/projects"><FolderKanban className="h-4 w-4" />Projects</Link></Button>{manager && <Button variant="outline" asChild><Link to={`/teams${projectQuery}`}><UsersRound className="h-4 w-4" />Teams & Members</Link></Button>}</div>} />
    <Card className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex flex-wrap gap-2"><Badge tone={project.status === 'Active' ? 'green' : 'slate'}>{project.status}</Badge><Badge tone="purple">{roleLabel(project.currentRole)}</Badge><Badge tone="slate">{project.health || 'No update'}</Badge></div><p className="text-xs text-slate-500">{formatDate(project.startDate)} → {formatDate(project.endDate)}</p></Card>
    <Card className="p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Project context</h2><p className="mt-1 text-xs text-slate-500">Dữ liệu dùng chung cho yêu cầu, kiểm thử, automation và chất lượng.</p></div><Badge tone="purple">{summary.members || 0} members · {summary.pendingInvitations || 0} pending</Badge></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{metrics.map(([label, key]) => <div key={key} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold">{summary[key] || 0}</p></div>)}</div></Card>
    <Card className="p-5"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Teams in this Project</h2><p className="mt-1 text-xs text-slate-500">Team thuộc Workspace và có thể liên kết nhiều Project.</p></div><Button size="sm" variant="outline" asChild><Link to={`/teams${projectQuery}`}>Quản lý Teams</Link></Button></div>{teams.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{teams.map((team) => <div key={team._id} className="rounded-lg border p-3"><div className="flex items-center justify-between"><span className="text-sm font-medium">{team.name} <span className="text-xs text-slate-400">{team.key}</span></span><Badge tone={team.isPrivate ? 'amber' : 'green'}>{team.isPrivate ? 'Private' : 'Shared'}</Badge></div><p className="mt-2 text-xs text-slate-500">{team.members?.length || 0} members{team.lead ? ` · Lead ${team.lead.fullName}` : ''}</p></div>)}</div> : <p className="rounded-lg border border-dashed p-5 text-center text-xs text-slate-500">Chưa có Team liên kết.</p>}</Card>
    <section><div className="mb-3"><p className="text-sm font-semibold">Project workflow</p><p className="mt-1 text-xs text-slate-500">Mọi module bên dưới mở đúng Project context này, không cần chọn lại Project ở từng trang.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map(([title, description, to, Icon, color]) => <Link key={title} to={`${to}${projectQuery}`} className="group"><Card className="h-full p-5 transition hover:-translate-y-0.5 hover:shadow-lg"><span className={`grid h-10 w-10 place-items-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></span><div className="mt-5 flex items-center justify-between"><h2 className="text-sm font-semibold">{title}</h2><ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-600" /></div><p className="mt-2 text-xs leading-5 text-slate-500">{description}</p></Card></Link>)}</div></section>
  </div>
}
