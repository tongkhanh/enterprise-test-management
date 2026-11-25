import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { executionApi, workspaceApi } from '@/api/client';
import { Badge, Button, Card, Select } from '@/components/ui';
import TestRunExecutionPanel from './TestRunExecutionPanel';

export default function ResultsTriagePage() {
  const [search, setSearch] = useSearchParams();
  const projects = useQuery({ queryKey: ['projects'], queryFn: workspaceApi.projects });
  const project = search.get('project') || projects.data?.[0]?._id || '';
  const runs = useQuery({ queryKey: ['e2e-runs', project], queryFn: () => executionApi.runs(project), enabled: Boolean(project) });
  const run = search.get('run') || runs.data?.[0]?._id || '';
  const detail = useQuery({ queryKey: ['test-run-detail', run], queryFn: () => executionApi.run(run), enabled: Boolean(run) });
  const executions = detail.data?.executions || [];
  const confirmed = executions.filter((item) => item.qaReviewedAt && item.qaVerdict === item.result && String(item.qaAutomationRun || '') === String(item.automationRun?._id || '')).length;
  const pendingTriage = executions.filter((item) => ['Failed', 'Blocked'].includes(item.result) && !item.triage?.reviewedAt).length;
  const set = (key, value) => setSearch((current) => { const next = new URLSearchParams(current); next.set(key, value); if (key === 'project') next.delete('run'); return next; });
  return <div className="space-y-5">
    <header><h1 className="text-2xl font-bold">Results & Triage</h1><p className="mt-2 text-sm text-slate-500">Test Run → kết quả & evidence → QA verdict → phân loại nguyên nhân → Bug / Retest → đánh giá hoàn tất → báo cáo.</p></header>
    <Card className="space-y-3 p-4"><div className="grid gap-3 md:grid-cols-2"><label><span className="label">Project</span><Select aria-label="Project Results & Triage" value={project} onChange={(event) => set('project', event.target.value)}>{projects.data?.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</Select></label><label><span className="label">Test Run</span><Select aria-label="Test Run Results & Triage" value={run} onChange={(event) => set('run', event.target.value)}><option value="">Chọn Test Run</option>{runs.data?.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.executionMode}</option>)}</Select></label></div>
      <div className="flex flex-wrap gap-2"><Badge>QA xác nhận {confirmed}/{executions.length}</Badge><Badge>Chờ triage {pendingTriage}</Badge>{['Passed', 'Failed', 'Blocked', 'Skipped', 'NotRun'].map((status) => <Badge key={status}>{status}: {executions.filter((item) => item.result === status).length}</Badge>)}</div>
      <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to={`/test-execution?project=${project}&run=${run}`}>Quay lại thực thi</Link></Button><Button asChild variant="outline"><Link to={`/bugs?project=${project}`}>Bug Tracking</Link></Button>{executions.length > 0 && confirmed === executions.length && !pendingTriage ? <Button asChild><Link to={`/reports?project=${project}`}>Đánh giá hoàn tất & báo cáo</Link></Button> : <p className="text-xs text-amber-700">Xác nhận QA cho mọi case và triage Fail/Blocked trước khi tổng hợp báo cáo.</p>}</div>
    </Card>
    {(projects.isError || runs.isError || detail.isError) && <p role="alert" className="text-red-600">{projects.error?.message || runs.error?.message || detail.error?.message}</p>}
    {run ? <TestRunExecutionPanel key={run} runId={run} project={project} reviewOnly /> : <p>Chưa có Test Run. Chuẩn bị thực thi từ Backlog & Test Board.</p>}
  </div>;
}
