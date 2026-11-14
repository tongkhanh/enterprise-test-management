import { cloneElement, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileCode2,
  FileUp,
  Layers3,
  PlayCircle,
  Route,
  Search,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  agileApi,
  aiApi,
  e2eApi,
  executionApi,
  requirementApi,
  testCaseApi,
} from "@/api/client";
import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { PageHeader, SectionTitle } from "@/components/common/PageKit";
import { DocumentQualityBadge, DocumentQualityNotice } from "@/components/common/DocumentQuality";
import AutomationLabPage from "@/features/automation/AutomationLabPage";
import TestRunExecutionPanel from "./TestRunExecutionPanel";

const statusTone = {
  Draft: "slate",
  PendingApproval: "amber",
  Approved: "green",
  Rejected: "red",
  Baselined: "green",
  NeedsReview: "amber",
  Changed: "amber",
  Retired: "red",
};
const runtimeUrlForProfile = (profile) =>
  profile?.environment
    ? profile.environment.status === "Ready"
      ? profile.environment.targetUrl
      : ""
    : profile?.baseUrl || "";
const lines = (value = "") => String(value).split("\n").map((item) => item.trim()).filter(Boolean);
const steps = [
  ["requirement", "Nguồn yêu cầu", FileCheck2],
  ["evidence", "Bằng chứng GitHub", FileCode2],
  ["usecase", "Use Case", Route],
  ["story", "User Story", CheckCircle2],
  ["plan", "Test Plan", FileCheck2],
  ["suite", "Test Suite", Layers3],
  ["testcase", "Test Case", ClipboardCheck],
  ["review", "QA review / approve", CheckCircle2],
  ["agile", "Backlog & Cycle", Layers3],
  ["runtime", "Gắn môi trường chạy", PlayCircle],
  ["automation", "Automation DSL / Script", FileCode2],
  ["execution", "Execution Plan / Test Run", PlayCircle],
  ["result", "Evidence · RCA · Bug · Report", FileCheck2],
];
const phases = [
  {
    label: "Nguồn & đặc tả",
    detail: "Nhập nguồn, phân loại, chuẩn hóa và xác nhận",
    ids: ["requirement", "evidence", "usecase", "story"],
  },
  {
    label: "Lập kế hoạch & Sprint",
    detail: "Test Plan, Test Case, duyệt và Backlog",
    ids: ["plan", "suite", "testcase", "review", "agile"],
  },
  {
    label: "Thực thi & kết quả",
    detail: "Môi trường, automation, chạy test và báo cáo",
    ids: ["runtime", "automation", "execution", "result"],
  },
];

