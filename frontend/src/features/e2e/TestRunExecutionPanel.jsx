import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { automationLabApi, bugApi, executionApi } from "@/api/client";
import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import RemoteManualBrowser from "./RemoteManualBrowser";
import AutomationLiveView from "./AutomationLiveView";

const activeStatuses = new Set(["Queued", "Preparing", "Running", "Collecting"]);

function ExecutionCase({ execution, scripts, jobs, project, profile, run, refresh }) {
  const mode = execution.executionMode || run.executionMode || (execution.automationRun ? "Automation" : "Manual");
  const [manualOpen, setManualOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [split, setSplit] = useState(40);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (!manualOpen && !automationOpen) return;
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [manualOpen, automationOpen]);
  const [script, setScript] = useState("");
  const [dataset, setDataset] = useState("");
  const [fixture, setFixture] = useState("");
  const [verdict, setVerdict] = useState("");
  const [files, setFiles] = useState([]);
  const [stepResults, setStepResults] = useState(() => (execution.testCase?.testSteps || []).map((step, index) => execution.stepResults?.find((row) => row.stepNumber === (step.stepNumber || index + 1)) || { stepNumber: step.stepNumber || index + 1, status: "NotRun", actualResult: "", note: "" }));
  const [noteEdit, setNote] = useState(null);
  const note = noteEdit ?? execution.actualResult ?? "";
  const [showBug, setShowBug] = useState(false);
  const [bug, setBug] = useState({ title: "", description: "", stepsToReproduce: "", expectedResult: "", actualResult: "", anomalyType: "ProductBug", severity: "Major", priority: "Medium", jiraRequested: false });
  const testCase = execution.testCase;
  const runner = execution.automationRun;
  const runnerActive = activeStatuses.has(runner?.status);
  const runnerResult = jobs.find((job) => job._id === runner?.result);
  const evidence = Object.values(runnerResult?.artifacts || {}).flat().filter((item) => item?.url?.startsWith("/api/v1/execution-artifacts/"));
  const options = scripts.filter((item) =>
    item.testCase === testCase?._id &&
    (!item.runtimeUrl || item.runtimeUrl === execution.runtimeUrl) &&
    (!testCase?.e2e?.systemProfile || item.sourceCaseUpdatedAt === testCase.updatedAt),
  );
  const boundScript = execution.automationScript?._id || execution.automationScript;
  const selectedScript = options.find((item) => item._id === script)?._id || options.find((item) => item._id === boundScript)?._id || options[0]?._id || "";
  const planReady = run.testPlan.kind !== "ExecutionPlan" || run.testPlan.approvalStatus === "Approved";
  const params = new URLSearchParams({ project, run: run._id, testCase: testCase?._id || "" });
  if (profile) params.set("profile", profile);
  const datasets = useQuery({ queryKey: ["ops-data", project], queryFn: () => automationLabApi.datasets(project), enabled: mode === "Automation" });
  const fixtures = useQuery({ queryKey: ["ops-fixtures", project], queryFn: () => automationLabApi.fixtures(project), enabled: mode === "Automation" });
  const readyFixtures = (fixtures.data || []).filter((item) => (item.environment?._id || item.environment) === execution.environmentId);
  const preflight = useQuery({ queryKey: ['automation-preflight', execution._id, selectedScript, dataset, fixture, runner?.status, runner?.attempt], queryFn: () => executionApi.automationPreflight(execution._id, { scriptId: selectedScript || undefined, dataset: dataset || undefined, fixture: fixture || undefined }), enabled: mode === 'Automation', refetchOnWindowFocus: true });

  const save = useMutation({
    mutationFn: () => executionApi.recordExecution(execution._id, { result: verdict || execution.result, actualResult: note.trim(), stepResults }),
    onSuccess: () => { setVerdict(""); refresh(); toast.success("Đã lưu kết quả QA"); },
    onError: (error) => toast.error(error.message),
  });
  const uploadEvidence = useMutation({
    mutationFn: () => executionApi.uploadExecutionEvidence(execution._id, files),
    onSuccess: () => { setFiles([]); refresh(); toast.success("Đã gắn evidence vào lần thực thi"); },
    onError: (error) => toast.error(error.message),
  });
  const start = useMutation({
    mutationFn: () => executionApi.executeScript(execution._id, { scriptId: selectedScript, dataset: dataset || undefined, fixture: readyFixtures.some((item) => item._id === fixture) ? fixture : undefined }),
    onSuccess: () => { setAutomationOpen(true); preflight.refetch(); refresh(); toast.success("Đã xếp hàng script được duyệt"); },
    onError: (error) => toast.error(error.message),
  });
  const logBug = useMutation({
    mutationFn: () => bugApi.create({ ...bug, title: bug.title.trim(), description: bug.description.trim(), project, testExecution: execution._id, approvalStatus: "PendingApproval", environment: execution.runtimeUrl || "", attachments: (execution.evidence || []).map((url) => ({ fileName: decodeURIComponent(url.split('/').at(-1)), fileUrl: url, fileType: "Evidence" })) }),
    onSuccess: () => { setShowBug(false); setBug({ title: "", description: "", stepsToReproduce: "", expectedResult: "", actualResult: "", anomalyType: "ProductBug", severity: "Major", priority: "Medium", jiraRequested: false }); refresh(); toast.success("Đã tạo Bug nháp để triage và phê duyệt"); },
    onError: (error) => toast.error(error.message),
  });

  async function download(item) {
    try {
      const { data } = await automationLabApi.downloadEvidence(item.url);
      const url = URL.createObjectURL(data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = item.name.split("/").at(-1);
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(error.message);
    }
  }

  const card = (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold">{testCase?.title || "Test Case"}</h4>
        {testCase?._id && <span className="text-xs text-slate-500">TC-{testCase._id.slice(-6).toUpperCase()}</span>}
        <Badge>{execution.result}</Badge>
      </div>
      <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${mode === 'Automation' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>{mode} Run</div>
      {mode === "Manual" ? (
        <div className="space-y-2">
          {execution.runtimeUrl ? <Button variant="outline" disabled={!planReady} onClick={() => setManualOpen(true)}>{manualOpen ? 'Đang thực thi Manual' : 'Bắt đầu Manual Test'}</Button> : <p className="text-sm text-slate-500">Gắn môi trường chạy để mở website kiểm thử.</p>}
          {!planReady && <p className="text-sm text-amber-700">QA Manager cần duyệt Execution Plan trước khi chạy.</p>}
          {!!Object.keys(testCase?.generatedTestData || {}).length && <details className="text-sm"><summary>Dữ liệu kiểm thử</summary><pre className="mt-2 whitespace-pre-wrap break-words rounded border p-2 text-xs">{JSON.stringify(testCase.generatedTestData, null, 2)}</pre></details>}
          {testCase?.testSteps?.length > 0 && <div className="overflow-hidden rounded-xl border"><div className="grid grid-cols-[3rem_1fr_1fr_9rem] gap-2 bg-slate-50 p-3 text-xs font-bold dark:bg-slate-800"><span>Bước</span><span>Thao tác / Expected</span><span>Actual result</span><span>Kết quả</span></div>{testCase.testSteps.map((step, index) => { const row = stepResults[index] || {}; return <div key={index} className="grid grid-cols-[3rem_1fr_1fr_9rem] gap-2 border-t p-3 text-sm"><strong>{step.stepNumber || index + 1}</strong><div>{step.action}{step.testData && <p className="mt-1 text-xs text-slate-500">Test Data: {step.testData}</p>}<p className="mt-1 text-xs text-slate-500">Expected: {step.expectedResult}</p></div><Textarea className="min-h-20" aria-label={`Actual result bước ${index + 1}`} value={row.actualResult || ''} onChange={(event) => setStepResults((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, actualResult: event.target.value } : item))} /><Select aria-label={`Kết quả bước ${index + 1}`} value={row.status || 'NotRun'} onChange={(event) => setStepResults((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, status: event.target.value } : item))}>{['NotRun','Passed','Failed','Blocked','Skipped'].map((value) => <option key={value} value={value}>{value === 'NotRun' ? 'Chưa kiểm thử' : value}</option>)}</Select></div> })}</div>}
        </div>
      ) : (
        <div className="space-y-2">
          <Button asChild variant="outline"><Link to={`/automation?${params}`}>Sinh / chỉnh script trong Automation Lab</Link></Button>
          <div aria-label="Automation readiness" className="rounded border p-3 text-sm"><strong>{preflight.isPending ? 'Đang kiểm tra readiness…' : preflight.data?.ready ? 'Sẵn sàng Automation' : 'Cần chuẩn bị trước khi chạy'}</strong>{preflight.isError && <p className="text-red-600">{preflight.error.message}</p>}<ul className="mt-2 space-y-1">{preflight.data?.checks.map((item) => <li key={item.name} className={item.ready ? 'text-emerald-700' : 'text-amber-700'}>{item.ready ? '✓' : '○'} {item.name}{!item.ready && ` · ${item.detail}`}</li>)}</ul><Button size="sm" variant="ghost" onClick={() => preflight.refetch()}>Kiểm tra lại</Button></div>
          <label className="block">
            <span className="label">Script đã duyệt</span>
            <Select value={selectedScript} onChange={(event) => setScript(event.target.value)}>
              {!options.length && <option value="">Chưa có script phù hợp</option>}
              {options.map((item) => <option key={item._id} value={item._id}>{item.engine} · {item.filename}</option>)}
            </Select>
          </label>
          {!!datasets.data?.length && <label className="block"><span className="label">Dataset</span><Select value={dataset} onChange={(event) => setDataset(event.target.value)}><option value="">Không dùng dataset</option>{datasets.data.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</Select></label>}
          {!!readyFixtures.length && <label className="block"><span className="label">Fixture</span><Select value={fixture} onChange={(event) => setFixture(event.target.value)}><option value="">Không dùng fixture</option>{readyFixtures.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</Select></label>}
          {!planReady && <p className="text-sm text-amber-700">QA Manager cần duyệt Execution Plan trước khi chạy.</p>}
          {!execution.environmentId && <p className="text-sm text-amber-700">Hãy gắn Test Environment Ready cho Automation.</p>}
          <Button disabled={!selectedScript || !execution.environmentId || !planReady || !preflight.data?.ready || runnerActive || start.isPending} onClick={() => start.mutate()}>{runner ? 'Retest bằng script đã duyệt' : 'Chạy script đã duyệt'}</Button>
          {runner && <Button variant="outline" onClick={() => setAutomationOpen(true)}>Theo dõi runner & lịch sử</Button>}
        </div>
      )}
      {runner && <div className="space-y-1 rounded-md border p-3 text-sm">
        <p>Kết quả runner · {runner.engine} · <strong>{runner.status}</strong></p>
        {runner.error && <p className="text-red-600">{runner.error}</p>}
        {evidence.map((item) => <Button key={item.url} size="sm" variant="ghost" onClick={() => download(item)}>{item.name}</Button>)}
      </div>}
      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/20"><strong className="text-sm">Evidence của lần thực thi</strong><p className="mt-1 text-xs text-slate-500">Ảnh, video, log, HAR, ZIP hoặc PDF; tối đa 5 tệp/lần và 25 MB/tệp.</p><div className="mt-2 flex flex-wrap items-center gap-2"><Input className="max-w-md" type="file" multiple accept="image/*,video/mp4,video/webm,.txt,.log,.json,.xml,.har,.zip,.pdf" onChange={(event) => setFiles(Array.from(event.target.files || []))} /><Button type="button" variant="outline" disabled={!files.length || uploadEvidence.isPending} onClick={() => uploadEvidence.mutate()}>{uploadEvidence.isPending ? 'Đang tải…' : `Tải ${files.length || ''} evidence`}</Button></div>{!!execution.evidence?.length && <div className="mt-2 flex flex-wrap gap-2">{execution.evidence.map((url) => <Button key={url} size="sm" variant="ghost" onClick={() => download({ url, name: decodeURIComponent(url.split('/').at(-1)) })}>{decodeURIComponent(url.split('/').at(-1)).replace(/^\d+-[a-z0-9]+-/, '')}</Button>)}</div>}</div>
      <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); if ((verdict || execution.result) && (verdict || execution.result) !== 'NotRun') save.mutate(); }}>
        <label className="block max-w-xs">
          <span className="label">Kết luận QA</span>
          <Select value={verdict || execution.result || ""} onChange={(event) => setVerdict(event.target.value)}>
            <option value="NotRun">Chưa chạy</option><option value="Passed">Pass</option><option value="Failed">Fail</option><option value="Blocked">Blocked</option><option value="Skipped">Skipped</option>
          </Select>
        </label>
        <Textarea aria-label="Ghi chú kết quả" placeholder="Ghi chú kết quả" value={note} onChange={(event) => setNote(event.target.value)} />
        <Button type="submit" disabled={!(verdict || execution.result) || (verdict || execution.result) === 'NotRun' || save.isPending}>Lưu kết quả QA</Button>
      </form>
      {execution.bugReported && <p className="text-sm text-slate-500">Bug Log đã liên kết · {execution.bugReported}</p>}
      {!showBug && <Button variant="outline" onClick={() => setShowBug(true)}>Ghi Bug Log</Button>}
      {showBug && <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); if (bug.title.trim() && bug.description.trim()) logBug.mutate(); }}>
        <div className="grid gap-2 md:grid-cols-3"><label><span className="label">Phân loại anomaly</span><Select value={bug.anomalyType} onChange={(event) => setBug({ ...bug, anomalyType: event.target.value })}>{['ProductBug','TestScript','TestData','Environment','FlakyTest','RequirementMismatch'].map((item) => <option key={item}>{item}</option>)}</Select></label><label><span className="label">Severity</span><Select value={bug.severity} onChange={(event) => setBug({ ...bug, severity: event.target.value })}>{['Critical','Major','Minor','Trivial'].map((item) => <option key={item}>{item}</option>)}</Select></label><label><span className="label">Priority</span><Select value={bug.priority} onChange={(event) => setBug({ ...bug, priority: event.target.value })}>{['Urgent','High','Medium','Low'].map((item) => <option key={item}>{item}</option>)}</Select></label></div>
        <Input aria-label="Tiêu đề lỗi" placeholder="Tiêu đề lỗi" required value={bug.title} onChange={(event) => setBug({ ...bug, title: event.target.value })} />
        <Textarea aria-label="Mô tả lỗi" placeholder="Mô tả hiện tượng và ảnh hưởng" required value={bug.description} onChange={(event) => setBug({ ...bug, description: event.target.value })} />
        <div className="grid gap-2 md:grid-cols-2"><Textarea aria-label="Các bước tái hiện" placeholder="Các bước tái hiện" value={bug.stepsToReproduce} onChange={(event) => setBug({ ...bug, stepsToReproduce: event.target.value })} /><Textarea aria-label="Kết quả mong đợi" placeholder="Expected result" value={bug.expectedResult} onChange={(event) => setBug({ ...bug, expectedResult: event.target.value })} /><Textarea aria-label="Kết quả thực tế" placeholder="Actual result" value={bug.actualResult || note} onChange={(event) => setBug({ ...bug, actualResult: event.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bug.jiraRequested} onChange={(event) => setBug({ ...bug, jiraRequested: event.target.checked })} />Yêu cầu đồng bộ Jira sau khi Bug được duyệt</label>
        <div className="flex gap-2">
          <Button type="submit" disabled={logBug.isPending}>Lưu Bug Log</Button>
          <Button type="button" variant="ghost" onClick={() => setShowBug(false)}>Hủy</Button>
        </div>
      </form>}
    </Card>
  );
  if (automationOpen) return createPortal(<div role="dialog" aria-modal="true" aria-label="Không gian thực thi Automation" className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-slate-950"><header className="flex items-center justify-between gap-3 border-b p-3"><div><h2 className="font-semibold">Automation Test · {testCase?.title}</h2><p className="text-xs text-slate-500">Runner điều khiển trình duyệt; QA theo dõi kết quả, assertions và evidence.</p></div><Button variant="outline" onClick={() => setAutomationOpen(false)}>Quay lại Test Run</Button></header><div className="flex min-h-0 flex-1 flex-col md:flex-row"><div className="overflow-auto md:w-2/5">{card}</div><div className="min-h-80 min-w-0 flex-1"><AutomationLiveView executionId={execution._id} runner={runner} history={preflight.data?.history || []} /></div></div></div>, document.body);
  if (!manualOpen) return card;
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Không gian thực thi Manual" className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-slate-950">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b p-3 dark:border-slate-800"><div><h2 className="font-semibold">Manual Test · {testCase?.title}</h2><p className="text-xs text-slate-500">Thao tác website bên phải, ghi nhận kết quả và evidence bên trái.</p></div><label className="flex items-center gap-2 text-xs">Độ rộng QA<input aria-label="Độ rộng bảng kết quả QA" type="range" min="30" max="65" value={split} onChange={(event) => setSplit(Number(event.target.value))} /></label><Button variant="ghost" title="Giữ phiên để tiếp tục; tự đóng sau 15 phút không thao tác" onClick={() => setManualOpen(false)}>Thu gọn</Button><Button variant="outline" disabled={closing} onClick={async () => { setClosing(true); try { await executionApi.endManualBrowser(execution._id); setManualOpen(false); } catch (error) { if ([404, 410].includes(error.status)) setManualOpen(false); else toast.error(error.message); } finally { setClosing(false); } }}>{closing ? 'Đang đóng…' : 'Kết thúc & quay lại Test Run'}</Button></header>
    <div className="flex min-h-0 flex-1 flex-col md:flex-row"><div className="min-h-48 overflow-auto border-r md:h-full" style={{ flex: `0 1 ${split}%` }}>{card}</div><div className="min-h-80 min-w-0 flex-1"><RemoteManualBrowser executionId={execution._id} onEvidence={refresh} /></div></div>
  </div>, document.body);
}

export default function TestRunExecutionPanel({ runId, project, profile }) {
  const client = useQueryClient();
  const run = useQuery({
    queryKey: ["test-run-detail", runId],
    queryFn: () => executionApi.run(runId),
    refetchInterval: (query) => query.state.data?.executions.some((item) => activeStatuses.has(item.automationRun?.status)) ? 2500 : false,
  });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ["test-run-detail", runId] });
    client.invalidateQueries({ queryKey: ["e2e-runs", project] });
  };
  if (run.isPending) return <p className="mt-4 text-sm">Đang tải Test Run…</p>;
  if (run.isError) return <p className="mt-4 text-sm text-red-600">{run.error.message}</p>;
  if (!run.data.executions.length) return <p className="mt-4 text-sm">Test Run chưa có Test Case.</p>;
  return <div className="mt-4 space-y-3">{run.data.executions.map((execution) => <ExecutionCase key={execution._id} execution={execution} scripts={run.data.scripts} jobs={run.data.automationJobs} project={project} profile={profile} run={run.data.run} refresh={refresh} />)}</div>;
}
