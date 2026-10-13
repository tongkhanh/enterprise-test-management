import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, ArrowRight, Bug, CheckCircle2, Clock3, FolderKanban,
  PlayCircle, Plus, Sparkles, TestTube2, UsersRound,
} from 'lucide-react'
import { dashboardApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { Badge, Button, Card, Skeleton } from '@/components/ui'
import { EmptyState, MetricCard, PageHeader, SectionTitle, TextLink } from '@/components/common/PageKit'
import { formatDate } from '@/lib/utils'

const actionLabel = { CREATE: 'đã tạo', UPDATE: 'đã cập nhật', APPROVE: 'đã duyệt', REJECT: 'đã từ chối', INVITE: 'đã mời thành viên vào' }

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const query = useQuery({ queryKey: ['dashboard-overview'], queryFn: () => dashboardApi.overview() })
  const data = query.data || {}
  const counts = data.counts || {}
  const firstName = user?.fullName?.split(' ').at(-1) || 'bạn'

  return <div className="space-y-6">
    <PageHeader
      eyebrow="Workspace overview"
      title={`Chào ${firstName}, hôm nay bạn muốn kiểm thử gì?`}
      description="Theo dõi tiến độ chất lượng, yêu cầu đang chờ và hoạt động gần nhất trên tất cả Project của bạn."
      actions={<><Button variant="outline" asChild><Link to="/projects"><Plus className="h-4 w-4" />Project mới</Link></Button><Button asChild><Link to="/ai-generator"><Sparkles className="h-4 w-4" />Sinh Test Case</Link></Button></>}
    />

    {query.isLoading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-32" />)}</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Projects đang theo dõi" value={counts.projects || 0} hint={`${counts.teams || 0} team · ${counts.members || 0} thành viên`} icon={FolderKanban} />
      <MetricCard label="Test Case" value={counts.testCases || 0} hint={`${counts.draftCases || 0} Draft · ${counts.reviewCases || 0} chờ review · ${counts.approvedCases || 0} Approved`} icon={TestTube2} tone="emerald" />
      <MetricCard label="Đang chờ bạn duyệt" value={counts.pendingReviews || 0} hint={`${counts.pendingInvites || 0} lời mời đang chờ`} icon={Clock3} tone="amber" />
      <MetricCard label="Automation pass rate" value={`${data.passRate || 0}%`} hint={`${counts.runs || 0} Test Run đã tạo`} icon={PlayCircle} tone="rose" />
    </div>}

    <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
      <Card className="p-0">
        <div className="border-b border-slate-100 p-4 dark:border-slate-800"><SectionTitle title="Projects gần đây" description="Tổng quan nhanh theo từng sản phẩm" action={<Link to="/projects"><TextLink>Xem tất cả</TextLink></Link>} /></div>
        {query.isLoading ? <div className="space-y-2 p-4">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-20" />)}</div> : data.projects?.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{data.projects.map((project) => <Link to={`/projects/${project._id}`} key={project._id} className="group flex items-center gap-3 p-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/40"><span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-900 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">{project.key?.slice(0, 2)}</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{project.name}</p><Badge tone={project.status === 'Active' ? 'green' : 'slate'}>{project.status}</Badge></div><p className="mt-1 text-[11px] text-slate-400">{project.testCaseCount} test cases · {project.openBugs} bug đang mở</p></div><div className="hidden items-center gap-5 text-right sm:flex"><div><p className="text-xs font-semibold">{project.testCaseCount}</p><p className="text-[10px] text-slate-400">Test Cases</p></div><div><p className="text-xs font-semibold text-rose-500">{project.bugCount}</p><p className="text-[10px] text-slate-400">Bugs</p></div></div><ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" /></Link>)}</div> : <div className="p-4"><EmptyState title="Chưa có Project" description="Tạo Project đầu tiên để bắt đầu tổ chức Team và quy trình kiểm thử." action={<Button size="sm" asChild><Link to="/projects">Tạo Project</Link></Button>} /></div>}
      </Card>

      <Card className="p-0">
        <div className="border-b border-slate-100 p-4 dark:border-slate-800"><SectionTitle title="Hoạt động gần đây" description="Audit trail trong workspace" /></div>
        <div className="p-4">{data.recentActivity?.length ? <div className="space-y-4">{data.recentActivity.map((item) => <div key={item._id} className="flex gap-3"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800"><Activity className="h-3.5 w-3.5" /></span><div className="min-w-0"><p className="text-xs leading-5"><strong>{item.performedBy?.fullName || 'Thành viên'}</strong> {actionLabel[item.action] || 'đã thao tác trên'} <span className="font-medium text-violet-600 dark:text-violet-400">{item.entityType}</span></p><p className="mt-0.5 text-[10px] text-slate-400">{formatDate(item.createdAt)}</p></div></div>)}</div> : <EmptyState title="Chưa có hoạt động" description="Các thay đổi quan trọng sẽ xuất hiện tại đây." />}</div>
      </Card>
    </div>

    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-4"><SectionTitle title="Quality snapshot" /><div className="mt-4 space-y-3"><div className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-500" />Test Case đã duyệt</span><strong>{counts.approvedCases || 0}</strong></div><div className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-slate-500"><Clock3 className="h-4 w-4 text-amber-500" />Đang chờ review</span><strong>{counts.reviewCases || 0}</strong></div><div className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-slate-500"><Bug className="h-4 w-4 text-rose-500" />Critical bugs đang mở</span><strong>{counts.criticalBugs || 0}</strong></div><div className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-slate-500"><UsersRound className="h-4 w-4 text-violet-500" />Thành viên tham gia</span><strong>{counts.members || 0}</strong></div></div></Card>
      <Card className="p-4"><SectionTitle title="Test Run gần nhất" />{data.recentRuns?.length ? <div className="mt-3 space-y-2">{data.recentRuns.slice(0, 4).map((run) => <div key={run._id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold">{run.name}</p><Badge tone={run.status === 'Completed' ? 'green' : run.status === 'InProgress' ? 'amber' : 'slate'}>{run.status}</Badge></div><p className="mt-1 text-[10px] text-slate-400">{run.passedCount}/{run.totalCases} passed · {run.environment || 'Chưa chọn môi trường'}</p></div>)}</div> : <p className="mt-4 text-xs text-slate-400">Chưa có Test Run.</p>}</Card>
      <Card className="p-4"><SectionTitle title="Bug mới nhất" action={<Link to="/bugs"><TextLink>Mở Bug Tracking</TextLink></Link>} />{data.recentBugs?.length ? <div className="mt-3 space-y-2">{data.recentBugs.slice(0, 4).map((bug) => <div key={bug._id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800"><div className="flex items-center justify-between gap-2"><Badge tone={bug.severity === 'Critical' ? 'red' : bug.severity === 'Major' ? 'amber' : 'slate'}>{bug.severity}</Badge><span className="text-[10px] text-slate-400">{bug.project?.key}</span></div><p className="mt-2 truncate text-xs font-semibold">{bug.title}</p></div>)}</div> : <p className="mt-4 text-xs text-slate-400">Chưa có bug nào được ghi nhận.</p>}</Card>
    </div>
  </div>
}
