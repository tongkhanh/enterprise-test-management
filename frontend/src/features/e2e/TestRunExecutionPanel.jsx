import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { automationLabApi, bugApi, executionApi } from "@/api/client";
import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";

const activeStatuses = new Set(["Queued", "Preparing", "Running", "Collecting"]);

function ExecutionCase({ execution, scripts, jobs, project, profile, run, refresh }) {
  const [mode, setMode] = useState(execution.automationRun ? "Auto" : "Manual");
  const [script, setScript] = useState("");
  const [dataset, setDataset] = useState("");
  const [fixture, setFixture] = useState("");
  const [verdict, setVerdict] = useState("");
  const [note, setNote] = useState("");
  const [showBug, setShowBug] = useState(false);
  const [bug, setBug] = useState({ title: "", description: "" });
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
  const selectedScript = options.find((item) => item._id === script)?._id || options[0]?._id || "";
  const planReady = run.testPlan.kind !== "ExecutionPlan" || run.testPlan.approvalStatus === "Approved";
  const params = new URLSearchParams({ project, run: run._id, testCase: testCase?._id || "" });
  if (profile) params.set("profile", profile);
  const datasets = useQuery({ queryKey: ["ops-data", project], queryFn: () => automationLabApi.datasets(project), enabled: mode === "Auto" });
  const fixtures = useQuery({ queryKey: ["ops-fixtures", project], queryFn: () => automationLabApi.fixtures(project), enabled: mode === "Auto" });
  const readyFixtures = (fixtures.data || []).filter((item) => (item.environment?._id || item.environment) === execution.environmentId);

  const save = useMutation({
    mutationFn: () => executionApi.recordExecution(execution._id, { result: verdict, ...(note.trim() && { actualResult: note.trim() }) }),
    onSuccess: () => { setVerdict(""); refresh(); toast.success("Đã lưu kết quả QA"); },
    onError: (error) => toast.error(error.message),
  });
  const start = useMutation({
    mutationFn: () => executionApi.executeScript(execution._id, { scriptId: selectedScript, dataset: dataset || undefined, fixture: readyFixtures.some((item) => item._id === fixture) ? fixture : undefined }),
    onSuccess: () => { refresh(); toast.success("Đã xếp hàng script được duyệt"); },
    onError: (error) => toast.error(error.message),
  });
  const logBug = useMutation({
    mutationFn: () => bugApi.create({ ...bug, title: bug.title.trim(), description: bug.description.trim(), project, testExecution: execution._id, severity: "Major", priority: "Medium" }),
    onSuccess: () => { setShowBug(false); setBug({ title: "", description: "" }); refresh(); toast.success("Đã ghi Bug Log"); },
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

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold">{testCase?.title || "Test Case"}</h4>
        {testCase?._id && <span className="text-xs text-slate-500">TC-{testCase._id.slice(-6).toUpperCase()}</span>}
        <Badge>{execution.result}</Badge>
      </div>
      <label className="block max-w-xs">
        <span className="label">Cách thực thi</span>
        <Select value={mode} onChange={(event) => setMode(event.target.value)}>
          <option>Manual</option><option>Auto</option>
        </Select>
      </label>
      {mode === "Manual" ? (
        <div className="space-y-2">
          {execution.runtimeUrl ? <Button asChild variant="outline"><a href={execution.runtimeUrl} target="_blank" rel="noreferrer">Mở website kiểm thử</a></Button> : <p className="text-sm text-slate-500">Gắn môi trường chạy để mở website kiểm thử.</p>}
          {testCase?.testSteps?.length > 0 && <details className="text-sm"><summary>Các bước kiểm thử</summary><ol className="ml-5 mt-2 list-decimal space-y-2">{testCase.testSteps.map((step, index) => <li key={index}>{step.action}<p className="text-slate-500">{step.expectedResult}</p></li>)}</ol></details>}
        </div>
      ) : (
        <div className="space-y-2">
          <Button asChild variant="outline"><Link to={`/automation?${params}`}>Sinh / chỉnh script trong Automation Lab</Link></Button>
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
          {!execution.environmentId && <p className="text-sm text-amber-700">Hãy gắn Environment Ready cho Auto.</p>}
          <Button disabled={!selectedScript || !execution.environmentId || !planReady || runnerActive || start.isPending} onClick={() => start.mutate()}>Chạy script đã duyệt</Button>
        </div>
      )}
      {runner && <div className="space-y-1 rounded-md border p-3 text-sm">
        <p>Kết quả runner · {runner.engine} · <strong>{runner.status}</strong></p>
        {runner.error && <p className="text-red-600">{runner.error}</p>}
        {evidence.map((item) => <Button key={item.url} size="sm" variant="ghost" onClick={() => download(item)}>{item.name}</Button>)}
      </div>}
      <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); if (verdict) save.mutate(); }}>
        <label className="block max-w-xs">
          <span className="label">Kết luận QA</span>
          <Select value={verdict || execution.qaVerdict || ""} onChange={(event) => setVerdict(event.target.value)}>
            <option value="">Chọn Pass / Fail</option><option value="Passed">Pass</option><option value="Failed">Fail</option>
          </Select>
        </label>
        <Textarea aria-label="Ghi chú kết quả" placeholder="Ghi chú kết quả" value={note} onChange={(event) => setNote(event.target.value)} />
        <Button type="submit" disabled={!verdict || save.isPending}>Lưu kết quả QA</Button>
      </form>
      {execution.bugReported && <p className="text-sm text-slate-500">Bug Log đã liên kết · {execution.bugReported}</p>}
      {!showBug && <Button variant="outline" onClick={() => setShowBug(true)}>Ghi Bug Log</Button>}
      {showBug && <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); if (bug.title.trim() && bug.description.trim()) logBug.mutate(); }}>
        <Input aria-label="Tiêu đề lỗi" placeholder="Tiêu đề lỗi" required value={bug.title} onChange={(event) => setBug({ ...bug, title: event.target.value })} />
        <Textarea aria-label="Mô tả lỗi" placeholder="Mô tả lỗi, các bước tái hiện và kết quả thực tế" required value={bug.description} onChange={(event) => setBug({ ...bug, description: event.target.value })} />
        <div className="flex gap-2">
          <Button type="submit" disabled={logBug.isPending}>Lưu Bug Log</Button>
          <Button type="button" variant="ghost" onClick={() => setShowBug(false)}>Hủy</Button>
        </div>
      </form>}
    </Card>
  );
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
