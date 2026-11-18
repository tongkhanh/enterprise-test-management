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

import { executionApi, requirementApi, testCaseApi } from '@/api/client'
import {
  Badge,
  Button,
  Card,
  Dialog,
  Input,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui'
import { cn, formatDate, idOf, roleLabel } from '@/lib/utils'
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
              {review.approvalException?.mode === 'SelfApproval' && <Badge tone="amber">Tự duyệt · ngoại lệ dự án nhỏ</Badge>}
              {review.approvalException?.mode === 'OwnerFallback' && <Badge tone="blue">Workspace Owner duyệt thay</Badge>}
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
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Module / Feature</p>
            <p className="mt-1 font-medium text-slate-800">{testCase.e2e?.module || testCase.testSuite?.name || 'Chưa xác định'}</p>
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
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">QA duyệt</p>
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

function PlanApprovalCard({ plan, onDecision, pending }) {
  const canDecide = plan.viewerPermissions?.canDecide
  const status = plan.approvalStatus === 'PendingApproval' ? statusView.Pending : (statusView[plan.approvalStatus] || statusView.Pending)
  const StatusIcon = status.icon
  return <Card className="border-violet-200 p-5 shadow-sm">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><Badge tone="violet">Test Plan</Badge><Badge tone={status.tone}><StatusIcon size={13} />{status.label}</Badge>{plan.viewerPermissions?.approvalMode === 'RoleFallback' && <Badge tone="blue">Business Owner duyệt thay · Project nhỏ</Badge>}{plan.approvalException?.mode === 'SelfApproval' && <Badge tone="amber">Tự duyệt có lý do</Badge>}</div>
        <h3 className="mt-3 text-lg font-bold text-slate-950">{plan.name}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">{plan.description || plan.scope || 'Chưa có mô tả.'}</p>
        <p className="mt-2 text-xs text-slate-500">Người gửi: <b>{personName(plan.createdBy)}</b> · Môi trường: <b>{plan.environment || 'Chưa khai báo'}</b></p>
        <WorkflowContext context={plan.workflowContext} />
      </div>
      {plan.approvalStatus === 'PendingApproval' && canDecide && <div className="flex shrink-0 gap-2"><Button variant="outline" className="border-rose-200 text-rose-600" disabled={pending} onClick={() => onDecision(plan, 'Rejected')}><X size={16} />Từ chối</Button><Button disabled={pending} onClick={() => onDecision(plan, 'Approved')}><Check size={16} />Duyệt Test Plan</Button></div>}
    </div>
    {plan.viewerPermissions?.message && !canDecide && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs font-medium text-amber-800">{plan.viewerPermissions.message}</p>}
    {plan.reviewNote && plan.approvalStatus !== 'PendingApproval' && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><b>Nhận xét:</b> {plan.reviewNote}</p>}
  </Card>
}

export default function ApprovalInboxPage() {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [activeStatus, setActiveStatus] = useState('Pending')
  const [activeScope, setActiveScope] = useState('Action')
  const [search, setSearch] = useState('')
  const [decisionDialog, setDecisionDialog] = useState(null)
  const [planDecisionDialog, setPlanDecisionDialog] = useState(null)
  const [planReviewNote, setPlanReviewNote] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [selectedReviewIds, setSelectedReviewIds] = useState([])
  const [bulkDecisionPending, setBulkDecisionPending] = useState(false)

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
  const plansQuery = useQuery({ queryKey: ['test-plan-approval-inbox', idOf(user)], queryFn: executionApi.planApprovals, enabled: Boolean(user) })
  const storiesQuery = useQuery({ queryKey: ['approval-user-stories', idOf(user)], queryFn: requirementApi.reviewStories, enabled: Boolean(user) })
  const storyDecisionMutation = useMutation({
    mutationFn: ({ id, decision, reviewNote }) => requirementApi.decideBusiness(id, { decision, reviewNote }),
    onSuccess: (_, variables) => { toast.success(variables.decision === 'BusinessConfirmed' ? 'Business Owner đã xác nhận nghiệp vụ' : 'Business Owner đã từ chối nghiệp vụ'); queryClient.invalidateQueries({ queryKey: ['approval-user-stories'] }); queryClient.invalidateQueries({ queryKey: ['stories'] }) },
    onError: (error) => toast.error(error.message),
  })
  const qaStoryDecisionMutation = useMutation({
    mutationFn: ({ id, decision, reviewNote }) => requirementApi.decideQaTestability(id, { decision, reviewNote }),
    onSuccess: (_, variables) => {
      toast.success(variables.decision === 'Testable' ? 'QA đã xác nhận User Story có thể kiểm thử' : 'Đã gửi yêu cầu làm rõ User Story')
      queryClient.invalidateQueries({ queryKey: ['approval-user-stories'] })
      queryClient.invalidateQueries({ queryKey: ['stories'] })
    },
    onError: (error) => toast.error(error.message),
  })

  const stories = useMemo(() => Array.isArray(storiesQuery.data) ? storiesQuery.data : [], [storiesQuery.data])
  const approvalPlans = useMemo(() => Array.isArray(plansQuery.data) ? plansQuery.data : [], [plansQuery.data])
  const businessPendingStories = useMemo(() => stories.filter((story) => (
    story.approvalStatus === 'PendingApproval'
    && story.businessApprovalStatus === 'PendingBusinessConfirmation'
  )), [stories])
  const qaPendingStories = useMemo(() => stories.filter((story) => (
    story.businessApprovalStatus === 'BusinessConfirmed'
    && story.qaTestabilityStatus === 'NotReviewed'
  )), [stories])
  const actionableBusinessStories = useMemo(() => businessPendingStories.filter((story) => (
    story.viewerPermissions?.canConfirmBusiness
  )), [businessPendingStories, user])
  const actionableQaStories = useMemo(() => qaPendingStories.filter((story) => (
    story.viewerPermissions?.canReviewQaTestability
  )), [qaPendingStories, user])

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
    && (
      review.approvalException?.mode === 'SelfApproval'
      || (
        idOf(review.requestedBy) !== idOf(user)
        && idOf(review.testCase?.createdBy) !== idOf(user)
      )
    )
  )), [reviews, user])
  const submittedReviews = useMemo(() => reviews.filter((review) => idOf(review.requestedBy) === idOf(user)), [reviews, user])
  const completedReviews = useMemo(() => reviews.filter((review) => review.status !== 'Pending'), [reviews])
  const actionablePlans = useMemo(() => approvalPlans.filter((plan) => plan.approvalStatus === 'PendingApproval' && plan.viewerPermissions?.canDecide), [approvalPlans])
  const submittedPlans = useMemo(() => approvalPlans.filter((plan) => idOf(plan.createdBy) === idOf(user)), [approvalPlans, user])
  const completedPlans = useMemo(() => approvalPlans.filter((plan) => plan.approvalStatus !== 'PendingApproval'), [approvalPlans])
  const planCounts = useMemo(() => approvalPlans.reduce((result, plan) => { const key = plan.approvalStatus === 'PendingApproval' ? 'Pending' : plan.approvalStatus; result[key] = (result[key] || 0) + 1; return result }, {}), [approvalPlans])

  const visiblePlans = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return approvalPlans.filter((plan) => {
      const status = plan.approvalStatus === 'PendingApproval' ? 'Pending' : plan.approvalStatus
      if (activeScope === 'Action' && !plan.viewerPermissions?.canDecide) return false
      if (activeScope === 'Submitted' && idOf(plan.createdBy) !== idOf(user)) return false
      if (activeStatus !== 'All' && status !== activeStatus) return false
      if (!keyword) return true
      return [plan.name, plan.description, plan.scope, plan.createdBy?.fullName, plan.createdBy?.email, plan.project?.name].filter(Boolean).join(' ').toLowerCase().includes(keyword)
    })
  }, [activeScope, activeStatus, approvalPlans, search, user])

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
      if (!variables?.silent) {
        toast.success(variables.decision === 'Approved' ? 'Đã duyệt Test Case' : 'Đã ghi nhận kết quả rà soát Test Case')
        setDecisionDialog(null)
        setReviewNote('')
        queryClient.invalidateQueries({ queryKey: ['approval-inbox'] })
        queryClient.invalidateQueries({ queryKey: ['ai-generated-test-cases'] })
        queryClient.invalidateQueries({ queryKey: ['kanban-board'] })
      }
    },
    onError: (error, variables) => {
      if (!variables?.silent) toast.error(error.message || 'Không thể xử lý yêu cầu duyệt')
    },
  })
  const planDecisionMutation = useMutation({
    mutationFn: ({ id, decision, reviewNote }) => executionApi.decidePlan(id, { decision, reviewNote }),
    onSuccess: (_, variables) => {
      toast.success(variables.decision === 'Approved' ? 'Đã duyệt Test Plan' : 'Đã từ chối Test Plan')
      setPlanDecisionDialog(null); setPlanReviewNote('')
      queryClient.invalidateQueries({ queryKey: ['test-plan-approval-inbox'] })
      queryClient.invalidateQueries({ queryKey: ['e2e-plans'] })
    },
    onError: (error) => toast.error(error.message || 'Không thể xử lý Test Plan'),
  })
  const openPlanDecision = (plan, decision) => {
    setPlanDecisionDialog({ plan, decision })
    setPlanReviewNote(decision === 'Approved' ? (plan.viewerPermissions?.requiresReason ? '' : 'Đã rà soát phạm vi, chiến lược, môi trường và tiêu chí của Test Plan.') : '')
  }
  const submitPlanDecision = () => {
    const requiresNote = planDecisionDialog?.decision === 'Rejected' || planDecisionDialog?.plan?.viewerPermissions?.requiresReason
    if (requiresNote && planReviewNote.trim().length < (planDecisionDialog?.plan?.viewerPermissions?.requiresReason ? 10 : 1)) return toast.error(planDecisionDialog?.plan?.viewerPermissions?.requiresReason ? 'Lý do tự duyệt phải có tối thiểu 10 ký tự.' : 'Vui lòng nhập lý do từ chối.')
    planDecisionMutation.mutate({ id: planDecisionDialog.plan._id, decision: planDecisionDialog.decision, reviewNote: planReviewNote.trim() })
  }

  const openDecision = (review, decision) => {
    setDecisionDialog({ review, decision })
    setReviewNote(decision === 'Approved' ? 'Test Case đáp ứng yêu cầu và có thể đưa vào Test Plan.' : '')
  }

  const submitDecision = () => {
    if (decisionDialog?.decision !== 'Approved' && !reviewNote.trim()) {
      toast.error('Vui lòng nhập nhận xét để người tạo biết cần xử lý gì')
      return
    }
    decisionMutation.mutate({
      reviewId: decisionDialog.review._id,
      decision: decisionDialog.decision,
      note: reviewNote.trim(),
    })
  }
  const selectableVisible = visibleReviews.filter((review) => review.status === 'Pending' && actionableReviews.some((item) => idOf(item) === idOf(review)))
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((review) => selectedReviewIds.includes(idOf(review)))
  const bulkDecision = async (decision) => {
    if (bulkDecisionPending || !selectedReviewIds.length) return
    const note = decision === 'Rejected' ? window.prompt('Lý do từ chối áp dụng cho các Test Case đã chọn:') : 'Đã review và duyệt hàng loạt.'
    if (decision === 'Rejected' && !note?.trim()) return
    const idsToProcess = [...selectedReviewIds]
    setBulkDecisionPending(true)
    try {
      const results = await Promise.allSettled(idsToProcess.map((reviewId) => decisionMutation.mutateAsync({ reviewId, decision, note: note?.trim() || '', silent: true })))
      const succeeded = results.filter((result) => result.status === 'fulfilled').length
      const failedResults = results.filter((result) => result.status === 'rejected')
      const failed = failedResults.length

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['approval-inbox'] }),
        queryClient.invalidateQueries({ queryKey: ['ai-generated-test-cases'] }),
        queryClient.invalidateQueries({ queryKey: ['kanban-board'] }),
      ])

      if (!failed) {
        toast.success(`${decision === 'Approved' ? 'Đã duyệt' : 'Đã từ chối'} ${succeeded} Test Case.`)
        setSelectedReviewIds([])
        return
      }

      const firstError = failedResults[0]?.reason?.message
      toast.error(
        succeeded
          ? `Đã xử lý ${succeeded}/${idsToProcess.length} Test Case; ${failed} mục thất bại${firstError ? `: ${firstError}` : '.'}`
          : firstError || `Không thể xử lý ${failed} Test Case.`,
      )
      setSelectedReviewIds(idsToProcess.filter((_, index) => results[index].status === 'rejected'))
    } finally {
      setBulkDecisionPending(false)
    }
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
            placeholder="Tìm tài liệu hoặc người liên quan..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5">
          <p className="text-sm font-semibold text-amber-700">Cần bạn quyết định</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-950">{actionableReviews.length + actionablePlans.length + actionableBusinessStories.length + actionableQaStories.length}</p>
        </Card>
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
          <p className="text-sm font-semibold text-emerald-700">Bạn đã gửi</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-950">{submittedReviews.length + submittedPlans.length}</p>
        </Card>
        <Card className="border-rose-200 bg-gradient-to-br from-rose-50 to-white p-5">
          <p className="text-sm font-semibold text-rose-700">Đã hoàn tất</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-950">{completedReviews.length + completedPlans.length}</p>
        </Card>
      </div>

      {(businessPendingStories.some((story) => idOf(story.createdBy) === idOf(user) && story.viewerPermissions?.canConfirmBusiness) || qaPendingStories.some((story) => idOf(story.createdBy) === idOf(user) && story.viewerPermissions?.canReviewQaTestability)) && <Card className="border-amber-300 bg-amber-50 p-5"><p className="text-sm font-bold text-amber-900">Ngoại lệ dự án nhỏ</p><p className="mt-1 text-xs leading-5 text-amber-800">Chỉ dùng khi Project không có reviewer độc lập. Quality Gate vẫn được kiểm tra và lý do được lưu audit.</p><div className="mt-3 space-y-2">{businessPendingStories.filter((story) => idOf(story.createdBy) === idOf(user) && story.viewerPermissions?.canConfirmBusiness).map((story) => <div key={`self-business-${story._id}`} className="flex flex-col justify-between gap-2 rounded-lg bg-white p-3 sm:flex-row sm:items-center"><span className="text-sm font-medium">{story.title} · Xác nhận nghiệp vụ</span><Button size="sm" onClick={() => { const reason = window.prompt('Lý do tự duyệt (tối thiểu 10 ký tự):'); if (reason?.trim()) storyDecisionMutation.mutate({ id: story._id, decision: 'BusinessConfirmed', reviewNote: reason.trim() }) }}>Tự duyệt có lý do</Button></div>)}{qaPendingStories.filter((story) => idOf(story.createdBy) === idOf(user) && story.viewerPermissions?.canReviewQaTestability).map((story) => <div key={`self-qa-${story._id}`} className="flex flex-col justify-between gap-2 rounded-lg bg-white p-3 sm:flex-row sm:items-center"><span className="text-sm font-medium">{story.title} · Xác nhận khả năng kiểm thử</span><Button size="sm" onClick={() => { const reason = window.prompt('Lý do tự duyệt QA (tối thiểu 10 ký tự):'); if (reason?.trim()) qaStoryDecisionMutation.mutate({ id: story._id, decision: 'Testable', reviewNote: reason.trim() }) }}>Tự duyệt có lý do</Button></div>)}</div></Card>}

      {businessPendingStories.length > 0 && <Card className="border-violet-200 bg-violet-50/40 p-5"><div className="mb-4"><p className="text-xs font-bold uppercase tracking-wide text-violet-700">Bước 1 · User Story chờ Business Owner xác nhận nghiệp vụ</p><p className="mt-1 text-sm text-slate-600">Business Owner xác nhận phạm vi và Acceptance Criteria. Sau đó User Story mới chuyển sang hàng chờ QA rà soát khả năng kiểm thử.</p></div><div className="space-y-3">{businessPendingStories.map((story) => { const ownStory = idOf(story.createdBy) === idOf(user); const canDecide = story.viewerPermissions?.canConfirmBusiness && !ownStory; const isDeciding = storyDecisionMutation.isPending && idOf(storyDecisionMutation.variables?.id) === idOf(story); const currentProjectRole = story.viewerPermissions?.projectRole; return <div key={story._id} className="rounded-xl border border-violet-100 bg-white p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{story.title}</p><Badge tone={canDecide ? 'violet' : 'amber'}>{canDecide ? 'Cần bạn xác nhận nghiệp vụ' : ownStory ? 'Bạn đã gửi' : 'Chờ Business Owner'}</Badge></div><p className="mt-1 text-sm text-slate-600">{story.description}</p><p className="mt-2 text-xs text-slate-500">Người tạo: {personName(story.createdBy)}</p><div className="mt-2 flex flex-wrap gap-1.5">{(story.acceptanceCriteria || []).slice(0, 4).map((item, index) => <Badge key={index} tone="slate">AC {index + 1}: {item.criteria}</Badge>)}</div><WorkflowContext context={story.workflowContext} /></div>{canDecide ? <div className="flex shrink-0 gap-2"><Button variant="outline" className="border-rose-200 text-rose-600" disabled={isDeciding} onClick={() => { const note = window.prompt('Lý do từ chối nghiệp vụ:'); if (note?.trim()) storyDecisionMutation.mutate({ id: story._id, decision: 'BusinessRejected', reviewNote: note }) }}>{isDeciding && storyDecisionMutation.variables?.decision === 'BusinessRejected' ? 'Đang từ chối…' : 'Từ chối'}</Button><Button disabled={isDeciding} onClick={() => storyDecisionMutation.mutate({ id: story._id, decision: 'BusinessConfirmed', reviewNote: 'Đã xác nhận phạm vi nghiệp vụ và Acceptance Criteria.' })}><Check size={16} />{isDeciding && storyDecisionMutation.variables?.decision === 'BusinessConfirmed' ? 'Đang xác nhận…' : 'Xác nhận nghiệp vụ'}</Button></div> : <p className="shrink-0 text-xs font-medium text-amber-700">{ownStory ? 'Người tạo không thể tự xác nhận' : currentProjectRole ? `Vai trò tại ${story.project?.name || 'Project'} là ${roleLabel(currentProjectRole)}, cần Business Owner` : `Tài khoản chưa có membership trong ${story.project?.name || 'Project'}`}</p>}</div></div> })}</div></Card>}

      {qaPendingStories.length > 0 && <Card className="border-sky-200 bg-sky-50/40 p-5"><div className="mb-4"><p className="text-xs font-bold uppercase tracking-wide text-sky-700">Bước 2 · User Story chờ QA rà soát khả năng kiểm thử</p><p className="mt-1 text-sm text-slate-600">Nghiệp vụ đã được Business Owner xác nhận. QA kiểm tra độ rõ ràng, Acceptance Criteria và dữ liệu cần thiết trước khi tài liệu được duyệt.</p></div><div className="space-y-3">{qaPendingStories.map((story) => { const ownStory = idOf(story.createdBy) === idOf(user); const canDecide = story.viewerPermissions?.canReviewQaTestability && !ownStory; const isDeciding = qaStoryDecisionMutation.isPending && idOf(qaStoryDecisionMutation.variables?.id) === idOf(story); return <div key={story._id} className="rounded-xl border border-sky-100 bg-white p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{story.title}</p><Badge tone={canDecide ? 'blue' : 'amber'}>{canDecide ? 'Cần bạn rà soát QA' : ownStory ? 'Bạn đã gửi' : 'Chờ QA'}</Badge></div><p className="mt-1 text-sm text-slate-600">{story.description}</p><p className="mt-2 text-xs text-slate-500">Người tạo: {personName(story.createdBy)}</p><div className="mt-2 flex flex-wrap gap-1.5">{(story.acceptanceCriteria || []).slice(0, 4).map((item, index) => <Badge key={index} tone="slate">AC {index + 1}: {item.criteria}</Badge>)}</div><WorkflowContext context={story.workflowContext} /></div>{canDecide ? <div className="flex shrink-0 gap-2"><Button variant="outline" className="border-amber-200 text-amber-700" disabled={isDeciding} onClick={() => { const note = window.prompt('Nội dung cần Business Owner làm rõ:'); if (note?.trim()) qaStoryDecisionMutation.mutate({ id: story._id, decision: 'NeedsClarification', reviewNote: note }) }}>{isDeciding && qaStoryDecisionMutation.variables?.decision === 'NeedsClarification' ? 'Đang gửi…' : 'Cần làm rõ'}</Button><Button disabled={isDeciding} onClick={() => qaStoryDecisionMutation.mutate({ id: story._id, decision: 'Testable', reviewNote: 'QA đã rà soát và xác nhận User Story đủ khả năng kiểm thử.' })}><Check size={16} />{isDeciding && qaStoryDecisionMutation.variables?.decision === 'Testable' ? 'Đang xác nhận…' : 'Xác nhận có thể kiểm thử'}</Button></div> : <p className="shrink-0 text-xs font-medium text-amber-700">{ownStory ? 'Người tạo không thể tự rà soát QA' : 'Tài khoản này không giữ vai trò QA'}</p>}</div></div> })}</div></Card>}

      {visiblePlans.length > 0 && <section className="space-y-3"><div><p className="text-xs font-bold uppercase tracking-wide text-violet-700">Test Plan chờ phê duyệt</p><p className="mt-1 text-sm text-slate-600">QA duyệt theo luồng chuẩn; nếu Project không có QA, Business Owner được giao duyệt thay theo ngoại lệ Project nhỏ.</p></div>{visiblePlans.map((plan) => <PlanApprovalCard key={plan._id} plan={plan} pending={planDecisionMutation.isPending} onDecision={openPlanDecision} />)}</section>}

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/70 p-2">
        {[['Action', 'Cần tôi xử lý', actionableReviews.length + actionablePlans.length], ['Submitted', 'Tôi đã gửi', submittedReviews.length + submittedPlans.length], ['Related', 'Tất cả liên quan', reviews.length + approvalPlans.length]].map(([value, label, count]) => <Button key={value} size="sm" variant={activeScope === value ? 'default' : 'ghost'} onClick={() => setActiveScope(value)}>{label} <span className="ml-1 opacity-70">{count}</span></Button>)}
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-px">
        {statusTabs.map((tab) => {
          const count = tab.value === 'All' ? reviews.length + approvalPlans.length : (counts[tab.value] || 0) + (planCounts[tab.value] || 0)
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

      {(reviewsQuery.isLoading || plansQuery.isLoading) && (
        <div className="space-y-4">
          {[1, 2, 3].map((item) => <Skeleton key={item} className="h-64 rounded-2xl" />)}
        </div>
      )}

      {(reviewsQuery.isError || plansQuery.isError) && (
        <Card className="border-rose-200 bg-rose-50 p-6 text-rose-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 shrink-0" size={21} />
            <div>
              <h2 className="font-bold">Không thể tải yêu cầu phê duyệt</h2>
              <p className="mt-1 text-sm">{reviewsQuery.error?.message || plansQuery.error?.message || 'Vui lòng thử tải lại trang.'}</p>
            </div>
          </div>
        </Card>
      )}

      {!reviewsQuery.isLoading && !plansQuery.isLoading && !reviewsQuery.isError && !plansQuery.isError && visibleReviews.length === 0 && visiblePlans.length === 0 && (
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
          {!!selectableVisible.length && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={allVisibleSelected} disabled={bulkDecisionPending} onChange={() => setSelectedReviewIds(allVisibleSelected ? [] : selectableVisible.map((item) => idOf(item)))} className="h-4 w-4 accent-violet-600" />Chọn tất cả kết quả đang hiển thị</label><div className="flex gap-2"><span className="self-center text-xs">Đã chọn {selectedReviewIds.length}</span><Button size="sm" variant="outline" disabled={!selectedReviewIds.length || decisionMutation.isPending || bulkDecisionPending} onClick={() => bulkDecision('Rejected')}>Từ chối đã chọn</Button><Button size="sm" disabled={!selectedReviewIds.length || decisionMutation.isPending || bulkDecisionPending} onClick={() => bulkDecision('Approved')}>{bulkDecisionPending ? `Đang xử lý ${selectedReviewIds.length} mục…` : 'Duyệt đã chọn'}</Button></div></div>}
          {visibleReviews.map((review) => (
            <div key={review._id} className="flex items-start gap-3"><input type="checkbox" aria-label={`Chọn ${review.testCase?.title || 'Test Case'}`} className="mt-6 h-4 w-4 accent-violet-600" disabled={!selectableVisible.some((item) => idOf(item) === idOf(review))} checked={selectedReviewIds.includes(idOf(review))} onChange={() => setSelectedReviewIds((current) => current.includes(idOf(review)) ? current.filter((id) => id !== idOf(review)) : [...current, idOf(review)])} /><div className="min-w-0 flex-1"><ReviewCard
              key={review._id}
              review={review}
              onDecision={openDecision}
              canDecide={
                idOf(review.reviewer) === idOf(user)
                && (
                  review.approvalException?.mode === 'SelfApproval'
                  || (
                    idOf(review.requestedBy) !== idOf(user)
                    && idOf(review.testCase?.createdBy) !== idOf(user)
                  )
                )
              }
            /></div></div>
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
        title={decisionDialog?.decision === 'Approved' ? 'Duyệt Test Case' : 'Kết luận rà soát Test Case'}
        description={decisionDialog?.review?.testCase?.title || ''}
      >
        {decisionDialog?.decision !== 'Approved' && <div className="mb-4"><label className="mb-2 block text-sm font-semibold text-slate-800">Kết luận</label><Select value={decisionDialog?.decision || 'RequestEdit'} onChange={(event) => setDecisionDialog((current) => ({ ...current, decision: event.target.value }))}><option value="RequestEdit">Yêu cầu chỉnh sửa</option><option value="Rejected">Từ chối</option><option value="ClarifyBasis">Cần làm rõ Test Basis</option><option value="InsufficientInformation">Chưa đủ thông tin</option><option value="RegenerateFailedArea">Sinh lại phần không đạt</option></Select></div>}
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-800">
            Nhận xét {decisionDialog?.decision !== 'Approved' && <span className="text-rose-500">*</span>}
          </label>
          <Textarea
            rows={5}
            placeholder={decisionDialog?.decision === 'Approved'
              ? 'Nhập nhận xét cho QA (không bắt buộc)...'
              : 'Nêu rõ lý do để QA có thể chỉnh sửa...'}
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
          />
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="outline" disabled={decisionMutation.isPending} onClick={() => setDecisionDialog(null)}>
            Hủy
          </Button>
          <Button
            className={decisionDialog?.decision !== 'Approved' ? 'bg-rose-600 hover:bg-rose-700' : ''}
            disabled={decisionMutation.isPending}
            onClick={submitDecision}
          >
            {decisionMutation.isPending
              ? <Loader2 className="animate-spin" size={17} />
              : decisionDialog?.decision === 'Approved' ? <Check size={17} /> : <X size={17} />}
            {decisionDialog?.decision === 'Approved' ? 'Xác nhận duyệt' : 'Ghi nhận kết luận'}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={Boolean(planDecisionDialog)}
        onOpenChange={(open) => { if (!open && !planDecisionMutation.isPending) { setPlanDecisionDialog(null); setPlanReviewNote('') } }}
        title={planDecisionDialog?.decision === 'Approved' ? 'Duyệt Test Plan' : 'Từ chối Test Plan'}
        description={planDecisionDialog?.plan?.name || ''}
      >
        {planDecisionDialog?.plan?.viewerPermissions?.approvalMode === 'RoleFallback' && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">Project không có QA độc lập. Bạn đang duyệt thay với vai trò Business Owner; quyết định này sẽ được lưu trong audit.</div>}
        {planDecisionDialog?.plan?.viewerPermissions?.requiresReason && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Đây là tự duyệt theo ngoại lệ Project nhỏ. Lý do tối thiểu 10 ký tự là bắt buộc.</div>}
        <label className="mb-2 block text-sm font-semibold text-slate-800">Nhận xét {(planDecisionDialog?.decision === 'Rejected' || planDecisionDialog?.plan?.viewerPermissions?.requiresReason) && <span className="text-rose-500">*</span>}</label>
        <Textarea rows={5} value={planReviewNote} onChange={(event) => setPlanReviewNote(event.target.value)} placeholder={planDecisionDialog?.decision === 'Rejected' ? 'Nêu rõ nội dung Test Plan cần chỉnh sửa…' : 'Ghi nhận phạm vi đã rà soát hoặc lý do dùng ngoại lệ…'} />
        <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4"><Button variant="outline" disabled={planDecisionMutation.isPending} onClick={() => setPlanDecisionDialog(null)}>Hủy</Button><Button className={planDecisionDialog?.decision === 'Rejected' ? 'bg-rose-600 hover:bg-rose-700' : ''} disabled={planDecisionMutation.isPending} onClick={submitPlanDecision}>{planDecisionMutation.isPending ? <Loader2 className="animate-spin" size={17} /> : planDecisionDialog?.decision === 'Approved' ? <Check size={17} /> : <X size={17} />}{planDecisionDialog?.decision === 'Approved' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}</Button></div>
      </Dialog>
    </div>
  )
}
