import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Bot, CheckCheck, CheckCircle2, ChevronRight, Copy, FolderPlus, FolderTree, LoaderCircle, RotateCcw, Sparkles, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'
import AnalyzerForm from './AnalyzerForm'
import AnalysisResults from './AnalysisResults'
import TestCaseCard from './TestCaseCard'
import GithubRequirementPanel from './GithubRequirementPanel'
import { aiApi, catalogApi, documentApi, requirementApi, testCaseApi, testSuiteApi } from '@/api/client'
import { Badge, Button, Card, Dialog, Input, Select, Skeleton } from '@/components/ui'
import { cn, idOf } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { emptyGeneratorForm, useGeneratorStore } from '@/store/generatorStore'

const flattenSuites = (items = [], depth = 0) => items.flatMap((item) => [{ ...item, depth }, ...flattenSuites(item.children, depth + 1)])

function validate(form, generation = false) {
  const errors = {}
  if (!form.projectId) errors.projectId = 'Vui lòng chọn Project.'
  if (!form.userStoryId) errors.userStoryId = 'Vui lòng chọn User Story.'
  if (!form.targetUrl) errors.targetUrl = 'Target URL là bắt buộc.'
  else {
    try { const url = new URL(form.targetUrl); if (!['http:', 'https:'].includes(url.protocol)) errors.targetUrl = 'URL phải dùng HTTP hoặc HTTPS.' }
    catch { errors.targetUrl = 'URL không đúng định dạng.' }
  }
  if (generation && !form.testSuiteId) errors.testSuiteId = 'Vui lòng chọn Test Suite để lưu Test Case.'
  return errors
}

