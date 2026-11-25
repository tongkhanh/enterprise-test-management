import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { executionApi } from '@/api/client';
import { Badge, Button, Select, Textarea } from '@/components/ui';

const types = ['ProductBug', 'TestScript', 'TestData', 'Environment', 'FlakyTest', 'RequirementMismatch', 'ExpectedBehavior', 'Duplicate'];
export default function ExecutionTriage({ execution, refresh, qaConfirmed }) {
  const [edit, setEdit] = useState(null);
  const stored = execution.triage || {};
  const form = edit || { classification: stored.classification || '', rootCause: stored.rootCause || '', solution: stored.solution || '', notes: stored.notes || '' };
  const suggestion = stored.aiSuggestion;
  const update = (field, value) => setEdit({ ...form, [field]: value });
  const analyze = useMutation({ mutationFn: () => executionApi.analyzeExecution(execution._id), onSuccess: () => { refresh(); toast.success('Đã lưu đề xuất AI; chưa phải kết luận QA'); }, onError: (error) => toast.error(error.message) });
  const review = useMutation({ mutationFn: (aiDecision) => executionApi.reviewTriage(execution._id, { ...form, ...(aiDecision ? { aiDecision } : {}) }), onSuccess: () => { setEdit(null); refresh(); toast.success('Đã xác nhận triage'); }, onError: (error) => toast.error(error.message) });
  if (!['Failed', 'Blocked'].includes(execution.result) && !execution.triage) return null;
  return <section aria-label="Root Cause & Triage" className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/30 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Root Cause & Triage</h3><Badge>{stored.reviewedAt ? 'QA đã xác nhận' : 'Chờ triage'}</Badge></div>
    <p className="text-xs text-slate-500">QA có thể phân loại và nhập nguyên nhân thủ công. AI chỉ hỗ trợ; lỗi AI không chặn triage.</p>
    <Button variant="outline" disabled={analyze.isPending} onClick={() => analyze.mutate()}>{analyze.isPending ? 'Đang phân tích…' : 'AI gợi ý root cause'}</Button>
    {suggestion && <div className="space-y-2 rounded border bg-white p-3 dark:bg-slate-900"><strong className="text-sm">Đề xuất AI · {suggestion.status} · Confidence {Math.round(suggestion.confidence * 100)}%</strong><p className="whitespace-pre-wrap text-sm">{suggestion.rootCause}</p><p className="whitespace-pre-wrap text-sm">Hướng xử lý: {suggestion.solution || 'Chưa có đề xuất'}</p><p className="text-xs text-slate-500">Đối chiếu evidence trước khi chấp nhận. Phân tích thủ công sử dụng Actual Result và metadata evidence, không tự đọc nội dung video/ảnh.</p><div className="flex flex-wrap gap-2"><Button size="sm" disabled={!qaConfirmed || review.isPending} onClick={() => review.mutate('Accepted')}>Chấp nhận đề xuất</Button><Button size="sm" variant="outline" onClick={() => setEdit({ ...form, classification: suggestion.classification, rootCause: suggestion.rootCause, solution: suggestion.solution, aiDecision: 'Edited' })}>Chỉnh sửa đề xuất</Button><Button size="sm" variant="outline" disabled={!qaConfirmed || review.isPending || !form.classification} onClick={() => review.mutate('Rejected')}>Từ chối đề xuất</Button></div></div>}
    <label className="block"><span className="label">Phân loại nguyên nhân *</span><Select aria-label="Phân loại triage" value={form.classification} onChange={(event) => update('classification', event.target.value)}><option value="">Chọn loại nguyên nhân</option>{types.map((type) => <option key={type}>{type}</option>)}</Select></label>
    <label className="block"><span className="label">Root cause do QA xác nhận</span><Textarea aria-label="Root cause QA" value={form.rootCause} onChange={(event) => update('rootCause', event.target.value)} /></label>
    <label className="block"><span className="label">Giải pháp / hướng điều tra</span><Textarea aria-label="Giải pháp QA" value={form.solution} onChange={(event) => update('solution', event.target.value)} /></label>
    <label className="block"><span className="label">Ghi chú triage</span><Textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} /></label>
    {!qaConfirmed && <p className="text-xs text-amber-700">Lưu xác nhận verdict QA trước khi chốt triage.</p>}
    <Button disabled={!qaConfirmed || !form.classification || review.isPending} onClick={() => review.mutate(form.aiDecision)}>Xác nhận triage</Button>
  </section>;
}
