import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Bot, Bug, CheckSquare2, Columns3, FileBarChart, FileText, FolderKanban, PlayCircle, Settings2, UsersRound } from 'lucide-react'
import { workspaceApi } from '@/api/client'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { Badge, Button, Card, Skeleton } from '@/components/ui'
import { EmptyState, PageHeader } from '@/components/common/PageKit'
import { formatDate, roleLabel } from '@/lib/utils'

const workItems = [
  { title: 'Automation Operations', description: 'Datasets, fixtures, lịch regression, flaky test và traceability.', to: '/automation-operations', icon: Settings2, color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' },
  { title: 'E2E Use Cases', description: 'Tạo System Profile hoặc phân tích GitHub để thiết kế hành trình E2E.', to: '/ai-generator', icon: FileText, color: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  { title: 'E2E Test Generator', description: 'Sinh User Story và Test Case theo Use Case đã duyệt.', to: '/ai-generator', icon: Bot, color: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  { title: 'Approval Inbox', description: 'Kiểm tra, phản hồi và phê duyệt Test Case.', to: '/approvals', icon: CheckSquare2, color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  { title: 'Test Board', description: 'Lập kế hoạch Cycle và kéo thả công việc kiểm thử.', to: '/board', icon: Columns3, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  { title: 'Automation Lab', description: 'Tạo môi trường, chạy automation và nhận evidence.', to: '/automation', icon: PlayCircle, color: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
  { title: 'Bug Tracking', description: 'Theo dõi bug và kết quả AI Root Cause.', to: '/bugs', icon: Bug, color: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  { title: 'Test Reports', description: 'Duyệt báo cáo AI và xuất PDF, Excel, CSV hoặc Word.', to: '/reports', icon: FileBarChart, color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300' },
]

export default function ProjectWorkspacePage() {
  const { projectId } = useParams()
  const setSelectedProjectId = useWorkspaceStore((state) => state.setSelectedProjectId)
  const projectQuery = useQuery({ queryKey: ['project', projectId], queryFn: () => workspaceApi.project(projectId), enabled: Boolean(projectId) })
  useEffect(() => { if (projectId) setSelectedProjectId(projectId) }, [projectId, setSelectedProjectId])
  const project = projectQuery.data
  if (projectQuery.isLoading) return <div className="space-y-4"><Skeleton className="h-36" /><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} className="h-40" />)}</div></div>
  if (projectQuery.isError || !project) return <EmptyState title="Không thể mở Project" description="Project có thể không tồn tại hoặc bạn chưa là thành viên của Workspace này." action={<Button asChild><Link to="/projects">Quay lại Projects</Link></Button>} />
  const canManage = ['Owner', 'QA_Manager'].includes(project.currentRole)
  return <div className="space-y-6">
    <PageHeader eyebrow={`${project.workspace?.name || 'Workspace'} / ${project.key}`} title={project.name} description={project.description || 'Không gian làm việc tập trung cho toàn bộ quy trình kiểm thử.'} actions={<div className="flex gap-2"><Button variant="outline" asChild><Link to="/projects"><FolderKanban className="h-4 w-4" />Projects</Link></Button>{canManage && <Button variant="outline" asChild><Link to="/teams"><UsersRound className="h-4 w-4" />Thành viên</Link></Button>}</div>} />
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><Badge tone={project.status === 'Active' ? 'green' : 'slate'}>{project.status}</Badge><Badge tone="purple">{roleLabel(project.currentRole)}</Badge></div><p className="mt-3 text-xs text-slate-500">Bắt đầu: {formatDate(project.startDate)} · Mục tiêu: {formatDate(project.endDate)}</p></div>{canManage && <Button variant="outline" asChild><Link to="/projects"><Settings2 className="h-4 w-4" />Cài đặt Project</Link></Button>}</Card>
    <section><div className="mb-3"><p className="text-sm font-semibold">Không gian làm việc của Project</p><p className="mt-1 text-xs text-slate-500">Thực hiện các bước theo flow: Environment → Use Case E2E → User Story → Test Case → duyệt → board → chạy test → bug.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{workItems.map(({ title, description, to, icon: Icon, color }) => <Link key={title} to={to} className="group"><Card className="h-full p-5 transition hover:-translate-y-0.5 hover:shadow-lg"><span className={`grid h-10 w-10 place-items-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></span><div className="mt-5 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{title}</h2><ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" /></div><p className="mt-2 text-xs leading-5 text-slate-500">{description}</p></Card></Link>)}</div></section>
  </div>
}