export default function AiTestGeneratorPage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const generatorContext = useGeneratorStore()
  const ownerId = idOf(user)
  const ownsContext = generatorContext.ownerId === ownerId
  const form = ownsContext ? generatorContext.form : emptyGeneratorForm
  const analysis = ownsContext ? generatorContext.analysis : null
  const setForm = (next) => generatorContext.setForm(ownerId, typeof next === 'function' ? next(form) : next)
  const setAnalysis = (next) => generatorContext.setAnalysis(ownerId, typeof next === 'function' ? next(analysis) : next)
  const [errors, setErrors] = useState({})
  const [rawOpen, setRawOpen] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [previewDocument, setPreviewDocument] = useState(null)
  const [storySuggestion, setStorySuggestion] = useState(null)
  const [pendingRequirementFile, setPendingRequirementFile] = useState(null)
  const [copiedStoryId, setCopiedStoryId] = useState(false)
  const [suiteDialogOpen, setSuiteDialogOpen] = useState(false)
  const [suiteDraft, setSuiteDraft] = useState({ name: '', description: '' })

  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: catalogApi.projects })
  const storiesQuery = useQuery({ queryKey: ['stories', form.projectId], queryFn: () => catalogApi.stories(form.projectId), enabled: Boolean(form.projectId) })
  const suitesQuery = useQuery({ queryKey: ['suites', form.projectId], queryFn: () => catalogApi.suites(form.projectId), enabled: Boolean(form.projectId), select: (data) => flattenSuites(data) })
  const membersQuery = useQuery({ queryKey: ['members', form.projectId], queryFn: () => catalogApi.members(form.projectId), enabled: Boolean(form.projectId) })
  const documentsQuery = useQuery({ queryKey: ['story-documents', form.userStoryId], queryFn: () => documentApi.list(form.userStoryId), enabled: Boolean(form.userStoryId) })
  const previewQuery = useQuery({ queryKey: ['document-preview', idOf(previewDocument)], queryFn: () => documentApi.preview(idOf(previewDocument)), enabled: Boolean(previewDocument) })
  const casesQueryKey = ['ai-generated-test-cases', form.projectId, form.userStoryId]
  const persistedCasesQuery = useQuery({
    queryKey: casesQueryKey,
    queryFn: () => testCaseApi.list(`project=${form.projectId}&userStory=${form.userStoryId}&limit=100`),
    enabled: Boolean(form.projectId && form.userStoryId),
  })
  const cases = persistedCasesQuery.data || []
  const setCases = (next) => queryClient.setQueryData(casesQueryKey, (current = []) => (
    typeof next === 'function' ? next(current) : next
  ))

  const canApprove = user?.role?.permissions?.includes('testcase:approve') || false
  const canSubmitReview = user?.role?.permissions?.includes('testcase:create') || false
  const reviewsQuery = useQuery({ queryKey: ['generator-reviews', user?._id, cases.map(idOf).join(',')], queryFn: () => testCaseApi.reviews(`status=Pending&reviewer=${idOf(user)}&limit=100`), enabled: canApprove && cases.length > 0 })
  const reviewers = useMemo(
    () => (membersQuery.data || []).filter((member) => member.role?.permissions?.includes('testcase:approve') && idOf(member) !== idOf(user)),
    [membersQuery.data, user],
  )
  const story = (storiesQuery.data || []).find((item) => item._id === form.userStoryId)
  const needsStoryApproval = Boolean(story?.aiSuggestion)

  const analyzeMutation = useMutation({
    mutationFn: aiApi.analyze,
    onSuccess: (result) => { setAnalysis(result); toast.success('Đã phân tích tài liệu và website thành công.') },
    onError: (error) => toast.error('Không thể phân tích website', { description: error.message }),
  })
  const suggestStoryMutation = useMutation({
    mutationFn: aiApi.suggestUserStory,
    onSuccess: (result) => { setStorySuggestion(result.suggestion); toast.success('Gemini đã tạo User Story Suggestion. QA có thể chỉnh sửa trước khi gửi duyệt.') },
    onError: (error) => toast.error('Không thể tạo User Story Suggestion', { description: error.message }),
  })
  const suggestStoryDocumentMutation = useMutation({
    mutationFn: (file) => aiApi.suggestUserStoryDocument(form.projectId, file),
    onSuccess: (result) => { setStorySuggestion(result.suggestion); toast.success('Đã trích xuất requirement và tạo User Story Suggestion.') },
    onError: (error) => toast.error('Không thể xử lý requirement document', { description: error.message }),
  })
  const suggestStoryGithubMutation = useMutation({
    mutationFn: aiApi.suggestUserStoryGithub,
    onSuccess: (result) => { setStorySuggestion(result.suggestion); toast.success('Gemini đã tạo User Story Suggestion từ các file GitHub đã chọn.') },
    onError: (error) => toast.error('Không thể tạo User Story từ GitHub', { description: error.message }),
  })
  const createStoryMutation = useMutation({
    mutationFn: (suggestion) => requirementApi.createStory({ project: form.projectId, ...suggestion, acceptanceCriteria: (suggestion.acceptanceCriteria || []).map((item) => typeof item === 'string' ? { criteria: item, isCompleted: false } : item), approvalStatus: 'PendingApproval', source: suggestion.source || 'AI', aiSuggestion: suggestion }),
    onSuccess: async (storyResult) => { setStorySuggestion(null); queryClient.invalidateQueries({ queryKey: ['stories', form.projectId] }); setForm((current) => ({ ...current, userStoryId: idOf(storyResult) })); if (pendingRequirementFile) { try { await documentApi.upload(idOf(storyResult), pendingRequirementFile); setPendingRequirementFile(null); queryClient.invalidateQueries({ queryKey: ['story-documents', idOf(storyResult)] }) } catch (error) { toast.error('User Story đã lưu nhưng không thể gắn tài liệu requirement', { description: error.message }) } } toast.success('Đã lưu User Story và gửi QA Manager duyệt.') },
    onError: (error) => toast.error('Không thể lưu User Story', { description: error.message }),
  })
  const createSuiteMutation = useMutation({
    mutationFn: (body) => testSuiteApi.create(body),
    onSuccess: (suite) => {
      queryClient.invalidateQueries({ queryKey: ['suites', form.projectId] })
      setForm((current) => ({ ...current, testSuiteId: idOf(suite) }))
      setSuiteDialogOpen(false)
      setSuiteDraft({ name: '', description: '' })
      setErrors((current) => ({ ...current, testSuiteId: undefined }))
      toast.success(`Đã tạo Test Suite “${suite.name}” và chọn để lưu Test Case.`)
    },
    onError: (error) => toast.error('Không thể tạo Test Suite', { description: error.message }),
  })
  const generateMutation = useMutation({
    mutationFn: aiApi.generate,
    onSuccess: (result) => { setAnalysis((current) => ({ businessContext: current?.businessContext || {}, webContext: result.analysis })); setCases(result.testCases || []); queryClient.invalidateQueries({ queryKey: ['ai-generated-test-cases', form.projectId, form.userStoryId] }); toast.success(`AI đã sinh ${result.testCases?.length || 0} Test Case Draft.`) },
    onError: (error) => toast.error('AI không thể sinh Test Case', { description: error.message }),
  })
  const uploadMutation = useMutation({
    mutationFn: (file) => documentApi.upload(form.userStoryId, file, setUploadProgress),
    onMutate: () => setUploadProgress(0),
    onSuccess: (document) => { queryClient.invalidateQueries({ queryKey: ['story-documents', form.userStoryId] }); setForm((current) => ({ ...current, documentIds: [...new Set([...(current.documentIds || []), idOf(document)])] })); setUploadProgress(100); toast.success('Tài liệu đã được trích xuất và sẵn sàng cho AI.') },
    onError: (error) => toast.error('Không thể xử lý tài liệu', { description: error.message }),
  })
  const deleteDocumentMutation = useMutation({
    mutationFn: (document) => documentApi.remove(idOf(document)),
    onSuccess: (_, document) => { setForm((current) => ({ ...current, documentIds: (current.documentIds || []).filter((id) => id !== idOf(document)) })); queryClient.invalidateQueries({ queryKey: ['story-documents', form.userStoryId] }); toast.success('Đã xóa tài liệu.') },
    onError: (error) => toast.error(error.message),
  })
  const editMutation = useMutation({ mutationFn: ({ id, body }) => testCaseApi.update(id, body), onSuccess: (updated) => { setCases((current) => current.map((item) => idOf(item) === idOf(updated) ? updated : item)); queryClient.invalidateQueries({ queryKey: ['ai-generated-test-cases'] }); toast.success('Đã lưu thay đổi Test Case.') }, onError: (error) => toast.error(error.message) })
  const reviewMutation = useMutation({ mutationFn: ({ id, body }) => testCaseApi.submitReview(id, body), onSuccess: (_, variables) => { setCases((current) => current.map((item) => idOf(item) === variables.id ? { ...item, status: 'NeedsReview' } : item)); toast.success('Đã gửi QA Manager phê duyệt.'); queryClient.invalidateQueries({ queryKey: ['generator-reviews'] }); queryClient.invalidateQueries({ queryKey: ['ai-generated-test-cases'] }) }, onError: (error) => toast.error(error.message) })
  const decisionMutation = useMutation({ mutationFn: ({ reviewId, decision, note }) => testCaseApi.decide(reviewId, { decision, reviewNote: note }), onSuccess: (result) => { setCases((current) => current.map((item) => idOf(item) === idOf(result.testCase) ? result.testCase : item)); toast.success(result.review.status === 'Approved' ? 'Test Case đã được duyệt và đưa vào Backlog.' : 'Đã từ chối Test Case.'); queryClient.invalidateQueries({ queryKey: ['generator-reviews'] }); queryClient.invalidateQueries({ queryKey: ['approval-inbox'] }); queryClient.invalidateQueries({ queryKey: ['kanban-board'] }) }, onError: (error) => toast.error(error.message) })
  const busy = editMutation.isPending || reviewMutation.isPending || decisionMutation.isPending

  const payload = () => ({ projectId: form.projectId, userStoryId: form.userStoryId, testSuiteId: form.testSuiteId, documentIds: form.documentIds || [], targetUrl: form.targetUrl.trim(), viewportWidth: Number(form.viewportWidth), viewportHeight: Number(form.viewportHeight) })
  const updateForm = (next) => {
    if (next.projectId !== form.projectId || next.userStoryId !== form.userStoryId) {
      setAnalysis(null); setErrors({})
    }
    setForm(next)
  }
  const analyze = (event) => { event.preventDefault(); const next = validate(form); setErrors(next); if (!Object.keys(next).length) analyzeMutation.mutate(payload()) }
  const generate = () => { const next = validate(form, true); setErrors(next); if (Object.keys(next).length) return toast.error('Vui lòng bổ sung các trường bắt buộc.'); if (needsStoryApproval && story?.approvalStatus !== 'Approved') return toast.error('User Story do AI đề xuất cần được QA Manager duyệt trước khi sinh Test Case.'); generateMutation.mutate(payload()) }
  const decide = (review, decision) => { if (!review) return; const note = window.prompt(decision === 'Rejected' ? 'Lý do từ chối Test Case:' : 'Ghi chú phê duyệt:', decision === 'Approved' ? 'Đã kiểm tra steps, expected result và selectors.' : ''); if (note === null) return; decisionMutation.mutate({ reviewId: idOf(review), decision, note }) }
  const reset = () => { generatorContext.reset(ownerId); setErrors({}); setRawOpen(false) }
  const openSuiteDialog = () => {
    if (!form.projectId) return toast.error('Hãy chọn Project trước khi tạo Test Suite.')
    setSuiteDraft({ name: story?.title ? `Kiểm thử · ${story.title}` : '', description: story?.description || '' })
    setSuiteDialogOpen(true)
  }
  const createSuite = (event) => {
    event.preventDefault()
    if (!suiteDraft.name.trim()) return toast.error('Tên Test Suite là bắt buộc.')
    createSuiteMutation.mutate({ project: form.projectId, name: suiteDraft.name.trim(), description: suiteDraft.description.trim() })
  }
  const removeDocument = (document) => { if (window.confirm(`Xóa tài liệu “${document.originalName}”?`)) deleteDocumentMutation.mutate(document) }
  const copyStoryId = async () => { if (!story?._id) return; await navigator.clipboard?.writeText(story._id); setCopiedStoryId(true); window.setTimeout(() => setCopiedStoryId(false), 1600) }

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end"><div><div className="flex items-center gap-2"><Badge tone="purple"><Bot className="mr-1 h-3.5 w-3.5" />AI Core</Badge><span className="text-xs text-muted-foreground">Từ yêu cầu đến Test Case</span></div><h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Tạo Test Case với AI</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Bắt đầu bằng Project, User Story và địa chỉ website. AI sẽ phân tích ngữ cảnh trước khi tạo các Test Case để bạn kiểm tra.</p></div><Button variant="outline" onClick={reset} disabled={!analysis}><RotateCcw className="h-4 w-4" />Bắt đầu lại</Button></div>
    <Card className="overflow-hidden"><div className="border-b border-border px-4 py-3 sm:px-5"><p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Quy trình làm việc</p><p className="mt-0.5 text-xs text-muted-foreground">Cả ba luồng đều dùng cùng Website URL: lưu User Story, phân tích website bằng Playwright, sau đó duyệt trước khi sinh Test Case.</p></div><div className="flex items-center overflow-x-auto p-2 sm:p-3"><Step number="1" label="Nguồn User Story" active={!form.userStoryId} complete={Boolean(form.userStoryId)} /><ChevronRight className="mx-2 h-4 w-4 shrink-0 text-slate-300" /><Step number="2" label="Phân tích Website" active={Boolean(form.userStoryId) && !analysis} complete={Boolean(analysis)} /><ChevronRight className="mx-2 h-4 w-4 shrink-0 text-slate-300" /><Step number="3" label="QA Manager duyệt" active={Boolean(analysis) && Boolean(story) && !Boolean(!needsStoryApproval || story.approvalStatus === 'Approved')} complete={Boolean(story && (!needsStoryApproval || story.approvalStatus === 'Approved'))} /><ChevronRight className="mx-2 h-4 w-4 shrink-0 text-slate-300" /><Step number="4" label="Tạo Test Case" active={Boolean(analysis) && Boolean(story && (!needsStoryApproval || story.approvalStatus === 'Approved')) && !cases.length} complete={cases.length > 0} /></div></Card>
    <AnalyzerForm form={form} setForm={updateForm} errors={errors} projects={projectsQuery.data || []} stories={storiesQuery.data || []} story={story} storySuggestion={storySuggestion} onSuggestStory={(body) => suggestStoryMutation.mutate(body)} onSuggestStoryDocument={(file) => { setPendingRequirementFile(file); suggestStoryDocumentMutation.mutate(file) }} onCreateStory={(suggestion) => createStoryMutation.mutate(suggestion)} suggestingStory={suggestStoryMutation.isPending || suggestStoryDocumentMutation.isPending || suggestStoryGithubMutation.isPending} creatingStory={createStoryMutation.isPending} documents={documentsQuery.data || []} loadingCatalog={projectsQuery.isPending || storiesQuery.isFetching} analyzing={analyzeMutation.isPending} uploading={uploadMutation.isPending} uploadProgress={uploadProgress} onAnalyze={analyze} onUpload={(file) => uploadMutation.mutate(file)} onPreview={setPreviewDocument} onDelete={removeDocument} storyReady={Boolean(story)} githubRequirement={<GithubRequirementPanel key={form.projectId} projectId={form.projectId} loading={suggestStoryGithubMutation.isPending} onSuggest={(body) => suggestStoryGithubMutation.mutate(body)} suggestion={storySuggestion?.source === 'GitHub' ? storySuggestion : null} onCreateStory={(suggestion) => createStoryMutation.mutate(suggestion)} creatingStory={createStoryMutation.isPending} embedded />} />
    {story && <Card className="border-l-4 border-l-primary p-4"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary"><FolderTree className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold text-slate-700 dark:text-slate-200">{story.title}</p><Badge tone={needsStoryApproval && story.approvalStatus !== 'Approved' ? 'amber' : 'green'}>{needsStoryApproval ? story.approvalStatus || 'Draft' : 'Sẵn sàng sử dụng'}</Badge></div><div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900"><span className="text-[11px] text-slate-500">User Story ID:</span><code className="break-all text-[11px] font-semibold text-slate-700 dark:text-slate-200">{story._id}</code><button type="button" className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-primary" onClick={copyStoryId}>{copiedStoryId ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copiedStoryId ? 'Đã sao chép' : 'Sao chép ID'}</button></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{story.description || 'Không có mô tả.'}</p><div className="mt-2 flex flex-wrap gap-1.5">{(story.acceptanceCriteria || []).map((item, index) => <Badge key={index} tone="slate">AC {index + 1}: {item.criteria}</Badge>)}{form.documentIds.length > 0 && <Badge tone="blue">{form.documentIds.length} tài liệu được chọn</Badge>}</div></div></div></Card>}
    {analyzeMutation.isPending && <AnalysisSkeleton />}
    {analysis && !analyzeMutation.isPending && <section className="space-y-4"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Analysis result</p><h2 className="mt-1 text-xl font-bold">Website inventory</h2></div><button onClick={() => setRawOpen(!rawOpen)} className="text-xs font-semibold text-primary hover:underline">{rawOpen ? 'Ẩn JSON' : 'Xem JSON tree'}</button></div>{rawOpen ? <Card className="max-h-[560px] overflow-auto bg-[#171829] p-5"><pre className="whitespace-pre-wrap break-words text-xs leading-6 text-violet-100">{JSON.stringify(analysis, null, 2)}</pre></Card> : <AnalysisResults result={analysis} />}</section>}
    {analysis && <Card className="overflow-hidden">
      <div className="border-b bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 p-5 dark:from-violet-950/30 dark:via-[#17181d] dark:to-fuchsia-950/20 sm:p-6">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 text-white shadow-md shadow-violet-200"><WandSparkles className="h-5 w-5" /></span><div><span className="text-xs font-bold uppercase tracking-[.14em] text-primary">Bước 2 · AI Generator</span><h2 className="mt-1 text-lg font-bold">Sinh Test Case từ ngữ cảnh hợp nhất</h2><p className="mt-1 text-sm text-muted-foreground">Tạo một Test Suite tại đây hoặc chọn Suite có sẵn để lưu các bản Draft do Gemini tạo.</p></div></div>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-6">
        <label><span className="label">Test Suite <b className="text-danger">*</b></span><Select value={form.testSuiteId} onChange={(event) => setForm({ ...form, testSuiteId: event.target.value })} error={errors.testSuiteId}><option value="">Chọn Test Suite</option>{(suitesQuery.data || []).map((suite) => <option key={suite._id} value={suite._id}>{'— '.repeat(suite.depth)}{suite.name}</option>)}</Select>{errors.testSuiteId && <p className="field-error"><AlertCircle className="h-3.5 w-3.5" />{errors.testSuiteId}</p>}</label>
        <div className="flex flex-col gap-2 sm:flex-row"><Button type="button" variant="outline" className="h-11" onClick={openSuiteDialog}><FolderPlus className="h-4 w-4" />Tạo Test Suite</Button><Button className={cn('h-11 min-w-60', generateMutation.isPending && 'ai-shimmer')} onClick={generate} disabled={generateMutation.isPending || (needsStoryApproval && story?.approvalStatus !== 'Approved')}>{generateMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{generateMutation.isPending ? 'AI đang suy nghĩ…' : needsStoryApproval && story?.approvalStatus !== 'Approved' ? 'Chờ duyệt đề xuất AI' : 'Tạo Test Case với AI'}</Button></div>
      </div>
      {!suitesQuery.isFetching && !(suitesQuery.data || []).length && <p className="px-5 pb-5 text-xs text-amber-700 dark:text-amber-300">Project này chưa có Test Suite. Bấm “Tạo Test Suite” để tiếp tục.</p>}
    </Card>}
    {generateMutation.isPending && <TestCasesSkeleton />}
    {cases.length > 0 && !generateMutation.isPending && <section><div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Generated drafts</p><h2 className="mt-1 text-xl font-bold">{cases.length} Test Case được tạo</h2><p className="mt-1 text-sm text-muted-foreground">Mở từng card để xem Steps, Expected Result, Test Data và Selectors.</p></div><Badge tone="amber">Cần người kiểm tra</Badge></div><div className="grid gap-4 2xl:grid-cols-2">{cases.map((testCase) => <TestCaseCard key={idOf(testCase)} testCase={testCase} canApprove={canApprove} canSubmitReview={canSubmitReview} pendingReview={(reviewsQuery.data || []).find((review) => idOf(review.testCase) === idOf(testCase) && idOf(review.reviewer) === idOf(user) && idOf(review.requestedBy) !== idOf(user) && idOf(review.testCase?.createdBy || testCase.createdBy) !== idOf(user))} reviewers={reviewers} busy={busy} onEdit={(id, body) => editMutation.mutateAsync({ id, body })} onSubmitReview={(id, body) => reviewMutation.mutateAsync({ id, body })} onDecision={decide} />)}</div></section>}
    <Dialog open={suiteDialogOpen} onOpenChange={setSuiteDialogOpen} title="Tạo Test Suite" description="Suite này thuộc Project đang chọn và sẽ được chọn tự động sau khi tạo.">
      <form className="space-y-4" onSubmit={createSuite}>
        <label className="block"><span className="label">Tên Test Suite <b className="text-danger">*</b></span><Input autoFocus value={suiteDraft.name} onChange={(event) => setSuiteDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ví dụ: Kiểm thử đăng nhập" maxLength={200} /></label>
        <label className="block"><span className="label">Mô tả <span className="text-muted-foreground">(không bắt buộc)</span></span><textarea className="input min-h-24 resize-y" value={suiteDraft.description} onChange={(event) => setSuiteDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Phạm vi hoặc mục tiêu kiểm thử của Suite này" /></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSuiteDialogOpen(false)}>Hủy</Button><Button type="submit" disabled={createSuiteMutation.isPending}>{createSuiteMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}{createSuiteMutation.isPending ? 'Đang tạo…' : 'Tạo và chọn Suite'}</Button></div>
      </form>
    </Dialog>
    <Dialog open={Boolean(previewDocument)} onOpenChange={(open) => !open && setPreviewDocument(null)} title={previewDocument?.originalName || 'Nội dung tài liệu'} description="Văn bản đã trích xuất sẽ được gửi cho Gemini cùng dữ liệu website."><div className="max-h-[60vh] overflow-auto rounded-lg border bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">{previewQuery.isPending ? <Skeleton className="h-64" /> : previewQuery.isError ? <p className="text-sm text-rose-600">{previewQuery.error.message}</p> : <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-6 text-slate-700 dark:text-slate-200">{previewQuery.data?.text}</pre>}</div>{previewQuery.data?.previewTruncated && <p className="mt-3 text-xs text-amber-600">Bản xem trước đã được rút gọn; AI sử dụng ngữ cảnh theo giới hạn cấu hình của hệ thống.</p>}</Dialog>
  </div>
}

function Step({ number, label, active, complete }) { return <div className={cn('flex min-w-fit items-center gap-2 rounded-xl px-3 py-2', active && 'bg-primary-50')}><span className={cn('grid h-7 w-7 place-items-center rounded-full text-xs font-bold', complete ? 'bg-emerald-500 text-white' : active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500')}>{complete ? <CheckCircle2 className="h-4 w-4" /> : number}</span><span className={cn('text-xs font-semibold', active || complete ? 'text-slate-800 dark:text-slate-100' : 'text-muted-foreground')}>{label}</span></div> }
function AnalysisSkeleton() { return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map((item) => <Skeleton key={item} className="h-20" />)}</div><div className="grid gap-5 xl:grid-cols-2"><Skeleton className="h-96" /><Skeleton className="h-96" /></div></div> }
function TestCasesSkeleton() { return <div className="grid gap-4 2xl:grid-cols-2">{[1,2,3,4].map((item) => <Card key={item} className="p-5"><div className="flex gap-2"><Skeleton className="h-6 w-16" /><Skeleton className="h-6 w-12" /></div><Skeleton className="mt-4 h-5 w-3/4" /><Skeleton className="mt-3 h-4 w-full" /><Skeleton className="mt-2 h-4 w-2/3" /><div className="mt-5 flex gap-2 border-t pt-4"><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-20" /></div></Card>)}</div> }
