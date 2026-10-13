import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  FileCheck2,
  FolderKanban,
  Inbox,
  Loader2,
  Search,
  UserRound,
  UsersRound,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { requirementApi, testCaseApi } from '@/api/client'
import {
  Badge,
  Button,
  Card,
  Dialog,
  Input,
  Skeleton,
  Textarea,
} from '@/components/ui'
import { cn, formatDate, idOf } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

const statusTabs = [
  { value: 'Pending', label: 'Chờ duyệt' },
  { value: 'Approved', label: 'Đã duyệt' },
  { value: 'Rejected', label: 'Đã từ chối' },
  { value: 'All', label: 'Tất cả' },
]

const statusView = {
  Pending: { label: 'Chờ duyệt', tone: 'amber', icon: Clock3 },
  Approved: { label: 'Đã duyệt', tone: 'green', icon: CheckCircle2 },
  Rejected: { label: 'Đã từ chối', tone: 'red', icon: XCircle },
  Cancelled: { label: 'Đã hủy', tone: 'slate', icon: XCircle },
}

const priorityTone = {
  Critical: 'red',
  High: 'amber',
  Medium: 'blue',
  Low: 'slate',
}

function personName(person, fallback = 'Không xác định') {
  return person?.fullName || person?.email || fallback
}

function WorkflowContext({ context }) {
  const workspace = context?.workspace
  const project = context?.project
  const teams = Array.isArray(context?.teams) ? context.teams : []
  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4 text-xs">
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-700"><Building2 size={13} className="text-sky-600" />Workspace: <b>{workspace?.name || 'Chưa xác định'}</b></span>
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-700"><FolderKanban size={13} className="text-violet-600" />Project: <b>{project?.key ? `${project.key} · ${project.name}` : project?.name || 'Chưa xác định'}</b></span>
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-700"><UsersRound size={13} className="text-emerald-600" />Team: <b>{teams.length ? teams.map((team) => team.key || team.name).join(', ') : 'Chưa gán team'}</b></span>
    </div>
  )
}