export default function QAWorkflow(props) {
  const {
    activeStep,
    setActiveStep,
    activeProject,
    projects,
    setProject,
    currentProfile,
    profiles,
    startWorkflowRun,
    updateWorkflowProgress,
    selectProfile,
    updateProfile,
    environments,
    useCases,
    useCase,
    setUseCase,
    suggestUseCases,
    addUseCase,
    approveUseCase,
    generateStory,
    currentStories,
    suites,
    createSuite,
    currentCases,
    plans,
    StoryDraftCard,
    TestCaseStep,
  } = props;
  // One intake record accompanies the user until the document is normalized.
  // It prevents the same source/version from being re-entered on every screen.
  const [intake, setIntake] = useState(() => ({
    documentType: "Requirement",
    sourceSystem: "Customer",
    officialStatus: "NeedsConfirmation",
    title: "",
    provider: "",
    version: "",
    receivedAt: new Date().toISOString().slice(0, 10),
    externalId: "",
    reference: "",
    scopeLevel: "Feature",
    scopeName: "",
  }));
  const phaseIndex = Math.max(
    0,
    phases.findIndex((phase) => phase.ids.includes(activeStep)),
  );
  const phase = phases[phaseIndex];
  const phaseStopPoint = [
    "Dừng sau khi tài liệu đã được lưu hoặc duyệt",
    "Dừng sau khi Backlog / Sprint đã được lập",
    "Dừng sau khi có kết quả chạy và báo cáo",
  ][phaseIndex];
  const testPlans = (plans.data || []).filter(
    (item) =>
      (item.kind || "TestPlan") === "TestPlan" &&
      (item.planLevel || "Feature") === "Feature" &&
      String(item.systemProfile?._id || item.systemProfile || "") ===
        String(currentProfile?._id || ""),
  );
  const approvedPlan = testPlans.find(
    (item) => item.approvalStatus === "Approved",
  );
  const approvedCaseCount = currentCases.filter(
    (item) => item.status === "Approved",
  ).length;
  const baselineRequirementCount = (props.requirements?.data || []).filter((item) => item.status === "Baselined").length;
  const stepStatus = {
    requirement: baselineRequirementCount ? `${baselineRequirementCount} đã Baseline` : "",
    evidence: currentProfile?.repository?.fullName ? "Đã phân tích" : "Tuỳ chọn",
    usecase: (useCases.data || []).some((item) => item.status === "Approved")
      ? "Có mục đã duyệt"
      : "",
    story: currentStories.some((item) => item.approvalStatus === "Approved")
      ? "Có mục đã duyệt"
      : "",
    plan: approvedPlan ? "Đã duyệt" : "",
    testcase: currentCases.length ? "Đã có Test Case" : "",
    review: currentCases.some((item) => item.status === "Approved")
      ? "Có mục đã duyệt"
      : "",
    agile:
      approvedPlan && approvedCaseCount
        ? `${approvedCaseCount} case sẵn sàng vào Backlog`
        : "",
    runtime: currentProfile?.environment?.status === "Ready" ? "Sẵn sàng" : "",
  };
  const artifactStepCounts = {
    requirement: props.requirements?.data?.length || 0,
    evidence: currentProfile?.repository?.fullName ? 1 : 0,
    usecase: useCases.data?.length || 0,
    story: currentStories.length,
    plan: testPlans.length,
    suite: suites.data?.length || 0,
    testcase: currentCases.length,
  };
  const savedDocumentCount = Object.entries(artifactStepCounts).filter(([id]) => id !== "evidence").reduce((total, [, count]) => total + count, 0);
  const content = {
    evidence: (
      <TechnicalEvidenceStep
        profile={currentProfile}
        github={props.github}
        integrations={props.integrations}
        git={props.git}
        setGit={props.setGit}
        analyzeGithub={props.analyzeGithub}
        activeProject={activeProject}
        GitHubForm={props.GitHubForm}
        requirements={props.requirements}
        updateProfile={updateProfile}
        onNext={() => setActiveStep("usecase")}
      />
    ),
    usecase: (
      <UseCaseStep
        useCase={useCase}
        profile={currentProfile}
        setUseCase={setUseCase}
        suggestUseCases={suggestUseCases}
        addUseCase={addUseCase}
        approveUseCase={approveUseCase}
        useCases={useCases}
        requirements={props.requirements}
        onNext={() => setActiveStep("story")}
      />
    ),
    story: (
      <UserStoryStep
        setActiveStep={setActiveStep}
        project={activeProject}
        profile={currentProfile}
        intake={intake}
        useCases={useCases}
        requirements={props.requirements}
        stories={currentStories}
        generateStory={generateStory}
        StoryDraftCard={StoryDraftCard}
        user={props.user}
        updateStory={props.updateStory}
        submitStory={props.submitStory}
        qaReviewStory={props.qaReviewStory}
        download={props.download}
        onNext={() => setActiveStep("plan")}
      />
    ),
    plan: (
      <TestPlanningDocumentEditor
        setActiveStep={setActiveStep}
        activeProject={activeProject}
        profile={currentProfile}
        stories={currentStories}
        items={testPlans}
        onNext={() => setActiveStep("suite")}
      />
    ),
    suite: (
      <SuiteStep
        suites={suites}
        createSuite={createSuite}
        setActiveStep={setActiveStep}
        blocked={!approvedPlan}
        onNext={() => setActiveStep("testcase")}
      />
    ),
    testcase: approvedPlan ? (
      <>
        <TestCaseStep
          {...props}
          currentStories={currentStories.filter((story) =>
            testPlans.some(
              (plan) =>
                plan.approvalStatus === "Approved" &&
                (plan.userStories || []).some(
                  (id) => String(id._id || id) === String(story._id),
                ),
            ),
          )}
        />
        <Button
          variant="outline"
          disabled={!currentCases.length}
          onClick={() => setActiveStep("review")}
        >
          Sang QA review <ArrowRight className="h-4 w-4" />
        </Button>
      </>
    ) : (
      <Blocked
        title="Cần Test Plan được duyệt"
        description="QA Manager cần duyệt phạm vi, rủi ro, approach, test data và môi trường trước khi sinh Test Case."
        onClick={() => setActiveStep("plan")}
      />
    ),
    review: (
      <>
        <ReviewGateStep
          cases={currentCases}
          members={props.members || []}
          reviewers={props.reviewers || []}
          submitCase={props.submitCase}
          onNext={() => setActiveStep("agile")}
        />
        <DocumentExports
          useCases={useCases.data || []}
          stories={currentStories}
          plans={testPlans}
          cases={currentCases}
          download={props.download}
        />
      </>
    ),
    agile: (
      <AgileHandoffStep
        project={activeProject}
        plan={approvedPlan}
        cases={currentCases}
        setActiveStep={setActiveStep}
      />
    ),
    runtime: (
      <RuntimeBindingStep
        key={currentProfile?._id}
        profile={currentProfile}
        environments={environments}
        project={activeProject}
        requestedEnvironment={props.requestedEnvironment}
        updateProfile={updateProfile}
        onNext={() => setActiveStep("automation")}
      />
    ),
    automation: (
      <AutomationStep
        profile={currentProfile}
        project={activeProject}
        onNext={() => setActiveStep("execution")}
      />
    ),
    execution: (
      <ExecutionStep
        setActiveStep={setActiveStep}
        project={activeProject}
        profile={currentProfile}
        cases={currentCases}
        plans={plans}
        requestedRun={props.requestedRun}
      />
    ),
    result: (
      <Overview
        title="Evidence · RCA · Bug · Report"
        description="Thu screenshot, video, trace, console và network; AI RCA; tạo hoặc đồng bộ Jira Issue; retest và xuất Test Summary Report."
        action="Mở Test Reports"
        to={`/reports?project=${activeProject}`}
      />
    ),
    documents: (
      <DocumentRegister
        profile={currentProfile}
        profiles={profiles.data || []}
        requirements={props.requirements?.data || []}
        useCases={useCases.data || []}
        stories={currentStories}
        plans={testPlans}
        suites={suites.data || []}
        cases={currentCases}
        setActiveStep={setActiveStep}
      />
    ),
  };
  const requirementContent = (
      <RequirementStep
        profile={currentProfile}
        requirements={props.requirements}
        draft={currentProfile?.workflow?.drafts?.requirement}
        onDraftSave={(data) => updateWorkflowProgress.mutate({ lastStep: "requirement", draft: { step: "requirement", data } })}
        onDraftClear={() => updateWorkflowProgress.mutate({ draft: { step: "requirement", data: null } })}
        intake={intake}
        setIntake={setIntake}
        evidenceContent={content.evidence}
        alternateContent={intake.documentType !== "Requirement" && cloneElement(content[{ UserStory: "story", UseCase: "usecase", }[intake.documentType]], { intakeOnly: true, reference: intake.reference })}
        onNext={() => setActiveStep("evidence")}
      />
  );

  return (
    <div className="e2e-workflow space-y-5 pb-8">
      <PageHeader
        eyebrow="QA delivery workflow"
        title="Luồng E2E theo quy trình QA"
        description="Chọn đúng mục tiêu cho lần làm việc này. Mọi tài liệu được lưu độc lập, nên bạn có thể dừng và quay lại bất cứ lúc nào."
      />
      <WorkflowRunPanel
        profile={currentProfile}
        profiles={profiles.data || []}
        liveCounts={{ requirements: props.requirements?.data?.length || 0, useCases: useCases.data?.length || 0, stories: currentStories.length, plans: testPlans.length, suites: suites.data?.length || 0, testCases: currentCases.length }}
        selectProfile={selectProfile}
        setActiveStep={setActiveStep}
        startWorkflowRun={startWorkflowRun}
        updateWorkflowProgress={updateWorkflowProgress}
      />
      <Card className="overflow-hidden border-slate-200 shadow-sm dark:border-slate-700">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <label className="label" htmlFor="workflow-project">
              Project
            </label>
            <Select
              id="workflow-project"
              value={activeProject}
              onChange={(event) => {
                setProject(event.target.value);
                setActiveStep("requirement");
              }}
            >
              <option value="">Chọn Project</option>
              {(projects.data || []).map((item) => (
                <option key={item._id} value={item._id}>
                  {item.key} · {item.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="text-right text-xs text-slate-600 dark:text-slate-300">
            <p className="font-semibold text-slate-800 dark:text-white">Mục tiêu {phaseIndex + 1}/{phases.length} · {phase.label}</p>
            <p className="mt-1">{phaseStopPoint}</p>
          </div>
        </div>
        <nav
          aria-label="Các giai đoạn kiểm thử"
          className="grid grid-cols-1 gap-2 p-4 md:grid-cols-3"
        >
          {phases.map((item, position) => (
            <button
              key={item.label}
              type="button"
              aria-pressed={phaseIndex === position}
              onClick={() => {
                if (phaseIndex !== position) setActiveStep(item.ids[0]);
              }}
              className={`flex min-w-0 items-start gap-3 rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${phaseIndex === position ? "border-violet-700 bg-violet-700 text-white shadow-md dark:border-violet-500 dark:bg-violet-700" : "border-slate-200 bg-white text-slate-800 hover:border-violet-400 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"}`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${phaseIndex === position ? "bg-white/20" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
              >
                {position + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{item.label}</span>
                <span
                  className={`mt-0.5 block text-xs leading-5 ${phaseIndex === position ? "text-violet-100" : "text-slate-600 dark:text-slate-300"}`}
                >
                  {item.detail}
                </span>
              </span>
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Các bước trong {phase.label}
          </p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{phaseStopPoint}. Bạn luôn có thể mở lại từ Danh mục tài liệu.</p></div><Button className="min-h-11 bg-violet-700 px-4 text-white shadow-md hover:bg-violet-800" onClick={() => setActiveStep("documents")}><FileCheck2 className="h-4 w-4" /> Danh mục tài liệu <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{savedDocumentCount}</span></Button></div>
          <nav
            aria-label={`Các bước: ${phase.label}`}
            className="flex flex-wrap gap-2"
          >
            {steps
              .filter(([id]) => phase.ids.includes(id))
              .map(([id, label, Icon]) => {
                const active = activeStep === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-current={active ? "step" : undefined}
                    onClick={() => setActiveStep(id)}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${active ? "border-violet-700 bg-violet-50 text-violet-900 dark:border-violet-400 dark:bg-violet-950/60 dark:text-violet-100" : "border-slate-200 text-slate-700 hover:border-violet-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"}`}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span>{label}</span>
                    {active ? (
                      <span className="text-xs font-medium">· Đang xem</span>
                    ) : (
                      stepStatus[id] && (
                        <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                          · {stepStatus[id]}
                        </span>
                      )
                    )}
                  </button>
                );
              })}
          </nav>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Tiến độ và tài liệu đã lưu trong đợt này</p><p className="text-xs text-slate-500">Bước cuối: <strong className="text-violet-700 dark:text-violet-300">{steps.find(([id]) => id === (currentProfile?.workflow?.lastStep || activeStep))?.[1]}</strong></p></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {[['requirement', 'Requirement'], ['evidence', 'GitHub'], ['usecase', 'Use Case'], ['story', 'User Story'], ['plan', 'Test Plan'], ['suite', 'Test Suite'], ['testcase', 'Test Case']].map(([id, label]) => { const count = artifactStepCounts[id] || 0; const stoppedHere = (currentProfile?.workflow?.lastStep || activeStep) === id; return <button key={id} type="button" onClick={() => setActiveStep(id)} className={`rounded-lg border p-3 text-left transition ${stoppedHere ? "border-violet-500 bg-violet-50 ring-1 ring-violet-300 dark:bg-violet-950/30" : count ? "border-emerald-200 bg-white dark:border-emerald-900 dark:bg-slate-900" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{label}</span>{stoppedHere && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-200">Dừng ở đây</span>}</div><p className={`mt-2 text-xs ${count ? "font-semibold text-emerald-700 dark:text-emerald-300" : "text-slate-500"}`}>{count ? `${count} ${id === 'evidence' ? 'bằng chứng' : 'tài liệu'} đã lưu` : "Chưa có tài liệu đã lưu"}</p></button>; })}
            </div>
            <p className="mt-3 text-xs text-slate-500">Chỉ nội dung đã bấm Lưu/Tạo mới được tính là tài liệu. Form Requirement đang nhập dở được tự động lưu riêng và sẽ khôi phục khi quay lại.</p>
          </div>
        </div>
      </Card>
      {activeStep === "documents" || currentProfile || activeStep === "requirement" ? (
        activeStep === "requirement" ? requirementContent : content[activeStep]
      ) : (
        <Blocked
          title="Cần chọn System Profile"
          description="Chọn hoặc tạo Profile trước khi bắt đầu Use Case; chưa cần môi trường chạy."
          onClick={() => setActiveStep("requirement")}
        />
      )}
    </div>
  );
}

function WorkflowRunPanel({ profile, profiles, liveCounts, selectProfile, setActiveStep, startWorkflowRun, updateWorkflowProgress }) {
  const workflow = profile?.workflow || {};
  const summary = profile?.workflowSummary || {};
  const counts = { ...(summary.artifactCounts || {}), ...(liveCounts || {}) };
  const status = workflow.status || "Active";
  const lastStep = workflow.lastStep || "requirement";
  const lastStepLabel = steps.find(([id]) => id === lastStep)?.[1] || "Nguồn yêu cầu";
  const statusLabel = { Active: "Đang thực hiện", Paused: "Tạm dừng", Completed: "Đã hoàn tất" }[status] || status;
  const tone = status === "Active" ? "green" : status === "Completed" ? "blue" : "amber";
  const startNewRun = () => {
    if (window.confirm("Bắt đầu một đợt mới từ bước Nguồn yêu cầu? Đợt hiện tại và toàn bộ tài liệu đã sinh sẽ được giữ nguyên để tra cứu.")) startWorkflowRun.mutate();
  };
  if (!profile) return null;
  return <Card className="border-violet-200 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-5 dark:border-violet-900 dark:from-violet-950/30 dark:via-slate-900 dark:to-sky-950/20">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">Đợt tạo tài liệu</span><Badge tone={tone}>{statusLabel}</Badge></div>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-center">
          <Select className="max-w-xl" value={profile._id} onChange={(event) => selectProfile(event.target.value)} aria-label="Chọn đợt tạo tài liệu">
            {profiles.map((item, index) => <option key={item._id} value={item._id}>{`#${item.workflow?.runNumber || profiles.length - index} · ${item.name} · ${formatDocumentDate(item.workflow?.startedAt || item.createdAt)}`}</option>)}
          </Select>
          <p className="text-sm text-slate-600 dark:text-slate-300">Dừng ở <strong className="text-slate-900 dark:text-white">{lastStepLabel}</strong> · Hoạt động {formatDocumentDate(summary.latestActivityAt || workflow.lastActivityAt || profile.updatedAt)}</p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[["Requirement", counts.requirements], ["Use Case", counts.useCases], ["User Story", counts.stories], ["Test Plan", counts.plans], ["Test Suite", counts.suites], ["Test Case", counts.testCases]].map(([label, value]) => <div key={label} className="rounded-lg border border-white bg-white/80 px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/70"><p className="text-lg font-bold">{value || 0}</p><p className="text-[11px] text-slate-500">{label}</p></div>)}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {status !== "Active" && <Button variant="outline" disabled={updateWorkflowProgress.isPending} onClick={() => { setActiveStep(lastStep); updateWorkflowProgress.mutate({ status: "Active", lastStep }); }}>Tiếp tục từ {lastStepLabel}</Button>}
        {status === "Active" && <Button variant="outline" disabled={updateWorkflowProgress.isPending} onClick={() => updateWorkflowProgress.mutate({ status: "Paused", lastStep })}>Tạm dừng tại đây</Button>}
        <Button disabled={startWorkflowRun.isPending} onClick={startNewRun}>{startWorkflowRun.isPending ? "Đang tạo…" : "Bắt đầu đợt mới"}</Button>
      </div>
    </div>
    <p className="mt-3 text-xs text-slate-500">Mỗi đợt là một phạm vi độc lập. Bắt đầu đợt mới không xoá, ghi đè hay trộn tài liệu của đợt cũ.</p>
  </Card>;
}

function RequirementStep({ profile, requirements, intake, setIntake, draft, onDraftSave, onDraftClear, onNext, alternateContent, evidenceContent }) {
  const blank = () => ({ requirementId: "", title: "", type: "Functional", priority: "Medium", release: "", description: "", objective: "", actors: "", inScope: "", outOfScope: "", businessRules: "", acceptanceCriteria: "", nonFunctionalRequirements: "", risks: "", assumptions: "", dependencies: "", testDataRequirements: "", dataRestrictions: "", source: { type: "ManualCustomerBrief", title: "", provider: "", receivedAt: new Date().toISOString().slice(0, 10), version: "", reference: "", section: "" } });
  const [form, setForm] = useState(() => ({ ...blank(), ...(draft?.form || {}) }));
  const [mode, setMode] = useState("modern");
  const [referenceImages, setReferenceImages] = useState([]);
  const draftSnapshot = useRef({ form, intake });
  draftSnapshot.current = { form, intake };
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateIntake = (key, value) => setIntake((current) => ({ ...current, [key]: value, ...(key === "documentType" ? { reference: "" } : {}) }));
  useEffect(() => {
    setForm({ ...blank(), ...(draft?.form || {}) });
    if (draft?.intake) setIntake((current) => ({ ...current, ...draft.intake }));
  }, [profile?._id]);
  useEffect(() => {
    const hasDraftContent = Boolean(form.title || form.description || form.objective || intake.title || intake.provider || intake.scopeName);
    if (!profile?._id || !hasDraftContent) return undefined;
    const timer = window.setTimeout(() => onDraftSave?.({ form, intake, savedAt: new Date().toISOString() }), 900);
    return () => window.clearTimeout(timer);
  }, [form, intake, profile?._id]);
  useEffect(() => () => {
    const snapshot = draftSnapshot.current;
    const hasDraftContent = Boolean(snapshot.form.title || snapshot.form.description || snapshot.form.objective || snapshot.intake.title || snapshot.intake.provider || snapshot.intake.scopeName);
    if (hasDraftContent) onDraftSave?.({ ...snapshot, savedAt: new Date().toISOString() });
  }, [profile?._id]);
  const mutation = useMutation({
    mutationFn: async () => {
      const created = await e2eApi.createRequirement({ ...form, source, scope: { level: intake.scopeLevel, name: intake.scopeName }, systemProfile: profile._id, actors: lines(form.actors), inScope: lines(form.inScope), outOfScope: lines(form.outOfScope), businessRules: lines(form.businessRules), acceptanceCriteria: lines(form.acceptanceCriteria), nonFunctionalRequirements: lines(form.nonFunctionalRequirements), risks: lines(form.risks), assumptions: lines(form.assumptions), dependencies: lines(form.dependencies), testDataRequirements: lines(form.testDataRequirements), dataRestrictions: lines(form.dataRestrictions) });
      await Promise.all(referenceImages.map(({ file }) => e2eApi.uploadRequirementImage(created._id, file)));
      return created;
    },
    onSuccess: () => { toast.success(referenceImages.length ? "Đã lưu Requirement và đính kèm ảnh tham chiếu." : "Đã lưu Requirement nháp từ đề bài khách hàng."); setForm(blank()); setReferenceImages([]); onDraftClear?.(); requirements.refetch(); },
    onError: (error) => toast.error(error.message),
  });
  const importDocument = useMutation({
    mutationFn: (file) => e2eApi.importRequirements(profile._id, { ...source, type: "CustomerDocument" }, file, { level: intake.scopeLevel, name: intake.scopeName }),
    onSuccess: (result) => { toast.success(result.message || "Đã trích xuất Requirement nháp; hãy rà soát trước khi Baseline."); requirements.refetch(); },
    onError: (error) => toast.error(error.message),
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }) => e2eApi.decideRequirement(id, { decision }),
    onSuccess: () => { toast.success("Đã cập nhật trạng thái Requirement."); requirements.refetch(); },
    onError: (error) => toast.error(error.message),
  });
  if (!profile) return <Blocked title="Đang chuẩn bị phạm vi kiểm thử" description="Hệ thống đang tạo không gian liên kết tài liệu cho Project này; bạn không cần cấu hình trước." />;
  const items = requirements.data || [];
  const baselined = items.filter((item) => item.status === "Baselined");
  const source = { ...form.source, title: intake.title, provider: intake.provider, receivedAt: intake.receivedAt, version: intake.version, reference: intake.reference };
  const scopeReady = intake.scopeLevel === "System" || intake.scopeName.trim();
  const canSave = form.title && form.description && form.objective && lines(form.actors).length && lines(form.inScope).length && lines(form.acceptanceCriteria).length && source.title.trim() && source.provider.trim() && source.receivedAt && scopeReady;
  if (mode === "modern") return <ModernRequirementEditor {...{ profile, intake, updateIntake, form, update, source, canSave, mutation, importDocument, items, baselined, decide, onNext, alternateContent, evidenceContent, referenceImages, setReferenceImages, draft }} />;
  return <Card className="p-5 sm:p-6">
    <SectionTitle title="Nhập nguồn yêu cầu" description="Chọn loại đầu vào để nhập ngay tại đây. Yêu cầu mô tả hành vi mong đợi. URL kiểm thử, thiết kế giao diện và mã nguồn giúp đối chiếu khi thiết kế hoặc chạy test." />
    <section className="mt-5 rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20">
      <p className="text-sm font-semibold">1. Phân loại và xác nhận nguồn</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Loại đầu vào *"><Select value={intake.documentType} onChange={(event) => updateIntake("documentType", event.target.value)}><option value="Requirement">BRD / SRS / PRD / email khách hàng</option><option value="UserStory">User Story / Product Backlog</option><option value="UseCase">Use Case / quy trình nghiệp vụ</option></Select></Field>
        {intake.documentType === "Requirement" && <>
        <Field label="Nguồn từ đâu? *"><Select value={intake.sourceSystem} onChange={(event) => updateIntake("sourceSystem", event.target.value)}>{["Customer", "ProductOwner", "Jira", "AzureDevOps", "Internal", "GitHub"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
        <Field label="Trạng thái nguồn *"><Select value={intake.officialStatus} onChange={(event) => updateIntake("officialStatus", event.target.value)}><option value="Official">Nguồn chính thức</option><option value="NeedsConfirmation">Cần PO/BA xác nhận</option></Select></Field>
        <Field label="Ngày nhận *"><Input type="date" value={intake.receivedAt} onChange={(event) => updateIntake("receivedAt", event.target.value)} /></Field>
        <Field label="Tên tài liệu / ticket *"><Input value={intake.title} onChange={(event) => updateIntake("title", event.target.value)} placeholder="BRD thanh toán / PROJ-123" /></Field>
        <Field label="Người cung cấp *"><Input value={intake.provider} onChange={(event) => updateIntake("provider", event.target.value)} placeholder="Khách hàng, PO hoặc BA" /></Field>
        <Field label="Phiên bản"><Input value={intake.version} onChange={(event) => updateIntake("version", event.target.value)} placeholder="v1.0" /></Field>
        <Field label="External ID / liên kết"><Input value={intake.externalId || intake.reference} onChange={(event) => { updateIntake("externalId", event.target.value); updateIntake("reference", event.target.value); }} placeholder="JIRA-123 hoặc URL" /></Field>
        </>}
      </div>
    </section>
    {alternateContent || <>
    <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700"><p className="text-sm font-semibold">2. Chuẩn hóa Requirement</p><p className="mt-1 text-xs text-slate-500">Chỉ dùng phần này khi loại đầu vào bên trên là BRD, SRS, PRD, email hoặc yêu cầu khách hàng.</p></div>
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      <button type="button" onClick={() => setMode("manual")} className={`rounded-xl border p-4 text-left ${mode === "manual" ? "border-violet-600 bg-violet-50 ring-1 ring-violet-600 dark:bg-violet-950/30" : "border-slate-200 dark:border-slate-700"}`}><p className="font-semibold">Nhập đề bài / yêu cầu khách hàng</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Dùng cho email, họp, ticket hoặc trao đổi trực tiếp có thể truy vết.</p></button>
      <button type="button" onClick={() => setMode("document")} className={`rounded-xl border p-4 text-left ${mode === "document" ? "border-violet-600 bg-violet-50 ring-1 ring-violet-600 dark:bg-violet-950/30" : "border-slate-200 dark:border-slate-700"}`}><p className="font-semibold">Tải đề bài khách hàng</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">PDF, DOC hoặc DOCX; AI trích xuất Requirement nháp để bạn xác nhận.</p></button>
    </div>
    {mode === "document" ? <div className="mt-5 rounded-xl border border-dashed border-violet-300 bg-violet-50/50 p-5 dark:border-violet-900 dark:bg-violet-950/20"><p className="font-semibold">Tải đề bài khách hàng</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Điền nguồn bên trên trước. Hệ thống chỉ tạo bản nháp, không tự Baseline Requirement.</p><label className="mt-4 inline-flex h-10 cursor-pointer items-center rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white"><FileUp className="mr-2 h-4 w-4" />{importDocument.isPending ? "Đang trích xuất…" : "Chọn PDF, DOC hoặc DOCX"}<input className="hidden" type="file" accept=".pdf,.doc,.docx" disabled={!source.title.trim() || !source.provider.trim() || !source.receivedAt || importDocument.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) importDocument.mutate(file); event.target.value = ""; }} /></label></div> : <div className="mt-5 space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="grid gap-4 md:grid-cols-2"><Field label="Requirement ID"><Input value={form.requirementId} onChange={(e) => update("requirementId", e.target.value)} placeholder="REQ-ORDER-001 (để trống để tự sinh)" /></Field><Field label="Release / version áp dụng"><Input value={form.release} onChange={(e) => update("release", e.target.value)} placeholder="Release 1.2" /></Field><Field label="Tiêu đề yêu cầu *"><Input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Customer đặt đơn hàng" /></Field><Field label="Loại / ưu tiên"><div className="grid grid-cols-2 gap-2"><Select value={form.type} onChange={(e) => update("type", e.target.value)}>{["Functional", "NonFunctional", "BusinessRule", "Integration"].map((item) => <option key={item}>{item}</option>)}</Select><Select value={form.priority} onChange={(e) => update("priority", e.target.value)}>{["Critical", "High", "Medium", "Low"].map((item) => <option key={item}>{item}</option>)}</Select></div></Field></div><Field label="Mô tả yêu cầu *"><Textarea rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Hệ thống phải…" /></Field><Field label="Mục tiêu nghiệp vụ *"><Textarea rows={2} value={form.objective} onChange={(e) => update("objective", e.target.value)} placeholder="Giá trị/kết quả khách hàng mong đợi…" /></Field><div className="grid gap-4 md:grid-cols-2"><Field label="Actor / role * · mỗi dòng một mục"><Textarea rows={3} value={form.actors} onChange={(e) => update("actors", e.target.value)} placeholder="Customer" /></Field><Field label="Phạm vi trong kiểm thử * · mỗi dòng một mục"><Textarea rows={3} value={form.inScope} onChange={(e) => update("inScope", e.target.value)} placeholder="Đặt hàng\nThanh toán" /></Field><Field label="Acceptance Criteria * · mỗi dòng một tiêu chí"><Textarea rows={4} value={form.acceptanceCriteria} onChange={(e) => update("acceptanceCriteria", e.target.value)} placeholder="Given… When… Then…" /></Field><Field label="Business rules · mỗi dòng một quy tắc"><Textarea rows={4} value={form.businessRules} onChange={(e) => update("businessRules", e.target.value)} placeholder="Chỉ được đặt món từ một nhà hàng trong cùng giỏ." /></Field></div><details><summary className="cursor-pointer text-sm font-semibold text-violet-700 dark:text-violet-300">Bổ sung NFR, rủi ro, dependency và chính sách dữ liệu</summary><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Ngoài phạm vi"><Textarea rows={3} value={form.outOfScope} onChange={(e) => update("outOfScope", e.target.value)} /></Field><Field label="Yêu cầu phi chức năng"><Textarea rows={3} value={form.nonFunctionalRequirements} onChange={(e) => update("nonFunctionalRequirements", e.target.value)} /></Field><Field label="Rủi ro"><Textarea rows={3} value={form.risks} onChange={(e) => update("risks", e.target.value)} /></Field><Field label="Giả định / phụ thuộc"><Textarea rows={3} value={`${form.assumptions}${form.assumptions && form.dependencies ? "\n" : ""}${form.dependencies}`} onChange={(e) => { const value = e.target.value; update("assumptions", value); update("dependencies", ""); }} /></Field><Field label="Dữ liệu test cần có"><Textarea rows={3} value={form.testDataRequirements} onChange={(e) => update("testDataRequirements", e.target.value)} /></Field><Field label="Dữ liệu cấm sử dụng"><Textarea rows={3} value={form.dataRestrictions} onChange={(e) => update("dataRestrictions", e.target.value)} placeholder="PII thật, token, mật khẩu, dữ liệu production" /></Field></div></details><div className="flex justify-end"><Button disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang lưu…" : "Lưu Requirement nháp"}</Button></div></div>}
    <div className="mt-7 border-t border-slate-200 pt-5 dark:border-slate-700"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Requirement trong Profile</p><p className="mt-1 text-xs text-slate-500">{baselined.length} Requirement đã Baselined. Chỉ các mục này được dùng để AI sinh Use Case.</p></div>{baselined.length > 0 && <Button variant="outline" onClick={onNext}>Tiếp tục Use Case <ArrowRight className="h-4 w-4" /></Button>}</div>{items.length ? <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="min-w-[800px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800"><tr><th className="p-3">Requirement</th><th className="p-3">Nguồn khách hàng</th><th className="p-3">Trạng thái</th><th className="p-3 text-right">Thao tác</th></tr></thead><tbody>{items.map((item) => <tr key={item._id} className="border-t border-slate-200 dark:border-slate-700"><td className="p-3"><p className="font-semibold">{item.requirementId} · {item.title}</p><p className="mt-1 text-xs text-slate-500">{item.actors?.join(", ")} · {item.inScope?.join(", ")}</p></td><td className="p-3 text-xs">{item.source?.title}<br />{item.source?.provider}</td><td className="p-3"><Badge tone={item.status === "Baselined" ? "green" : item.status === "Rejected" ? "red" : "amber"}>{item.status}</Badge></td><td className="p-3 text-right">{item.status !== "Baselined" && <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: item._id, decision: "Baselined" })}>Baseline</Button>}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-slate-500">Chưa có Requirement. Thêm đề bài khách hàng bằng một trong hai cách bên trên.</p>}</div>
    </>}
  </Card>;
}

function ModernRequirementEditor({ profile, intake, updateIntake, form, update, source, canSave, mutation, importDocument, items, baselined, decide, onNext, alternateContent, evidenceContent, referenceImages, setReferenceImages, draft }) {
  const [entryMode, setEntryMode] = useState("manual");
  const [activeSection, setActiveSection] = useState(1);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const completed = [form.title, form.description, form.objective, form.actors, form.inScope, form.acceptanceCriteria].filter(Boolean).length;
  const itemCount = items.length;
  const libraryUrl = `/requirements?${new URLSearchParams({ project: String(profile?.project?._id || profile?.project || ""), profile: String(profile?._id || "") }).toString()}`;
  const sourceReady = source.title.trim() && source.provider.trim() && source.receivedAt;
  return <Card className="overflow-hidden p-0">
    <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-sky-50 px-5 py-5 dark:border-violet-900/50 dark:from-violet-950/30 dark:via-slate-950 dark:to-sky-950/20 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">Requirement workspace</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-950 dark:text-white">Nguồn tài liệu đầu vào</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">Nhập hoặc tải nguồn nghiệp vụ đã có. Với ứng dụng đang chạy, bổ sung URL và bằng chứng kỹ thuật. Tạo tài liệu dẫn xuất tại bước Use Case hoặc User Story.</p></div><div className="rounded-xl border border-violet-200 bg-white/80 px-3 py-2 text-right text-xs shadow-sm dark:border-violet-800 dark:bg-slate-900/70"><p className="font-semibold text-violet-800 dark:text-violet-200">{completed}/6 nội dung cốt lõi</p><p className="mt-1 text-slate-500">{draft?.savedAt ? `Đã khôi phục bản nhập dở ${formatDocumentDate(draft.savedAt)}` : "Nội dung nhập dở được tự động lưu"}</p></div></div>
    </div>
    <div className="grid gap-0 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="border-b border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50 lg:border-b-0 lg:border-r">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Cấu trúc tài liệu</p>
        <ol className="mt-3 space-y-2 text-sm">{[[1, "Nguồn & định danh"], [2, "Mục tiêu & yêu cầu"], [3, "Phạm vi & tiêu chí"], [4, "Chi tiết bổ sung"]].map(([step, label]) => <li key={step}><button type="button" onClick={() => setActiveSection(step)} className={`w-full rounded-lg px-3 py-2 text-left transition ${activeSection === step ? "bg-violet-100 font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-200" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>{step}. {label}</button></li>)}</ol>
        <Link to={libraryUrl} className="mt-3 flex w-full items-center justify-between rounded-lg border border-violet-200 bg-white px-3 py-2 text-left text-sm font-semibold text-violet-700 shadow-sm transition hover:border-violet-400 hover:bg-violet-50 dark:border-violet-900 dark:bg-slate-900 dark:text-violet-200 dark:hover:bg-violet-950/30"><span>Mở Thư viện Requirement</span><span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs dark:bg-violet-950">{itemCount}</span></Link>
        <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-3 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:text-slate-300"><p className="font-semibold text-slate-800 dark:text-white">Mẹo soạn nhanh</p><p className="mt-1">Chỉ cần hoàn tất 6 trường cốt lõi. Các trường nâng cao có thể bổ sung khi QA lập Test Plan.</p></div>
      </aside>
      <main className="space-y-5 p-5 sm:p-6">
        {activeSection === 1 && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">1. Nguồn & định danh</h3><p className="mt-1 text-xs text-slate-500">Thông tin truy vết được giữ lại cùng tài liệu, không lẫn với nội dung Requirement.</p></div>{intake.documentType === "Requirement" && <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800"><button type="button" onClick={() => setEntryMode("manual")} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${entryMode === "manual" ? "bg-white text-violet-700 shadow-sm dark:bg-slate-700 dark:text-violet-200" : "text-slate-500"}`}>Soạn tay</button><button type="button" onClick={() => setEntryMode("document")} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${entryMode === "document" ? "bg-white text-violet-700 shadow-sm dark:bg-slate-700 dark:text-violet-200" : "text-slate-500"}`}>Tải tài liệu</button></div>}</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Loại đầu vào *"><Select value={intake.documentType} onChange={(event) => updateIntake("documentType", event.target.value)}><option value="Requirement">BRD / SRS / PRD / email</option><option value="UserStory">User Story / Product Backlog</option><option value="UseCase">Use Case / quy trình</option></Select></Field>{intake.documentType === "Requirement" && <><Field label="Tên nguồn *"><Input value={intake.title} onChange={(event) => updateIntake("title", event.target.value)} placeholder="BRD thanh toán / Email khách hàng" /></Field><Field label="Người cung cấp *"><Input value={intake.provider} onChange={(event) => updateIntake("provider", event.target.value)} placeholder="Khách hàng / PO / BA" /></Field><Field label="Ngày nhận *"><Input type="date" value={intake.receivedAt} onChange={(event) => updateIntake("receivedAt", event.target.value)} /></Field></>}</div>
          {intake.documentType === "Requirement" && <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900 dark:bg-sky-950/20"><div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]"><Field label="Phạm vi tài liệu *"><Select value={intake.scopeLevel} onChange={(event) => updateIntake("scopeLevel", event.target.value)}><option value="System">Toàn hệ thống</option><option value="Module">Một module</option><option value="Feature">Một feature</option><option value="Flow">Một flow / hành trình</option></Select></Field><Field label={intake.scopeLevel === "System" ? "Tên hệ thống (tuỳ chọn)" : "Tên phạm vi *"} hint={intake.scopeLevel === "System" ? "Một tài liệu hệ thống có thể được tách thành nhiều Requirement, Module và Feature." : "Ví dụ: Checkout, Quản lý đơn hàng, Đặt món từ giỏ hàng."}><Input value={intake.scopeName} onChange={(event) => updateIntake("scopeName", event.target.value)} placeholder={intake.scopeLevel === "System" ? "FoodRush" : "Ví dụ: Checkout"} /></Field></div><p className="mt-2 text-xs leading-5 text-sky-800 dark:text-sky-200">Tài liệu là nguồn đầu vào; sau khi trích xuất, mỗi Requirement được lưu riêng để truy vết, xác nhận nghiệp vụ và thiết kế test.</p></div>}
          {intake.documentType === "Requirement" && entryMode === "document" && <div className="mt-4 rounded-lg border border-dashed border-violet-300 bg-violet-50/50 p-4 dark:border-violet-900 dark:bg-violet-950/20"><p className="text-sm font-semibold">Tải BRD, SRS, PRD hoặc email đã xuất file</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Chọn tệp trước. Sau đó bổ sung thông tin nguồn để AI trích xuất Requirement nháp; PO/BA vẫn là người Baseline.</p><div className="mt-3 flex flex-wrap items-center gap-3"><label className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700"><FileUp className="mr-2 h-4 w-4" />Chọn PDF, DOC hoặc DOCX<input className="hidden" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={importDocument.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) { setSelectedDocument(file); if (!intake.title.trim()) updateIntake("title", file.name); } event.target.value = ""; }} /></label>{selectedDocument && <span className="max-w-sm truncate text-xs font-medium text-slate-700 dark:text-slate-200">Đã chọn: {selectedDocument.name}</span>}</div>{selectedDocument && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-200 bg-white/80 p-3 text-xs dark:border-violet-800 dark:bg-slate-950/40"><span className={sourceReady ? "text-slate-600 dark:text-slate-300" : "text-amber-700 dark:text-amber-300"}>{sourceReady ? "Sẵn sàng trích xuất. AI chỉ tạo bản nháp để bạn rà soát." : "Cần điền Tên nguồn, Người cung cấp và Ngày nhận ở phía trên trước khi trích xuất."}</span><Button size="sm" disabled={!sourceReady || importDocument.isPending} onClick={() => importDocument.mutate(selectedDocument)}>{importDocument.isPending ? "Đang trích xuất…" : "Trích xuất Requirement"}</Button></div>}</div>}
        </section>}
        {intake.documentType !== "Requirement" ? <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-5 dark:border-violet-900 dark:bg-violet-950/20"><p className="text-sm font-semibold">Đã phân loại: {intake.documentType === "UserStory" ? "User Story / Product Backlog" : intake.documentType === "UseCase" ? "Use Case / quy trình nghiệp vụ" : "Bằng chứng kỹ thuật"}</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Hệ thống không cố chuyển loại tài liệu này thành Requirement. Hãy tiếp tục trong luồng tương ứng bên dưới.</p><div className="mt-4">{alternateContent}</div></section> : entryMode === "manual" && <>
          {activeSection === 2 && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-950/50 dark:text-violet-200">2</span><div><h3 className="font-semibold">Nhu cầu nghiệp vụ</h3><p className="text-xs text-slate-500">Viết như một tài liệu ngắn, không phải bảng dữ liệu.</p></div></div><div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]"><Field label="Tên Requirement *"><Input className="h-11 text-base font-medium" value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Ví dụ: Khách hàng có thể đặt đơn hàng" /></Field><div className="grid grid-cols-2 gap-2"><Field label="Loại"><Select value={form.type} onChange={(e) => update("type", e.target.value)}>{["Functional", "NonFunctional", "BusinessRule", "Integration"].map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Ưu tiên"><Select value={form.priority} onChange={(e) => update("priority", e.target.value)}>{["Critical", "High", "Medium", "Low"].map((item) => <option key={item}>{item}</option>)}</Select></Field></div></div><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Mục tiêu nghiệp vụ *" hint="Khách hàng nhận được giá trị gì?"><Textarea rows={4} value={form.objective} onChange={(e) => update("objective", e.target.value)} placeholder="Khách hàng có thể hoàn tất đặt hàng nhanh và biết đơn đã được ghi nhận." /></Field><Field label="Yêu cầu chi tiết *" hint="Hệ thống cần làm gì để đạt mục tiêu?"><Textarea rows={4} value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Hệ thống phải cho phép khách hàng chọn sản phẩm, xác nhận thông tin và tạo đơn hàng." /></Field></div></section>}
          {activeSection === 3 && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-950/50 dark:text-violet-200">3</span><div><h3 className="font-semibold">Phạm vi và tiêu chí chấp nhận</h3><p className="text-xs text-slate-500">Đây là cơ sở PO/BA xác nhận và QA đánh giá khả năng kiểm thử.</p></div></div><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Ai sử dụng? *" hint="Mỗi vai trò một dòng"><Textarea rows={3} value={form.actors} onChange={(e) => update("actors", e.target.value)} placeholder={"Khách hàng\nNhân viên vận hành"} /></Field><Field label="Trong phạm vi *" hint="Mỗi hạng mục một dòng"><Textarea rows={3} value={form.inScope} onChange={(e) => update("inScope", e.target.value)} placeholder={"Tạo đơn hàng\nXác nhận trạng thái đơn"} /></Field></div><Field className="mt-4" label="Acceptance Criteria *" hint="Mỗi tiêu chí một dòng, ưu tiên Given / When / Then"><Textarea rows={5} value={form.acceptanceCriteria} onChange={(e) => update("acceptanceCriteria", e.target.value)} placeholder={"Given giỏ hàng hợp lệ\nWhen khách hàng xác nhận đặt hàng\nThen hệ thống tạo đơn và hiển thị mã đơn hàng"} /></Field></section>}
          {activeSection === 4 && <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/30"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-950/50 dark:text-violet-200">4</span><div><h3 className="font-semibold">Chi tiết bổ sung</h3><p className="text-xs text-slate-500">Tùy chọn. Chỉ bổ sung khi cần làm rõ phạm vi hoặc chuẩn bị kiểm thử.</p></div></div><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Business rules"><Textarea rows={3} value={form.businessRules} onChange={(e) => update("businessRules", e.target.value)} placeholder="Mỗi quy tắc một dòng" /></Field><Field label="Ngoài phạm vi"><Textarea rows={3} value={form.outOfScope} onChange={(e) => update("outOfScope", e.target.value)} placeholder="Các hạng mục chưa xử lý ở phiên bản này" /></Field><Field label="Rủi ro / phụ thuộc"><Textarea rows={3} value={`${form.risks}${form.risks && form.dependencies ? "\n" : ""}${form.dependencies}`} onChange={(e) => { update("risks", e.target.value); update("dependencies", ""); }} /></Field><Field label="Dữ liệu test cần có / hạn chế"><Textarea rows={3} value={`${form.testDataRequirements}${form.testDataRequirements && form.dataRestrictions ? "\n" : ""}${form.dataRestrictions}`} onChange={(e) => { update("testDataRequirements", e.target.value); update("dataRestrictions", ""); }} placeholder="Không dùng PII, mật khẩu hoặc dữ liệu production" /></Field></div></section>}
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700"><Button variant="outline" disabled={activeSection === 1} onClick={() => setActiveSection((step) => Math.max(1, step - 1))}>Quay lại</Button><div className="flex items-center gap-2"><span className="text-xs text-slate-500">Bước {activeSection}/4</span>{activeSection < 4 && <Button variant="outline" onClick={() => setActiveSection((step) => Math.min(4, step + 1))}>Tiếp theo <ArrowRight className="h-4 w-4" /></Button>}</div></div>
          <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-violet-900 dark:bg-slate-950/95"><p className="text-xs text-slate-600 dark:text-slate-300">{canSave ? "Đủ nội dung cốt lõi. Lưu thành tài liệu nháp để PO/BA rà soát." : `Còn ${6 - completed} phần cốt lõi; phần đang nhập vẫn được tự động lưu.`}</p><Button disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang lưu…" : "Lưu Requirement nháp"}</Button></div>
        </>}
        <details className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <summary className="cursor-pointer font-semibold">Môi trường và tài liệu tham chiếu (tùy chọn)</summary>
          <div className="mt-3 space-y-3">
            <Field label="Ảnh giao diện / Figma / đặc tả API" hint="Dán liên kết và ghi chú thiết kế mong đợi hoặc ảnh chụp hiện trạng. Nội dung được lưu cùng bản nháp khi bạn lưu hoặc tải tài liệu.">
              <Textarea rows={3} maxLength={1000} value={intake.reference} onChange={(event) => updateIntake("reference", event.target.value)} placeholder="Thiết kế mong đợi — https://… (màn hình đăng nhập)" />
            </Field>
            <div className="rounded-lg border border-dashed border-violet-300 bg-violet-50/50 p-3 dark:border-violet-900 dark:bg-violet-950/20">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-800 dark:text-white">Ảnh tham chiếu</p><p className="mt-0.5 text-xs text-slate-500">PNG, JPG hoặc WebP · tối đa 5 MB/ảnh. Ảnh được đính kèm khi bạn lưu Requirement.</p></div><label className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700"><FileUp className="mr-2 h-4 w-4" />Chọn ảnh<input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => { const files = [...(event.target.files || [])].filter((file) => file.size <= 5 * 1024 * 1024); if (files.length !== event.target.files.length) toast.error("Mỗi ảnh tối đa 5 MB."); setReferenceImages((current) => [...current, ...files.map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(0, 5)); event.target.value = ""; }} /></label></div>
              {referenceImages.length > 0 && <div className="mt-3 flex flex-wrap gap-3">{referenceImages.map((item, index) => <div key={`${item.file.name}-${index}`} className="relative h-20 w-28 overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700"><img src={item.preview} alt={item.file.name} className="h-full w-full object-cover" /><button type="button" onClick={() => setReferenceImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-xs font-bold text-white" aria-label={`Xóa ${item.file.name}`}>×</button><p className="absolute inset-x-0 bottom-0 truncate bg-slate-950/70 px-1 py-0.5 text-[10px] text-white">{item.file.name}</p></div>)}</div>}
            </div>
            {evidenceContent && cloneElement(evidenceContent, { intakeOnly: true })}
          </div>
        </details>
        <RequirementLibraryPreview items={items} baselined={baselined} libraryUrl={libraryUrl} />
      </main>
    </div>
  </Card>;
}

const requirementStatusLabel = {
  Draft: "Bản nháp",
  Reviewed: "Đã rà soát",
  Baselined: "Đã chốt",
  Rejected: "Từ chối",
  Changed: "Có thay đổi",
  Retired: "Ngừng áp dụng",
};

const requirementTone = (status) => status === "Baselined" ? "green" : status === "Rejected" || status === "Retired" ? "red" : status === "Draft" ? "slate" : "amber";

function DetailList({ title, values }) {
  const items = Array.isArray(values) ? values.filter(Boolean) : values ? [values] : [];
  return <section className={`rounded-xl border p-4 ${items.length ? "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" : "border-dashed border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40"}`}><div className="flex items-center justify-between gap-3"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h4>{!items.length && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">Chưa có dữ liệu</span>}</div>{items.length ? <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{items.map((value, index) => <li key={`${title}-${index}`} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" /><span>{value}</span></li>)}</ul> : <p className="mt-2 text-sm leading-6 text-slate-400">Tài liệu nguồn chưa nêu rõ nội dung này; cần PO/BA bổ sung hoặc xác nhận.</p>}</section>;
}

function RequirementLibraryPreview({ items, baselined, libraryUrl }) {
  const recent = [...items].sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0)).slice(0, 5);
  const draftCount = items.filter((item) => item.status === "Draft").length;
  const changedCount = items.filter((item) => item.status === "Changed").length;
  return <section className="border-t border-slate-200 pt-5 dark:border-slate-700">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold">Requirement đã lưu</h3><p className="mt-1 text-xs text-slate-500">Tóm tắt đợt hiện tại. Việc rà soát, Baseline và Từ chối được thực hiện trong Thư viện riêng.</p></div><Button asChild><Link to={libraryUrl}>Mở Thư viện Requirement <ArrowRight className="h-4 w-4" /></Link></Button></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><p className="text-2xl font-bold">{items.length}</p><p className="text-xs text-slate-500">Tổng Requirement</p></div><div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20"><p className="text-2xl font-bold text-amber-800 dark:text-amber-200">{draftCount + changedCount}</p><p className="text-xs text-amber-700 dark:text-amber-300">Cần rà soát</p></div><div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/20"><p className="text-2xl font-bold text-emerald-800 dark:text-emerald-200">{baselined.length}</p><p className="text-xs text-emerald-700 dark:text-emerald-300">Đã Baseline</p></div></div>
    {recent.length ? <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"><div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800">5 mục cập nhật gần nhất</div>{recent.map((item) => <Link key={item._id} to={`${libraryUrl}&requirement=${item._id}`} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm transition last:border-0 hover:bg-violet-50 dark:border-slate-800 dark:hover:bg-violet-950/20"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-violet-700 dark:text-violet-300">{item.requirementId}</span><Badge tone={requirementTone(item.status)}>{requirementStatusLabel[item.status] || item.status}</Badge><DocumentQualityBadge quality={item.quality} /></div><p className="mt-1 truncate font-semibold">{item.title}</p></div><span className="shrink-0 text-xs font-semibold text-violet-700 dark:text-violet-300">Mở <ChevronRight className="inline h-4 w-4" /></span></Link>)}</div> : <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700">Chưa có Requirement đã lưu. Nội dung form đang nhập dở vẫn được tự động lưu trong đợt này.</p>}
  </section>;
}

export function RequirementLibrary({ items, baselined, decide, update, supplementDocument, onNext, initialRequirementId = "" }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [sortBy, setSortBy] = useState("updated");
  const [selected, setSelected] = useState(() => items.find((item) => item._id === initialRequirementId) || null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const supplementInputRef = useRef(null);
  useEffect(() => {
    if (initialRequirementId) setSelected(items.find((item) => item._id === initialRequirementId) || null);
  }, [initialRequirementId, items]);
  useEffect(() => {
    if (!selected?._id) return;
    const fresh = items.find((item) => item._id === selected._id);
    if (fresh && fresh.updatedAt !== selected.updatedAt) setSelected(fresh);
  }, [items, selected?._id, selected?.updatedAt]);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const statusOptions = [
    ["All", "Tất cả", items.length],
    ["Draft", "Bản nháp", items.filter((item) => item.status === "Draft").length],
    ["Baselined", "Đã chốt", baselined.length],
    ["Changed", "Có thay đổi", items.filter((item) => item.status === "Changed").length],
    ["Rejected", "Từ chối", items.filter((item) => item.status === "Rejected").length],
  ];
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const filtered = items.filter((item) => {
    const matchesStatus = status === "All" || item.status === status;
    const haystack = [item.requirementId, item.title, item.description, item.source?.title, item.source?.provider, ...(item.actors || []), ...(item.inScope || [])].filter(Boolean).join(" ").toLocaleLowerCase("vi");
    return matchesStatus && (!normalizedQuery || haystack.includes(normalizedQuery));
  }).sort((left, right) => {
    if (sortBy === "priority") return ({ Critical: 0, High: 1, Medium: 2, Low: 3 }[left.priority] ?? 4) - ({ Critical: 0, High: 1, Medium: 2, Low: 3 }[right.priority] ?? 4);
    if (sortBy === "created") return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
    return new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0);
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const changeFilter = (nextStatus) => { setStatus(nextStatus); setPage(1); };
  const changeQuery = (value) => { setQuery(value); setPage(1); };
  const openDetails = (item) => { setReviewConfirmed(false); setEditing(false); setEditForm(null); setSelected(item); };
  const startEditing = (item) => {
    const textList = (value) => Array.isArray(value) ? value.join("\n") : String(value || "");
    setReviewConfirmed(false);
    setEditForm({
      title: item.title || "", type: item.type || "Functional", priority: item.priority || "Medium", release: item.release || "",
      description: item.description || "", objective: item.objective || "", actors: textList(item.actors), inScope: textList(item.inScope), outOfScope: textList(item.outOfScope),
      acceptanceCriteria: textList(item.acceptanceCriteria), businessRules: textList(item.businessRules), nonFunctionalRequirements: textList(item.nonFunctionalRequirements),
      risks: textList(item.risks), assumptions: textList(item.assumptions), dependencies: textList(item.dependencies), testDataRequirements: textList(item.testDataRequirements), dataRestrictions: textList(item.dataRestrictions),
    });
    setEditing(true);
  };
  const saveEdits = () => {
    const arrayFields = ["actors", "inScope", "outOfScope", "acceptanceCriteria", "businessRules", "nonFunctionalRequirements", "risks", "assumptions", "dependencies", "testDataRequirements", "dataRestrictions"];
    const body = { ...editForm, scope: selected.scope };
    arrayFields.forEach((field) => { body[field] = lines(editForm[field]); });
    update.mutate({ id: selected._id, body }, { onSuccess: (saved) => { setSelected(saved); setEditing(false); setEditForm(null); } });
  };
  const baseline = (item) => {
    if (window.confirm(`Chốt ${item.requirementId || "Requirement này"} làm bản chuẩn? Sau khi chốt, mục này sẽ được dùng để sinh Use Case.`)) decide.mutate({ id: item._id, decision: "Baselined" }, { onSuccess: () => { setSelected(null); setReviewConfirmed(false); } });
  };
  const reject = (item) => {
    if (window.confirm(`Từ chối ${item.requirementId || "Requirement này"}? Mục này sẽ không được dùng để sinh Use Case.`)) decide.mutate({ id: item._id, decision: "Rejected" }, { onSuccess: () => { setSelected(null); setReviewConfirmed(false); } });
  };
  const selectedDetails = selected ? [selected.objective, selected.description, selected.actors, selected.inScope, selected.outOfScope, selected.acceptanceCriteria, selected.businessRules, selected.nonFunctionalRequirements, selected.risks, selected.assumptions, selected.dependencies, selected.testDataRequirements, selected.dataRestrictions] : [];
  const completedDetailCount = selectedDetails.filter((value) => Array.isArray(value) ? value.some(Boolean) : Boolean(value)).length;
  const missingBaselineFields = selected ? [
    !selected.title && "tiêu đề",
    !selected.description && "mô tả",
    !selected.objective && "mục tiêu",
    !selected.actors?.length && "actor",
    !selected.inScope?.length && "phạm vi",
    !selected.acceptanceCriteria?.length && "Acceptance Criteria",
  ].filter(Boolean) : [];
  const canBaselineSelected = missingBaselineFields.length === 0;

  return <section id="requirements-library" className="scroll-mt-5 border-t border-slate-200 pt-5 dark:border-slate-700">
    <input ref={supplementInputRef} className="sr-only" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { const file = event.target.files?.[0]; const referenceItem = selected || items[0]; if (file) supplementDocument.mutate({ file, source: referenceItem?.source, scope: referenceItem?.scope }); event.target.value = ""; }} />
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold">Thư viện Requirement</h3><p className="mt-1 text-xs text-slate-500">{items.length} mục · {baselined.length} đã chốt. Mở chi tiết để bổ sung thủ công hoặc tải một BRD/SRS đầy đủ hơn.</p></div><div className="flex flex-wrap gap-2"><Button disabled={supplementDocument.isPending} onClick={() => supplementInputRef.current?.click()}><FileUp className="h-4 w-4" />{supplementDocument.isPending ? "Đang đối chiếu tài liệu…" : "Tải BRD/SRS đầy đủ hơn"}</Button>{baselined.length > 0 && <Button variant="outline" onClick={onNext}>Tiếp tục Use Case <ArrowRight className="h-4 w-4" /></Button>}</div></div>
    <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-100"><p className="font-semibold">Có tài liệu mới đầy đủ hơn?</p><p className="mt-1 text-xs leading-5 opacity-80">Tải lại BRD/SRS mới. Hệ thống đối chiếu theo mã Requirement, bổ sung trường còn thiếu và giữ nguyên nội dung đã được PO/BA chỉnh sửa. Requirement đã Baseline không bị ghi đè.</p></div>
    {items.length ? <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 p-3 backdrop-blur dark:border-slate-700 dark:bg-slate-950/95">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <label className="relative block w-full xl:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => changeQuery(event.target.value)} className="pl-9" placeholder="Tìm theo mã, tên, actor hoặc nguồn…" aria-label="Tìm Requirement" /></label>
          <div className="flex flex-wrap items-center gap-2"><Select className="h-9 min-w-36 text-xs" value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1); }} aria-label="Sắp xếp Requirement"><option value="updated">Mới cập nhật</option><option value="created">Mới tạo</option><option value="priority">Theo ưu tiên</option></Select><Select className="h-9 w-28 text-xs" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Số Requirement mỗi trang"><option value="5">5 / trang</option><option value="10">10 / trang</option><option value="20">20 / trang</option></Select></div>
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1">{statusOptions.map(([value, label, count]) => <button key={value} type="button" onClick={() => changeFilter(value)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${status === value ? "bg-violet-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"}`}>{label} <span className={status === value ? "text-violet-100" : "text-slate-400"}>{count}</span></button>)}</div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">{visible.map((item) => <button key={item._id} type="button" onClick={() => openDetails(item)} className="group grid w-full gap-3 px-3 py-3 text-left transition hover:bg-violet-50/60 focus:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-500 dark:hover:bg-violet-950/20 md:grid-cols-[minmax(0,1fr)_150px_150px_96px] md:items-center">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-violet-700 dark:text-violet-300">{item.requirementId || "Chưa có mã"}</span><Badge tone={requirementTone(item.status)}>{requirementStatusLabel[item.status] || item.status}</Badge><DocumentQualityBadge quality={item.quality} /></div><p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{item.title}</p><p className="mt-1 line-clamp-1 text-xs text-slate-500">{item.description || item.objective || "Chưa có mô tả"}</p></div>
        <div className="text-xs text-slate-500"><p className="font-medium text-slate-700 dark:text-slate-300">{item.source?.title || "Chưa rõ nguồn"}</p><p className="mt-1">{item.source?.provider || "Chưa có người cung cấp"}</p></div>
        <div className="text-xs text-slate-500"><p>{item.type || "Requirement"} · {item.priority || "Medium"}</p><p className="mt-1">Tạo {formatDocumentDate(item.createdAt)}</p><p className="mt-0.5">Cập nhật {formatDocumentDate(item.updatedAt)}</p></div>
        <span className="inline-flex items-center justify-end gap-1 text-xs font-semibold text-violet-700 dark:text-violet-300">Xem chi tiết <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
      </button>)}</div>
      {!visible.length && <div className="p-10 text-center"><Search className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold">Không tìm thấy Requirement phù hợp</p><button type="button" onClick={() => { changeQuery(""); changeFilter("All"); }} className="mt-2 text-xs font-semibold text-violet-600 hover:underline">Xóa bộ lọc</button></div>}
      {filtered.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/60"><span>Hiển thị {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} trong {filtered.length} mục</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" /> Trước</Button><span className="font-semibold text-slate-700 dark:text-slate-200">{currentPage}/{pageCount}</span><Button size="sm" variant="outline" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Sau <ChevronRight className="h-4 w-4" /></Button></div></div>}
    </div> : <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-slate-500">Chưa có Requirement. Bạn có thể soạn tay hoặc tải tài liệu ở phía trên.</p>}

    {selected && <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-label={`Chi tiết ${selected.requirementId}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-slate-950">
        <header className="border-b border-slate-200 p-5 dark:border-slate-800"><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-violet-700 dark:text-violet-300">{selected.requirementId || "Chưa có mã"}</span><Badge tone={requirementTone(selected.status)}>{requirementStatusLabel[selected.status] || selected.status}</Badge><DocumentQualityBadge quality={selected.quality} /></div><h3 className="mt-2 text-xl font-bold text-slate-950 dark:text-white">{selected.title}</h3><p className="mt-2 text-xs text-slate-500">{selected.type || "Requirement"} · Ưu tiên {selected.priority || "Medium"} · Tạo {formatDocumentDate(selected.createdAt)} · Cập nhật {formatDocumentDate(selected.updatedAt)}</p></div><div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{!editing && <><Button size="sm" onClick={() => startEditing(selected)}>Chỉnh sửa & bổ sung</Button><Button size="sm" variant="outline" disabled={supplementDocument.isPending} onClick={() => supplementInputRef.current?.click()}><FileUp className="h-4 w-4" />Tải file mới</Button></>}<button type="button" onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Đóng chi tiết"><X className="h-5 w-5" /></button></div></div></header>
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Nguồn</p><p className="mt-1 text-sm font-semibold">{selected.source?.title || "Chưa rõ nguồn"}</p><p className="mt-1 text-xs text-slate-500">{selected.source?.provider || "Chưa có người cung cấp"}{selected.source?.version ? ` · ${selected.source.version}` : ""}</p></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Phạm vi</p><p className="mt-1 text-sm font-semibold">{selected.scope?.name || selected.release || "Toàn hệ thống"}</p><p className="mt-1 text-xs text-slate-500">{selected.scope?.level || "System"}</p></div></div>
          <div className={`rounded-xl border p-4 ${completedDetailCount >= 8 ? "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100" : "border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100"}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">Độ đầy đủ: {completedDetailCount}/13 nhóm thông tin</p><span className="text-xs font-medium">{completedDetailCount >= 8 ? "Khá đầy đủ" : "Cần bổ sung trước khi chốt"}</span></div><p className="mt-1 text-xs leading-5 opacity-80">Hệ thống chỉ tách nội dung có trong tài liệu nguồn và không tự bịa phần còn thiếu. Các mục trống được hiển thị bên dưới để PO/BA dễ rà soát.</p></div>
          {!canBaselineSelected && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-100"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">Chưa thể Baseline Requirement này</p><p className="mt-1 text-xs leading-5">Cần bổ sung: {missingBaselineFields.join(", ")}. {selected.reviewNote || "PO/BA cần hoàn thiện nội dung có thể kiểm thử trước khi chốt."}</p></div>{!editing && <Button size="sm" onClick={() => startEditing(selected)}>Bổ sung ngay</Button>}</div></div>}
          {editing ? <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/30 p-4 dark:border-violet-900 dark:bg-violet-950/10">
            <div><h4 className="font-semibold">Bổ sung Requirement</h4><p className="mt-1 text-xs leading-5 text-slate-500">Có thể lưu từng phần khi còn là Draft. Các trường có dấu * phải đủ trước khi Baseline.</p></div>
            {selected.status === "Baselined" && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">Sửa Requirement đã Baseline sẽ chuyển trạng thái thành “Có thay đổi” và cần Baseline lại.</p>}
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Tiêu đề *"><Input value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} /></Field><Field label="Loại và ưu tiên"><div className="grid grid-cols-2 gap-2"><Select value={editForm.type} onChange={(event) => setEditForm({ ...editForm, type: event.target.value })}>{["Functional", "NonFunctional", "BusinessRule", "Integration"].map((value) => <option key={value}>{value}</option>)}</Select><Select value={editForm.priority} onChange={(event) => setEditForm({ ...editForm, priority: event.target.value })}>{["Critical", "High", "Medium", "Low"].map((value) => <option key={value}>{value}</option>)}</Select></div></Field></div>
            <Field label="Mô tả *"><Textarea rows={3} value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} /></Field>
            <Field label="Mục tiêu nghiệp vụ *"><Textarea rows={2} value={editForm.objective} onChange={(event) => setEditForm({ ...editForm, objective: event.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Actor / vai trò *" hint="Mỗi dòng một mục"><Textarea rows={3} value={editForm.actors} onChange={(event) => setEditForm({ ...editForm, actors: event.target.value })} /></Field><Field label="Trong phạm vi *" hint="Mỗi dòng một mục"><Textarea rows={3} value={editForm.inScope} onChange={(event) => setEditForm({ ...editForm, inScope: event.target.value })} /></Field></div>
            <Field label="Acceptance Criteria *" hint="Mỗi dòng một tiêu chí; ưu tiên Given / When / Then"><Textarea rows={6} value={editForm.acceptanceCriteria} onChange={(event) => setEditForm({ ...editForm, acceptanceCriteria: event.target.value })} /></Field>
            <details className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><summary className="cursor-pointer text-sm font-semibold text-violet-700 dark:text-violet-300">Thông tin khuyến nghị</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Ngoài phạm vi"><Textarea rows={3} value={editForm.outOfScope} onChange={(event) => setEditForm({ ...editForm, outOfScope: event.target.value })} /></Field><Field label="Business rules"><Textarea rows={3} value={editForm.businessRules} onChange={(event) => setEditForm({ ...editForm, businessRules: event.target.value })} /></Field><Field label="Yêu cầu phi chức năng"><Textarea rows={3} value={editForm.nonFunctionalRequirements} onChange={(event) => setEditForm({ ...editForm, nonFunctionalRequirements: event.target.value })} /></Field><Field label="Rủi ro"><Textarea rows={3} value={editForm.risks} onChange={(event) => setEditForm({ ...editForm, risks: event.target.value })} /></Field><Field label="Giả định"><Textarea rows={3} value={editForm.assumptions} onChange={(event) => setEditForm({ ...editForm, assumptions: event.target.value })} /></Field><Field label="Phụ thuộc"><Textarea rows={3} value={editForm.dependencies} onChange={(event) => setEditForm({ ...editForm, dependencies: event.target.value })} /></Field><Field label="Dữ liệu test cần có"><Textarea rows={3} value={editForm.testDataRequirements} onChange={(event) => setEditForm({ ...editForm, testDataRequirements: event.target.value })} /></Field><Field label="Hạn chế dữ liệu"><Textarea rows={3} value={editForm.dataRestrictions} onChange={(event) => setEditForm({ ...editForm, dataRestrictions: event.target.value })} /></Field></div></details>
          </div> : <>
            <DetailList title="Mục tiêu nghiệp vụ" values={selected.objective} />
            <DetailList title="Mô tả yêu cầu" values={selected.description} />
            <DetailList title="Actor / vai trò" values={selected.actors} />
            <DetailList title="Trong phạm vi" values={selected.inScope} />
            <DetailList title="Ngoài phạm vi" values={selected.outOfScope} />
            <DetailList title="Acceptance Criteria" values={selected.acceptanceCriteria} />
            <DetailList title="Business rules" values={selected.businessRules} />
            <DetailList title="Yêu cầu phi chức năng" values={selected.nonFunctionalRequirements} />
            <DetailList title="Rủi ro" values={selected.risks} />
            <DetailList title="Giả định" values={selected.assumptions} />
            <DetailList title="Phụ thuộc" values={selected.dependencies} />
            <DetailList title="Dữ liệu test cần có" values={selected.testDataRequirements} />
            <DetailList title="Hạn chế dữ liệu" values={selected.dataRestrictions} />
          </>}
        </div>
        <footer className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">{editing ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Sau khi lưu, điểm chất lượng và danh sách còn thiếu sẽ được tính lại.</p><div className="flex gap-2"><Button variant="outline" disabled={update.isPending} onClick={() => { setEditing(false); setEditForm(null); }}>Hủy</Button><Button disabled={!editForm.title.trim() || !editForm.description.trim() || update.isPending} onClick={saveEdits}>{update.isPending ? "Đang lưu…" : "Lưu nội dung bổ sung"}</Button></div></div> : <><label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-violet-600" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} /><span><strong>Tôi đã đọc nội dung chi tiết</strong><span className="mt-0.5 block text-xs text-slate-500">Xác nhận trước khi Baseline hoặc Từ chối Requirement.</span></span></label><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="max-w-md text-xs leading-5 text-slate-500">{canBaselineSelected ? "Baseline cho phép dùng Requirement làm đầu vào chính thức để sinh Use Case." : `Nút Baseline bị khóa vì còn thiếu ${missingBaselineFields.join(", ")}.`}</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setSelected(null)}>Đóng</Button>{selected.status !== "Baselined" && <><Button variant="outline" disabled={!reviewConfirmed || decide.isPending} onClick={() => reject(selected)}>Từ chối</Button><Button disabled={!reviewConfirmed || !canBaselineSelected || decide.isPending} onClick={() => baseline(selected)}>{decide.isPending ? "Đang cập nhật…" : "Baseline Requirement"}</Button></>}</div></div></>}</footer>
      </div>
    </div>}
  </section>;
}

function TechnicalEvidenceStep({ profile, github, integrations, git, setGit, analyzeGithub, activeProject, GitHubForm, requirements, updateProfile, onNext, intakeOnly = false }) {
  const [url, setUrl] = useState(null);
  const [designReference, setDesignReference] = useState(null);
  const [selectedRequirement, setSelectedRequirement] = useState("");
  const imageInputRef = useRef(null);
  const website = url ?? profile?.baseUrl ?? "";
  const figmaUrl = designReference ?? profile?.referenceUrl ?? "";
  const requirementItems = requirements?.data || [];
  const selectedRequirementId = selectedRequirement || requirementItems[0]?._id || "";
  const selectedRequirementItem = requirementItems.find((item) => item._id === selectedRequirementId);
  const uploadEvidence = useMutation({
    mutationFn: async (files) => Promise.all(files.map((file) => e2eApi.uploadRequirementImage(selectedRequirementId, file))),
    onSuccess: (_, files) => {
      toast.success(`Đã gắn ${files.length} ảnh tham chiếu vào ${selectedRequirementItem?.requirementId || "Requirement"}.`);
      requirements?.refetch?.();
    },
    onError: (error) => toast.error(error.message),
  });
  if (!profile) return <Blocked title="Đang chuẩn bị phạm vi kiểm thử" description="Hệ thống đang tạo không gian liên kết tài liệu cho Project này." />;
  return <Card className="p-5 sm:p-6">
    <SectionTitle title="Môi trường và bằng chứng kỹ thuật" description="Tuỳ chọn. Repository giúp đối chiếu route, API, role và entity; không thay thế Requirement đã Baseline từ đề bài khách hàng." />
    <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
      <div className="rounded-lg border border-border p-3">
        <p className="font-semibold">Website / Staging URL</p>
        <p className="mt-1 break-all text-muted-foreground">{profile.environment?.targetUrl || profile.baseUrl || "Chưa có URL. Có thể chọn môi trường chạy ở bước Run Automation."}</p>
        {updateProfile && <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => {
          event.preventDefault();
          updateProfile.mutate({ baseUrl: website.trim() }, { onSuccess: () => setUrl(null) });
        }}>
          <Input aria-label="Website hoặc Staging URL" type="url" pattern="https?://.+" required value={website} onChange={(event) => setUrl(event.target.value)} placeholder="https://staging.example.com" />
          <Button type="submit" disabled={updateProfile.isPending}>Lưu URL của Profile</Button>
        </form>}
      </div>
      {!intakeOnly && <div className="rounded-lg border border-violet-200 bg-violet-50/30 p-3 dark:border-violet-900 dark:bg-violet-950/20">
        <p className="font-semibold">Ảnh giao diện / Figma / đặc tả API</p>
        <p className="mt-1 text-muted-foreground">Lưu link Figma trên Profile hoặc gắn PNG, JPG, WebP xuất từ Figma vào một Requirement đã lưu.</p>
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); updateProfile.mutate({ referenceUrl: figmaUrl.trim() }, { onSuccess: () => setDesignReference(null) }); }}>
          <Input aria-label="Liên kết Figma hoặc đặc tả API" type="url" pattern="https?://.+" value={figmaUrl} onChange={(event) => setDesignReference(event.target.value)} placeholder="https://www.figma.com/design/…" />
          <Button type="submit" variant="outline" disabled={!figmaUrl.trim() || updateProfile.isPending}>Lưu link</Button>
        </form>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Select aria-label="Requirement nhận ảnh tham chiếu" value={selectedRequirementId} onChange={(event) => setSelectedRequirement(event.target.value)} disabled={!requirementItems.length}>
            {!requirementItems.length && <option value="">Chưa có Requirement đã lưu</option>}
            {requirementItems.map((item) => <option key={item._id} value={item._id}>{item.requirementId} · {item.title}</option>)}
          </Select>
          <input ref={imageInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" multiple onChange={(event) => {
            const selectedFiles = [...(event.target.files || [])];
            const validFiles = selectedFiles.filter((file) => file.size <= 5 * 1024 * 1024).slice(0, 5);
            if (validFiles.length !== selectedFiles.length) toast.error("Chỉ nhận tối đa 5 ảnh PNG, JPG hoặc WebP, mỗi ảnh không quá 5 MB.");
            if (validFiles.length && selectedRequirementId) uploadEvidence.mutate(validFiles);
            event.target.value = "";
          }} />
          <Button type="button" disabled={!selectedRequirementId || uploadEvidence.isPending} onClick={() => imageInputRef.current?.click()}><FileUp className="h-4 w-4" />{uploadEvidence.isPending ? "Đang tải…" : "Thêm ảnh / Figma export"}</Button>
        </div>
        {!requirementItems.length ? <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">Hãy lưu ít nhất một Requirement trước khi gắn ảnh. Link Figma vẫn có thể lưu ngay.</p> : <p className="mt-2 text-xs text-slate-500">{selectedRequirementItem?.attachments?.length || 0} ảnh đã gắn vào Requirement đang chọn.</p>}
      </div>}
    </div>
    {profile.repository?.fullName && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"><span className="font-semibold">Đã gắn bằng chứng:</span> {profile.repository.fullName}@{profile.repository.commitSha || profile.repository.ref}</div>}
    <details className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer text-sm font-semibold">{profile.repository?.fullName ? "Cập nhật phân tích GitHub" : "Kết nối và phân tích GitHub"}</summary><div className="mt-5"><GitHubForm {...{ github, integrations, git, setGit, analyzeGithub, activeProject, profile }} /></div></details>
    {!intakeOnly && <div className="mt-6 flex justify-end"><Button variant="outline" onClick={onNext}>{profile.repository?.fullName ? "Tiếp tục Use Case" : "Bỏ qua, tiếp tục Use Case"} <ArrowRight className="h-4 w-4" /></Button></div>}
  </Card>;
}

function UseCaseStep({
  intakeOnly = false,
  reference = "",
  useCase,
  profile,
  setUseCase,
  suggestUseCases,
  addUseCase,
  approveUseCase,
  useCases,
  requirements,
  onNext,
}) {
  const [mode, setMode] = useState(intakeOnly ? "source" : "review");
  const [originFilter, setOriginFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState("newest");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedItemId, setSelectedItemId] = useState("");
  const update = (key, value) => setUseCase({ ...useCase, [key]: value });
  const items = useCases.data || [];
  const approved = items.filter((item) => item.status === "Approved");
  const hasBaselineRequirements = (requirements?.data || []).some((item) => item.status === "Baselined");
  const importDocument = useMutation({
    mutationFn: (file) => e2eApi.importUseCasesDocument(profile._id, file, reference),
    onSuccess: (result) => {
      toast.success(result.message || "Đã tạo Use Case nháp từ tài liệu");
      setMode("review");
      useCases.refetch();
    },
    onError: (error) => toast.error(error.message || "Không thể đọc tài liệu Use Case."),
  });
  const confirmOrigin = useMutation({
    mutationFn: ({ id, origin }) => e2eApi.updateUseCase(id, { origin }),
    onSuccess: () => {
      toast.success("Đã lưu nguồn tạo Use Case.");
      useCases.refetch();
    },
    onError: (error) => toast.error(error.message || "Không thể cập nhật nguồn tạo."),
  });
  const canCreate = useCase.name && useCase.actor && useCase.scope && useCase.summary && useCase.mainFlow && !addUseCase.isPending;
  const filteredItems = items
    .filter((item) => {
      const term = search.trim().toLocaleLowerCase();
      const matchesSearch = !term || [item.code, item.name, item.actor]
        .some((value) => String(value || "").toLocaleLowerCase().includes(term));
      return matchesSearch && (originFilter === "All" || getUseCaseOrigin(item).key === originFilter);
    })
    .sort((left, right) => {
      const a = new Date(left.createdAt || 0).getTime();
      const b = new Date(right.createdAt || 0).getTime();
      return sortOrder === "oldest" ? a - b : b - a;
    });
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedItem = items.find((item) => item._id === selectedItemId);
  const sourceOption = (value, title, description, action) => (
    <button type="button" onClick={() => setMode(value)} className={`rounded-xl border p-4 text-left transition ${mode === value ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100 dark:bg-violet-950/30 dark:ring-violet-950" : "border-slate-200 hover:border-violet-300 dark:border-slate-700"}`}>
      <p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p><span className="mt-3 inline-block text-xs font-semibold text-violet-700 dark:text-violet-300">{action}</span>
    </button>
  );
  return <Card className="p-5">
    <SectionTitle title="Use Case" description="Rà soát và duyệt các hành trình đang có trước. Chỉ thêm Use Case khi phạm vi hiện tại còn thiếu." />
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
      <div>
        <p className="text-sm font-semibold">{items.length ? `Use Case trong Profile (${items.length})` : "Chưa có Use Case trong Profile"}</p>
        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
          {items.length
            ? `${approved.length} đã duyệt. Bản nháp cần được kiểm tra trước khi dùng để sinh User Story.`
            : "Thêm hành trình đầu tiên từ tài liệu, AI gợi ý hoặc soạn thủ công."}
        </p>
      </div>
      <Button variant={mode === "source" ? "outline" : "default"} onClick={() => setMode(mode === "source" ? "review" : "source")}>
        {mode === "source" ? "Đóng phần thêm Use Case" : "Thêm Use Case"}
      </Button>
    </div>

    {(mode === "source" || !items.length) && <div className="mt-4"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Chọn một cách bổ sung Use Case</p><div className="grid gap-3 md:grid-cols-3">
      {sourceOption("document", "Nhập từ tài liệu", "Tải PDF, DOC hoặc DOCX; AI chỉ trích xuất thành các bản nháp.", "Dùng khi đã có đặc tả")}
      {!intakeOnly && sourceOption("ai", "Soạn nháp từ Requirement đã Baseline", "AI chuyển yêu cầu đã xác nhận thành hành trình nháp.", "Tài liệu dẫn xuất")}
      {sourceOption("manual", "Soạn thủ công", "QA tự khai báo một hành trình mới và các luồng của nó.", "Dùng cho ngoại lệ cụ thể")}
    </div></div>}

    {mode === "document" && <div className="mt-5 rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-5 dark:border-violet-900 dark:bg-violet-950/20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">Tài liệu Use Case đã có</p><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-300">Tải lên một tài liệu. AI sẽ đọc nội dung, tách các hành trình thành Use Case ở trạng thái Nháp, rồi bạn rà soát trước khi duyệt. Tệp tối đa 10 MB.</p></div><label className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700"><FileUp className="mr-2 h-4 w-4" />{importDocument.isPending ? "Đang đọc tài liệu…" : "Chọn tài liệu"}<input className="hidden" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={importDocument.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) importDocument.mutate(file); event.target.value = ""; }} /></label></div>
      <p className="mt-3 text-xs text-slate-500">Tài liệu gốc là nguồn tham khảo. Những chỗ thiếu sẽ được gắn “Cần QA xác nhận”; hệ thống không tự duyệt hoặc tự suy diễn chức năng.</p>
    </div>}

    {mode === "ai" && <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50/60 p-5 dark:border-sky-900 dark:bg-sky-950/20"><p className="text-sm font-semibold">Sinh từ Requirement khách hàng đã Baseline</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">AI dùng Requirement đã xác nhận làm nguồn chính; System Profile và GitHub chỉ là bối cảnh/bằng chứng kỹ thuật bổ sung.</p>{!hasBaselineRequirements && <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-300">Hãy quay lại bước “Đề bài khách hàng” và Baseline ít nhất một Requirement trước.</p>}<Button className="mt-4" disabled={!hasBaselineRequirements || suggestUseCases.isPending} onClick={() => suggestUseCases.mutate()}>{suggestUseCases.isPending ? "AI đang gợi ý…" : "Tạo Use Case nháp từ Requirement"}</Button></div>}

    {mode === "manual" && <div className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="grid gap-4 md:grid-cols-2"><Field label="Tên hành trình"><Input value={useCase.name} onChange={(e) => update("name", e.target.value)} placeholder="Đăng nhập thành công và vào trang chủ" /></Field><Field label="Actor"><Input value={useCase.actor} onChange={(e) => update("actor", e.target.value)} placeholder="Customer" /></Field><Field label="Phạm vi Use Case *" hint="Feature hoặc ranh giới hành trình mà Use Case này bao phủ."><Input value={useCase.scope} onChange={(e) => update("scope", e.target.value)} placeholder="Ví dụ: Checkout / Đặt món từ giỏ hàng" /></Field><Field label="Mục tiêu / giá trị nghiệp vụ"><Textarea rows={3} value={useCase.summary} onChange={(e) => update("summary", e.target.value)} placeholder="Người dùng truy cập được trang chủ sau khi xác thực hợp lệ." /></Field><Field label="Luồng chính · mỗi dòng một bước"><Textarea rows={4} value={useCase.mainFlow} onChange={(e) => update("mainFlow", e.target.value)} placeholder={"A: Mở trang đăng nhập\nA: Nhập tài khoản hợp lệ\nS: Hệ thống xác thực và chuyển tới trang chủ"} /></Field></div><details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-violet-700 dark:text-violet-300">Bổ sung mã, rủi ro và các luồng ngoại lệ</summary><div className="mt-4 grid gap-4 md:grid-cols-3"><Field label="Mã Use Case"><Input value={useCase.code} onChange={(e) => update("code", e.target.value)} placeholder="UC-LOGIN-01" /></Field><Field label="Rủi ro"><Select value={useCase.risk} onChange={(e) => update("risk", e.target.value)}>{["Critical", "High", "Medium", "Low"].map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Tiền điều kiện"><Textarea rows={3} value={useCase.preconditions || ""} onChange={(e) => update("preconditions", e.target.value)} /></Field><Field label="Luồng thay thế"><Textarea rows={3} value={useCase.alternateFlows || ""} onChange={(e) => update("alternateFlows", e.target.value)} /></Field><Field label="Luồng lỗi / ngoại lệ"><Textarea rows={3} value={useCase.exceptionFlows || ""} onChange={(e) => update("exceptionFlows", e.target.value)} /></Field></div></details><div className="mt-4 flex justify-end"><Button disabled={!canCreate} onClick={() => addUseCase.mutate(reference)}>{addUseCase.isPending ? "Đang lưu…" : "Tạo Use Case nháp"}</Button></div></div>}

    {!!items.length && <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm font-semibold">Danh mục Use Case</p><span className="text-xs text-slate-500">{filteredItems.length}/{items.length} Use Case phù hợp bộ lọc</span></div>
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Tìm Use Case" className="h-9 w-56 text-xs" value={search} placeholder="Tìm mã, tên hoặc actor…" onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
          <Select aria-label="Lọc nguồn tạo Use Case" className="h-9 min-w-44 text-xs" value={originFilter} onChange={(event) => { setOriginFilter(event.target.value); setPage(1); }}><option value="All">Tất cả nguồn tạo</option><option value="Manual">Soạn thủ công</option><option value="AIProfile">AI từ Profile</option><option value="ImportedDocument">Trích xuất từ tài liệu</option><option value="Legacy">Chưa xác định</option></Select>
          <Select aria-label="Sắp xếp Use Case" className="h-9 min-w-36 text-xs" value={sortOrder} onChange={(event) => { setSortOrder(event.target.value); setPage(1); }}><option value="newest">Mới tạo trước</option><option value="oldest">Cũ tạo trước</option></Select>
        </div>
      </div>
      {!filteredItems.length ? <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500">Không có Use Case khớp bộ lọc.</p> : <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="min-w-[1040px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800"><tr><th className="px-3 py-3">Use Case</th><th className="px-3 py-3">Nguồn</th><th className="px-3 py-3">Trạng thái</th><th className="px-3 py-3">Actor</th><th className="px-3 py-3">Người tạo</th><th className="px-3 py-3">Ngày tạo</th><th className="px-3 py-3">Cập nhật</th><th className="px-3 py-3 text-right">Chi tiết</th></tr></thead><tbody>{visibleItems.map((item) => { const origin = getUseCaseOrigin(item); return <tr key={item._id} className="border-t border-slate-200 dark:border-slate-700"><td className="max-w-80 px-3 py-3"><p className="font-semibold text-slate-900 dark:text-white">{item.code || "Chưa có mã"} · {item.name}</p><p className="mt-1 truncate text-xs text-slate-500">{item.summary || "Chưa có mục tiêu"}</p></td><td className="px-3 py-3"><Badge tone={origin.tone}>{origin.label}</Badge></td><td className="px-3 py-3"><Badge tone={statusTone[item.status] || "slate"}>{item.status}</Badge></td><td className="px-3 py-3 text-xs">{item.actor || "—"}</td><td className="px-3 py-3 text-xs">{item.createdBy?.fullName || "Không rõ"}</td><td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600 dark:text-slate-300">{formatDocumentDate(item.createdAt)}</td><td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600 dark:text-slate-300">{formatDocumentDate(item.updatedAt)}</td><td className="px-3 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setSelectedItemId(item._id)}>Xem</Button></td></tr>; })}</tbody></table></div>}
      {filteredItems.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 text-xs"><span>Trang {currentPage}/{totalPages} · {visibleItems.length} mục</span><div className="flex items-center gap-2"><Select aria-label="Số Use Case mỗi trang" className="h-8 w-28 text-xs" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="10">10 / trang</option><option value="20">20 / trang</option><option value="50">50 / trang</option></Select><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Trước</Button><Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Sau</Button></div></div>}
      {selectedItem && <div className="border-t border-slate-200 pt-4 dark:border-slate-700"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">Use Case đang xem</p><Button size="sm" variant="outline" onClick={() => setSelectedItemId("")}>Đóng chi tiết</Button></div><UseCaseSpecificationCard item={selectedItem} approveUseCase={approveUseCase} confirmOrigin={confirmOrigin} /></div>}
    </div>}
    {approved.length > 0 && <div className="mt-5 flex justify-end"><Button variant="outline" onClick={onNext}>Tiếp tục User Story <ArrowRight className="h-4 w-4" /></Button></div>}
  </Card>;
}

function UseCaseList({ title, value, ordered = false }) {
  const rows = Array.isArray(value) ? value.filter(Boolean) : [];
  if (!rows.length) return null;
  const List = ordered ? "ol" : "ul";
  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
        {title}
      </p>
      <List
        className={`${ordered ? "list-decimal" : "list-disc"} mt-1 space-y-1 pl-5 text-sm leading-6 text-slate-700 dark:text-slate-200`}
      >
        {rows.map((row, index) => (
          <li key={index}>{row}</li>
        ))}
      </List>
    </section>
  );
}

function scenarioStep(rawStep, actor, index, type) {
  const raw = String(rawStep || "").trim();
  const role = raw.match(/^(A|Actor|S|System)\s*:\s*(.+)$/i);
  const reference = raw.match(/^((?:\d+)?[a-z])\s*[:.)-]\s*(.+)$/i);
  if (role) {
    const isSystem = /^(s|system)$/i.test(role[1]);
    return {
      scenario: isSystem ? "S: System" : `A: ${actor || "Actor"}`,
      step:
        type === "main"
          ? index + 1
          : `${type === "alternate" ? "ALT" : "EX"}-${index + 1}`,
      description: role[2],
    };
  }
  return {
    scenario: `A: ${actor || "Actor"}`,
    step:
      reference?.[1] ||
      (type === "main"
        ? index + 1
        : `${type === "alternate" ? "ALT" : "EX"}-${index + 1}`),
    description: reference?.[2] || raw,
  };
}

function ScenarioTable({ title, value, actor, type = "main" }) {
  const rows = (Array.isArray(value) ? value : [])
    .filter(Boolean)
    .map((step, index) => scenarioStep(step, actor, index, type));
  if (!rows.length) return null;
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
          {title}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[620px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            <tr>
              <th className="w-40 border-r border-slate-200 px-3 py-2.5 dark:border-slate-700">
                Kịch bản
              </th>
              <th className="w-28 border-r border-slate-200 px-3 py-2.5 dark:border-slate-700">
                Bước
              </th>
              <th className="px-3 py-2.5">Mô tả</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.step}-${index}`}
                className="border-t border-slate-200 align-top dark:border-slate-700"
              >
                <td className="border-r border-slate-200 px-3 py-3 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                  {row.scenario}
                </td>
                <td className="border-r border-slate-200 px-3 py-3 font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  {row.step}
                </td>
                <td className="px-3 py-3 leading-6 text-slate-800 dark:text-slate-100">
                  {row.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function registryOrigin(type, item) {
  if (type === "System Profile") return item.mode === "GitHubE2E" ? { label: "Phân tích GitHub", tone: "blue" } : { label: "Thiết lập thủ công", tone: "slate" };
  if (type === "Requirement") return item.source?.type === "ImportedCustomerDocument" ? { label: "Tài liệu khách hàng", tone: "blue" } : { label: "Nguồn yêu cầu", tone: "slate" };
  if (type === "Use Case") { const origin = getUseCaseOrigin(item); return { label: origin.label, tone: origin.tone }; }
  if (type === "User Story") return item.source === "AI" ? { label: "AI", tone: "purple" } : item.source === "GitHub" ? { label: "GitHub", tone: "blue" } : item.source === "ImportedDocument" ? { label: "Tài liệu User Story", tone: "blue" } : { label: "Thủ công", tone: "slate" };
  if (type === "Test Plan") return item.origin === "AI" ? { label: "AI", tone: "purple" } : item.origin === "Rule" ? { label: "Quy tắc hệ thống", tone: "blue" } : item.origin === "Board" ? { label: "Test Board", tone: "blue" } : item.origin === "Manual" ? { label: "Thủ công", tone: "slate" } : { label: "Chưa ghi nhận", tone: "amber" };
  if (type === "Test Suite") return item.origin === "SystemE2E" ? { label: "Tự tạo E2E", tone: "blue" } : item.origin === "Imported" ? { label: "Nhập dữ liệu", tone: "blue" } : { label: "Thủ công", tone: "slate" };
  const labels = { SystemE2E: "AI E2E từ Profile", UserStory: "AI từ User Story", UserStoryAndWeb: "AI từ User Story & Web", Manual: "Thủ công" };
  return { label: labels[item.generatedFrom] || "Chưa ghi nhận", tone: item.generatedFrom === "Manual" ? "slate" : item.generatedFrom ? "purple" : "amber" };
}

function DocumentRegister({ profile, profiles, requirements, useCases, stories, plans, suites, cases, setActiveStep }) {
  const [typeFilter, setTypeFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const profileId = String(profile?._id || "");
  const records = [
    ...profiles.filter((item) => String(item._id) === profileId).map((item) => ({ id: item._id, type: "System Profile", name: item.name, status: item.status, item, step: "requirement" })),
    ...requirements.map((item) => ({ id: item._id, type: "Requirement", name: `${item.requirementId || "Requirement"} · ${item.title}`, status: item.status, item, step: "requirement" })),
    ...useCases.map((item) => ({ id: item._id, type: "Use Case", name: item.name, status: item.status, item, step: "usecase" })),
    ...stories.map((item) => ({ id: item._id, type: "User Story", name: item.title, status: item.approvalStatus, item, step: "story" })),
    ...plans.map((item) => ({ id: item._id, type: "Test Plan", name: item.name, status: item.approvalStatus, item, step: "plan" })),
    ...suites.map((item) => ({ id: item._id, type: "Test Suite", name: item.name, status: "Ready", item, step: "suite" })),
    ...cases.map((item) => ({ id: item._id, type: "Test Case", name: item.title, status: item.status, item, step: "testcase" })),
  ].map((record) => ({ ...record, source: registryOrigin(record.type, record.item) }));
  const filtered = records.filter((record) => {
    const term = search.trim().toLocaleLowerCase();
    return (typeFilter === "All" || record.type === typeFilter) && (sourceFilter === "All" || record.source.label === sourceFilter) && (!term || [record.name, record.item.code, record.item.testCaseId].some((value) => String(value || "").toLocaleLowerCase().includes(term)));
  }).sort((a, b) => new Date(b.item.updatedAt || b.item.createdAt || 0) - new Date(a.item.updatedAt || a.item.createdAt || 0));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const typeCount = Object.fromEntries(["System Profile", "Requirement", "Use Case", "User Story", "Test Plan", "Test Suite", "Test Case"].map((type) => [type, records.filter((record) => record.type === type).length]));
  const sourceOptions = [...new Set(records.map((record) => record.source.label))];
  return <Card className="p-5">
    <SectionTitle title="Danh mục tài liệu" description="Một nơi để tra cứu và quản lý toàn bộ tài liệu thuộc Profile hiện tại. Danh sách gọn, có tìm kiếm, nguồn tạo và lịch sử ngày tháng; mở đúng bước để chỉnh sửa nội dung." />
    {!profileId ? <p className="mt-5 rounded-lg border border-dashed p-4 text-sm text-slate-500">Chọn System Profile trước để xem danh mục tài liệu theo phạm vi.</p> : <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">{Object.entries(typeCount).map(([type, count]) => <button type="button" key={type} onClick={() => { setTypeFilter(type); setPage(1); }} className={`rounded-xl border p-3 text-left ${typeFilter === type ? "border-violet-400 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30" : "border-slate-200 dark:border-slate-700"}`}><p className="text-xl font-bold">{count}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{type}</p></button>)}</div>
      <div className="mt-5 flex flex-wrap gap-2"><Input className="h-9 w-64 text-xs" value={search} placeholder="Tìm tên, mã hoặc Test Case ID…" onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><Select className="h-9 min-w-40 text-xs" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}><option value="All">Tất cả loại tài liệu</option>{Object.keys(typeCount).map((type) => <option key={type} value={type}>{type}</option>)}</Select><Select className="h-9 min-w-44 text-xs" value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setPage(1); }}><option value="All">Tất cả nguồn tạo</option>{sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}</Select></div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="min-w-[1050px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800"><tr><th className="px-3 py-3">Tài liệu</th><th className="px-3 py-3">Loại</th><th className="px-3 py-3">Nguồn</th><th className="px-3 py-3">Trạng thái</th><th className="px-3 py-3">Chất lượng</th><th className="px-3 py-3">Người tạo</th><th className="px-3 py-3">Ngày tạo</th><th className="px-3 py-3">Cập nhật</th><th className="px-3 py-3 text-right">Thao tác</th></tr></thead><tbody>{pageRows.map((record) => <tr key={`${record.type}-${record.id}`} className="border-t border-slate-200 dark:border-slate-700"><td className="max-w-96 px-3 py-3 font-semibold">{record.name || "Chưa đặt tên"}</td><td className="px-3 py-3 text-xs">{record.type}</td><td className="px-3 py-3"><Badge tone={record.source.tone}>{record.source.label}</Badge></td><td className="px-3 py-3"><Badge tone={statusTone[record.status] || "slate"}>{record.status || "—"}</Badge></td><td className="px-3 py-3"><DocumentQualityBadge quality={record.item.quality} /></td><td className="px-3 py-3 text-xs">{record.item.createdBy?.fullName || "Không rõ"}</td><td className="whitespace-nowrap px-3 py-3 text-xs">{formatDocumentDate(record.item.createdAt)}</td><td className="whitespace-nowrap px-3 py-3 text-xs">{formatDocumentDate(record.item.updatedAt)}</td><td className="px-3 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setActiveStep(record.step)}>Mở</Button></td></tr>)}</tbody></table></div>
      {!pageRows.length && <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-slate-500">Không có tài liệu khớp điều kiện lọc.</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs"><span>{filtered.length} tài liệu · Trang {currentPage}/{totalPages}</span><div className="flex items-center gap-2"><Select className="h-8 w-28 text-xs" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="10">10 / trang</option><option value="20">20 / trang</option><option value="50">50 / trang</option></Select><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Trước</Button><Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Sau</Button></div></div>
    </>}
  </Card>;
}

function getUseCaseOrigin(item) {
  if (item.origin === "Manual") return { key: "Manual", label: "Soạn thủ công", tone: "slate", detail: "QA tự tạo" };
  if (item.origin === "AIProfile") return { key: "AIProfile", label: "AI từ Profile", tone: "purple", detail: "AI gợi ý từ System Profile" };
  if (item.origin === "ImportedDocument" || item.evidence?.source === "UploadedUseCaseDocument") return { key: "ImportedDocument", label: "Trích xuất từ tài liệu", tone: "blue", detail: item.originDetail?.fileName || item.evidence?.fileName || "Tài liệu đã tải lên" };
  return { key: "Legacy", label: "Chưa xác định nguồn", tone: "amber", detail: "Tạo trước khi hệ thống theo dõi nguồn" };
}

function formatDocumentDate(value) {
  if (!value) return "Chưa có dữ liệu";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Chưa có dữ liệu" : date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function UseCaseSpecificationCard({ item, approveUseCase, confirmOrigin }) {
  const approved = item.status === "Approved";
  const origin = getUseCaseOrigin(item);
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone[item.status] || "slate"}>
              {item.status}
            </Badge>
            <Badge tone={origin.tone}>{origin.label}</Badge>
            <DocumentQualityBadge quality={item.quality} />
            <Badge
              tone={
                item.risk === "Critical"
                  ? "red"
                  : item.risk === "High"
                    ? "amber"
                    : "blue"
              }
            >
              {item.risk || "Medium"}
            </Badge>
            <span className="text-xs font-semibold text-slate-500">
              {item.code || "Chưa có mã"}
            </span>
          </div>
          <h3 className="mt-2 text-base font-bold text-slate-900 dark:text-white">
            {item.name || "Use Case chưa đặt tên"}
          </h3>
          <p className="mt-1 text-xs text-slate-500">Nguồn: {origin.detail}</p>
        </div>
        <p className="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-300">
          Actor:{" "}
          <span className="font-semibold text-slate-900 dark:text-white">
            {item.actor || "Chưa khai báo"}
          </span>
        </p>
      </div>
      <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Mục tiêu nghiệp vụ
          </p>
          <p className="mt-1 leading-6 text-slate-700 dark:text-slate-200">
            {item.summary || "Chưa khai báo"}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Kích hoạt
          </p>
          <p className="mt-1 leading-6 text-slate-700 dark:text-slate-200">
            {item.trigger || "Chưa khai báo"}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
        <span>Tạo: {formatDocumentDate(item.createdAt)}</span>
        <span>Cập nhật: {formatDocumentDate(item.updatedAt)}</span>
        {item.approvedAt && <span>Duyệt: {formatDocumentDate(item.approvedAt)}</span>}
      </div>
      {origin.key === "Legacy" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <span className="font-medium">Xác nhận nguồn lịch sử:</span>
          <Select
            aria-label="Xác nhận nguồn tạo Use Case"
            className="h-8 min-w-48 bg-white text-xs dark:bg-slate-900"
            defaultValue=""
            disabled={confirmOrigin?.isPending}
            onChange={(event) => {
              if (event.target.value) confirmOrigin?.mutate({ id: item._id, origin: event.target.value });
            }}
          >
            <option value="">Chọn nguồn thực tế</option>
            <option value="Manual">QA soạn thủ công</option>
            <option value="AIProfile">AI gợi ý từ Profile</option>
            <option value="ImportedDocument">Trích xuất từ tài liệu</option>
          </Select>
        </div>
      )}
      <div className="mt-3"><DocumentQualityNotice quality={item.quality} action="duyệt Use Case" /></div>
      <details className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <summary className="cursor-pointer text-sm font-semibold text-violet-700 dark:text-violet-300">
          Mở đặc tả và luồng xử lý
        </summary>
        <div className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-2">
          <UseCaseList title="Tiền điều kiện" value={item.preconditions} />
          <UseCaseList title="Hậu điều kiện" value={item.postconditions} />
          <UseCaseList title="Quy tắc nghiệp vụ" value={item.businessRules} />
          <UseCaseList title="Giả định" value={item.assumptions} />
          <UseCaseList title="Phụ thuộc" value={item.dependencies} />
        </div>
        <div className="mt-5 space-y-4">
          <ScenarioTable
            title="Luồng chính"
            value={item.mainFlow}
            actor={item.actor}
          />
          <ScenarioTable
            title="Luồng thay thế"
            value={item.alternateFlows}
            actor={item.actor}
            type="alternate"
          />
          <ScenarioTable
            title="Luồng lỗi / ngoại lệ"
            value={item.exceptionFlows}
            actor={item.actor}
            type="exception"
          />
        </div>
      </details>
      {!approved && (
        <div className="mt-4 flex justify-end border-t border-slate-100 pt-3 dark:border-slate-800">
          <Button
            size="sm"
            onClick={() => approveUseCase.mutate(item._id)}
            disabled={approveUseCase.isPending || item.quality?.canApprove === false}
          >
            Duyệt Use Case
          </Button>
        </div>
      )}
    </article>
  );
}
function UserStoryStep({
  intakeOnly = false,
  reference = "",
  project,
  profile,
  intake,
  useCases,
  requirements,
  stories,
  generateStory,
  StoryDraftCard,
  user,
  updateStory,
  submitStory,
  qaReviewStory,
  download,
  onNext,
  setActiveStep,
}) {
  const qc = useQueryClient();
  const [useCaseId, setUseCaseId] = useState("");
  const documentKind = "UserStory";
  const [mode, setMode] = useState("manual");
  const emptyDraft = () => ({ title: "", externalId: "", version: "", actor: "", goal: "", benefit: "", description: "", criteria: "", priority: "Medium", storyPoints: "3", estimatedHours: "", labels: "", businessValue: "", inScope: "", outOfScope: "", nonFunctionalRequirements: "", risks: "", assumptions: "", dependencies: "", definitionOfReady: "", definitionOfDone: "", testDataRequirements: "", dataRestrictions: "", parentRequirements: [] });
  const [draft, setDraft] = useState(emptyDraft);
  const [importMeta, setImportMeta] = useState({ externalId: "", version: "", system: "File", effectiveAt: new Date().toISOString().slice(0, 10), parentRequirements: [] });
  const intakeSystem = intake?.sourceSystem === "Jira" ? "Jira" : intake?.sourceSystem === "AzureDevOps" ? "AzureDevOps" : intake?.sourceSystem === "Customer" || intake?.sourceSystem === "ProductOwner" ? "Other" : "File";
  const resolvedImportMeta = {
    ...importMeta,
    system: importMeta.system === "File" ? intakeSystem : importMeta.system,
    externalId: importMeta.externalId || intake?.externalId || "",
    version: importMeta.version || intake?.version || "",
    effectiveAt: importMeta.effectiveAt || intake?.receivedAt || null,
  };
  const approvedUseCases = (useCases.data || []).filter(
    (item) => item.status === "Approved",
  );
  const approvedStories = stories.filter(
    (item) => item.approvalStatus === "Approved",
  );
  const createManual = useMutation({
    mutationFn: () => requirementApi.createStory({
      project,
      reference,
      title: draft.title.trim(),
      description: draft.description.trim() || `As a ${draft.actor.trim()}, I want ${draft.goal.trim()}, so that ${draft.benefit.trim()}.`,
      acceptanceCriteria: lines(draft.criteria).map((criteria) => ({ criteria })),
      priority: draft.priority,
      storyPoints: Number(draft.storyPoints) || 0,
      estimatedHours: Number(draft.estimatedHours) || 0,
      labels: lines(draft.labels),
      businessValue: draft.businessValue.trim(),
      inScope: lines(draft.inScope), outOfScope: lines(draft.outOfScope),
      nonFunctionalRequirements: lines(draft.nonFunctionalRequirements), risks: lines(draft.risks),
      assumptions: lines(draft.assumptions), dependencies: lines(draft.dependencies),
      definitionOfReady: lines(draft.definitionOfReady), definitionOfDone: lines(draft.definitionOfDone),
      testDataRequirements: lines(draft.testDataRequirements), dataRestrictions: lines(draft.dataRestrictions),
      parentRequirements: draft.parentRequirements,
      source: "Manual",
      approvalStatus: "Draft",
      externalReference: {
        system: intakeSystem === "File" ? "Other" : intakeSystem,
        externalId: draft.externalId.trim() || intake?.externalId || "",
        version: draft.version.trim() || intake?.version || "",
      },
      e2e: { systemProfile: profile._id, requirements: draft.parentRequirements, definitionOfDone: lines(draft.definitionOfDone), assumptions: lines(draft.assumptions), dependencies: lines(draft.dependencies) },
    }),
    onSuccess: () => {
      setDraft(emptyDraft());
      toast.success("Đã lưu User Story nháp.");
      qc.invalidateQueries({ queryKey: ["e2e-stories"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const upload = useMutation({
    mutationFn: async (file) => {
      const result = await aiApi.suggestUserStoryDocument(project, file, documentKind);
      const suggestions = result.suggestions || (result.suggestion ? [result.suggestion] : []);
      return Promise.all(suggestions.map((suggestion) => requirementApi.createStory({
        ...suggestion,
        project,
      reference,
        source: documentKind === "UserStory" ? "ImportedDocument" : "AI",
        sourceDocument: documentKind === "UserStory" ? result.document : { fileName: file.name, documentType: "Requirement", extractedAt: new Date().toISOString() },
        externalReference: documentKind === "UserStory" ? { system: resolvedImportMeta.system, externalId: suggestion.externalId || resolvedImportMeta.externalId, version: resolvedImportMeta.version, effectiveAt: resolvedImportMeta.effectiveAt || null } : undefined,
        parentRequirements: documentKind === "UserStory" ? resolvedImportMeta.parentRequirements : [],
        approvalStatus: "Draft",
        e2e: { systemProfile: profile?._id || profile },
      })));
    },
    onSuccess: (created) => {
      toast.success(documentKind === "UserStory" ? `Đã trích xuất ${created.length} User Story từ tài liệu. Hãy kiểm tra trước khi gửi duyệt.` : "AI đã tạo User Story nháp từ tài liệu yêu cầu. Hãy kiểm tra và gửi duyệt.");
      qc.invalidateQueries({ queryKey: ["e2e-stories"] });
    },
    onError: (error) =>
      toast.error(error.message || "Không thể xử lý tài liệu."),
  });
  return (
    <Card className="p-5">
      <SectionTitle
        title="Chuẩn hóa User Story"
        description="Thêm User Story từ backlog hoặc soạn bản nháp dựa trên nghiệp vụ đã duyệt."
      />
      <div className="mt-4 flex flex-wrap gap-2">
        {[["manual", "Tự nhập"], ["upload", "Tải tài liệu có sẵn"], ["ai", "AI soạn từ Use Case đã duyệt"]].filter(([key]) => !intakeOnly || key !== "ai").map(([key, label]) => (
          <Button key={key} type="button" variant={mode === key ? "default" : "outline"} aria-pressed={mode === key} onClick={() => setMode(key)}>{label}</Button>
        ))}
      </div>
      {mode === "manual" && <div className="mt-4 space-y-4">
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20">
          <p className="text-sm font-semibold">Nội dung cốt lõi</p><p className="mt-1 text-xs text-slate-500">Chỉ cần hoàn thành các trường này để lưu bản nháp. Những thông tin chi tiết có thể bổ sung sau.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2"><Field className="md:col-span-2" label="Tiêu đề *"><Input maxLength={300} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="US-ORDER-001 · Đặt món từ nhà hàng" /></Field><Field label="Với vai trò *"><Input value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })} placeholder="Khách hàng" /></Field><Field label="Tôi muốn *"><Input value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} placeholder="chọn món và đặt hàng" /></Field><Field className="md:col-span-2" label="Để *"><Input value={draft.benefit} onChange={(e) => setDraft({ ...draft, benefit: e.target.value })} placeholder="nhận món phù hợp tại địa chỉ đã chọn." /></Field><Field className="md:col-span-2" label="Acceptance Criteria * · mỗi dòng một tiêu chí"><Textarea rows={4} value={draft.criteria} onChange={(e) => setDraft({ ...draft, criteria: e.target.value })} placeholder={"Given khách hàng đã chọn món hợp lệ\nWhen khách hàng xác nhận đặt hàng\nThen hệ thống tạo đơn và hiển thị mã đơn."} /></Field></div>
        </div>
        <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><summary className="cursor-pointer text-sm font-semibold text-violet-700 dark:text-violet-300">Bổ sung chi tiết: phạm vi, ưu tiên, truy vết, rủi ro và dữ liệu</summary><p className="mt-1 text-xs text-slate-500">Mở khi bạn cần làm rõ phạm vi hoặc chuẩn bị hồ sơ đầy đủ để review.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Phạm vi User Story" hint="Một lát cắt nhỏ có thể bàn giao và kiểm thử trong một feature hoặc flow."><Textarea rows={2} value={draft.inScope} onChange={(e) => setDraft({ ...draft, inScope: e.target.value })} placeholder="Ví dụ: Checkout — khách hàng áp mã voucher và xác nhận đơn hàng." /></Field><Field label="Mã nguồn / phiên bản"><div className="grid grid-cols-2 gap-2"><Input value={draft.externalId} onChange={(e) => setDraft({ ...draft, externalId: e.target.value })} placeholder="US-123" /><Input value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} placeholder="v1.0" /></div></Field><Field label="Ưu tiên · Story Point · Giờ ước tính"><div className="grid grid-cols-3 gap-2"><Select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>{["Critical", "High", "Medium", "Low"].map((item) => <option key={item}>{item}</option>)}</Select><Select value={draft.storyPoints} onChange={(e) => setDraft({ ...draft, storyPoints: e.target.value })}>{["1", "2", "3", "5", "8", "13", "21"].map((item) => <option key={item} value={item}>{item} SP</option>)}</Select><Input type="number" min="0" step="0.5" value={draft.estimatedHours} onChange={(e) => setDraft({ ...draft, estimatedHours: e.target.value })} placeholder="Giờ" /></div></Field><Field label="Giá trị nghiệp vụ"><Textarea rows={2} value={draft.businessValue} onChange={(e) => setDraft({ ...draft, businessValue: e.target.value })} placeholder="Giảm thời gian đặt món, tăng tỷ lệ hoàn tất đơn." /></Field><Field className="md:col-span-2" label="Diễn giải bổ sung"><Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Bổ sung bối cảnh nghiệp vụ nếu cần." /></Field><Field label="Requirement nguồn / truy vết"><Select multiple className="min-h-24" value={draft.parentRequirements} onChange={(event) => setDraft({ ...draft, parentRequirements: [...event.target.selectedOptions].map((item) => item.value) })}>{(requirements?.data || []).filter((item) => item.status === "Baselined").map((item) => <option key={item._id} value={item._id}>{item.requirementId} · {item.title}</option>)}</Select></Field><Field label="Definition of Ready"><Textarea rows={3} value={draft.definitionOfReady} onChange={(e) => setDraft({ ...draft, definitionOfReady: e.target.value })} placeholder="Requirement đã Baseline\nThiết kế/API liên quan đã rõ" /></Field><Field label="Tags · mỗi dòng một tag"><Input value={draft.labels} onChange={(e) => setDraft({ ...draft, labels: e.target.value })} placeholder="Order\nCustomer\nMVP" /></Field><Field label="Ngoài phạm vi"><Textarea rows={3} value={draft.outOfScope} onChange={(e) => setDraft({ ...draft, outOfScope: e.target.value })} /></Field><Field label="Yêu cầu phi chức năng"><Textarea rows={3} value={draft.nonFunctionalRequirements} onChange={(e) => setDraft({ ...draft, nonFunctionalRequirements: e.target.value })} placeholder="Phản hồi dưới 3 giây…" /></Field><Field label="Rủi ro"><Textarea rows={3} value={draft.risks} onChange={(e) => setDraft({ ...draft, risks: e.target.value })} /></Field><Field label="Giả định"><Textarea rows={3} value={draft.assumptions} onChange={(e) => setDraft({ ...draft, assumptions: e.target.value })} /></Field><Field label="Phụ thuộc"><Textarea rows={3} value={draft.dependencies} onChange={(e) => setDraft({ ...draft, dependencies: e.target.value })} /></Field><Field label="Dữ liệu test cần có"><Textarea rows={3} value={draft.testDataRequirements} onChange={(e) => setDraft({ ...draft, testDataRequirements: e.target.value })} /></Field><Field label="Dữ liệu cấm sử dụng"><Textarea rows={3} value={draft.dataRestrictions} onChange={(e) => setDraft({ ...draft, dataRestrictions: e.target.value })} placeholder="PII thật, mật khẩu, token, dữ liệu production" /></Field><Field className="md:col-span-2" label="Definition of Done"><Textarea rows={3} value={draft.definitionOfDone} onChange={(e) => setDraft({ ...draft, definitionOfDone: e.target.value })} placeholder="Acceptance Criteria được QA xác nhận\nKhông còn lỗi Critical/High\nTài liệu và bằng chứng đã cập nhật" /></Field></div></details>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800"><p className="text-xs text-slate-500">Bạn có thể bổ sung phạm vi, truy vết và rủi ro sau khi lưu nháp.</p><Button disabled={!draft.title.trim() || !draft.actor.trim() || !draft.goal.trim() || !draft.benefit.trim() || !lines(draft.criteria).length || createManual.isPending} onClick={() => createManual.mutate()}>{createManual.isPending ? "Đang lưu…" : "Lưu User Story nháp"}</Button></div>
      </div>}
      {mode === "upload" && <div className="mt-5 rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20">
        {documentKind === "UserStory" && <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70 md:grid-cols-2"><Field label="Nguồn hệ thống"><Select value={resolvedImportMeta.system} onChange={(event) => setImportMeta((value) => ({ ...value, system: event.target.value }))}>{["File", "Jira", "AzureDevOps", "Other"].map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="External ID / mã backlog"><Input value={resolvedImportMeta.externalId} onChange={(event) => setImportMeta((value) => ({ ...value, externalId: event.target.value }))} placeholder="PROJ-123 (nếu cả tệp có cùng mã)" /></Field><Field label="Phiên bản"><Input value={resolvedImportMeta.version} onChange={(event) => setImportMeta((value) => ({ ...value, version: event.target.value }))} placeholder="v2.1" /></Field><Field label="Ngày hiệu lực"><Input type="date" value={resolvedImportMeta.effectiveAt} onChange={(event) => setImportMeta((value) => ({ ...value, effectiveAt: event.target.value }))} /></Field><Field className="md:col-span-2" label="Requirement cha (tuỳ chọn)"><Select multiple className="min-h-24" value={resolvedImportMeta.parentRequirements} onChange={(event) => setImportMeta((value) => ({ ...value, parentRequirements: [...event.target.selectedOptions].map((item) => item.value) }))}>{(requirements?.data || []).filter((item) => item.status === "Baselined").map((item) => <option key={item._id} value={item._id}>{item.requirementId} · {item.title}</option>)}</Select></Field></div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-600 dark:text-slate-300">Hỗ trợ PDF, DOC, DOCX · tối đa 10 MB · nội dung luôn cần được rà soát trước khi gửi duyệt.</p>
        <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700">
          {upload.isPending ? "Đang xử lý tài liệu…" : "Tải và trích xuất User Story"}
          <input
            className="hidden"
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={upload.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      </div>}
      {mode === "ai" && <>
      <p className="mt-4 text-sm text-slate-500">AI chuyển Use Case đã duyệt thành User Story nháp để rà soát và gửi duyệt.</p>
      {!approvedUseCases.length && (
        <div className="mt-4 rounded-lg border border-dashed p-3 text-xs leading-5 text-slate-500">
          Chưa có Use Case được duyệt để sinh User Story từ hành trình.{" "}
          <button
            type="button"
            className="font-semibold text-violet-600 underline"
            onClick={() => setActiveStep("usecase")}
          >
            Tạo hoặc duyệt Use Case
          </button>
          . Bạn vẫn có thể tải tài liệu ở trên.
        </div>
      )}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Select
          disabled={!approvedUseCases.length}
          value={useCaseId}
          onChange={(e) => setUseCaseId(e.target.value)}
        >
          <option value="">Chọn Use Case đã duyệt</option>
          {approvedUseCases.map((item) => (
            <option key={item._id} value={item._id}>
              {item.code} · {item.name}
            </option>
          ))}
        </Select>
        <Button
          disabled={!useCaseId || generateStory.isPending}
          onClick={() => generateStory.mutate(useCaseId)}
        >
          {generateStory.isPending ? "Đang sinh…" : "Nhờ AI sinh từ Use Case"}
        </Button>
      </div>
      </>}
      <div className="mt-6 space-y-2">
        {stories.map((item) => (
          <StoryDraftCard
            key={`${item._id}-${item.updatedAt || ""}`}
            item={item}
            currentUser={user}
            updateStory={updateStory}
            submitStory={submitStory}
            qaReviewStory={qaReviewStory}
            download={download}
          />
        ))}
      </div>
      {approvedStories.length > 0 && (
        <Button variant="outline" className="mt-4" onClick={onNext}>
          Tiếp tục Test Plan <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </Card>
  );
}
function ProfileConfig({
  profile,
  profileMode,
  setProfileMode,
  setProfile,
  currentProfile,
  profiles,
  newProfile,
  selectProfile,
  createProfile,
  updateProfile,
  integrations,
  activeProject,
  projects,
  github,
  git,
  setGit,
  analyzeGithub,
  GitHubForm,
  onNext,
}) {
  const [editingGitHubProfile, setEditingGitHubProfile] = useState(false);
  const change = (key, value) => setProfile({ ...profile, [key]: value });
  const save = currentProfile ? updateProfile : createProfile;
  const sourceReady =
    currentProfile?.mode !== "GitHubE2E" ||
    Boolean(
      currentProfile.repository?.fullName &&
        currentProfile.repository?.commitSha,
    );
  if (!activeProject)
    return (
      <Card className="p-5">
        <SectionTitle
          title="Bắt đầu với một project"
          description="Project lưu các yêu cầu, Profile và kết quả kiểm thử của cùng một sản phẩm."
        />
        {projects.isPending ? (
          <p className="mt-4 text-sm text-slate-500">Đang tải project…</p>
        ) : projects.isError ? (
          <div className="mt-4">
            <p className="text-sm text-rose-600">
              Không tải được danh sách project.
            </p>
            <Button
              className="mt-2"
              variant="outline"
              onClick={() => projects.refetch()}
            >
              Thử tải lại
            </Button>
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-slate-500">
              Chọn project phía trên hoặc tạo project mới trước.
            </p>
            <Button className="mt-3" asChild>
              <Link to="/projects">Mở danh sách project</Link>
            </Button>
          </>
        )}
      </Card>
    );
  return (
    <Card className="border-slate-200 p-5 dark:border-slate-700 sm:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          Bước 1 · Bắt đầu
        </p>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950 dark:text-white">
          Nguồn và phạm vi hệ thống
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700 dark:text-slate-300">
          Profile lưu ngữ cảnh chung cho Use Case, User Story và Test Case. Chưa
          cần URL hoặc môi trường chạy để tạo tài liệu.
        </p>
      </div>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div>
          <Field label="Tên Profile *">
            <Input
              value={profile.name}
              onChange={(e) => change("name", e.target.value)}
              placeholder="Ví dụ: Kiểm thử đặt món FoodRush"
            />
          </Field>
          <p className="mt-2 text-sm font-medium leading-5 text-slate-700 dark:text-slate-200">
            Đặt tên để dễ tìm lại hồ sơ.
          </p>
        </div>
        <div>
          {profiles.isPending ? (
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Đang tải Profile…
            </p>
          ) : profiles.isError ? (
            <div className="text-sm text-rose-700 dark:text-rose-300">
              <p>Không tải được Profile của project.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => profiles.refetch()}
              >
                Thử tải lại
              </Button>
            </div>
          ) : (profiles.data || []).length ? (
            <>
              <Field label="Profile đã lưu">
                <Select
                  value={currentProfile?._id || ""}
                  onChange={(e) => {
                    setEditingGitHubProfile(false);
                    selectProfile(e.target.value);
                  }}
                >
                  <option value="">Tạo Profile mới</option>
                  {profiles.data.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="mt-2 text-sm leading-5 text-slate-600 dark:text-slate-300">
                Chọn hồ sơ đã lưu để tiếp tục.
              </p>
            </>
          ) : (
            <p className="pt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Chưa có Profile trong project này. Hãy tạo hồ sơ đầu tiên.
            </p>
          )}
        </div>
      </div>
      {!currentProfile && (
        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Chọn nguồn để bắt đầu
          </legend>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {[
              {
                value: "SystemProfile",
                title: "Mô tả hoặc tài liệu yêu cầu",
                detail:
                  "Tự mô tả hệ thống; có thể tải tài liệu ở bước User Story.",
                Icon: FileCheck2,
              },
              {
                value: "GitHubE2E",
                title: "Repository GitHub",
                detail:
                  "Phân tích mã nguồn để thiết kế tài liệu, không cần Docker.",
                Icon: FileCode2,
              },
            ].map(({ value, title, detail, Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={profileMode === value}
                onClick={() => setProfileMode(value)}
                className={`flex min-h-24 items-start gap-3 rounded-xl border p-4 text-left transition duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${profileMode === value ? "border-violet-600 bg-violet-50 ring-1 ring-violet-600 dark:border-violet-400 dark:bg-violet-950/50 dark:ring-violet-400" : "border-slate-200 bg-white hover:border-violet-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-violet-400"}`}
              >
                <Icon
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-violet-700 dark:text-violet-300"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-900 dark:text-white">
                    {title}
                  </span>
                  <span className="mt-1 block text-sm font-medium leading-5 text-slate-700 dark:text-slate-200">
                    {detail}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {currentProfile?.mode === "GitHubE2E" && !editingGitHubProfile && (
        <GitHubProfileSummary
          profile={currentProfile}
          sourceReady={sourceReady}
          onEdit={() => setEditingGitHubProfile(true)}
          onCreate={newProfile}
          onNext={onNext}
        />
      )}
      {!currentProfile && profileMode === "GitHubE2E" ? (
        <div className="mt-6">
          <GitHubForm
            {...{
              github,
              integrations,
              git,
              setGit,
              analyzeGithub,
              activeProject,
              profile,
            }}
          />
        </div>
      ) : (
        !(currentProfile?.mode === "GitHubE2E" && !editingGitHubProfile) && (
          <>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field label="Mô tả hệ thống và phạm vi kiểm thử">
                  <Textarea
                    rows={3}
                    value={profile.description || ""}
                    onChange={(e) => change("description", e.target.value)}
                    placeholder="Ví dụ: Sinh viên đăng nhập, tìm khóa học và nộp bài tập. Mô tả những gì đã biết; nội dung chưa rõ sẽ cần QA xác nhận."
                  />
                </Field>
              </div>
              <div>
                <Field label="Website tham khảo (tuỳ chọn)">
                  <Input
                    value={profile.referenceUrl || ""}
                    onChange={(e) => change("referenceUrl", e.target.value)}
                    placeholder="https://example.com"
                  />
                </Field>
                <p className="mt-2 text-sm font-medium leading-5 text-slate-700 dark:text-slate-200">
                  Chỉ lưu để tham khảo; không tự đọc website hoặc dùng làm môi
                  trường chạy.
                </p>
              </div>
              <div>
                <Field label="Vai trò / tham chiếu tài khoản (tuỳ chọn)">
                  <Input
                    value={profile.roles}
                    onChange={(e) => change("roles", e.target.value)}
                    placeholder="Sinh viên | /login | student-e2e"
                  />
                </Field>
                <p className="mt-2 text-sm font-medium leading-5 text-slate-700 dark:text-slate-200">
                  Chỉ nhập tham chiếu; không nhập mật khẩu hoặc thông tin bí
                  mật.
                </p>
              </div>
            </div>
            <div className="mt-7 flex flex-col gap-3 border-t border-slate-200 pt-5 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium leading-5 text-slate-700 dark:text-slate-200">
                Bạn có thể dừng sau khi xuất tài liệu; môi trường được chọn ở
                bước thực thi.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditingGitHubProfile(false)}
                  className={
                    currentProfile?.mode === "GitHubE2E" ? "" : "hidden"
                  }
                >
                  Xem Profile
                </Button>
                <Button
                  size="lg"
                  className="shrink-0 bg-gradient-to-r from-violet-800 to-indigo-700 text-white shadow-[0_8px_22px_-8px_rgba(109,40,217,0.65)] enabled:hover:from-violet-900 enabled:hover:to-indigo-800 disabled:shadow-none"
                  disabled={!activeProject || !profile.name || save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending
                    ? "Đang lưu…"
                    : currentProfile
                      ? "Lưu Profile"
                      : "Tạo Profile"}
                </Button>
              </div>
            </div>
          </>
        )
      )}
      {currentProfile &&
        !(currentProfile.mode === "GitHubE2E" && !editingGitHubProfile) && (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={newProfile}>
              Tạo Profile mới
            </Button>
            <Button disabled={!sourceReady} onClick={onNext}>
              Tiếp tục Use Case <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
    </Card>
  );
}

function GitHubProfileSummary({
  profile,
  sourceReady,
  onEdit,
  onCreate,
  onNext,
}) {
  const map = profile.systemMap || {};
  const modules = Array.isArray(map.modules) ? map.modules : [];
  const risks = Array.isArray(map.risks) ? map.risks : [];
  const files = profile.repository?.selectedPaths || [];
  return (
    <section className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 dark:border-emerald-900 dark:bg-emerald-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
            Profile GitHub đã tạo
          </p>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
            Đây là ngữ cảnh đã lưu từ nguồn bạn chọn; không cần tạo lại hoặc
            điền form rỗng.
          </p>
        </div>
        <Badge tone="green">Ready</Badge>
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Repository</dt>
          <dd className="mt-1 break-all font-semibold">
            {profile.repository?.fullName || "Chưa xác định"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Branch</dt>
          <dd className="mt-1 font-semibold">
            {profile.repository?.ref || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Commit</dt>
          <dd className="mt-1 break-all font-semibold">
            {profile.repository?.commitSha?.slice(0, 12) || "Chưa xác định"}
          </dd>
        </div>
      </dl>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-white/70 p-3 dark:bg-slate-900/50">
          <strong>{modules.length}</strong>
          <p className="mt-1 text-xs text-slate-500">module được nhận diện</p>
        </div>
        <div className="rounded-lg bg-white/70 p-3 dark:bg-slate-900/50">
          <strong>{files.length}</strong>
          <p className="mt-1 text-xs text-slate-500">
            tệp đã dùng để phân tích
          </p>
        </div>
        <div className="rounded-lg bg-white/70 p-3 dark:bg-slate-900/50">
          <strong>{risks.length}</strong>
          <p className="mt-1 text-xs text-slate-500">rủi ro cần lưu ý</p>
        </div>
      </div>
      <details className="mt-5 rounded-lg border border-emerald-200 bg-white/70 p-3 text-sm dark:border-emerald-900 dark:bg-slate-900/50">
        <summary className="cursor-pointer font-semibold">
          Xem System Map và tệp nguồn
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <p className="font-semibold">Modules</p>
            {modules.length ? (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
                {modules.map((item, index) => (
                  <li key={`${item.name || "module"}-${index}`}>
                    {item.name || "Chưa đặt tên"}
                    {Array.isArray(item.routes) && item.routes.length
                      ? ` · ${item.routes.join(", ")}`
                      : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-slate-500">
                AI chưa xác định module rõ ràng.
              </p>
            )}
          </div>
          <div>
            <p className="font-semibold">Rủi ro</p>
            {risks.length ? (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
                {risks.map((risk, index) => (
                  <li key={index}>
                    {typeof risk === "string" ? risk : JSON.stringify(risk)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-slate-500">Chưa có rủi ro được nêu.</p>
            )}
          </div>
          <div>
            <p className="font-semibold">Tệp nguồn ({files.length})</p>
            <ul className="mt-1 max-h-40 list-disc space-y-1 overflow-auto break-all pl-5 text-slate-700 dark:text-slate-300">
              {files.map((file) => (
                <li key={file}>{file}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onEdit}>
          Chỉnh sửa ghi chú
        </Button>
        <Button variant="outline" onClick={onCreate}>
          Tạo Profile mới
        </Button>
        <Button disabled={!sourceReady} onClick={onNext}>
          Tiếp tục Use Case <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
function Overview({ title, description, count, action, to }) {
  return (
    <Card className="p-8 text-center">
      <CheckCircle2 className="mx-auto h-10 w-10 text-violet-500" />
      <h2 className="mt-3 text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        {description}
      </p>
      {typeof count === "number" && (
        <p className="mt-3 text-sm font-semibold text-violet-600">
          {count} mục đã được duyệt
        </p>
      )}
      <Button className="mt-5" asChild>
        <Link to={to}>
          {action}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </Card>
  );
}
function Blocked({ title, description, onClick }) {
  return (
    <Card className="p-8 text-center">
      <FileCheck2 className="mx-auto h-10 w-10 text-amber-500" />
      <h2 className="mt-3 text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
        {description}
      </p>
      <Button className="mt-5" onClick={onClick}>
        Mở bước cần hoàn tất
      </Button>
    </Card>
  );
}
function TestPlanning({
  activeProject,
  profile,
  stories,
  items,
  onNext,
  setActiveStep,
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    scope: "",
    strategy: "",
    data: "",
    environment: "",
    risks: "",
  });
  const approve = useMutation({
    mutationFn: (id) =>
      executionApi.decidePlan(id, {
        decision: "Approved",
        reviewNote: "Test Plan đã được QA Manager duyệt.",
      }),
    onSuccess: () => {
      toast.success("Đã duyệt Test Plan");
      qc.invalidateQueries({ queryKey: ["e2e-plans"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const approvedStories = stories.filter(
    (item) => item.approvalStatus === "Approved",
  );
  const canSubmitPlan = approvedStories.length > 0 && form.name.trim() && form.scope.trim() && form.strategy.trim() && form.environment.trim();
  const suggest = useMutation({
    mutationFn: () =>
      executionApi.suggestPlanFromRequirements({
        project: activeProject,
        userStories: approvedStories.map((item) => ({
          title: item.title,
          description: item.description,
          acceptanceCriteria: item.acceptanceCriteria,
        })),
        environment: form.environment || "Staging",
      }),
    onSuccess: ({ suggestion, fallback }) => {
      setForm({
        name: suggestion.name || "",
        scope: suggestion.scope || "",
        strategy: suggestion.testStrategy || "",
        data: suggestion.testData || "",
        environment: suggestion.environment || "",
        risks: suggestion.risks || "",
      });
      toast.success(
        fallback
          ? "Đã điền bản nháp theo User Story; bạn hãy rà soát trước khi gửi duyệt."
          : "AI đã đề xuất Test Plan; bạn hãy rà soát trước khi gửi duyệt.",
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const create = useMutation({
    mutationFn: () =>
      executionApi.createPlan({
        project: activeProject,
        systemProfile: profile._id,
        userStories: approvedStories.map((story) => story._id),
        kind: "TestPlan",
        name: form.name,
        scope: form.scope,
        testStrategy: form.strategy,
        environment: form.environment,
        description: `Test data: ${form.data}\nRủi ro: ${form.risks}`,
        objectives: ["Xác nhận các User Story và Use Case đã duyệt."],
        entryCriteria: ["Environment sẵn sàng", "Test data sẵn sàng"],
        exitCriteria: ["Test Case đã được review", "Bug Critical đã triage"],
        approvalStatus: "PendingApproval",
      }),
    onSuccess: () => {
      toast.success("Đã gửi Test Plan cho QA Manager duyệt");
      qc.invalidateQueries({ queryKey: ["e2e-plans"] });
      onNext();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Card className="p-5">
      <SectionTitle
        title="Test Plan · dùng User Story có sẵn hoặc AI gợi ý"
        description="Có thể dùng User Story đã duyệt làm nguồn để AI đề xuất phạm vi, rủi ro, approach, test data và môi trường; QA vẫn là người quyết định bản cuối."
      />
      <div className="mt-4 rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20">
        <p className="text-sm font-semibold">Không có Test Plan sẵn?</p>
        <p className="mt-1 text-xs text-slate-500">
          AI sẽ đề xuất bản nháp từ {approvedStories.length} User Story đã duyệt
          trong flow này.
        </p>
        {!approvedStories.length && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Chưa có User Story được duyệt.{" "}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => setActiveStep("story")}
            >
              Tạo hoặc gửi duyệt User Story
            </button>
            .
          </p>
        )}
        <Button
          className="mt-3"
          variant="outline"
          disabled={!approvedStories.length || suggest.isPending}
          onClick={() => suggest.mutate()}
        >
          {suggest.isPending ? "AI đang đề xuất…" : "Nhờ AI gợi ý Test Plan"}
        </Button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Field label="Tên Test Plan">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="CTU Login E2E · Sprint 1"
          />
        </Field>
        <Field label="Môi trường">
          <Input
            value={form.environment}
            onChange={(e) => setForm({ ...form, environment: e.target.value })}
            placeholder="Staging · Chrome"
          />
        </Field>
        <Field label="Phạm vi">
          <Textarea
            value={form.scope}
            onChange={(e) => setForm({ ...form, scope: e.target.value })}
            placeholder="Đăng nhập thành công từ login page đến homepage."
          />
        </Field>
        <Field label="Approach">
          <Textarea
            value={form.strategy}
            onChange={(e) => setForm({ ...form, strategy: e.target.value })}
            placeholder="Risk-based E2E; ưu tiên xác thực và phân quyền."
          />
        </Field>
        <Field label="Test data">
          <Textarea
            value={form.data}
            onChange={(e) => setForm({ ...form, data: e.target.value })}
            placeholder="CTU_E2E_STUDENT"
          />
        </Field>
        <Field label="Rủi ro / xử lý">
          <Textarea
            value={form.risks}
            onChange={(e) => setForm({ ...form, risks: e.target.value })}
            placeholder="SSO timeout — retry và ghi evidence."
          />
        </Field>
      </div>
      <Button
        className="mt-4"
        disabled={
          !canSubmitPlan ||
          create.isPending
        }
        onClick={() => create.mutate()}
      >
        Gửi QA Manager duyệt Test Plan
      </Button>
      <div className="mt-5 space-y-2">
        {items.map((item) => (
          <div key={item._id} className="rounded-lg border p-3 text-sm">
            <Badge tone={statusTone[item.approvalStatus] || "slate"}>
              {item.approvalStatus}
            </Badge>
            <strong className="ml-2">{item.name}</strong>
            {item.approvalStatus === "PendingApproval" && (
              <Button
                className="ml-3"
                size="sm"
                disabled={approve.isPending || item.quality?.canApprove === false}
                onClick={() => approve.mutate(item._id)}
              >
                Duyệt Test Plan
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
function SuiteStep({ suites, createSuite, blocked, onNext, setActiveStep }) {
  return (
    <Card className="p-5">
      <SectionTitle
        title="Test Suite"
        description="Nhóm Test Case theo phạm vi: Authentication, Course, Assignment hoặc Permission."
      />
      {blocked ? (
        <p className="mt-5 text-sm text-amber-600">
          Cần Test Plan Approved trước khi tạo Test Suite.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => setActiveStep("plan")}
          >
            Mở bước Test Plan
          </button>
          .
        </p>
      ) : (
        <Button
          className="mt-5"
          disabled={createSuite.isPending}
          onClick={() => createSuite.mutate()}
        >
          <Layers3 className="h-4 w-4" />
          Tạo Test Suite E2E
        </Button>
      )}
      <div className="mt-5 space-y-2">
        {(suites.data || []).map((item) => (
          <div key={item._id} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.name}</strong><DocumentQualityBadge quality={item.quality} /></div>
            <p className="mt-1 text-xs text-slate-500">{item.description}</p>
            <div className="mt-2"><DocumentQualityNotice quality={item.quality} action="dùng Test Suite" /></div>
          </div>
        ))}
      </div>
      {!blocked && (suites.data || []).length > 0 && (
        <Button variant="outline" className="mt-4" onClick={onNext}>
          Tiếp tục sinh Test Case
        </Button>
      )}
    </Card>
  );
}
function CaseStep({
  useCases,
  stories,
  suites,
  target,
  setTarget,
  generate,
  cases,
  onNext,
}) {
  const approvedStories = stories.filter(
    (item) => item.approvalStatus === "Approved",
  );
  const update = (key, value) => setTarget({ ...target, [key]: value });
  return (
    <Card className="p-5">
      <SectionTitle
        title="Test Case"
        description="Chọn đúng Use Case, User Story và Test Suite; chỉ sinh case trong cùng phạm vi."
      />
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Select
          value={target.useCaseId}
          onChange={(e) => update("useCaseId", e.target.value)}
        >
          <option value="">Use Case đã duyệt</option>
          {(useCases.data || [])
            .filter((item) => item.status === "Approved")
            .map((item) => (
              <option key={item._id} value={item._id}>
                {item.code} · {item.name}
              </option>
            ))}
        </Select>
        <Select
          value={target.storyId}
          onChange={(e) => update("storyId", e.target.value)}
        >
          <option value="">User Story đã duyệt</option>
          {approvedStories.map((item) => (
            <option key={item._id} value={item._id}>
              {item.title}
            </option>
          ))}
        </Select>
        <Select
          value={target.suiteId}
          onChange={(e) => update("suiteId", e.target.value)}
        >
          <option value="">Test Suite</option>
          {(suites.data || []).filter((item) => item.quality?.canApprove !== false).map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </Select>
      </div>
      <Button
        className="mt-4"
        disabled={
          !target.useCaseId ||
          !target.storyId ||
          !target.suiteId ||
          generate.isPending
        }
        onClick={() => generate.mutate()}
      >
        <ClipboardCheck className="h-4 w-4" />
        Sinh Test Case
      </Button>
      <p className="mt-5 text-sm text-slate-500">
        Đã có {cases.length} Test Case trong System Profile. QA cần rà locator,
        test data và expected result trước khi gửi review.
      </p>
      <Button
        variant="outline"
        className="mt-3"
        disabled={!cases.length}
        onClick={onNext}
      >
        Sang QA review
      </Button>
    </Card>
  );
}
function ReviewStep({ cases, onNext }) {
  const approved = cases.filter((item) => item.status === "Approved").length;
  return (
    <Card className="p-5">
      <SectionTitle
        title="QA review / approve"
        description="QA review các Test Case trong ngữ cảnh Test Plan; chỉ case approved mới được đưa vào Automation hoặc Execution."
      />
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900">
          <strong>{cases.length}</strong>
          <p className="mt-1 text-xs">Tổng Test Case</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-4 text-sm dark:bg-emerald-950/30">
          <strong>{approved}</strong>
          <p className="mt-1 text-xs">Đã duyệt</p>
        </div>
      </div>
      <Button className="mt-5" asChild>
        <Link to="/approvals">Mở hàng chờ QA review</Link>
      </Button>
      <Button
        variant="outline"
        className="ml-2 mt-5"
        disabled={!approved}
        onClick={onNext}
      >
        Gắn môi trường chạy <ArrowRight className="h-4 w-4" />
      </Button>
    </Card>
  );
}
function DocumentExports({ useCases, stories, plans, cases, download }) {
  const [selected, setSelected] = useState({});
  const groups = [
    {
      key: "use-case",
      title: "Use Case",
      items: useCases,
      format: "docx",
      label: (item) => `${item.code || ""} · ${item.name}`,
    },
    {
      key: "user-story",
      title: "User Story",
      items: stories,
      format: "docx",
      label: (item) => item.title,
    },
    {
      key: "test-plan",
      title: "Test Plan",
      items: plans,
      format: "docx",
      label: (item) => item.name,
    },
    {
      key: "test-case",
      title: "Test Case",
      items: cases,
      format: "xlsx",
      label: (item) => `${item.testCaseId || ""} · ${item.title}`,
    },
  ];
  return (
    <Card className="p-5">
      <SectionTitle
        title="Chỉ cần tài liệu? Xuất và hoàn tất tại đây"
        description="Bạn không cần tạo môi trường hay chạy automation để tải tài liệu. Hãy kiểm tra trạng thái và nội dung trước khi sử dụng."
      />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {groups.map((group) => (
          <div key={group.key} className="rounded-lg border p-3">
            <Field label={group.title}>
              <Select
                value={selected[group.key] || ""}
                onChange={(event) =>
                  setSelected({ ...selected, [group.key]: event.target.value })
                }
              >
                <option value="">
                  {group.items.length
                    ? `Chọn ${group.title}`
                    : `Chưa có ${group.title}`}
                </option>
                {group.items.map((item) => (
                  <option key={item._id} value={item._id}>
                    {group.label(item)} ·{" "}
                    {item.approvalStatus || item.status || "Draft"}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={!selected[group.key]}
              onClick={() => {
                const id = selected[group.key];
                const request =
                  group.key === "test-plan"
                    ? () => executionApi.exportPlan(id, group.format)
                    : () => e2eApi.exportArtifact(group.key, id, group.format);
                download(request, `${group.key}-${id}.${group.format}`);
              }}
            >
              Tải {group.title}
              {group.format === "xlsx" ? " · Excel" : ""}
            </Button>
          </div>
        ))}
      </div>
      {cases.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900 dark:bg-violet-950/20">
          <div>
            <p className="text-sm font-semibold">Xuất toàn bộ Test Case</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Một workbook Excel chứa {cases.length} case, các bước, dữ liệu
              an toàn và liên kết truy vết.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              download(
                () => testCaseApi.exportMany(cases.map((item) => item._id)),
                "test-cases.xlsx",
              )
            }
          >
            Tải bộ Test Case (.xlsx)
          </Button>
        </div>
      )}
    </Card>
  );
}
function RuntimeBindingStep({
  profile,
  environments,
  project,
  requestedEnvironment,
  updateProfile,
  onNext,
}) {
  const [selected, setSelected] = useState(
    String(
      requestedEnvironment ||
        profile?.environment?._id ||
        profile?.environment ||
        "",
    ),
  );
  const [showBuilder, setShowBuilder] = useState(false);
  const labUrl = `/automation?${new URLSearchParams({ project, returnProfile: profile?._id || "" })}`;
  const all = environments?.data || [];
  const ready = all.filter((item) => item.status === "Ready" && item.targetUrl);
  const boundId = String(
    profile?.environment?._id || profile?.environment || "",
  );
  const bound = ready.find((item) => String(item._id) === boundId);
  const runtimeUrl = boundId ? bound?.targetUrl : profile?.baseUrl;
  return (
    <Card className="p-5">
      <SectionTitle
        title="Gắn môi trường chạy"
        description="Môi trường chạy là ứng dụng đang hoạt động mà Test Run sẽ truy cập. Hãy chọn môi trường của project đã được kiểm tra và ở trạng thái Ready."
      />
      {environments?.isPending ? (
        <p className="mt-4 text-sm text-slate-500">Đang tải môi trường…</p>
      ) : environments?.isError ? (
        <div className="mt-4 rounded-lg border p-4">
          <p className="text-sm">Không tải được danh sách môi trường.</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => environments.refetch()}
          >
            Thử tải lại
          </Button>
        </div>
      ) : ready.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
          <Select
            value={
              ready.some((item) => String(item._id) === selected)
                ? selected
                : ""
            }
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Chọn môi trường Ready</option>
            {ready.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name} · {item.targetUrl}
              </option>
            ))}
          </Select>
          <Button
            disabled={
              !selected ||
              !ready.some((item) => String(item._id) === selected) ||
              selected === boundId ||
              updateProfile.isPending
            }
            onClick={() =>
              updateProfile.mutate({ environment: selected, baseUrl: "" })
            }
          >
            Gắn vào Profile
          </Button>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
          <p className="text-sm font-semibold">Chưa có môi trường sẵn sàng</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {all.length
              ? "Project có môi trường chưa Ready. Kiểm tra lại hoặc tạo môi trường khác tại đây."
              : "Bạn có thể dùng website đang chạy hoặc dựng từ GitHub + Docker ngay tại đây."}
          </p>
        </div>
      )}
      <p className="mt-3 text-sm">
        {runtimeUrl
          ? `Đang cấu hình: ${runtimeUrl}`
          : boundId
            ? "Môi trường đã gắn chưa sẵn sàng."
            : "Chưa có môi trường được gắn."}
      </p>
      {profile?.repository?.fullName && (
        <p className="mt-3 text-xs text-slate-500">
          Nguồn tài liệu: {profile.repository.fullName} ·{" "}
          {profile.repository.commitSha?.slice(0, 12) || profile.repository.ref}
          .{" "}
          {bound?.repository?.fullName
            ? `Môi trường: ${bound.repository.fullName} · ${bound.repository.commitSha?.slice(0, 12) || bound.repository.ref || "chưa xác định commit"}.`
            : "Với URL có sẵn, hãy xác nhận phiên bản ứng dụng tương ứng với nguồn tài liệu."}{" "}
          QA cần xác nhận hai phiên bản phù hợp trước khi chạy.
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => setShowBuilder((value) => !value)}
        >
          {showBuilder
            ? "Đóng cấu hình môi trường"
            : "Tạo hoặc kiểm tra môi trường tại đây"}
        </Button>
        <Button variant="ghost" asChild>
          <Link to={labUrl}>Automation Lab nâng cao</Link>
        </Button>
        <Button disabled={!runtimeUrl} onClick={onNext}>
          Tiếp tục Automation DSL <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      {showBuilder && (
        <div className="mt-5">
          <AutomationLabPage
            embedded
            initialProject={project}
            onEnvironmentReady={(item) => {
              setSelected(String(item._id));
              environments.refetch();
              setShowBuilder(false);
              toast.success(
                "Đã chọn môi trường Ready. Hãy gắn vào Profile để tiếp tục.",
              );
            }}
          />
        </div>
      )}
    </Card>
  );
}
function AutomationStep({ profile, project, onNext }) {
  const runtimeUrl = runtimeUrlForProfile(profile);
  return (
    <Card className="p-5">
      <SectionTitle
        title="Automation DSL / Script"
        description="Chỉ sinh và kiểm tra script khi Runtime URL đã được gắn. Các Test Case source-only vẫn là tài liệu thiết kế hợp lệ, nhưng không được đưa vào runner."
      />
      {runtimeUrl ? (
        <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
          Runtime đang dùng: {runtimeUrl}
        </p>
      ) : (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          Cần quay lại bước “Gắn môi trường chạy” trước khi tự động hóa.
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild>
          <Link to={`/automation?project=${project}`}>Mở Automation Lab</Link>
        </Button>
        <Button variant="outline" disabled={!runtimeUrl} onClick={onNext}>
          Sang Execution Plan <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
function ExecutionStep({ project, profile, cases, plans, setActiveStep, requestedRun }) {
  const qc = useQueryClient();
  const [, setSearchParams] = useSearchParams();
  const openRun = (id) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.set("run", id);
    return next;
  });
  const runs = useQuery({
    queryKey: ["e2e-runs", project],
    queryFn: () => executionApi.runs(project),
    enabled: Boolean(project),
  });
  const [selected, setSelected] = useState("");
  const approved = cases.filter((item) => item.status === "Approved");
  const caseIds = new Set(cases.map((item) => String(item._id)));
  const executionPlans = (plans.data || []).filter(
    (item) =>
      item.kind === "ExecutionPlan" &&
      item.testCases?.length &&
      item.testCases.every((testCase) =>
        caseIds.has(String(testCase._id || testCase)),
      ),
  );
  const runtimeUrl = runtimeUrlForProfile(profile);
  const openedRun = (runs.data || []).find((item) => String(item._id) === String(requestedRun));
  const createExecution = useMutation({
    mutationFn: () =>
      executionApi.suggestPlan({
        project,
        systemProfile: profile._id,
        testCaseIds: approved.map((item) => item._id),
        environment: runtimeUrl,
        kind: "ExecutionPlan",
      }),
    onSuccess: () => {
      toast.success("Đã tạo Execution Plan");
      qc.invalidateQueries({ queryKey: ["e2e-plans"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const approveExecution = useMutation({
    mutationFn: (id) =>
      executionApi.decidePlan(id, {
        decision: "Approved",
        reviewNote: "Execution Plan đã được duyệt.",
      }),
    onSuccess: () => {
      toast.success("Đã duyệt Execution Plan");
      qc.invalidateQueries({ queryKey: ["e2e-plans"] });
      qc.invalidateQueries({ queryKey: ["test-run-detail"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const submitBoardPlan = useMutation({
    mutationFn: (plan) => executionApi.updatePlan(plan._id, {
      approvalStatus: "PendingApproval",
      objectives: plan.objectives?.length ? plan.objectives : [`Xác minh các Test Case đã duyệt trong phạm vi ${plan.scope}.`],
      testStrategy: plan.testStrategy || "Chạy Manual hoặc script Auto đã duyệt và ghi kết quả từng Test Case.",
      entryCriteria: plan.entryCriteria?.length ? plan.entryCriteria : ["Test Case đã duyệt và môi trường kiểm thử sẵn sàng."],
      exitCriteria: plan.exitCriteria?.length ? plan.exitCriteria : ["Mọi Test Case có kết quả; lỗi phát hiện được ghi vào Bug Log."],
    }),
    onSuccess: () => { toast.success("Đã gửi Execution Plan để duyệt"); qc.invalidateQueries({ queryKey: ["e2e-plans"] }); qc.invalidateQueries({ queryKey: ["test-run-detail"] }); },
    onError: (error) => toast.error(error.message),
  });
  const createRun = useMutation({
    mutationFn: () =>
      executionApi.createRun({
        testPlan: selected,
        name: `E2E Run · ${new Date().toLocaleDateString("vi-VN")}`,
        environment: runtimeUrl,
        status: "NotStarted",
      }),
    onSuccess: (run) => {
      toast.success("Đã tạo Test Run");
      qc.invalidateQueries({ queryKey: ["e2e-runs", project] });
      openRun(run._id);
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Card className="p-5">
      <SectionTitle
        title="Test Execution Plan / Test Run"
        description="Quản lý case chạy theo Sprint/Cycle, tạo Execution Plan rồi tạo Test Run để theo dõi tiến độ Scrum."
      />
      {openedRun && (
        <section className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900 dark:bg-violet-950/20">
          <p className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">Test Run đang mở</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">{openedRun.name}</h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{openedRun.totalCases || 0} Test Case · {openedRun.environment || "Chưa khai báo môi trường"}</p>
            </div>
            <Badge tone={openedRun.status === "Completed" ? "green" : "amber"}>{openedRun.status || "NotStarted"}</Badge>
          </div>
          <p className="mt-3 text-xs text-slate-500">Run này đã tồn tại. Không cần tạo lại kế hoạch hoặc điền lại biểu mẫu; hãy chọn môi trường và chạy khi sẵn sàng.</p>
        </section>
      )}
      {openedRun && <TestRunExecutionPanel key={openedRun._id} runId={openedRun._id} project={project} profile={profile?._id} />}
      {!runtimeUrl && !openedRun && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          Chưa có Runtime URL nên chưa thể tạo Execution Plan hoặc Test Run. Các
          tài liệu QA vẫn không bị ảnh hưởng.
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          disabled={
            !runtimeUrl || !approved.length || createExecution.isPending
          }
          onClick={() => createExecution.mutate()}
        >
          Tạo Execution Plan ({approved.length} case)
        </Button>
        <Button variant="outline" asChild>
          <Link to={`/test-board?project=${project}`}>Board Agile/Scrum</Link>
        </Button>
      </div>
      <div className="mt-4 space-y-2">
        {executionPlans.map((item) => (
          <div key={item._id} className="rounded-lg border p-3 text-sm">
            <Badge tone={statusTone[item.approvalStatus] || "slate"}>
              {item.approvalStatus}
            </Badge>
            <strong className="ml-2">{item.name}</strong>
            {item.origin === "Board" && item.approvalStatus === "Draft" && (
              <Button size="sm" className="ml-3" disabled={submitBoardPlan.isPending} onClick={() => submitBoardPlan.mutate(item)}>
                Gửi duyệt Execution Plan
              </Button>
            )}
            {item.approvalStatus === "PendingApproval" && (
              <Button
                size="sm"
                className="ml-3"
                disabled={approveExecution.isPending}
                onClick={() => approveExecution.mutate(item._id)}
              >
                Duyệt Execution Plan
              </Button>
            )}
          </div>
        ))}
      </div>
      {!approved.length && (
        <p className="mt-4 text-xs text-amber-700 dark:text-amber-300">
          Chưa có Test Case được duyệt.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => setActiveStep("testcase")}
          >
            Mở Test Case
          </button>{" "}
          để chỉnh sửa và gửi duyệt.
        </p>
      )}
      {!executionPlans.some((item) => item.approvalStatus === "Approved") && (
        <p className="mt-4 text-xs text-slate-500">
          Chưa có Execution Plan được duyệt. Tạo kế hoạch ở trên, sau đó nhờ QA
          Manager duyệt trước khi tạo Test Run.
        </p>
      )}
      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
        <Select
          disabled={
            !executionPlans.some((item) => item.approvalStatus === "Approved")
          }
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Chọn Execution Plan đã duyệt</option>
          {executionPlans
            .filter((item) => item.approvalStatus === "Approved")
            .map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
        </Select>
        <Button
          disabled={!runtimeUrl || !selected || createRun.isPending}
          onClick={() => createRun.mutate()}
        >
          Tạo Test Run
        </Button>
      </div>
      <div className="mt-5 space-y-2">
        {(runs.data || [])
          .filter((item) =>
            executionPlans.some(
              (plan) =>
                String(plan._id) ===
                String(item.testPlan?._id || item.testPlan),
            ),
          )
          .map((item) => (
            <div key={item._id} className="rounded-lg border p-3 text-sm">
              <strong>{item.name}</strong>
              <span className="ml-2 text-xs text-slate-500">
                {item.status} · {item.totalCases} case
              </span>
              <Button size="sm" className="ml-3" variant="outline" onClick={() => openRun(item._id)}>
                Mở Test Run
              </Button>
            </div>
          ))}
      </div>
    </Card>
  );
}
function Field({ label, hint, className = "", children }) {
  return (
    <label className={`grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 ${className}`}>
      <span>{label}{hint && <span className="mt-0.5 block text-xs font-normal leading-4 text-slate-500 dark:text-slate-400">{hint}</span>}</span>
      {children}
    </label>
  );
}

const planLines = (value) =>
  Array.isArray(value)
    ? value.filter(Boolean)
    : String(value || "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
const planListText = (value) => planLines(value).join("\n");
const planRiskText = (value) =>
  Array.isArray(value)
    ? value
        .map(
          (item) =>
            `${item.risk || ""} | ${item.mitigation || ""} | ${item.owner || ""}`,
        )
        .join("\n")
    : String(value || "");
const planRisks = (value) =>
  planLines(value)
    .map((line) => {
      const [risk, mitigation, owner] = line
        .split("|")
        .map((item) => item.trim());
      return { risk, mitigation, owner };
    })
    .filter((item) => item.risk);

function PlanSection({ title, value }) {
  const rows = planLines(value);
  if (!rows.length) return null;
  return (
    <section className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
        {title}
      </h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-800 dark:text-slate-100">
        {rows.map((row, index) => (
          <li key={index}>{row}</li>
        ))}
      </ul>
    </section>
  );
}

function TestPlanDocument({
  plan,
  onApprove,
  approving,
  isDraft = false,
  onEdit,
  project,
}) {
  const [exporting, setExporting] = useState("");
  const exportDocument = async (format) => {
    setExporting(format);
    try {
      const response = isDraft
        ? await executionApi.exportPlanPreview(project, plan, format)
        : await executionApi.exportPlan(plan._id, format);
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${(plan.name || "test-plan")
        .replace(/[<>:"/\\|?*]/g, "-")
        .split("")
        .filter((char) => char.charCodeAt(0) >= 32)
        .join("")
        .slice(0, 100)}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Đã tải Test Plan ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(
        error.message || "Không thể xuất tài liệu. Vui lòng thử lại.",
      );
    } finally {
      setExporting("");
    }
  };
  const risks = Array.isArray(plan.risks)
    ? plan.risks.filter((item) => item?.risk || item?.mitigation || item?.owner)
    : planRisks(plan.risks);
  const approval = plan.approvalStatus || "Draft";
  const planTypeLabel =
    plan.planLevel === "Master"
      ? "Master Test Plan"
      : plan.planLevel === "CycleExecution"
        ? "Cycle Execution Plan"
        : "Feature Test Plan";
  const boardLink = project
    ? `/board?project=${project}${plan.cycle?._id || plan.cycle ? `&cycle=${plan.cycle?._id || plan.cycle}` : ""}`
    : "";
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <header className="border-b-4 border-violet-600 bg-slate-50 px-5 py-4 dark:border-violet-400 dark:bg-slate-800/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
              {planTypeLabel}
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">
              {plan.name || "Chưa đặt tên Test Plan"}
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {plan.description ||
                "Bản kế hoạch kiểm thử đang được hoàn thiện."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2"><Badge tone={statusTone[approval] || "slate"}>{isDraft ? "Bản nháp để rà soát" : approval}</Badge><DocumentQualityBadge quality={plan.quality} /></div>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Mã kế hoạch</dt>
            <dd className="mt-1 font-semibold">
              {plan.planId || "Sẽ tạo khi lưu"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Môi trường</dt>
            <dd className="mt-1 font-semibold">
              {plan.environment || "Chưa xác định"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Trạng thái phê duyệt</dt>
            <dd className="mt-1 font-semibold">{approval}</dd>
          </div>
        </dl>
      </header>
      <div className="space-y-4 p-5">
        <DocumentQualityNotice quality={plan.quality} action="duyệt Test Plan" />
        <PlanSection title="1. Mục tiêu kiểm thử" value={plan.objectives} />
        <PlanSection title="2. Phạm vi kiểm thử" value={plan.scope} />
        <div className="grid gap-4 lg:grid-cols-2">
          <PlanSection title="3. Hạng mục kiểm thử" value={plan.testItems} />
          <PlanSection title="4. Ngoài phạm vi" value={plan.outOfScope} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <PlanSection
            title="5. Chiến lược / phương pháp"
            value={plan.testStrategy}
          />
          <PlanSection title="6. Dữ liệu kiểm thử" value={plan.testData} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <PlanSection title="7. Tiêu chí bắt đầu" value={plan.entryCriteria} />
          <PlanSection title="8. Tiêu chí kết thúc" value={plan.exitCriteria} />
        </div>
        {risks.length > 0 && (
          <section className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <h4 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              9. Rủi ro và phương án xử lý
            </h4>
            <div className="overflow-x-auto">
              <table className="min-w-[650px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                  <tr>
                    <th className="px-3 py-2">Rủi ro</th>
                    <th className="px-3 py-2">Giảm thiểu</th>
                    <th className="px-3 py-2">Phụ trách</th>
                  </tr>
                </thead>
                <tbody>
                  {risks.map((item, index) => (
                    <tr
                      key={index}
                      className="border-t border-slate-200 align-top dark:border-slate-700"
                    >
                      <td className="px-3 py-3 leading-6">{item.risk}</td>
                      <td className="px-3 py-3 leading-6">
                        {item.mitigation || "QA xác nhận khi review."}
                      </td>
                      <td className="px-3 py-3 leading-6">
                        {item.owner || "Chưa phân công"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <PlanSection title="10. Deliverables" value={plan.deliverables} />
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800/40">
        {boardLink && !isDraft && (
          <Button variant="outline" asChild>
            <Link to={boardLink}>Xem Test Board</Link>
          </Button>
        )}
        <Button
          variant="outline"
          disabled={Boolean(exporting)}
          onClick={() => exportDocument("docx")}
        >
          {exporting === "docx" ? "Đang xuất Word…" : "Tải Word (.docx)"}
        </Button>
        <Button
          variant="outline"
          disabled={Boolean(exporting)}
          onClick={() => exportDocument("pdf")}
        >
          {exporting === "pdf" ? "Đang xuất PDF…" : "Tải PDF"}
        </Button>
        {isDraft && (
          <Button variant="outline" onClick={onEdit}>
            Chỉnh sửa bản nháp
          </Button>
        )}
        {!isDraft && approval === "PendingApproval" && (
          <Button size="sm" disabled={approving || plan.quality?.canApprove === false} onClick={onApprove}>
            Duyệt Feature Test Plan
          </Button>
        )}
      </footer>
    </article>
  );
}

function TestPlanningDocumentEditor({ activeProject, profile, stories, items, onNext, setActiveStep }) {
  const qc = useQueryClient();
  const generationRequest = useRef(null);
  const [generationError, setGenerationError] = useState("");
  useEffect(() => () => generationRequest.current?.abort(), []);
  const [screen, setScreen] = useState("start");
  const [selectedStoryIds, setSelectedStoryIds] = useState([]);
  const [planOrigin, setPlanOrigin] = useState("Manual");
  const [form, setForm] = useState({ name: "", scope: "", objectives: "", testItems: "", outOfScope: "", strategy: "", entryCriteria: "", exitCriteria: "", data: "", environment: "", risks: "", deliverables: "" });
  const approvedStories = stories.filter((item) => item.approvalStatus === "Approved");
  const selectedStories = approvedStories.filter((item) => selectedStoryIds.includes(String(item._id)));
  const storiesForPlan = selectedStories.length ? selectedStories : approvedStories;
  const toggleStory = (storyId) => setSelectedStoryIds((current) => current.includes(String(storyId)) ? current.filter((id) => id !== String(storyId)) : [...current, String(storyId)]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const preview = { planId: "", name: form.name, description: "Bản nháp Test Plan. QA cần rà soát trước khi gửi duyệt.", scope: form.scope, objectives: planLines(form.objectives), testItems: planLines(form.testItems), outOfScope: planLines(form.outOfScope), testStrategy: form.strategy, entryCriteria: planLines(form.entryCriteria), exitCriteria: planLines(form.exitCriteria), testData: form.data, environment: form.environment, risks: planRisks(form.risks), deliverables: planLines(form.deliverables), approvalStatus: "Draft" };
  const canSubmitPlan = Boolean(form.name.trim() && form.scope.trim() && planLines(form.objectives).length && form.strategy.trim() && planLines(form.entryCriteria).length && planLines(form.exitCriteria).length && form.environment.trim() && storiesForPlan.length);
  const suggest = useMutation({
    mutationFn: async () => {
      setGenerationError("");
      const controller = new AbortController();
      generationRequest.current = controller;
      try {
        return await executionApi.suggestPlanFromRequirements({ project: activeProject, userStories: storiesForPlan.map((item) => ({ title: item.title, description: item.description, acceptanceCriteria: item.acceptanceCriteria })), environment: form.environment || "Staging" }, { signal: controller.signal });
      } finally { if (generationRequest.current === controller) generationRequest.current = null; }
    },
    onSuccess: ({ suggestion, fallback }) => { setPlanOrigin(fallback ? "Rule" : "AI"); setForm({ name: suggestion.name || "", scope: suggestion.scope || "", objectives: planListText(suggestion.objectives), testItems: planListText(suggestion.testItems), outOfScope: planListText(suggestion.outOfScope), strategy: suggestion.testStrategy || "", entryCriteria: planListText(suggestion.entryCriteria), exitCriteria: planListText(suggestion.exitCriteria), data: suggestion.testData || "", environment: suggestion.environment || "", risks: planRiskText(suggestion.risks), deliverables: planListText(suggestion.deliverables) }); setScreen("preview"); toast.success(fallback ? "Đã tạo bản nháp từ User Story để QA rà soát." : "AI đã tạo bản nháp Test Plan."); },
    onError: (error) => { if (error.code === "ERR_CANCELED") return; setGenerationError(error.message || "Không thể tạo Test Plan từ AI."); toast.error(error.message); },
  });
  const create = useMutation({
    mutationFn: () => executionApi.createPlan({ project: activeProject, systemProfile: profile._id, userStories: storiesForPlan.map((story) => story._id), kind: "TestPlan", planLevel: "Feature", origin: planOrigin, name: form.name, description: preview.description, testData: form.data, scope: form.scope, objectives: planLines(form.objectives), testStrategy: form.strategy, testItems: planLines(form.testItems), outOfScope: planLines(form.outOfScope), entryCriteria: planLines(form.entryCriteria), exitCriteria: planLines(form.exitCriteria), risks: planRisks(form.risks), deliverables: planLines(form.deliverables), environment: form.environment, approvalStatus: "PendingApproval" }),
    onSuccess: () => { toast.success("Đã gửi Feature Test Plan cho QA Manager duyệt"); qc.invalidateQueries({ queryKey: ["e2e-plans"] }); onNext(); }, onError: (error) => toast.error(error.message),
  });
  const approve = useMutation({ mutationFn: (id) => executionApi.decidePlan(id, { decision: "Approved", reviewNote: "Test Plan E2E đã được QA Manager duyệt." }), onSuccess: () => { toast.success("Đã duyệt Test Plan"); qc.invalidateQueries({ queryKey: ["e2e-plans"] }); }, onError: (error) => toast.error(error.message) });
  const summary = (plan) => <div className="grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3"><span><b>Phạm vi:</b> {plan.scope || "Chưa khai báo"}</span><span><b>Môi trường:</b> {plan.environment || "Chưa khai báo"}</span><span><b>Rủi ro:</b> {(plan.risks || []).length || 0} mục</span></div>;
  return <Card className="p-5">
    <SectionTitle title="Feature Test Plan" description="Tạo bản nháp từ User Story, rà soát phần tóm tắt rồi gửi QA Manager duyệt." />
    {!approvedStories.length ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">Chưa có User Story được duyệt. <button type="button" className="font-semibold underline" onClick={() => setActiveStep("story")}>Mở bước User Story</button>.</div> : <>
      <details className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer text-sm font-semibold">Phạm vi nguồn · {selectedStories.length || approvedStories.length}/{approvedStories.length} User Story</summary><p className="mt-1 text-xs text-slate-500">Mặc định dùng tất cả User Story đã duyệt. Mở phần này chỉ khi cần bỏ bớt hoặc thêm phạm vi.</p><div className="mt-3 grid gap-2 md:grid-cols-2">{approvedStories.map((story) => <label key={story._id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-100 p-2 text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"><input className="mt-0.5 accent-violet-700" type="checkbox" checked={selectedStoryIds.length ? selectedStoryIds.includes(String(story._id)) : true} onChange={() => { if (!selectedStoryIds.length) setSelectedStoryIds(approvedStories.map((item) => String(item._id))); toggleStory(story._id); }} /><span>{story.title}</span></label>)}</div><div className="mt-3 flex gap-3 text-xs"><button type="button" className="font-semibold text-violet-700 underline" onClick={() => setSelectedStoryIds(approvedStories.map((item) => String(item._id)))}>Chọn tất cả</button><button type="button" className="underline" onClick={() => setSelectedStoryIds([])}>Dùng tất cả</button></div></details>
      <div className="mt-5 grid gap-3 md:grid-cols-2"><button type="button" className={`rounded-xl border p-4 text-left transition ${screen === "start" ? "border-violet-400 bg-violet-50/60 ring-1 ring-violet-200 dark:border-violet-900 dark:bg-violet-950/20" : "border-slate-200 hover:border-violet-300 dark:border-slate-700"}`} onClick={() => suggest.mutate()} disabled={suggest.isPending}><p className="text-sm font-semibold">{suggest.isPending ? "AI đang lập kế hoạch…" : "Tạo nhanh từ User Story"}</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">AI soạn phạm vi, chiến lược, rủi ro và tiêu chí.</p></button><button type="button" className={`rounded-xl border p-4 text-left transition ${screen === "edit" ? "border-violet-400 bg-violet-50/60 ring-1 ring-violet-200 dark:border-violet-900 dark:bg-violet-950/20" : "border-slate-200 hover:border-violet-300 dark:border-slate-700"}`} onClick={() => { generationRequest.current?.abort(); setGenerationError(""); setPlanOrigin("Manual"); setScreen("edit"); }}><p className="text-sm font-semibold">Tự soạn Test Plan</p><p className="mt-1 text-xs leading-5 text-slate-500">Tự nhập hoặc điều chỉnh toàn bộ nội dung.</p></button></div>
      {suggest.isPending && <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm dark:border-violet-900 dark:bg-violet-950/30"><p>Đang chờ AI tạo bản nháp. Bạn có thể hủy để tự soạn; kết quả sẽ hiển thị ở phần tóm tắt khi hoàn tất.</p><Button variant="outline" onClick={() => generationRequest.current?.abort()}>Hủy tạo AI</Button></div>}{generationError && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200"><p>{generationError}</p><p className="mt-1">Bấm Tạo nhanh từ User Story để thử lại hoặc chọn Tự soạn Test Plan. Nội dung đang nhập vẫn được giữ.</p></div>}{screen === "edit" && !suggest.isPending && <div className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="grid gap-4 md:grid-cols-2"><Field label="Tên Feature Test Plan"><Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Feature Test Plan · Nộp bài tập lớn" /></Field><Field label="Môi trường"><Input value={form.environment} onChange={(e) => update("environment", e.target.value)} placeholder="Staging · Chrome" /></Field><Field label="Mục tiêu · mỗi dòng một mục"><Textarea rows={3} value={form.objectives} onChange={(e) => update("objectives", e.target.value)} /></Field><Field label="Phạm vi kiểm thử"><Textarea rows={3} value={form.scope} onChange={(e) => update("scope", e.target.value)} /></Field></div><details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-violet-700 dark:text-violet-300">Mở nội dung chi tiết khi cần</summary><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Hạng mục kiểm thử"><Textarea rows={3} value={form.testItems} onChange={(e) => update("testItems", e.target.value)} /></Field><Field label="Ngoài phạm vi"><Textarea rows={3} value={form.outOfScope} onChange={(e) => update("outOfScope", e.target.value)} /></Field><Field label="Chiến lược"><Textarea rows={3} value={form.strategy} onChange={(e) => update("strategy", e.target.value)} /></Field><Field label="Dữ liệu kiểm thử"><Textarea rows={3} value={form.data} onChange={(e) => update("data", e.target.value)} /></Field><Field label="Tiêu chí bắt đầu"><Textarea rows={3} value={form.entryCriteria} onChange={(e) => update("entryCriteria", e.target.value)} /></Field><Field label="Tiêu chí kết thúc"><Textarea rows={3} value={form.exitCriteria} onChange={(e) => update("exitCriteria", e.target.value)} /></Field><Field label="Rủi ro | giảm thiểu | phụ trách"><Textarea rows={3} value={form.risks} onChange={(e) => update("risks", e.target.value)} /></Field><Field label="Deliverables"><Textarea rows={3} value={form.deliverables} onChange={(e) => update("deliverables", e.target.value)} /></Field></div></details><div className="mt-4 flex justify-end"><Button disabled={!form.name || !form.scope} onClick={() => setScreen("preview")}>Xem bản tóm tắt</Button></div></div>}
      {screen === "preview" && <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{preview.name || "Test Plan chưa đặt tên"}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Bản nháp, chưa gửi duyệt.</p></div><Button size="sm" variant="outline" onClick={() => setScreen("edit")}>Chỉnh sửa</Button></div><div className="mt-4">{summary(preview)}</div>{!canSubmitPlan && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-100">Cần đủ tên, phạm vi, mục tiêu, chiến lược, entry criteria, exit criteria, môi trường và User Story nguồn trước khi gửi duyệt.</div>}<details className="mt-4 rounded-lg border border-violet-200 bg-white/80 p-3 dark:border-violet-900 dark:bg-slate-950/30"><summary className="cursor-pointer text-xs font-semibold">Xem toàn bộ nội dung tài liệu</summary><TestPlanDocument plan={preview} project={activeProject} isDraft onEdit={() => setScreen("edit")} /></details><div className="mt-4 flex justify-end"><Button disabled={!canSubmitPlan || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Đang gửi…" : "Gửi QA Manager duyệt"}</Button></div></div>}
    </>}
    {!!items.length && <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700"><p className="text-sm font-semibold">Test Plan đã tạo ({items.length})</p><div className="mt-3 space-y-3">{items.map((item) => <details key={item._id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-2"><div><Badge tone={statusTone[item.approvalStatus] || "slate"}>{item.approvalStatus}</Badge><p className="mt-2 text-sm font-semibold">{item.name}</p></div><span className="text-xs font-semibold text-violet-700 dark:text-violet-300">Xem chi tiết</span></div><div className="mt-3">{summary(item)}</div></summary><div className="mt-4 border-t pt-4 dark:border-slate-700"><TestPlanDocument plan={item} project={activeProject} approving={approve.isPending} onApprove={() => approve.mutate(item._id)} /></div></details>)}</div></div>}
  </Card>;
}

function AgileHandoffStep({ project, plan, cases, setActiveStep }) {
  const cycles = useQuery({
    queryKey: ["cycles", project],
    queryFn: () => agileApi.cycles(project),
    enabled: Boolean(project),
  });
  const approvedCases = cases.filter((item) => item.status === "Approved");
  const activeCycle = (cycles.data || []).find(
    (item) => item.status === "Active",
  );
  const boardCycle =
    activeCycle ||
    (cycles.data || []).find((item) =>
      ["Planning", "Planned"].includes(item.status),
    ) ||
    (cycles.data || [])[0];
  const boardLink = `/board?project=${project}${boardCycle?._id ? `&cycle=${boardCycle._id}` : ""}`;
  if (!plan)
    return (
      <Blocked
        title="Cần hoàn tất tài liệu trước"
        description="Chỉ chuyển sang lập Sprint sau khi Test Plan được duyệt. Điều này giữ Backlog không lẫn tài liệu nháp."
        onClick={() => setActiveStep("plan")}
      />
    );
  if (!approvedCases.length)
    return (
      <Blocked
        title="Cần Test Case được QA duyệt"
        description="Feature Test Plan đã duyệt nhưng chưa có Test Case sẵn sàng. Hãy sinh và gửi duyệt ít nhất một Test Case trước khi lập Backlog hoặc Cycle."
        onClick={() => setActiveStep("review")}
      />
    );
  return (
    <Card className="p-5">
      <SectionTitle
        title="Bàn giao sang Agile / Scrum"
        description="Tài liệu đã hoàn tất. Từ đây, lập kế hoạch theo tuần bằng cách đưa từng Test Case đã duyệt vào Cycle trên Test Board."
      />
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-violet-50 p-4 dark:bg-violet-950/30">
          <p className="text-2xl font-bold text-violet-800 dark:text-violet-200">
            {approvedCases.length}
          </p>
          <p className="mt-1 text-xs font-semibold text-violet-700 dark:text-violet-300">
            Test Case đã duyệt
          </p>
        </div>
        <div className="rounded-xl bg-sky-50 p-4 dark:bg-sky-950/30">
          <p className="truncate text-sm font-bold text-sky-900 dark:text-sky-100">
            {activeCycle?.name || boardCycle?.name || "Chưa có Cycle"}
          </p>
          <p className="mt-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
            {activeCycle
              ? "Cycle đang thực hiện"
              : boardCycle
                ? "Cycle đang lập kế hoạch"
                : "Cycle đang thực hiện"}
          </p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-4 dark:bg-emerald-950/30">
          <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-200">
            {cycles.data?.length || 0}
          </p>
          <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            Cycle đã tạo
          </p>
        </div>
      </div>
      <ol className="mt-6 space-y-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
        <li className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            1
          </span>
          <span>
            Tạo hoặc chọn <strong>Cycle tuần này</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            2
          </span>
          <span>
            Mở <strong>Test Board</strong>; nếu case đã được xếp vào Cycle,
            Board sẽ tự mở đúng Cycle đó.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            3
          </span>
          <span>
            Gán các case cần làm tuần này vào Cycle, phân công và kéo thẻ qua
            Todo → In Progress → In Review → Done.
          </span>
        </li>
      </ol>
      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
        <Button variant="outline" asChild>
          <Link to={`/cycles?project=${project}`}>Lập Cycle / Sprint</Link>
        </Button>
        <Button asChild>
          <Link to={boardLink}>
            Mở Test Board ({approvedCases.length} case)
          </Link>
        </Button>
        <Button variant="outline" onClick={() => setActiveStep("runtime")}>
          Tiếp tục chuẩn bị chạy <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

function ReviewGateStep({ cases, members, reviewers, submitCase, onNext }) {
  const [reviewer, setReviewer] = useState("");
  const drafts = cases.filter((item) =>
    ["Draft", "Rejected"].includes(item.status || "Draft"),
  );
  const pending = cases.filter((item) => item.status === "NeedsReview");
  const approved = cases.filter((item) => item.status === "Approved");
  const send = (item) =>
    submitCase.mutate({
      id: item._id,
      body: {
        reviewer,
        reviewNote:
          "Xin QA Manager rà soát Test Case E2E trước khi đưa vào Cycle.",
      },
    });
  return (
    <Card className="p-5">
      <SectionTitle
        title="QA review / approve"
        description="Gửi từng Test Case nháp cho QA Manager trước. Approval Inbox chỉ hiển thị các case đã được gửi duyệt."
      />
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900">
          <strong className="text-2xl">{drafts.length}</strong>
          <p className="mt-1 text-xs text-slate-500">Chưa gửi duyệt</p>
        </div>
        <div className="rounded-xl bg-amber-50 p-4 dark:bg-amber-950/30">
          <strong className="text-2xl">{pending.length}</strong>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            Đang chờ QA Manager
          </p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-4 dark:bg-emerald-950/30">
          <strong className="text-2xl">{approved.length}</strong>
          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
            Đã duyệt
          </p>
        </div>
      </div>
      {drafts.length > 0 && (
        <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20">
          <Field label="QA Manager nhận duyệt">
            <Select
              value={reviewer}
              onChange={(event) => setReviewer(event.target.value)}
            >
              <option value="">Chọn QA Manager</option>
              {reviewers.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.fullName || item.email}
                </option>
              ))}
            </Select>
          </Field>
          {!reviewers.length && (
            <div className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <p>
                Project chưa có QA Manager khác để duyệt độc lập. Mời một người
                và gán vai trò <b>QA Manager</b>, sau đó quay lại đây.
              </p>
              <p className="text-xs">
                Thành viên Project hiện tại:{" "}
                {members.length
                  ? members
                      .map(
                        (item) =>
                          `${item.fullName || item.email} (${item.projectRole || "chưa gán vai trò"})`,
                      )
                      .join(" · ")
                  : "chưa tải được danh sách thành viên"}
                .
              </p>
              <Button size="sm" variant="outline" asChild>
                <Link to="/projects">Mở Projects để mời QA</Link>
              </Button>
            </div>
          )}
          <div className="mt-4 space-y-2">
            {drafts.map((item) => (
              <div
                key={item._id}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {item.testCaseId || "TC"} · {item.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.testSteps?.length || 0} bước ·{" "}
                    {item.priority || "Medium"}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={!reviewer || submitCase?.isPending}
                  onClick={() => send(item)}
                >
                  {submitCase?.isPending &&
                  String(submitCase.variables?.id) === String(item._id)
                    ? "Đang gửi…"
                    : "Gửi QA duyệt"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
      {pending.length > 0 && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          Đã gửi {pending.length} Test Case. QA Manager duyệt chúng trong
          Approval Inbox; sau khi duyệt, quay lại đây để tiếp tục Backlog &amp;
          Cycle.
        </div>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
        <Button variant="outline" asChild>
          <Link to="/approvals">Mở hàng chờ QA review</Link>
        </Button>
        <Button disabled={!approved.length} onClick={onNext}>
          Sang Backlog &amp; Cycle <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