function ReviewCard({ review, onDecision, canDecide }) {
  const [expanded, setExpanded] = useState(false)
  const testCase = review.testCase || {}
  const status = statusView[review.status] || statusView.Pending
  const StatusIcon = status.icon
  const steps = Array.isArray(testCase.testSteps) ? testCase.testSteps : []

  return (
    <Card className="overflow-hidden border-slate-200/80 p-0 shadow-sm transition hover:shadow-md">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={status.tone}>
                <StatusIcon size={13} />
                {status.label}
              </Badge>
              {testCase.priority && (
                <Badge tone={priorityTone[testCase.priority] || 'neutral'}>
                  {testCase.priority}
                </Badge>
              )}
              {testCase.type && <Badge tone="slate">{testCase.type}</Badge>}
            </div>

            <h3 className="text-lg font-bold text-slate-950">
              {testCase.title || 'Test Case không còn tồn tại'}
            </h3>
            {testCase.description && (
              <p className="mt-1.5 max-w-4xl text-sm leading-6 text-slate-600">
                {testCase.description}
              </p>
            )}
          </div>

          <div className="grid shrink-0 gap-2 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-1">
            <div className="flex items-center gap-2">
              <UserRound size={15} className="text-violet-500" />
              <span>Người gửi: <strong className="text-slate-800">{personName(review.requestedBy)}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Clock3 size={15} className="text-violet-500" />
              <span>{formatDate(review.submittedAt || review.createdAt)}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Test Suite</p>
            <p className="mt-1 font-medium text-slate-800">{testCase.testSuite?.name || 'Chưa gán'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">User Story</p>
            <p className="mt-1 font-medium text-slate-800">{testCase.userStory?.title || 'Chưa gán'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Số bước</p>
            <p className="mt-1 font-medium text-slate-800">{steps.length} bước kiểm thử</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">QA Manager</p>
            <p className="mt-1 font-medium text-slate-800">{personName(review.reviewer, 'Chưa phân công')}</p>
          </div>
        </div>

        <WorkflowContext context={review.workflowContext} />

        {review.reviewNote && review.status !== 'Pending' && (
          <div className={cn(
            'mt-4 rounded-xl border px-4 py-3 text-sm',
            review.status === 'Approved'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800',
          )}>
            <strong>Nhận xét:</strong> {review.reviewNote}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <Button variant="ghost" onClick={() => setExpanded((value) => !value)}>
            {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
            {expanded ? 'Thu gọn chi tiết' : 'Xem chi tiết Test Case'}
          </Button>

          {review.status === 'Pending' && testCase._id && canDecide && (
            <div className="flex items-center gap-2">
              <Button variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => onDecision(review, 'Rejected')}>
                <X size={17} />
                Từ chối
              </Button>
              <Button onClick={() => onDecision(review, 'Approved')}>
                <Check size={17} />
                Duyệt
              </Button>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50/80 px-5 py-5 sm:px-6">
          <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <section>
              <h4 className="mb-3 font-bold text-slate-900">Các bước kiểm thử</h4>
              {steps.length ? (
                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <div key={step._id || `${review._id}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900">{step.action || step.description || 'Thực hiện bước kiểm thử'}</p>
                          <p className="mt-2 text-sm text-slate-600">
                            <strong>Kết quả mong đợi:</strong> {step.expectedResult || 'Chưa cung cấp'}
                          </p>
                          {(step.locator || step.selector) && (
                            <code className="mt-2 block overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 text-xs text-violet-200">
                              {step.locator || step.selector}
                            </code>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                  Test Case này chưa có bước kiểm thử.
                </p>
              )}
            </section>

            <section className="space-y-4">
              {testCase.preconditions && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="font-bold text-slate-900">Điều kiện tiên quyết</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{testCase.preconditions}</p>
                </div>
              )}
              {testCase.storyCoverage && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="font-bold text-slate-900">Phạm vi User Story</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{testCase.storyCoverage}</p>
                </div>
              )}
              {testCase.targetUrl && (
                <a
                  className="flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm font-semibold text-violet-700 hover:bg-violet-100"
                  href={testCase.targetUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Mở website mục tiêu
                  <ExternalLink size={16} />
                </a>
              )}
            </section>
          </div>
        </div>
      )}
    </Card>
  )
}

export default function ApprovalInboxPage() {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [activeStatus, setActiveStatus] = useState('Pending')
  const [activeScope, setActiveScope] = useState('Action')
  const [search, setSearch] = useState('')
  const [decisionDialog, setDecisionDialog] = useState(null)
  const [reviewNote, setReviewNote] = useState('')

  // This is a personal work inbox, not a role-specific page. Every signed-in
  // Workspace member can see items they submitted and items assigned to them.
  // The API enforces Project membership and prevents a maker from approving
  // their own artefact.
  const queryString = `reviewer=${idOf(user)}&limit=100`

  const reviewsQuery = useQuery({
    queryKey: ['approval-inbox', idOf(user), queryString],
    queryFn: () => testCaseApi.reviews(queryString),
    enabled: Boolean(user),
  })
  const storiesQuery = useQuery({ queryKey: ['approval-user-stories', idOf(user)], queryFn: requirementApi.pendingStories, enabled: Boolean(user) })
  const storyDecisionMutation = useMutation({
    mutationFn: ({ id, decision, reviewNote }) => requirementApi.decideApproval(id, { decision, reviewNote }),
    onSuccess: (_, variables) => { toast.success(variables.decision === 'Approved' ? 'Đã duyệt User Story' : 'Đã từ chối User Story'); queryClient.invalidateQueries({ queryKey: ['approval-user-stories'] }); queryClient.invalidateQueries({ queryKey: ['stories'] }) },
    onError: (error) => toast.error(error.message),
  })

  const reviews = useMemo(() => {
    if (Array.isArray(reviewsQuery.data)) return reviewsQuery.data
    return reviewsQuery.data?.data || []
  }, [reviewsQuery.data])
  const counts = useMemo(() => reviews.reduce((result, review) => {
    result[review.status] = (result[review.status] || 0) + 1
    return result
  }, {}), [reviews])

  const actionableReviews = useMemo(() => reviews.filter((review) => (
    review.status === 'Pending'
    && idOf(review.reviewer) === idOf(user)
    && idOf(review.requestedBy) !== idOf(user)
    && idOf(review.testCase?.createdBy) !== idOf(user)
  )), [reviews, user])
  const submittedReviews = useMemo(() => reviews.filter((review) => idOf(review.requestedBy) === idOf(user)), [reviews, user])
  const completedReviews = useMemo(() => reviews.filter((review) => review.status !== 'Pending'), [reviews])

  const visibleReviews = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return reviews.filter((review) => {
      if (activeScope === 'Action' && !actionableReviews.some((item) => idOf(item) === idOf(review))) return false
      if (activeScope === 'Submitted' && idOf(review.requestedBy) !== idOf(user)) return false
      if (activeStatus !== 'All' && review.status !== activeStatus) return false
      if (!keyword) return true
      const searchable = [
        review.testCase?.title,
        review.testCase?.description,
        review.requestedBy?.fullName,
        review.requestedBy?.email,
        review.testCase?.testSuite?.name,
      ].filter(Boolean).join(' ').toLowerCase()
      return searchable.includes(keyword)
    })
  }, [activeScope, activeStatus, actionableReviews, reviews, search, user])

  const decisionMutation = useMutation({
    mutationFn: ({ reviewId, decision, note }) => testCaseApi.decide(reviewId, {
      decision,
      reviewNote: note,
    }),
    onSuccess: (_, variables) => {
      toast.success(variables.decision === 'Approved' ? 'Đã duyệt Test Case' : 'Đã từ chối Test Case')
      setDecisionDialog(null)
      setReviewNote('')
      queryClient.invalidateQueries({ queryKey: ['approval-inbox'] })
      queryClient.invalidateQueries({ queryKey: ['ai-generated-test-cases'] })
      queryClient.invalidateQueries({ queryKey: ['kanban-board'] })
    },
    onError: (error) => {
      toast.error(error.message || 'Không thể xử lý yêu cầu duyệt')
    },
  })

  const openDecision = (review, decision) => {
    setDecisionDialog({ review, decision })
    setReviewNote(decision === 'Approved' ? 'Test Case đáp ứng yêu cầu và có thể đưa vào Test Plan.' : '')
  }

  const submitDecision = () => {
    if (decisionDialog?.decision === 'Rejected' && !reviewNote.trim()) {
      toast.error('Vui lòng nhập lý do từ chối để Tester có thể chỉnh sửa')
      return
    }
    decisionMutation.mutate({
      reviewId: decisionDialog.review._id,
      decision: decisionDialog.decision,
      note: reviewNote.trim(),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-violet-600">
            <FileCheck2 size={16} />
            Approval Workflow
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">Hộp thư công việc & phê duyệt</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Theo dõi nội dung bạn đã gửi, các yêu cầu được giao cho bạn và lịch sử quyết định trong cùng một nơi.
          </p>
        </div>
        <div className="relative w-full lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <Input
            className="pl-10"
            placeholder="Tìm Test Case hoặc người liên quan..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5">
          <p className="text-sm font-semibold text-amber-700">Cần bạn quyết định</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-950">{actionableReviews.length}</p>
        </Card>
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
          <p className="text-sm font-semibold text-emerald-700">Bạn đã gửi</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-950">{submittedReviews.length}</p>
        </Card>
        <Card className="border-rose-200 bg-gradient-to-br from-rose-50 to-white p-5">
          <p className="text-sm font-semibold text-rose-700">Đã hoàn tất</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-950">{completedReviews.length}</p>
        </Card>
      </div>

      {(storiesQuery.data || []).length > 0 && <Card className="border-violet-200 bg-violet-50/40 p-5"><div className="mb-4"><p className="text-xs font-bold uppercase tracking-wide text-violet-700">User Story đang chờ phản hồi</p><p className="mt-1 text-sm text-slate-600">Bạn có thể duyệt nội dung do thành viên khác gửi. Nội dung do chính bạn tạo chỉ hiển thị trạng thái chờ, để bảo đảm không tự duyệt.</p></div><div className="space-y-3">{storiesQuery.data.map((story) => { const ownStory = idOf(story.createdBy) === idOf(user); return <div key={story._id} className="rounded-xl border border-violet-100 bg-white p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{story.title}</p><Badge tone={ownStory ? 'amber' : 'violet'}>{ownStory ? 'Bạn đã gửi' : 'Cần bạn duyệt'}</Badge></div><p className="mt-1 text-sm text-slate-600">{story.description}</p><p className="mt-2 text-xs text-slate-500">Người tạo: {personName(story.createdBy)}</p><div className="mt-2 flex flex-wrap gap-1.5">{(story.acceptanceCriteria || []).slice(0, 4).map((item, index) => <Badge key={index} tone="slate">AC {index + 1}: {item.criteria}</Badge>)}</div><WorkflowContext context={story.workflowContext} /></div>{ownStory ? <p className="shrink-0 text-xs font-medium text-amber-700">Đang chờ thành viên khác duyệt</p> : <div className="flex shrink-0 gap-2"><Button variant="outline" className="border-rose-200 text-rose-600" disabled={storyDecisionMutation.isPending} onClick={() => { const note = window.prompt('Lý do từ chối User Story:'); if (note?.trim()) storyDecisionMutation.mutate({ id: story._id, decision: 'Rejected', reviewNote: note }) }}>Từ chối</Button><Button disabled={storyDecisionMutation.isPending} onClick={() => storyDecisionMutation.mutate({ id: story._id, decision: 'Approved', reviewNote: 'Đã kiểm tra mô tả và Acceptance Criteria.' })}><Check size={16} />Duyệt User Story</Button></div>}</div></div> })}</div></Card>}

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/70 p-2">
        {[['Action', 'Cần tôi xử lý', actionableReviews.length], ['Submitted', 'Tôi đã gửi', submittedReviews.length], ['Related', 'Tất cả liên quan', reviews.length]].map(([value, label, count]) => <Button key={value} size="sm" variant={activeScope === value ? 'default' : 'ghost'} onClick={() => setActiveScope(value)}>{label} <span className="ml-1 opacity-70">{count}</span></Button>)}
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-px">
        {statusTabs.map((tab) => {
          const count = tab.value === 'All' ? reviews.length : (counts[tab.value] || 0)
          return (
            <button
              key={tab.value}
              type="button"
              className={cn(
                'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition',
                activeStatus === tab.value
                  ? 'border-violet-600 text-violet-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
              onClick={() => setActiveStatus(tab.value)}
            >
              {tab.label}
              <span className={cn(
                'rounded-full px-2 py-0.5 text-xs',
                activeStatus === tab.value ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500',
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {reviewsQuery.isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((item) => <Skeleton key={item} className="h-64 rounded-2xl" />)}
        </div>
      )}

      {reviewsQuery.isError && (
        <Card className="border-rose-200 bg-rose-50 p-6 text-rose-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 shrink-0" size={21} />
            <div>
              <h2 className="font-bold">Không thể tải yêu cầu phê duyệt</h2>
              <p className="mt-1 text-sm">{reviewsQuery.error?.message || 'Vui lòng thử tải lại trang.'}</p>
            </div>
          </div>
        </Card>
      )}

      {!reviewsQuery.isLoading && !reviewsQuery.isError && visibleReviews.length === 0 && (
        <Card className="border-dashed p-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Inbox size={28} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-950">
            {search ? 'Không tìm thấy yêu cầu phù hợp' : 'Chưa có yêu cầu trong mục này'}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">
            {activeStatus === 'Pending'
              ? activeScope === 'Action' ? 'Không có yêu cầu nào được giao cho bạn cần quyết định. Nội dung do chính bạn gửi sẽ nằm ở tab “Tôi đã gửi”.' : 'Chưa có yêu cầu phù hợp trong mục này.'
              : 'Hãy chọn một trạng thái khác để xem lịch sử phê duyệt.'}
          </p>
        </Card>
      )}

      {!reviewsQuery.isLoading && visibleReviews.length > 0 && (
        <div className="space-y-4">
          {visibleReviews.map((review) => (
            <ReviewCard
              key={review._id}
              review={review}
              onDecision={openDecision}
              canDecide={
                idOf(review.reviewer) === idOf(user)
                && idOf(review.requestedBy) !== idOf(user)
                && idOf(review.testCase?.createdBy) !== idOf(user)
              }
            />
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(decisionDialog)}
        onOpenChange={(open) => {
          if (!open && !decisionMutation.isPending) {
            setDecisionDialog(null)
            setReviewNote('')
          }
        }}
        title={decisionDialog?.decision === 'Approved' ? 'Duyệt Test Case' : 'Từ chối Test Case'}
        description={decisionDialog?.review?.testCase?.title || ''}
      >
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-800">
            Nhận xét {decisionDialog?.decision === 'Rejected' && <span className="text-rose-500">*</span>}
          </label>
          <Textarea
            rows={5}
            placeholder={decisionDialog?.decision === 'Approved'
              ? 'Nhập nhận xét cho Tester (không bắt buộc)...'
              : 'Nêu rõ lý do để Tester có thể chỉnh sửa...'}
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
          />
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="outline" disabled={decisionMutation.isPending} onClick={() => setDecisionDialog(null)}>
            Hủy
          </Button>
          <Button
            className={decisionDialog?.decision === 'Rejected' ? 'bg-rose-600 hover:bg-rose-700' : ''}
            disabled={decisionMutation.isPending}
            onClick={submitDecision}
          >
            {decisionMutation.isPending
              ? <Loader2 className="animate-spin" size={17} />
              : decisionDialog?.decision === 'Approved' ? <Check size={17} /> : <X size={17} />}
            {decisionDialog?.decision === 'Approved' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
