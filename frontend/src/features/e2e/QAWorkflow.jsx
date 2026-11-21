import { cloneElement, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileCode2,
  FileUp,
  Download,
  Layers3,
  Search,
  RotateCcw,
  X,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  agileApi,
  aiApi,
  e2eApi,
  executionApi,
  requirementApi,
  testCaseApi,
} from "@/api/client";
import { Badge, Button, Card, Dialog, Input, Select, Textarea } from "@/components/ui";
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

function ImportUndoButton({ profileId, artifactType, onDone }) {
  const batches = useQuery({ queryKey: ["document-import-batches", profileId, artifactType], queryFn: () => e2eApi.importBatches(profileId, artifactType), enabled: Boolean(profileId) });
  const latest = batches.data?.[0];
  const rollback = useMutation({
    mutationFn: () => e2eApi.rollbackImportBatch(latest._id),
    onSuccess: (result) => {
      toast.success(result.message || "Đã hoàn tác lần nhập.");
      batches.refetch();
      onDone?.();
    },
    onError: (error) => toast.error(error.message || "Không thể hoàn tác lần nhập."),
  });
  if (!latest) return null;
  return <Button size="sm" variant="outline" disabled={rollback.isPending} onClick={() => { if (window.confirm(`Hoàn tác lần nhập ${latest.fileName}? Bản nháp chưa được tham chiếu sẽ bị xóa; tài liệu đã liên kết sẽ chuyển sang Retired.`)) rollback.mutate(); }}><RotateCcw className="h-4 w-4" />{rollback.isPending ? "Đang hoàn tác…" : `Hoàn tác lần nhập · ${latest.artifactCount}`}</Button>;
}
const runtimeUrlForProfile = (profile) =>
  profile?.environment
    ? profile.environment.status === "Ready"
      ? profile.environment.targetUrl
      : ""
    : profile?.baseUrl || "";
const lines = (value = "") => String(value).split("\n").map((item) => item.trim()).filter(Boolean);
const workflowSteps = [
  ["requirement", "Nguồn & Test Basis"],
  ["plan", "Test Plan"],
  ["testcase", "Test Case"],
  ["review", "Review & duyệt"],
  ["documents", "Hoàn tất & xuất file"],
];
const executionWorkspaceSteps = new Set(["agile", "runtime", "automation", "execution", "result"]);
const executionWorkspaceLabels = {
  agile: "Bàn giao Agile",
  runtime: "Môi trường chạy",
  automation: "Automation",
  execution: "Thực thi Test Run",
  result: "Kết quả & báo cáo",
};
const sourceTabs = [
  ["requirement", "Requirement"],
  ["usecase", "Use Case"],
  ["story", "User Story"],
];
const primaryStepId = (step) => ["requirement", "evidence", "usecase", "story", "derived"].includes(step) ? "requirement" : step === "documents" ? "documents" : step;
const workflowStepLabel = (step) => workflowSteps.find(([id]) => id === primaryStepId(step))?.[1] || "Nguồn & Test Basis";

function getDerivationGuidance(requirementCount, useCaseCount, storyCount) {
  const total = requirementCount + useCaseCount + storyCount;
  if (!total) return { tone: "slate", title: "Chưa có nguồn được xác nhận", description: "AI chỉ tạo tài liệu dẫn xuất sau khi có ít nhất một Test Basis nguồn được xác nhận.", action: false };
  return { tone: "blue", title: "Workspace tài liệu AI dẫn xuất", description: "Tùy chọn: chọn nguồn cụ thể và định dạng đích. Kết quả không được tính là nguồn, không ảnh hưởng điều kiện sang Test Plan.", action: true, actionLabel: "Mở workspace AI" };
}

export default function QAWorkflow(props) {
  const navigate = useNavigate();
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
    addUseCase,
    approveUseCase,
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
  const currentWorkflowStep = primaryStepId(activeStep);
  const executionWorkspace = executionWorkspaceSteps.has(activeStep);
  const workflowStepIndex = Math.max(0, workflowSteps.findIndex(([id]) => id === currentWorkflowStep));
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
  const designPlan = approvedPlan;
  const approvedCaseCount = currentCases.filter(
    (item) => item.status === "Approved",
  ).length;
  const coveredBasisIds = new Set(currentCases.flatMap((item) => [item.primaryTestBasis?.basisId, ...(item.linkedRequirements || []), ...(item.e2e?.requirements || []), ...(item.linkedUserStories || []), item.userStory, ...(item.linkedUseCases || []), item.e2e?.useCase]).map((item) => String(item?._id || item || "")).filter(Boolean));
  const criticalSelectedBasis = [...(props.requirements?.data || []).filter((item) => item.status === "Baselined" && ["Critical", "High"].includes(item.priority)), ...(useCases.data || []).filter((item) => item.status === "Approved" && ["Critical", "High"].includes(item.risk)), ...currentStories.filter((item) => item.approvalStatus === "Approved" && ["Critical", "High"].includes(item.priority))].filter((item) => [ ...(currentProfile?.workflow?.testBasisSelection?.requirements || []), ...(currentProfile?.workflow?.testBasisSelection?.useCases || []), ...(currentProfile?.workflow?.testBasisSelection?.userStories || [])].some((id) => String(id?._id || id) === String(item._id)));
  const uncoveredCriticalCount = criticalSelectedBasis.filter((item) => !coveredBasisIds.has(String(item._id))).length;
  const baselineRequirementCount = (props.requirements?.data || []).filter((item) => item.status === "Baselined").length;
  const approvedUseCaseCount = (useCases.data || []).filter((item) => item.status === "Approved" && item.origin !== "AIProfile").length;
  const approvedStoryCount = currentStories.filter((item) => item.approvalStatus === "Approved" && item.source !== "AI").length;
  const sourceUseCaseCount = (useCases.data || []).filter((item) => item.origin !== "AIProfile").length;
  const sourceStoryCount = currentStories.filter((item) => item.source !== "AI").length;
  const approvedTestBasisCount = baselineRequirementCount + approvedUseCaseCount + approvedStoryCount;
  const confirmedSelection = currentProfile?.workflow?.testBasisSelection;
  const selectedBasisCount = (confirmedSelection?.requirements?.length || 0) + (confirmedSelection?.useCases?.length || 0) + (confirmedSelection?.userStories?.length || 0);
  const hasApprovedTestBasis = Boolean(confirmedSelection?.confirmed && selectedBasisCount > 0);
  const reviewNeededCount = (props.requirements?.data || []).filter((item) => ["Draft", "NeedsReview", "Changed", "PendingApproval"].includes(item.status)).length
    + (useCases.data || []).filter((item) => ["Draft", "PendingApproval"].includes(item.status)).length
    + currentStories.filter((item) => ["Draft", "PendingApproval"].includes(item.approvalStatus)).length;
  const derivationGuidance = getDerivationGuidance(baselineRequirementCount, approvedUseCaseCount, approvedStoryCount);
  const openTestBasisLibrary = (type) => navigate(`/documents?${new URLSearchParams({ project: String(activeProject || ""), profile: String(currentProfile?._id || ""), type }).toString()}`);
  const stepStatus = {
    requirement: baselineRequirementCount ? `${baselineRequirementCount} đã Baseline` : "",
    evidence: currentProfile?.repository?.fullName ? "Đã phân tích" : "Tuỳ chọn",
    usecase: (useCases.data || []).some((item) => item.status === "Approved" && item.origin !== "AIProfile")
      ? "Có mục đã duyệt"
      : "",
    story: currentStories.some((item) => item.approvalStatus === "Approved" && item.source !== "AI")
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
  const workflowStepStatus = {
    requirement: approvedTestBasisCount ? `${approvedTestBasisCount} Test Basis đã duyệt${hasApprovedTestBasis ? " · đã xác nhận phạm vi" : " · chờ xác nhận phạm vi"}` : "",
    plan: testPlans.length ? `${testPlans.length} Test Plan đã lưu` : "",
    testcase: currentCases.length ? `${currentCases.length} Test Case đã lưu` : "",
    review: approvedCaseCount ? `${approvedCaseCount} Test Case đã duyệt` : "",
    documents: approvedCaseCount ? "Sẵn sàng xuất file" : "",
  };
  const artifactStepCounts = {
    requirement: props.requirements?.data?.length || 0,
    evidence: currentProfile?.repository?.fullName ? 1 : 0,
    usecase: sourceUseCaseCount,
    story: sourceStoryCount,
    plan: testPlans.length,
    suite: suites.data?.length || 0,
    testcase: currentCases.length,
  };
  const savedDocumentCount = Object.entries(artifactStepCounts).filter(([id]) => !["evidence", "suite"].includes(id)).reduce((total, [, count]) => total + count, 0);
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
        onNext={() => setActiveStep("requirement")}
      />
    ),
    usecase: (
      <UseCaseStep
        useCase={useCase}
        profile={currentProfile}
        setUseCase={setUseCase}
        addUseCase={addUseCase}
        approveUseCase={approveUseCase}
        useCases={useCases}
        requirements={props.requirements}
        canContinue={hasApprovedTestBasis}
        onStored={() => openTestBasisLibrary("Use Case")}
        onNext={() => setActiveStep("plan")}
      />
    ),
    story: (
      <UserStoryStep
        project={activeProject}
        profile={currentProfile}
        intake={intake}
        useCases={useCases}
        requirements={props.requirements}
        stories={currentStories}
        StoryDraftCard={StoryDraftCard}
        user={props.user}
        updateStory={props.updateStory}
        submitStory={props.submitStory}
        qaReviewStory={props.qaReviewStory}
        download={props.download}
        canContinue={hasApprovedTestBasis}
        onStored={() => openTestBasisLibrary("User Story")}
        onNext={() => setActiveStep("plan")}
      />
    ),
    derived: (
      <DerivedDocumentsStep
        project={activeProject}
        profile={currentProfile}
        requirements={props.requirements}
        useCases={useCases}
        stories={currentStories}
        onUseCasesStored={() => openTestBasisLibrary("Use Case")}
        onStoryStored={() => openTestBasisLibrary("User Story")}
      />
    ),
    plan: (
      <TestPlanningDocumentEditor
        key={`${activeProject}:${currentProfile?._id}`}
        setActiveStep={setActiveStep}
        activeProject={activeProject}
        profile={currentProfile}
        stories={currentStories}
        items={testPlans}
        requirements={props.requirements?.data || []}
        useCases={useCases.data || []}
        onNext={() => setActiveStep("testcase")}
      />
    ),
    suite: (
      <SuiteStep
        project={activeProject}
        profile={currentProfile}
        suites={suites}
        createSuite={createSuite}
        setActiveStep={setActiveStep}
        blocked={!approvedPlan}
        onNext={() => setActiveStep("testcase")}
      />
    ),
    testcase: designPlan ? (
      <>
        <TestCaseStep
          {...props}
          currentStories={currentStories}
          requirements={props.requirements}
          designPlan={designPlan}
        />
        <Button
          variant="outline"
          disabled={!currentCases.length || uncoveredCriticalCount > 0}
          onClick={() => setActiveStep("review")}
        >
          {uncoveredCriticalCount ? `Còn ${uncoveredCriticalCount} nguồn High/Critical chưa bao phủ` : "Sang QA review"} <ArrowRight className="h-4 w-4" />
        </Button>
      </>
    ) : (
      <Blocked
        title="Cần tạo bản nháp Test Plan"
        description="Test Plan cần xác định phạm vi và cách tiếp cận trước khi thiết kế Test Case; có thể review và duyệt song song sau đó."
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
          onNext={() => setActiveStep("documents")}
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
        onBound={() => setActiveStep(props.requestedRun ? "execution" : "automation")}
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
        project={activeProject}
        profile={currentProfile}
        profiles={profiles.data || []}
        requirements={props.requirements?.data || []}
        useCases={useCases.data || []}
        stories={currentStories}
        plans={testPlans}
        suites={suites.data || []}
        cases={currentCases}
        setActiveStep={setActiveStep}
        onResolveGap={(item) => {
          props.setCaseTarget?.({
            requirementId: item.type === "Requirement" ? String(item.id) : "",
            storyId: item.type === "UserStory" ? String(item.id) : "",
            useCaseId: item.type === "UseCase" ? String(item.id) : "",
            suiteId: "",
          });
          setActiveStep("testcase");
        }}
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
        alternateContent={["UserStory", "UseCase"].includes(intake.documentType) ? cloneElement(content[{ UserStory: "story", UseCase: "usecase" }[intake.documentType]], { intakeOnly: true, reference: intake.reference }) : null}
        canContinue={hasApprovedTestBasis}
        onStored={() => openTestBasisLibrary("Requirement")}
        onNext={() => setActiveStep("plan")}
      />
  );

  return (
    <div className="e2e-workflow space-y-5 pb-8">
      <PageHeader
        eyebrow={executionWorkspace ? "Test execution workspace" : "QA delivery workflow"}
        title={executionWorkspace ? executionWorkspaceLabels[activeStep] : "Luồng E2E theo quy trình QA"}
        description={executionWorkspace ? "Chạy các Test Case trong Test Run, ghi kết quả riêng từng case và thu evidence mà không quay lại luồng tạo tài liệu." : "Chọn đúng mục tiêu cho lần làm việc này. Mọi tài liệu được lưu độc lập, nên bạn có thể dừng và quay lại bất cứ lúc nào."}
        actions={executionWorkspace ? <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to={`/board?project=${activeProject}`}>Quay lại Test Board</Link></Button><Button variant="outline" asChild><Link to={`/ai-generator?${new URLSearchParams({ project: String(activeProject || ""), profile: String(currentProfile?._id || ""), step: "documents" }).toString()}`}><FileCheck2 className="h-4 w-4" />Tài liệu nguồn</Link></Button></div> : currentProfile && <Button variant="outline" asChild><Link to={`/documents?${new URLSearchParams({ project: String(activeProject || ""), profile: String(currentProfile._id || "") }).toString()}`}><FileCheck2 className="h-4 w-4" />Mở thư viện tài liệu</Link></Button>}
      />
      {!executionWorkspace && <WorkflowRunPanel
        profile={currentProfile}
        profiles={profiles.data || []}
        liveCounts={{ requirements: props.requirements?.data?.length || 0, useCases: sourceUseCaseCount, stories: sourceStoryCount, plans: testPlans.length, suites: suites.data?.length || 0, testCases: currentCases.length }}
        selectProfile={selectProfile}
        setActiveStep={setActiveStep}
        startWorkflowRun={startWorkflowRun}
        updateWorkflowProgress={updateWorkflowProgress}
        currentStep={currentWorkflowStep}
      />}
      {!executionWorkspace && <Card className="overflow-hidden border-slate-200 shadow-sm dark:border-slate-700">
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
            <p className="font-semibold text-slate-800 dark:text-white">Bước {workflowStepIndex + 1}/{workflowSteps.length} · {workflowStepLabel(activeStep)}</p>
            <p className="mt-1">Flow hiện tại dừng sau khi Test Case được duyệt và xuất file.</p>
          </div>
        </div>
        <nav
          aria-label="Quy trình thiết kế kiểm thử"
          className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 xl:grid-cols-5"
        >
          {workflowSteps.map(([id, label], position) => {
            const active = currentWorkflowStep === id;
            const completed = Boolean(workflowStepStatus[id]);
            const blocked = (id === "plan" && !hasApprovedTestBasis) || (id === "testcase" && !approvedPlan) || (id === "review" && !currentCases.length) || (id === "documents" && !approvedCaseCount);
            const hasSavedStop = Boolean(currentProfile?.workflow?.lastPausedStep);
            const stoppedHere = hasSavedStop && primaryStepId(currentProfile.workflow.lastPausedStep) === id;
            return <div key={id} className="relative min-w-0">
              <button type="button" aria-current={active ? "step" : undefined} onClick={() => setActiveStep(id)} className={`flex h-full w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-3 ${stoppedHere || (active && !hasSavedStop) ? "pr-24" : "pr-3"} text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${active ? completed ? "border-emerald-700 bg-emerald-600 text-white shadow-md ring-2 ring-violet-200 dark:border-emerald-500 dark:bg-emerald-700 dark:ring-violet-950" : "border-violet-700 bg-violet-700 text-white shadow-md dark:border-violet-500 dark:bg-violet-700" : completed ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-400 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200" : "border-slate-200 bg-white text-slate-800 hover:border-violet-400 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${active ? "bg-white/20" : completed ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>{completed ? <CheckCircle2 className="h-4 w-4" /> : position + 1}</span>
                <span className="min-w-0"><span className="text-sm font-bold">{label}</span><span className={`mt-0.5 block text-[11px] ${active ? completed ? "text-emerald-50" : "text-violet-100" : "text-slate-500 dark:text-slate-400"}`}>{active ? completed ? workflowStepStatus[id] : "Đang thực hiện" : blocked ? id === "plan" ? "Cần xác nhận Test Basis Selection" : id === "testcase" ? "Cần Test Plan đã duyệt" : id === "review" ? "Cần Test Case nháp" : "Cần Test Case đã duyệt" : workflowStepStatus[id] || "Chưa có dữ liệu"}</span></span>
              </button>
              {(stoppedHere || (active && !hasSavedStop)) && <button type="button" title={stoppedHere ? "Đây là mốc làm việc đã lưu gần nhất" : "Lưu bước đang mở làm mốc để lần sau tiếp tục"} disabled={updateWorkflowProgress.isPending || stoppedHere} onClick={(event) => { event.stopPropagation(); updateWorkflowProgress.mutate({ status: "Paused", lastStep: id }); }} className={`absolute right-2 top-2 rounded-full border px-2 py-1 text-[9px] font-bold shadow-sm transition ${stoppedHere ? "cursor-default border-amber-400 bg-amber-100 text-amber-900" : "border-white/40 bg-white/15 text-white hover:bg-white/25"}`}>{stoppedHere ? "Đã dừng ở đây" : "Dừng ở đây"}</button>}
            </div>;
          })}
        </nav>
        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{workflowStepLabel(activeStep)}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{savedDocumentCount} tài liệu đã lưu trong đợt này. Bản đang nhập dở được tự động khôi phục.</p></div><Button variant="outline" onClick={() => setActiveStep("documents")}><FileCheck2 className="h-4 w-4" /> Thư viện tài liệu <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700 dark:bg-violet-950 dark:text-violet-200">{savedDocumentCount}</span></Button></div>
          {currentWorkflowStep === "requirement" && <div className="mt-4 space-y-4">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Chọn loại Test Basis</p><p className="mt-1 text-xs text-slate-500">Requirement, Use Case và User Story là ba đầu vào ngang hàng. Dự án chỉ cần ít nhất một loại đã được xác nhận.</p></div><Badge tone="blue">Ít nhất 1 loại</Badge></div>
              <nav aria-label="Loại Test Basis nguồn" className="mt-3 flex flex-wrap gap-2">{sourceTabs.map(([id, label]) => <button key={id} type="button" aria-current={activeStep === id ? "page" : undefined} onClick={() => setActiveStep(id)} className={`inline-flex min-h-10 items-center rounded-lg border px-3 py-2 text-sm font-semibold transition ${activeStep === id ? "border-violet-600 bg-violet-50 text-violet-800 dark:border-violet-400 dark:bg-violet-950/40 dark:text-violet-200" : "border-slate-200 text-slate-600 hover:border-violet-300 dark:border-slate-700 dark:text-slate-300"}`}>{label}{stepStatus[id] && <span className="ml-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">· {stepStatus[id]}</span>}</button>)}</nav>
            </div>
            {approvedTestBasisCount > 0 && <TestBasisSelectionGate profile={currentProfile} requirements={(props.requirements?.data || []).filter((item) => item.status === "Baselined")} useCases={(useCases.data || []).filter((item) => item.status === "Approved" && item.origin !== "AIProfile")} stories={currentStories.filter((item) => item.approvalStatus === "Approved" && item.source !== "AI")} onConfirmed={() => profiles.refetch()} />}
            <div className="grid gap-3 xl:grid-cols-2">
              <section className={`rounded-xl border p-4 ${hasApprovedTestBasis ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20"}`}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-start gap-3">{hasApprovedTestBasis ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}<div><p className="text-sm font-bold">{hasApprovedTestBasis ? "Đã sẵn sàng sang Test Plan" : reviewNeededCount ? `${reviewNeededCount} bản nháp cần được rà soát` : "Chưa có Test Basis được xác nhận"}</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{hasApprovedTestBasis ? `${approvedTestBasisCount} tài liệu đã được xác nhận. Rà soát không phải bước riêng; chỉ mở Thư viện khi còn bản nháp cần sửa hoặc duyệt.` : reviewNeededCount ? "Mở Thư viện tài liệu, kiểm tra nội dung rồi gửi duyệt/Baseline. Sau khi có một tài liệu được xác nhận, Test Plan sẽ được mở." : "Hãy tự nhập hoặc tải lên một Requirement, Use Case hay User Story."}</p>{reviewNeededCount > 0 && hasApprovedTestBasis && <p className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">Ngoài ra còn {reviewNeededCount} bản nháp chưa được xác nhận.</p>}</div></div><div className="flex flex-wrap gap-2">{reviewNeededCount > 0 && <Button size="sm" variant="outline" onClick={() => setActiveStep("documents")}><FileCheck2 className="h-4 w-4" />Mở Thư viện để rà soát</Button>}{hasApprovedTestBasis && <Button size="sm" onClick={() => setActiveStep("plan")}>Tiếp tục Test Plan <ArrowRight className="h-4 w-4" /></Button>}</div></div></section>
              <section className={`rounded-xl border p-4 ${activeStep === "derived" ? "border-violet-400 bg-violet-50 ring-2 ring-violet-100 dark:border-violet-700 dark:bg-violet-950/30 dark:ring-violet-950" : "border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/20"}`}><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Layers3 className="h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300" /><p className="text-sm font-bold">Gợi ý AI <span className="font-medium text-sky-700 dark:text-sky-300">· Không bắt buộc</span></p></div><p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{derivationGuidance.title}</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{derivationGuidance.description}</p></div>{derivationGuidance.action && <Button size="sm" variant={activeStep === "derived" ? "default" : "outline"} onClick={() => setActiveStep("derived")}>{derivationGuidance.actionLabel}</Button>}</div></section>
            </div>
          </div>}
        </div>
      </Card>}
      {executionWorkspace && <Card className="border-violet-200 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-4 dark:border-violet-900 dark:from-violet-950/30 dark:via-slate-900 dark:to-sky-950/20"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">Đang ở khu vực thực thi</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{executionWorkspaceLabels[activeStep]} · Project {projects.data?.find((item) => String(item._id) === String(activeProject))?.name || "đang chọn"}</p></div><div className="flex flex-wrap gap-2">{[["runtime", "Môi trường"], ["automation", "Automation"], ["execution", "Test Run"], ["result", "Báo cáo"]].map(([id, label]) => <Button key={id} size="sm" variant={activeStep === id ? "default" : "outline"} onClick={() => setActiveStep(id)}>{label}</Button>)}</div></div></Card>}
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

function TestBasisSelectionGate({ profile, requirements, useCases, stories, onConfirmed }) {
  const saved = profile?.workflow?.testBasisSelection;
  const allIds = [...requirements, ...useCases, ...stories].map((item) => String(item._id));
  const savedIds = [...(saved?.requirements || []), ...(saved?.useCases || []), ...(saved?.userStories || [])].map((item) => String(item?._id || item));
  const [selected, setSelected] = useState(() => savedIds.length ? savedIds : allIds);
  const [scopeSummary, setScopeSummary] = useState(saved?.scopeSummary || "");
  useEffect(() => { setSelected(savedIds.length ? savedIds : allIds); setScopeSummary(saved?.scopeSummary || ""); }, [profile?._id, requirements.length, useCases.length, stories.length]);
  const confirm = useMutation({
    mutationFn: () => e2eApi.confirmTestBasisSelection(profile._id, {
      requirements: requirements.filter((item) => selected.includes(String(item._id))).map((item) => item._id),
      useCases: useCases.filter((item) => selected.includes(String(item._id))).map((item) => item._id),
      userStories: stories.filter((item) => selected.includes(String(item._id))).map((item) => item._id),
      scopeSummary, conflicts: saved?.conflicts || [], gaps: saved?.gaps || [],
    }),
    onSuccess: () => { toast.success("Đã xác nhận phạm vi Test Basis cho Test Plan."); onConfirmed?.(); },
    onError: (error) => toast.error(error.message || "Không thể xác nhận Test Basis."),
  });
  const rows = [
    ...requirements.map((item) => ({ ...item, kind: "Requirement", label: `${item.requirementId || "REQ"} · ${item.title}` })),
    ...useCases.map((item) => ({ ...item, kind: "Use Case", label: `${item.code || "UC"} · ${item.name}` })),
    ...stories.map((item) => ({ ...item, kind: "User Story", label: item.title })),
  ];
  const toggle = (id) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  return <details className="rounded-xl border border-violet-200 bg-white p-4 dark:border-violet-900 dark:bg-slate-900" open={!saved?.confirmed}>
    <summary className="cursor-pointer text-sm font-bold">Xác nhận Test Basis dùng cho đợt này {saved?.confirmed && <Badge tone="green">Đã xác nhận</Badge>}</summary>
    <p className="mt-2 text-xs leading-5 text-slate-500">Chỉ chọn nguồn có thẩm quyền đã Baseline/duyệt. Tài liệu AI dẫn xuất và tài liệu kỹ thuật không xuất hiện trong danh sách này.</p>
    <div className="mt-3 max-h-52 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3 dark:border-slate-700">{rows.map((item) => <label key={item._id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-violet-600" checked={selected.includes(String(item._id))} onChange={() => toggle(String(item._id))} /><span><b>{item.kind}</b> · {item.label}</span></label>)}</div>
    <Field label="Tóm tắt phạm vi đã chọn"><Textarea rows={2} value={scopeSummary} onChange={(event) => setScopeSummary(event.target.value)} placeholder="Phạm vi tổng hợp để Test Plan sử dụng; không thêm hành vi ngoài nguồn đã chọn." /></Field>
    {!!saved?.conflicts?.some((item) => ["High", "Critical"].includes(item.severity) && !item.resolution) && <p className="mt-2 text-xs font-semibold text-rose-700">Còn xung đột High/Critical chưa được xử lý; chưa thể xác nhận.</p>}
    <div className="mt-3 flex justify-end"><Button size="sm" disabled={!selected.length || confirm.isPending} onClick={() => confirm.mutate()}>{confirm.isPending ? "Đang xác nhận…" : "Xác nhận phạm vi Test Basis"}</Button></div>
  </details>;
}

function WorkflowRunPanel({ profile, profiles, liveCounts, selectProfile, setActiveStep, startWorkflowRun, updateWorkflowProgress, currentStep }) {
  const workflow = profile?.workflow || {};
  const summary = profile?.workflowSummary || {};
  const counts = { ...(summary.artifactCounts || {}), ...(liveCounts || {}) };
  const status = workflow.status || "Active";
  const lastStep = workflow.lastStep || "requirement";
  const lastStepLabel = workflowStepLabel(lastStep);
  const statusLabel = { Active: "Đang thực hiện", Paused: "Tạm dừng", Completed: "Đã hoàn tất" }[status] || status;
  const tone = status === "Active" ? "green" : status === "Completed" ? "blue" : "amber";
  const startNewRun = () => {
    if (window.confirm("Bắt đầu một đợt mới từ bước Nguồn & Test Basis? Đợt hiện tại và toàn bộ tài liệu đã sinh sẽ được giữ nguyên để tra cứu.")) startWorkflowRun.mutate();
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
          <p className="text-sm text-slate-600 dark:text-slate-300">{status === "Paused" ? "Đã dừng ở" : "Đang ở"} <strong className="text-slate-900 dark:text-white">{lastStepLabel}</strong> · Hoạt động {formatDocumentDate(summary.latestActivityAt || workflow.lastActivityAt || profile.updatedAt)}</p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[["Requirement", counts.requirements], ["Use Case", counts.useCases], ["User Story", counts.stories], ["Test Plan", counts.plans], ["Test Case", counts.testCases]].map(([label, value]) => <div key={label} className="rounded-lg border border-white bg-white/80 px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/70"><p className="text-lg font-bold">{value || 0}</p><p className="text-[11px] text-slate-500">{label}</p></div>)}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {status !== "Active" && <Button variant="outline" disabled={updateWorkflowProgress.isPending} onClick={() => { setActiveStep(lastStep); updateWorkflowProgress.mutate({ status: "Active", lastStep }); }}>Tiếp tục từ {lastStepLabel}</Button>}
        {status === "Active" && <Button variant="outline" disabled={updateWorkflowProgress.isPending} onClick={() => updateWorkflowProgress.mutate({ status: "Paused", lastStep: currentStep || lastStep })}>Dừng ở đây</Button>}
        <Button disabled={startWorkflowRun.isPending} onClick={startNewRun}>{startWorkflowRun.isPending ? "Đang tạo…" : "Bắt đầu đợt mới"}</Button>
      </div>
    </div>
    <p className="mt-3 text-xs text-slate-500">Mỗi đợt là một phạm vi độc lập. Bắt đầu đợt mới không xoá, ghi đè hay trộn tài liệu của đợt cũ.</p>
  </Card>;
}

function RequirementStep({ profile, requirements, intake, setIntake, draft, onDraftSave, onDraftClear, onNext, onStored, canContinue, alternateContent, evidenceContent }) {
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
      const created = await e2eApi.createRequirement({ ...form, type: intake.documentType === "ChangeRequest" ? "ChangeRequest" : form.type, source, scope: { level: intake.scopeLevel, name: intake.scopeName }, systemProfile: profile._id, actors: lines(form.actors), inScope: lines(form.inScope), outOfScope: lines(form.outOfScope), businessRules: lines(form.businessRules), acceptanceCriteria: lines(form.acceptanceCriteria), nonFunctionalRequirements: lines(form.nonFunctionalRequirements), risks: lines(form.risks), assumptions: lines(form.assumptions), dependencies: lines(form.dependencies), testDataRequirements: lines(form.testDataRequirements), dataRestrictions: lines(form.dataRestrictions) });
      await Promise.all(referenceImages.map(({ file }) => e2eApi.uploadRequirementImage(created._id, file)));
      return created;
    },
    onSuccess: () => { toast.success(referenceImages.length ? "Đã lưu Requirement và đính kèm ảnh tham chiếu." : "Đã lưu Requirement nháp từ đề bài khách hàng."); setForm(blank()); setReferenceImages([]); onDraftClear?.(); requirements.refetch(); onStored?.(); },
    onError: (error) => toast.error(error.message),
  });
  const importDocument = useMutation({
    mutationFn: (file) => {
      return e2eApi.importRequirements(profile._id, { ...source, type: "CustomerDocument" }, file, { level: intake.scopeLevel, name: intake.scopeName }, intake.documentType, []);
    },
    onSuccess: (result) => { toast.success(result.message || "Đã trích xuất Requirement nháp; hãy rà soát trước khi Baseline."); requirements.refetch(); onStored?.(); },
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
  const canSave = form.title && form.description && form.objective && lines(form.actors).length && lines(form.inScope).length && lines(form.acceptanceCriteria).length && source.title.trim() && source.receivedAt && scopeReady;
  if (mode === "modern") return <ModernRequirementEditor {...{ profile, intake, updateIntake, form, update, source, canSave, mutation, importDocument, items, baselined, decide, onNext, canContinue, alternateContent, evidenceContent, referenceImages, setReferenceImages, draft }} onImportRollback={() => requirements.refetch()} />;
  return <Card className="p-5 sm:p-6">
    <SectionTitle title="Nhập nguồn yêu cầu" description="Chọn loại đầu vào để nhập ngay tại đây. Yêu cầu mô tả hành vi mong đợi. URL kiểm thử, thiết kế giao diện và mã nguồn giúp đối chiếu khi thiết kế hoặc chạy test." />
    <section className="mt-5 rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20">
      <p className="text-sm font-semibold">1. Phân loại và xác nhận nguồn</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Loại đầu vào *"><Select value={intake.documentType} onChange={(event) => updateIntake("documentType", event.target.value)}><option value="Requirement">Requirement / BRD / SRS / PRD</option><option value="UserStory">User Story / Product Backlog</option><option value="UseCase">Use Case / quy trình nghiệp vụ</option><option value="ChangeRequest">Change Request / đặc tả sửa lỗi</option></Select></Field>
        {["Requirement", "ChangeRequest"].includes(intake.documentType) && <>
        <Field label="Nguồn từ đâu? *"><Select value={intake.sourceSystem} onChange={(event) => updateIntake("sourceSystem", event.target.value)}>{["Customer", "ProductOwner", "Jira", "AzureDevOps", "Internal", "GitHub"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
        <Field label="Trạng thái nguồn *"><Select value={intake.officialStatus} onChange={(event) => updateIntake("officialStatus", event.target.value)}><option value="Official">Nguồn chính thức</option><option value="NeedsConfirmation">Cần Business Owner xác nhận</option></Select></Field>
        <Field label="Ngày nhận *"><Input type="date" value={intake.receivedAt} onChange={(event) => updateIntake("receivedAt", event.target.value)} /></Field>
        <Field label="Tên tài liệu / ticket *"><Input value={intake.title} onChange={(event) => updateIntake("title", event.target.value)} placeholder="BRD thanh toán / PROJ-123" /></Field>
        <Field label="Người/đơn vị cung cấp (tùy chọn)"><Input list="requirement-provider-suggestions" value={intake.provider} onChange={(event) => updateIntake("provider", event.target.value)} placeholder="Chọn gợi ý hoặc nhập tự do" /><datalist id="requirement-provider-suggestions"><option value="Khách hàng" /><option value="Business Owner" /><option value="Đội nội bộ" /><option value="Đối tác bên ngoài" /></datalist></Field>
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
    {mode === "document" ? <div className="mt-5 rounded-xl border border-dashed border-violet-300 bg-violet-50/50 p-5 dark:border-violet-900 dark:bg-violet-950/20"><p className="font-semibold">Tải đề bài khách hàng</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Điền tên nguồn và ngày nhận trước. Hệ thống chỉ tạo bản nháp, không tự Baseline Requirement.</p><label className="mt-4 inline-flex h-10 cursor-pointer items-center rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white"><FileUp className="mr-2 h-4 w-4" />{importDocument.isPending ? "Đang trích xuất…" : "Chọn PDF, DOC hoặc DOCX"}<input className="hidden" type="file" accept=".pdf,.doc,.docx" disabled={!source.title.trim() || !source.receivedAt || importDocument.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) importDocument.mutate(file); event.target.value = ""; }} /></label></div> : <div className="mt-5 space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="grid gap-4 md:grid-cols-2"><Field label="Requirement ID"><Input value={form.requirementId} onChange={(e) => update("requirementId", e.target.value)} placeholder="REQ-ORDER-001 (để trống để tự sinh)" /></Field><Field label="Release / version áp dụng"><Input value={form.release} onChange={(e) => update("release", e.target.value)} placeholder="Release 1.2" /></Field><Field label="Tiêu đề yêu cầu *"><Input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Customer đặt đơn hàng" /></Field><Field label="Loại / ưu tiên"><div className="grid grid-cols-2 gap-2"><Select value={form.type} onChange={(e) => update("type", e.target.value)}>{["Functional", "NonFunctional", "BusinessRule", "Integration"].map((item) => <option key={item}>{item}</option>)}</Select><Select value={form.priority} onChange={(e) => update("priority", e.target.value)}>{["Critical", "High", "Medium", "Low"].map((item) => <option key={item}>{item}</option>)}</Select></div></Field></div><Field label="Mô tả yêu cầu *"><Textarea rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Hệ thống phải…" /></Field><Field label="Mục tiêu nghiệp vụ *"><Textarea rows={2} value={form.objective} onChange={(e) => update("objective", e.target.value)} placeholder="Giá trị/kết quả khách hàng mong đợi…" /></Field><div className="grid gap-4 md:grid-cols-2"><Field label="Actor / role * · mỗi dòng một mục"><Textarea rows={3} value={form.actors} onChange={(e) => update("actors", e.target.value)} placeholder="Customer" /></Field><Field label="Phạm vi trong kiểm thử * · mỗi dòng một mục"><Textarea rows={3} value={form.inScope} onChange={(e) => update("inScope", e.target.value)} placeholder="Đặt hàng\nThanh toán" /></Field><Field label="Acceptance Criteria * · mỗi dòng một tiêu chí"><Textarea rows={4} value={form.acceptanceCriteria} onChange={(e) => update("acceptanceCriteria", e.target.value)} placeholder="Given… When… Then…" /></Field><Field label="Business rules · mỗi dòng một quy tắc"><Textarea rows={4} value={form.businessRules} onChange={(e) => update("businessRules", e.target.value)} placeholder="Chỉ được đặt món từ một nhà hàng trong cùng giỏ." /></Field></div><details><summary className="cursor-pointer text-sm font-semibold text-violet-700 dark:text-violet-300">Bổ sung NFR, rủi ro, dependency và chính sách dữ liệu</summary><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Ngoài phạm vi"><Textarea rows={3} value={form.outOfScope} onChange={(e) => update("outOfScope", e.target.value)} /></Field><Field label="Yêu cầu phi chức năng"><Textarea rows={3} value={form.nonFunctionalRequirements} onChange={(e) => update("nonFunctionalRequirements", e.target.value)} /></Field><Field label="Rủi ro"><Textarea rows={3} value={form.risks} onChange={(e) => update("risks", e.target.value)} /></Field><Field label="Giả định / phụ thuộc"><Textarea rows={3} value={`${form.assumptions}${form.assumptions && form.dependencies ? "\n" : ""}${form.dependencies}`} onChange={(e) => { const value = e.target.value; update("assumptions", value); update("dependencies", ""); }} /></Field><Field label="Dữ liệu test cần có"><Textarea rows={3} value={form.testDataRequirements} onChange={(e) => update("testDataRequirements", e.target.value)} /></Field><Field label="Dữ liệu cấm sử dụng"><Textarea rows={3} value={form.dataRestrictions} onChange={(e) => update("dataRestrictions", e.target.value)} placeholder="PII thật, token, mật khẩu, dữ liệu production" /></Field></div></details><div className="flex justify-end"><Button disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang lưu…" : "Lưu Requirement nháp"}</Button></div></div>}
    <div className="mt-7 border-t border-slate-200 pt-5 dark:border-slate-700"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Requirement trong đợt</p><p className="mt-1 text-xs text-slate-500">{baselined.length} Requirement đã Baseline. Requirement, Use Case và User Story đều có thể được dùng độc lập làm Test Basis.</p></div><Button variant="outline" disabled={!canContinue} onClick={onNext}>Tiếp tục Test Plan <ArrowRight className="h-4 w-4" /></Button></div>{items.length ? <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="min-w-[800px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800"><tr><th className="p-3">Requirement</th><th className="p-3">Nguồn khách hàng</th><th className="p-3">Trạng thái</th><th className="p-3 text-right">Thao tác</th></tr></thead><tbody>{items.map((item) => <tr key={item._id} className="border-t border-slate-200 dark:border-slate-700"><td className="p-3"><p className="font-semibold">{item.requirementId} · {item.title}</p><p className="mt-1 text-xs text-slate-500">{item.actors?.join(", ")} · {item.inScope?.join(", ")}</p></td><td className="p-3 text-xs">{item.source?.title}<br />{item.source?.provider}</td><td className="p-3"><Badge tone={item.status === "Baselined" ? "green" : item.status === "Rejected" ? "red" : "amber"}>{item.status}</Badge></td><td className="p-3 text-right">{item.status !== "Baselined" && <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: item._id, decision: "Baselined" })}>Baseline</Button>}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-slate-500">Chưa có Requirement. Bạn có thể nhập Requirement hoặc chọn Use Case/User Story làm Test Basis.</p>}</div>
    </>}
  </Card>;
}

function ModernRequirementEditor({ profile, intake, updateIntake, form, update, source, canSave, mutation, importDocument, items, baselined, decide, onNext, canContinue, alternateContent, evidenceContent, referenceImages, setReferenceImages, draft, onImportRollback }) {
  const [entryMode, setEntryMode] = useState("manual");
  const [activeSection, setActiveSection] = useState(1);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const completed = [form.title, form.description, form.objective, form.actors, form.inScope, form.acceptanceCriteria].filter(Boolean).length;
  const itemCount = items.length;
  const libraryUrl = `/documents?${new URLSearchParams({ project: String(profile?.project?._id || profile?.project || ""), profile: String(profile?._id || ""), type: "Requirement", mode: "governance" }).toString()}`;
  const sourceReady = source.title.trim() && source.receivedAt;
  const requirementLike = ["Requirement", "ChangeRequest"].includes(intake.documentType);
  return <Card className="overflow-hidden p-0">
    <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-sky-50 px-5 py-5 dark:border-violet-900/50 dark:from-violet-950/30 dark:via-slate-950 dark:to-sky-950/20 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">Test Basis workspace</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-950 dark:text-white">Requirement</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">Requirement là một trong ba loại Test Basis ngang hàng với Use Case và User Story. Bạn có thể nhập riêng loại này hoặc liên kết với các loại khác khi có căn cứ.</p></div><div className="rounded-xl border border-violet-200 bg-white/80 px-3 py-2 text-right text-xs shadow-sm dark:border-violet-800 dark:bg-slate-900/70"><p className="font-semibold text-violet-800 dark:text-violet-200">{completed}/6 nội dung cốt lõi</p><p className="mt-1 text-slate-500">{draft?.savedAt ? `Đã khôi phục bản nhập dở ${formatDocumentDate(draft.savedAt)}` : "Nội dung nhập dở được tự động lưu"}</p></div></div>
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
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">1. Nguồn & định danh</h3><p className="mt-1 text-xs text-slate-500">Thông tin truy vết được giữ lại cùng tài liệu, không lẫn với nội dung Requirement.</p></div>{requirementLike && <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800"><button type="button" onClick={() => setEntryMode("manual")} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${entryMode === "manual" ? "bg-white text-violet-700 shadow-sm dark:bg-slate-700 dark:text-violet-200" : "text-slate-500"}`}>Soạn tay</button><button type="button" onClick={() => setEntryMode("document")} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${entryMode === "document" ? "bg-white text-violet-700 shadow-sm dark:bg-slate-700 dark:text-violet-200" : "text-slate-500"}`}>Tải tài liệu</button></div>}</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Loại đầu vào *"><Select value={intake.documentType} onChange={(event) => updateIntake("documentType", event.target.value)}><option value="Requirement">Requirement / BRD / SRS / PRD</option><option value="UserStory">User Story / Product Backlog</option><option value="UseCase">Use Case / quy trình</option><option value="ChangeRequest">Change Request / đặc tả sửa lỗi</option></Select></Field>{["Requirement", "ChangeRequest"].includes(intake.documentType) && <><Field label="Tên nguồn *"><Input value={intake.title} onChange={(event) => updateIntake("title", event.target.value)} placeholder="BRD / CR / email khách hàng" /></Field><Field label="Người/đơn vị cung cấp (tùy chọn)"><Input list="modern-provider-suggestions" value={intake.provider} onChange={(event) => updateIntake("provider", event.target.value)} placeholder="Chọn gợi ý hoặc nhập tự do" /><datalist id="modern-provider-suggestions"><option value="Khách hàng" /><option value="Business Owner" /><option value="Đội nội bộ" /><option value="Đối tác bên ngoài" /></datalist></Field><Field label="Ngày nhận *"><Input type="date" value={intake.receivedAt} onChange={(event) => updateIntake("receivedAt", event.target.value)} /></Field></>}</div>
          {requirementLike && <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900 dark:bg-sky-950/20"><div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]"><Field label="Phạm vi tài liệu *"><Select value={intake.scopeLevel} onChange={(event) => updateIntake("scopeLevel", event.target.value)}><option value="System">Toàn hệ thống</option><option value="Module">Một module</option><option value="Feature">Một feature</option><option value="Flow">Một flow / hành trình</option></Select></Field><Field label={intake.scopeLevel === "System" ? "Tên hệ thống (tuỳ chọn)" : "Tên phạm vi *"}><Input value={intake.scopeName} onChange={(event) => updateIntake("scopeName", event.target.value)} placeholder={intake.scopeLevel === "System" ? "FoodRush" : "Ví dụ: Checkout"} /></Field></div></div>}
          {requirementLike && entryMode === "document" && <div className="mt-4 rounded-lg border border-dashed border-violet-300 bg-violet-50/50 p-4 dark:border-violet-900 dark:bg-violet-950/20"><p className="text-sm font-semibold">Tải BRD, SRS, PRD, Change Request hoặc email đã xuất file</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">AI chỉ trích xuất bản nháp; Business Owner vẫn là người Baseline.</p><div className="mt-3 flex flex-wrap items-center gap-3"><label className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700"><FileUp className="mr-2 h-4 w-4" />Chọn PDF, DOC hoặc DOCX<input className="hidden" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={importDocument.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) { setSelectedDocument(file); if (!intake.title.trim()) updateIntake("title", file.name); } event.target.value = ""; }} /></label>{selectedDocument && <span className="max-w-sm truncate text-xs font-medium text-slate-700 dark:text-slate-200">Đã chọn: {selectedDocument.name}</span>}</div>{selectedDocument && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-200 bg-white/80 p-3 text-xs dark:border-violet-800 dark:bg-slate-950/40"><span className={sourceReady ? "text-slate-600 dark:text-slate-300" : "text-amber-700 dark:text-amber-300"}>{sourceReady ? "Sẵn sàng trích xuất bản nháp." : "Cần điền Tên nguồn và Ngày nhận."}</span><Button size="sm" disabled={!sourceReady || importDocument.isPending} onClick={() => importDocument.mutate(selectedDocument)}>{importDocument.isPending ? "Đang trích xuất…" : "Trích xuất bản nháp"}</Button></div>}</div>}
        </section>}
        {!requirementLike ? <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-5 dark:border-violet-900 dark:bg-violet-950/20"><p className="text-sm font-semibold">Đã phân loại: {intake.documentType === "UserStory" ? "User Story / Product Backlog" : "Use Case / quy trình nghiệp vụ"}</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Hệ thống giữ nguyên loại tài liệu đầu vào; người dùng xác nhận liên kết.</p><div className="mt-4">{alternateContent}</div></section> : entryMode === "manual" && <>
          {activeSection === 2 && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-950/50 dark:text-violet-200">2</span><div><h3 className="font-semibold">Nhu cầu nghiệp vụ</h3><p className="text-xs text-slate-500">Viết như một tài liệu ngắn, không phải bảng dữ liệu.</p></div></div><div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]"><Field label="Tên Requirement *"><Input className="h-11 text-base font-medium" value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Ví dụ: Khách hàng có thể đặt đơn hàng" /></Field><div className="grid grid-cols-2 gap-2"><Field label="Loại"><Select value={form.type} onChange={(e) => update("type", e.target.value)}>{["Functional", "NonFunctional", "BusinessRule", "Integration"].map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Ưu tiên"><Select value={form.priority} onChange={(e) => update("priority", e.target.value)}>{["Critical", "High", "Medium", "Low"].map((item) => <option key={item}>{item}</option>)}</Select></Field></div></div><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Mục tiêu nghiệp vụ *" hint="Khách hàng nhận được giá trị gì?"><Textarea rows={4} value={form.objective} onChange={(e) => update("objective", e.target.value)} placeholder="Khách hàng có thể hoàn tất đặt hàng nhanh và biết đơn đã được ghi nhận." /></Field><Field label="Yêu cầu chi tiết *" hint="Hệ thống cần làm gì để đạt mục tiêu?"><Textarea rows={4} value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Hệ thống phải cho phép khách hàng chọn sản phẩm, xác nhận thông tin và tạo đơn hàng." /></Field></div></section>}
          {activeSection === 3 && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-950/50 dark:text-violet-200">3</span><div><h3 className="font-semibold">Phạm vi và tiêu chí chấp nhận</h3><p className="text-xs text-slate-500">Đây là cơ sở Business Owner xác nhận và QA đánh giá khả năng kiểm thử.</p></div></div><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Ai sử dụng? *" hint="Mỗi vai trò một dòng"><Textarea rows={3} value={form.actors} onChange={(e) => update("actors", e.target.value)} placeholder={"Khách hàng\nNhân viên vận hành"} /></Field><Field label="Trong phạm vi *" hint="Mỗi hạng mục một dòng"><Textarea rows={3} value={form.inScope} onChange={(e) => update("inScope", e.target.value)} placeholder={"Tạo đơn hàng\nXác nhận trạng thái đơn"} /></Field></div><Field className="mt-4" label="Acceptance Criteria *" hint="Mỗi tiêu chí một dòng, ưu tiên Given / When / Then"><Textarea rows={5} value={form.acceptanceCriteria} onChange={(e) => update("acceptanceCriteria", e.target.value)} placeholder={"Given giỏ hàng hợp lệ\nWhen khách hàng xác nhận đặt hàng\nThen hệ thống tạo đơn và hiển thị mã đơn hàng"} /></Field></section>}
          {activeSection === 4 && <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/30"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-950/50 dark:text-violet-200">4</span><div><h3 className="font-semibold">Chi tiết bổ sung</h3><p className="text-xs text-slate-500">Tùy chọn. Chỉ bổ sung khi cần làm rõ phạm vi hoặc chuẩn bị kiểm thử.</p></div></div><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Business rules"><Textarea rows={3} value={form.businessRules} onChange={(e) => update("businessRules", e.target.value)} placeholder="Mỗi quy tắc một dòng" /></Field><Field label="Ngoài phạm vi"><Textarea rows={3} value={form.outOfScope} onChange={(e) => update("outOfScope", e.target.value)} placeholder="Các hạng mục chưa xử lý ở phiên bản này" /></Field><Field label="Rủi ro / phụ thuộc"><Textarea rows={3} value={`${form.risks}${form.risks && form.dependencies ? "\n" : ""}${form.dependencies}`} onChange={(e) => { update("risks", e.target.value); update("dependencies", ""); }} /></Field><Field label="Dữ liệu test cần có / hạn chế"><Textarea rows={3} value={`${form.testDataRequirements}${form.testDataRequirements && form.dataRestrictions ? "\n" : ""}${form.dataRestrictions}`} onChange={(e) => { update("testDataRequirements", e.target.value); update("dataRestrictions", ""); }} placeholder="Không dùng PII, mật khẩu hoặc dữ liệu production" /></Field></div></section>}
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700"><Button variant="outline" disabled={activeSection === 1} onClick={() => setActiveSection((step) => Math.max(1, step - 1))}>Quay lại</Button><div className="flex items-center gap-2"><span className="text-xs text-slate-500">Bước {activeSection}/4</span>{activeSection < 4 && <Button variant="outline" onClick={() => setActiveSection((step) => Math.min(4, step + 1))}>Tiếp theo <ArrowRight className="h-4 w-4" /></Button>}</div></div>
          <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-violet-900 dark:bg-slate-950/95"><p className="text-xs text-slate-600 dark:text-slate-300">{canSave ? "Đủ nội dung cốt lõi. Lưu thành tài liệu nháp để Business Owner rà soát." : `Còn ${6 - completed} phần cốt lõi; phần đang nhập vẫn được tự động lưu.`}</p><Button disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang lưu…" : "Lưu Requirement nháp"}</Button></div>
        </>}
        <div className="flex justify-end"><ImportUndoButton profileId={profile._id} artifactType="Requirement" onDone={onImportRollback} /></div>
        <RequirementLibraryPreview items={items} baselined={baselined} libraryUrl={libraryUrl} />
        <div className="flex justify-end"><Button variant="outline" disabled={!canContinue} onClick={onNext}>Tiếp tục Test Plan <ArrowRight className="h-4 w-4" /></Button></div>
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
  return <section className={`rounded-xl border p-4 ${items.length ? "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" : "border-dashed border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40"}`}><div className="flex items-center justify-between gap-3"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h4>{!items.length && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">Chưa có dữ liệu</span>}</div>{items.length ? <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{items.map((value, index) => <li key={`${title}-${index}`} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" /><span>{value}</span></li>)}</ul> : <p className="mt-2 text-sm leading-6 text-slate-400">Tài liệu nguồn chưa nêu rõ nội dung này; cần Business Owner bổ sung hoặc xác nhận.</p>}</section>;
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

export function RequirementLibrary({ items, baselined, decide, bulkDecide, update, supplementDocument, onNext, initialRequirementId = "" }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [sortBy, setSortBy] = useState("updated");
  const [dateField, setDateField] = useState("updated");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState(() => items.find((item) => item._id === initialRequirementId) || null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
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
  const localDateKey = (value) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  };
  const dateLabel = (value) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "Không rõ ngày";
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    const key = localDateKey(date);
    if (key === localDateKey(today)) return "Hôm nay";
    if (key === localDateKey(yesterday)) return "Hôm qua";
    return date.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  };
  const selectedDateValue = (item) => dateField === "created" ? item.createdAt : (item.updatedAt || item.createdAt);
  const filtered = items.filter((item) => {
    const matchesStatus = status === "All" || item.status === status;
    const haystack = [item.requirementId, item.title, item.description, item.source?.title, item.source?.provider, ...(item.actors || []), ...(item.inScope || [])].filter(Boolean).join(" ").toLocaleLowerCase("vi");
    const itemDate = localDateKey(selectedDateValue(item));
    const matchesDateFrom = !dateFrom || (itemDate && itemDate >= dateFrom);
    const matchesDateTo = !dateTo || (itemDate && itemDate <= dateTo);
    return matchesStatus && matchesDateFrom && matchesDateTo && (!normalizedQuery || haystack.includes(normalizedQuery));
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
  const setDatePreset = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - Math.max(0, days - 1));
    setDateFrom(localDateKey(start)); setDateTo(localDateKey(end)); setPage(1);
  };
  const clearFilters = () => { setQuery(""); setStatus("All"); setDateFrom(""); setDateTo(""); setPage(1); };
  const selectableVisible = visible.filter((item) => item.status !== "Baselined");
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((item) => selectedIds.includes(item._id));
  const toggleSelected = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleVisible = () => setSelectedIds((current) => allVisibleSelected ? current.filter((id) => !selectableVisible.some((item) => item._id === id)) : [...new Set([...current, ...selectableVisible.map((item) => item._id)])]);
  const bulkBaseline = () => {
    if (!selectedIds.length) return;
    if (window.confirm(`Baseline ${selectedIds.length} Requirement đã chọn? Các mục hợp lệ sẽ được chốt làm bản chuẩn.`)) bulkDecide?.mutate({ ids: selectedIds, decision: "Baselined" }, { onSuccess: () => setSelectedIds([]) });
  };
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
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold">Thư viện Requirement</h3><p className="mt-1 text-xs text-slate-500">{items.length} mục · {baselined.length} đã chốt. Mở chi tiết để bổ sung thủ công hoặc tải một BRD/SRS đầy đủ hơn.</p></div><div className="flex flex-wrap gap-2"><Button disabled={supplementDocument.isPending} onClick={() => supplementInputRef.current?.click()}><FileUp className="h-4 w-4" />{supplementDocument.isPending ? "Đang đối chiếu tài liệu…" : "Tải BRD/SRS đầy đủ hơn"}</Button>{baselined.length > 0 && <Button variant="outline" onClick={onNext}>Tiếp tục Test Plan <ArrowRight className="h-4 w-4" /></Button>}</div></div>
    <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-100"><p className="font-semibold">Có tài liệu mới đầy đủ hơn?</p><p className="mt-1 text-xs leading-5 opacity-80">Tải lại BRD/SRS mới. Hệ thống đối chiếu theo mã Requirement, bổ sung trường còn thiếu và giữ nguyên nội dung đã được Business Owner chỉnh sửa. Requirement đã Baseline không bị ghi đè.</p></div>
    {items.length ? <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 p-3 backdrop-blur dark:border-slate-700 dark:bg-slate-950/95">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <label className="relative block w-full xl:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => changeQuery(event.target.value)} className="pl-9" placeholder="Tìm theo mã, tên, actor hoặc nguồn…" aria-label="Tìm Requirement" /></label>
          <div className="flex flex-wrap items-center gap-2"><Select className="h-9 min-w-36 text-xs" value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1); }} aria-label="Sắp xếp Requirement"><option value="updated">Mới cập nhật</option><option value="created">Mới tạo</option><option value="priority">Theo ưu tiên</option></Select><Select className="h-9 w-28 text-xs" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Số Requirement mỗi trang"><option value="5">5 / trang</option><option value="10">10 / trang</option><option value="20">20 / trang</option></Select></div>
        </div>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300"><CalendarDays className="h-4 w-4 text-violet-600" />Lọc theo thời gian</span><Select className="h-8 min-w-36 text-xs" value={dateField} onChange={(event) => { setDateField(event.target.value); setPage(1); }} aria-label="Chọn loại ngày"><option value="updated">Ngày cập nhật</option><option value="created">Ngày tạo</option></Select><div className="flex flex-wrap gap-1"><button type="button" onClick={() => setDatePreset(1)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">Hôm nay</button><button type="button" onClick={() => setDatePreset(7)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">7 ngày</button><button type="button" onClick={() => setDatePreset(30)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">30 ngày</button></div></div>
            <div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-xs text-slate-500"><span>Từ</span><Input type="date" className="h-8 w-36 text-xs" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} aria-label="Từ ngày" /></label><label className="flex items-center gap-2 text-xs text-slate-500"><span>Đến</span><Input type="date" className="h-8 w-36 text-xs" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} aria-label="Đến ngày" /></label>{(dateFrom || dateTo) && <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-950"><X className="h-3.5 w-3.5" />Bỏ lọc ngày</button>}</div>
          </div>
          {(dateFrom || dateTo) && <p className="mt-2 text-xs font-medium text-violet-700 dark:text-violet-300">Tìm thấy {filtered.length} Requirement theo {dateField === "created" ? "ngày tạo" : "ngày cập nhật"}{dateFrom ? ` từ ${new Date(`${dateFrom}T00:00:00`).toLocaleDateString("vi-VN")}` : ""}{dateTo ? ` đến ${new Date(`${dateTo}T00:00:00`).toLocaleDateString("vi-VN")}` : ""}.</p>}
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1">{statusOptions.map(([value, label, count]) => <button key={value} type="button" onClick={() => changeFilter(value)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${status === value ? "bg-violet-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"}`}>{label} <span className={status === value ? "text-violet-100" : "text-slate-400"}>{count}</span></button>)}</div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-2 dark:border-violet-900 dark:bg-violet-950/20"><label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} disabled={!selectableVisible.length} className="h-4 w-4 accent-violet-600" />Chọn các mục chưa Baseline trên trang</label>{selectedIds.length > 0 && <div className="flex items-center gap-2"><span className="text-xs font-semibold text-violet-700 dark:text-violet-300">Đã chọn {selectedIds.length}</span><Button size="sm" onClick={bulkBaseline} disabled={bulkDecide?.isPending}><CheckCircle2 className="h-3.5 w-3.5" />{bulkDecide?.isPending ? "Đang Baseline…" : `Baseline ${selectedIds.length} mục`}</Button><button type="button" className="text-xs font-semibold text-slate-500 hover:text-violet-700" onClick={() => setSelectedIds([])}>Bỏ chọn</button></div>}</div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">{visible.map((item, index) => { const itemDate = selectedDateValue(item); const currentDateKey = localDateKey(itemDate); const previousDateKey = index > 0 ? localDateKey(selectedDateValue(visible[index - 1])) : ""; return <div key={item._id}>{currentDateKey !== previousDateKey && <div className="flex items-center justify-between border-y border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950/70"><span className="font-bold capitalize text-slate-700 dark:text-slate-200">{dateLabel(itemDate)}</span><span className="text-slate-400">{currentDateKey}</span></div>}<div className="flex items-start gap-2"><input type="checkbox" aria-label={`Chọn ${item.requirementId || item.title}`} checked={selectedIds.includes(item._id)} disabled={item.status === "Baselined"} onChange={() => toggleSelected(item._id)} className="ml-3 mt-5 h-4 w-4 shrink-0 accent-violet-600" /><button type="button" onClick={() => openDetails(item)} className="group grid min-w-0 flex-1 gap-3 px-1 py-3 text-left transition hover:bg-violet-50/60 focus:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-500 dark:hover:bg-violet-950/20 md:grid-cols-[minmax(0,1fr)_150px_150px_96px] md:items-center">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-violet-700 dark:text-violet-300">{item.requirementId || "Chưa có mã"}</span><Badge tone={requirementTone(item.status)}>{requirementStatusLabel[item.status] || item.status}</Badge><DocumentQualityBadge quality={item.quality} /></div><p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{item.title}</p><p className="mt-1 line-clamp-1 text-xs text-slate-500">{item.description || item.objective || "Chưa có mô tả"}</p></div>
        <div className="text-xs text-slate-500"><p className="font-medium text-slate-700 dark:text-slate-300">{item.source?.title || "Chưa rõ nguồn"}</p><p className="mt-1">{item.source?.provider || "Chưa có người cung cấp"}</p></div>
        <div className="text-xs text-slate-500"><p>{item.type || "Requirement"} · {item.priority || "Medium"}</p><p className="mt-1">Tạo {formatDocumentDate(item.createdAt)}</p><p className="mt-0.5">Cập nhật {formatDocumentDate(item.updatedAt)}</p></div>
        <span className="inline-flex items-center justify-end gap-1 text-xs font-semibold text-violet-700 dark:text-violet-300">Xem chi tiết <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
      </button></div></div>; })}</div>
      {!visible.length && <div className="p-10 text-center"><Search className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold">Không tìm thấy Requirement phù hợp</p><button type="button" onClick={clearFilters} className="mt-2 text-xs font-semibold text-violet-600 hover:underline">Xóa toàn bộ bộ lọc</button></div>}
      {filtered.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/60"><span>Hiển thị {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} trong {filtered.length} mục</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" /> Trước</Button><span className="font-semibold text-slate-700 dark:text-slate-200">{currentPage}/{pageCount}</span><Button size="sm" variant="outline" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Sau <ChevronRight className="h-4 w-4" /></Button></div></div>}
    </div> : <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-slate-500">Chưa có Requirement. Bạn có thể soạn tay hoặc tải tài liệu ở phía trên.</p>}

    {selected && <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-label={`Chi tiết ${selected.requirementId}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-slate-950">
        <header className="border-b border-slate-200 p-5 dark:border-slate-800"><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-violet-700 dark:text-violet-300">{selected.requirementId || "Chưa có mã"}</span><Badge tone={requirementTone(selected.status)}>{requirementStatusLabel[selected.status] || selected.status}</Badge><DocumentQualityBadge quality={selected.quality} /></div><h3 className="mt-2 text-xl font-bold text-slate-950 dark:text-white">{selected.title}</h3><p className="mt-2 text-xs text-slate-500">{selected.type || "Requirement"} · Ưu tiên {selected.priority || "Medium"} · Tạo {formatDocumentDate(selected.createdAt)} · Cập nhật {formatDocumentDate(selected.updatedAt)}</p></div><div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{!editing && <><Button size="sm" onClick={() => startEditing(selected)}>Chỉnh sửa & bổ sung</Button><Button size="sm" variant="outline" disabled={supplementDocument.isPending} onClick={() => supplementInputRef.current?.click()}><FileUp className="h-4 w-4" />Tải file mới</Button></>}<button type="button" onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Đóng chi tiết"><X className="h-5 w-5" /></button></div></div></header>
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Nguồn</p><p className="mt-1 text-sm font-semibold">{selected.source?.title || "Chưa rõ nguồn"}</p><p className="mt-1 text-xs text-slate-500">{selected.source?.provider || "Chưa có người cung cấp"}{selected.source?.version ? ` · ${selected.source.version}` : ""}</p></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Phạm vi</p><p className="mt-1 text-sm font-semibold">{selected.scope?.name || selected.release || "Toàn hệ thống"}</p><p className="mt-1 text-xs text-slate-500">{selected.scope?.level || "System"}</p></div></div>
          <div className={`rounded-xl border p-4 ${completedDetailCount >= 8 ? "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100" : "border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100"}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">Độ đầy đủ: {completedDetailCount}/13 nhóm thông tin</p><span className="text-xs font-medium">{completedDetailCount >= 8 ? "Khá đầy đủ" : "Cần bổ sung trước khi chốt"}</span></div><p className="mt-1 text-xs leading-5 opacity-80">Hệ thống chỉ tách nội dung có trong tài liệu nguồn và không tự bịa phần còn thiếu. Các mục trống được hiển thị bên dưới để Business Owner dễ rà soát.</p></div>
          {!canBaselineSelected && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-100"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">Chưa thể Baseline Requirement này</p><p className="mt-1 text-xs leading-5">Cần bổ sung: {missingBaselineFields.join(", ")}. {selected.reviewNote || "Business Owner cần hoàn thiện nội dung có thể kiểm thử trước khi chốt."}</p></div>{!editing && <Button size="sm" onClick={() => startEditing(selected)}>Bổ sung ngay</Button>}</div></div>}
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
    <SectionTitle title="Website kiểm thử và bằng chứng kỹ thuật" description="Tùy chọn. Đây là nơi cấu hình hệ thống đang chạy; không phải liên kết tài liệu và không thay thế Requirement đã Baseline." />
    <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
      <div className="rounded-lg border border-border p-3">
        <p className="font-semibold">Website kiểm thử – Base URL</p>
        <p className="mt-1 text-xs text-muted-foreground">Địa chỉ ứng dụng thực tế mà QA sẽ mở để kiểm thử, ví dụ localhost, test hoặc staging.</p>
        <p className="mt-1 break-all text-muted-foreground">{profile.environment?.targetUrl || profile.baseUrl || "Chưa cấu hình website kiểm thử."}</p>
        {updateProfile && <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => {
          event.preventDefault();
          updateProfile.mutate({ baseUrl: website.trim() }, { onSuccess: () => setUrl(null) });
        }}>
          <Input aria-label="Base URL của website kiểm thử" type="url" pattern="https?://.+" required value={website} onChange={(event) => setUrl(event.target.value)} placeholder="Ví dụ: http://localhost:3000 hoặc https://staging.example.com" />
          <Button type="submit" disabled={updateProfile.isPending}>Lưu website kiểm thử</Button>
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
    {!intakeOnly && <div className="mt-6 flex justify-end"><Button variant="outline" onClick={onNext}>Quay lại Nguồn & Test Basis <ArrowRight className="h-4 w-4" /></Button></div>}
  </Card>;
}

function UseCaseStep({
  intakeOnly = false,
  reference = "",
  useCase,
  profile,
  setUseCase,
  addUseCase,
  approveUseCase,
  useCases,
  requirements,
  onNext,
  onStored,
  canContinue,
}) {
  const [mode, setMode] = useState(intakeOnly ? "source" : "review");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [supplementTargetId, setSupplementTargetId] = useState("");
  const [supplementResult, setSupplementResult] = useState(null);
  const [selectedSupplementChanges, setSelectedSupplementChanges] = useState({});
  const update = (key, value) => setUseCase({ ...useCase, [key]: value });
  const items = (useCases.data || []).filter((item) => item.origin !== "AIProfile");
  const approved = items.filter((item) => item.status === "Approved");
  const importDocument = useMutation({
    mutationFn: (file) => e2eApi.importUseCasesDocument(profile._id, file, reference),
    onSuccess: (result) => {
      toast.success(result.message || "Đã tạo Use Case nháp từ tài liệu");
      setMode("review");
      useCases.refetch();
      onStored?.();
    },
    onError: (error) => toast.error(error.message || "Không thể đọc tài liệu Use Case."),
  });
  const supplementDocument = useMutation({
    mutationFn: (file) => e2eApi.supplementUseCasesDocument(profile._id, file, supplementTargetId),
    onSuccess: (result) => {
      const defaults = {};
      (result.proposals || []).forEach((proposal, proposalIndex) => proposal.changes?.forEach((change) => { defaults[`${proposalIndex}-${change.field}`] = Boolean(change.safeDefault); }));
      setSelectedSupplementChanges(defaults);
      setSupplementResult(result);
      toast.success(result.message || "Đã tạo đề xuất bổ sung; chưa thay đổi Use Case.");
    },
    onError: (error) => toast.error(error.message || "Không thể đối chiếu tài liệu bổ sung."),
  });
  const applySupplement = useMutation({
    mutationFn: ({ proposal, proposalIndex }) => {
      const patch = Object.fromEntries((proposal.changes || []).filter((change) => selectedSupplementChanges[`${proposalIndex}-${change.field}`]).map((change) => [change.field, change.proposed]));
      return e2eApi.applyUseCaseSupplement(proposal.targetUseCaseId, { patch, source: supplementResult?.source });
    },
    onSuccess: () => {
      toast.success("Đã áp dụng các thay đổi đã chọn. Use Case đã duyệt cần được duyệt lại.");
      useCases.refetch();
    },
    onError: (error) => toast.error(error.message || "Không thể áp dụng thay đổi."),
  });
  const confirmOrigin = useMutation({
    mutationFn: ({ id, origin }) => e2eApi.updateUseCase(id, { origin }),
    onSuccess: () => {
      toast.success("Đã lưu nguồn tạo Use Case.");
      useCases.refetch();
    },
    onError: (error) => toast.error(error.message || "Không thể cập nhật nguồn tạo."),
  });
  const updateUseCase = useMutation({
    mutationFn: ({ id, body }) => e2eApi.updateUseCase(id, body),
    onSuccess: () => {
      toast.success("Đã lưu thay đổi Use Case. Tài liệu cần được duyệt lại nếu nội dung đã thay đổi.");
      useCases.refetch();
    },
    onError: (error) => toast.error(error.message || "Không thể lưu thay đổi Use Case."),
  });
  const canCreate = useCase.code && useCase.name && useCase.actor && useCase.scope && useCase.summary && useCase.trigger && useCase.preconditions && useCase.mainFlow && useCase.postconditions && !addUseCase.isPending;
  const draftCount = items.filter((item) => item.status === "Draft").length;
  const pendingCount = items.filter((item) => item.status === "PendingApproval").length;
  const recentItems = [...items].sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0)).slice(0, 5);
  const libraryUrl = `/documents?${new URLSearchParams({ project: String(profile?.project?._id || profile?.project || ""), profile: String(profile?._id || ""), type: "Use Case" }).toString()}`;
  const selectedItem = items.find((item) => item._id === selectedItemId);
  const sourceOption = (value, title, description, action) => (
    <button type="button" onClick={() => setMode(value)} className={`rounded-xl border p-4 text-left transition ${mode === value ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100 dark:bg-violet-950/30 dark:ring-violet-950" : "border-slate-200 hover:border-violet-300 dark:border-slate-700"}`}>
      <p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p><span className="mt-3 inline-block text-xs font-semibold text-violet-700 dark:text-violet-300">{action}</span>
    </button>
  );
  return <Card className="p-5">
    <SectionTitle title="Use Case (tùy chọn)" description="Chỉ thêm Use Case khi dự án có tài liệu luồng nghiệp vụ chi tiết. Requirement hoặc User Story đã xác nhận cũng đủ để tiếp tục lập Test Plan." />
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
      <div>
        <p className="text-sm font-semibold">{items.length ? `Use Case trong Test Basis hiện tại (${items.length})` : "Chưa thêm Use Case vào Test Basis hiện tại"}</p>
        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
          {items.length
            ? `${approved.length} đã duyệt. Bản nháp cần được kiểm tra trước khi dùng làm Test Basis.`
            : "Bạn có thể tải tài liệu hoặc tự nhập Use Case. Nếu chỉ có Requirement/User Story, hãy bỏ qua bước này."}
        </p>
      </div>
      {items.length > 0 && <div className="flex flex-wrap gap-2">
        <Button variant={mode === "source" ? "outline" : "default"} onClick={() => setMode(mode === "source" ? "review" : "source")}>
          {mode === "source" ? "Ẩn phần bổ sung" : "Bổ sung Use Case (tùy chọn)"}
        </Button>
      </div>}
    </div>

    {(mode === "source" || !items.length) && <div className="mt-4"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Thêm Use Case nếu có</p><p className="mb-3 text-xs leading-5 text-slate-500">Dùng phần này khi khách hàng, Product Owner hoặc nhóm dự án đã cung cấp tài liệu luồng nghiệp vụ riêng.</p><div className="grid gap-3 md:grid-cols-2">
      {sourceOption("document", "Tải tài liệu Use Case", "Tải PDF, DOC hoặc DOCX; AI chỉ trích xuất và chuẩn hóa thành bản nháp.", "Nguồn có sẵn")}
      {sourceOption("manual", "Tự nhập Use Case", "Nhập trực tiếp hành trình, actor, điều kiện, luồng và kết quả mong đợi.", "Nguồn nhập tay")}
    </div></div>}

    {mode === "document" && <div className="mt-5 rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-5 dark:border-violet-900 dark:bg-violet-950/20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">Tài liệu Use Case đã có</p><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-300">Tải lên một tài liệu. AI sẽ đọc nội dung, tách các hành trình thành Use Case ở trạng thái Nháp, rồi bạn rà soát trước khi duyệt. Tệp tối đa 10 MB.</p></div><label className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700"><FileUp className="mr-2 h-4 w-4" />{importDocument.isPending ? "Đang đọc tài liệu…" : "Chọn tài liệu"}<input className="hidden" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={importDocument.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) importDocument.mutate(file); event.target.value = ""; }} /></label></div>
      <p className="mt-3 text-xs text-slate-500">Tài liệu gốc là nguồn tham khảo. Những chỗ thiếu sẽ được gắn “Cần QA xác nhận”; hệ thống không tự duyệt hoặc tự suy diễn chức năng.</p>
    </div>}
    <div className="mt-3 flex justify-end"><ImportUndoButton profileId={profile._id} artifactType="UseCase" onDone={() => useCases.refetch()} /></div>

    {false && mode === "supplement" && <div className="mt-5 space-y-4 rounded-xl border border-sky-200 bg-sky-50/50 p-5 dark:border-sky-900 dark:bg-sky-950/20">
      <div><p className="text-sm font-semibold">Bổ sung Use Case từ tài liệu</p><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">AI chỉ tạo bảng so sánh. Nội dung đang có không bị ghi đè; bạn chọn từng trường trước khi áp dụng. Use Case đã duyệt sẽ chuyển sang chờ duyệt lại.</p></div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><Select aria-label="Phạm vi đối chiếu Use Case" value={supplementTargetId} onChange={(event) => { setSupplementTargetId(event.target.value); setSupplementResult(null); }}><option value="">Đối chiếu tất cả Use Case của Test Basis</option>{items.map((item) => <option key={item._id} value={item._id}>{item.code || "Use Case"} · {item.name}</option>)}</Select><label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700"><FileUp className="mr-2 h-4 w-4" />{supplementDocument.isPending ? "Đang đối chiếu…" : "Chọn tài liệu bổ sung"}<input className="hidden" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={supplementDocument.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) supplementDocument.mutate(file); event.target.value = ""; }} /></label></div>
      {supplementResult && <div className="space-y-3 border-t border-sky-200 pt-4 dark:border-sky-900"><p className="text-xs font-semibold text-sky-900 dark:text-sky-100">{supplementResult.proposals?.length || 0} đề xuất từ {supplementResult.source?.fileName || "tài liệu"}. Các ô được chọn sẵn chỉ là trường đang trống.</p>{!(supplementResult.proposals || []).length && <p className="rounded-lg border border-dashed border-sky-300 p-4 text-sm text-slate-600 dark:border-sky-800 dark:text-slate-300">Không xác định được thay đổi đủ rõ để đề xuất. Bạn có thể chọn một Use Case cụ thể hoặc dùng tài liệu có mã/tên Use Case rõ hơn.</p>}{(supplementResult.proposals || []).map((proposal, proposalIndex) => <div key={`${proposal.targetUseCaseId}-${proposalIndex}`} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{proposal.targetCode || "Use Case chưa khớp"} · {proposal.targetName || "Cần QA xác nhận"}</p><p className={`mt-1 text-xs font-semibold ${proposal.kind === "update" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>{proposal.kind === "update" ? "Đã ghép với Use Case hiện có" : proposal.kind === "new" ? "Đề xuất Use Case mới — chưa tự tạo" : "Cần QA xác nhận vì chưa khớp hoặc có mâu thuẫn"}</p></div>{proposal.kind === "update" && <Button size="sm" disabled={applySupplement.isPending || !(proposal.changes || []).some((change) => selectedSupplementChanges[`${proposalIndex}-${change.field}`])} onClick={() => applySupplement.mutate({ proposal, proposalIndex })}>{applySupplement.isPending ? "Đang áp dụng…" : "Áp dụng mục đã chọn"}</Button>}</div>{proposal.evidence?.length > 0 && <p className="mt-2 text-xs leading-5 text-slate-500">Căn cứ: {proposal.evidence.join(" · ")}</p>}<div className="mt-3 space-y-2">{(proposal.changes || []).map((change) => <label key={change.field} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"><input type="checkbox" className="mt-1 h-4 w-4 accent-violet-600" checked={Boolean(selectedSupplementChanges[`${proposalIndex}-${change.field}`])} onChange={(event) => setSelectedSupplementChanges((current) => ({ ...current, [`${proposalIndex}-${change.field}`]: event.target.checked }))} /><span className="min-w-0"><strong className="capitalize">{change.field.replace(/([A-Z])/g, " $1")}</strong><span className="mt-1 grid gap-1 text-xs leading-5 text-slate-500"><span>Hiện tại: {Array.isArray(change.current) ? change.current.join(" · ") || "—" : change.current || "—"}</span><span className="font-medium text-violet-700 dark:text-violet-300">Đề xuất: {Array.isArray(change.proposed) ? change.proposed.join(" · ") : change.proposed}</span></span></span></label>)}</div></div>)}</div>}
    </div>}

    {mode === "manual" && <div className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="mb-4 text-xs text-slate-500">Các trường có dấu * là thành phần bắt buộc của Bản đặc tả Use Case chuẩn.</p><div className="grid gap-4 md:grid-cols-2"><Field label="Mã Use Case *"><Input value={useCase.code} onChange={(e) => update("code", e.target.value)} placeholder="UC-LOGIN-01" /></Field><Field label="Tên Use Case *" hint="Ngắn gọn và bắt đầu bằng động từ."><Input value={useCase.name} onChange={(e) => update("name", e.target.value)} placeholder="Đăng nhập" /></Field><Field label="Actor chính *"><Input value={useCase.actor} onChange={(e) => update("actor", e.target.value)} placeholder="Khách hàng" /></Field><Field label="Actor phụ" hint="Mỗi dòng một actor."><Textarea rows={2} value={useCase.secondaryActors || ""} onChange={(e) => update("secondaryActors", e.target.value)} placeholder={"Cổng thanh toán\nNhà hàng"} /></Field><Field label="Phạm vi Use Case *"><Input value={useCase.scope} onChange={(e) => update("scope", e.target.value)} placeholder="Checkout / Đặt món" /></Field><Field label="Mức độ ưu tiên *"><Select value={useCase.risk} onChange={(e) => update("risk", e.target.value)}>{["Critical", "High", "Medium", "Low"].map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Mô tả tóm tắt *"><Textarea rows={3} value={useCase.summary} onChange={(e) => update("summary", e.target.value)} /></Field><Field label="Trigger / điều kiện kích hoạt *"><Textarea rows={3} value={useCase.trigger || ""} onChange={(e) => update("trigger", e.target.value)} /></Field><Field label="Pre-conditions *" hint="Mỗi dòng một điều kiện."><Textarea rows={3} value={useCase.preconditions || ""} onChange={(e) => update("preconditions", e.target.value)} /></Field><Field label="Post-conditions *" hint="Trạng thái hệ thống sau khi thành công."><Textarea rows={3} value={useCase.postconditions || ""} onChange={(e) => update("postconditions", e.target.value)} /></Field><Field label="Basic Flow *" hint="Mỗi dòng một bước; A: Actor, S: System."><Textarea rows={5} value={useCase.mainFlow} onChange={(e) => update("mainFlow", e.target.value)} placeholder={"A: Xác nhận đặt món\nS: Hiển thị tổng tiền\nS: Tạo đơn hàng"} /></Field><Field label="Luồng ngoại lệ" hint="Mỗi dòng một lỗi/ngoại lệ nếu có."><Textarea rows={5} value={useCase.exceptionFlows || ""} onChange={(e) => update("exceptionFlows", e.target.value)} /></Field></div><details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-violet-700 dark:text-violet-300">Luồng thay thế, Business Rule và thông tin bổ sung</summary><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Luồng thay thế"><Textarea rows={3} value={useCase.alternateFlows || ""} onChange={(e) => update("alternateFlows", e.target.value)} /></Field><Field label="Business Rule"><Textarea rows={3} value={useCase.businessRules || ""} onChange={(e) => update("businessRules", e.target.value)} /></Field></div></details><div className="mt-4 flex justify-end"><Button disabled={!canCreate} onClick={() => addUseCase.mutate(reference, { onSuccess: () => onStored?.() })}>{addUseCase.isPending ? "Đang lưu…" : "Tạo Use Case nháp"}</Button></div></div>}

    {!!items.length && <div className="mt-7 border-t border-slate-200 pt-5 dark:border-slate-700"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">Use Case đã lưu</p><p className="mt-1 text-xs text-slate-500">Tóm tắt đợt hiện tại. Tìm kiếm, lọc ngày và quản lý toàn bộ Use Case trong Thư viện tài liệu.</p></div><Button asChild><Link to={libraryUrl}>Mở Thư viện Use Case <ArrowRight className="h-4 w-4" /></Link></Button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-2xl font-bold">{items.length}</p><p className="mt-1 text-xs text-slate-500">Tổng Use Case</p></div><div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20"><p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{draftCount + pendingCount}</p><p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Cần rà soát</p></div><div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"><p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{approved.length}</p><p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Đã duyệt</p></div></div><div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"><div className="bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800">5 mục cập nhật gần nhất</div>{recentItems.map((item) => <button key={item._id} type="button" onClick={() => setSelectedItemId(item._id)} className="flex w-full items-center justify-between gap-3 border-t border-slate-200 px-3 py-3 text-left transition hover:bg-violet-50/60 dark:border-slate-700 dark:hover:bg-violet-950/20"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-violet-700 dark:text-violet-300">{item.code || "Use Case"}</span><Badge tone={statusTone[item.status] || "slate"}>{item.status}</Badge><DocumentQualityBadge quality={item.quality} /></div><p className="mt-1 truncate text-sm font-semibold">{item.name}</p></div><span className="shrink-0 text-xs font-semibold text-violet-700 dark:text-violet-300">Mở <ChevronRight className="inline h-4 w-4" /></span></button>)}</div></div>}
    {/* Bộ lọc và phân trang đầy đủ đã được chuyển sang Thư viện tài liệu.
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm font-semibold">Danh mục Use Case</p><span className="text-xs text-slate-500">{filteredItems.length}/{items.length} Use Case phù hợp bộ lọc</span></div>
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Tìm Use Case" className="h-9 w-56 text-xs" value={search} placeholder="Tìm mã, tên hoặc actor…" onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
          <Select aria-label="Lọc nguồn tạo Use Case" className="h-9 min-w-44 text-xs" value={originFilter} onChange={(event) => { setOriginFilter(event.target.value); setPage(1); }}><option value="All">Tất cả nguồn tạo</option><option value="Manual">Soạn thủ công</option><option value="AIProfile">AI từ Profile</option><option value="ImportedDocument">Trích xuất từ tài liệu</option><option value="Legacy">Chưa xác định</option></Select>
          <Select aria-label="Lọc trạng thái Use Case" className="h-9 min-w-36 text-xs" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="All">Tất cả trạng thái</option><option value="Draft">Nháp</option><option value="PendingApproval">Chờ duyệt</option><option value="Approved">Đã duyệt</option><option value="Rejected">Từ chối</option></Select>
          <Select aria-label="Sắp xếp Use Case" className="h-9 min-w-36 text-xs" value={sortOrder} onChange={(event) => { setSortOrder(event.target.value); setPage(1); }}><option value="newest">Mới tạo trước</option><option value="oldest">Cũ tạo trước</option></Select>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/70">
        <label className="min-w-40"><span className="mb-1 block text-[11px] font-semibold text-slate-500">Quản lý theo</span><Select aria-label="Chọn loại ngày của Use Case" className="h-9 text-xs" value={dateField} onChange={(event) => { setDateField(event.target.value); setPage(1); }}><option value="created">Ngày tạo</option><option value="updated">Ngày cập nhật</option></Select></label>
        <label><span className="mb-1 block text-[11px] font-semibold text-slate-500">Từ ngày</span><Input aria-label="Use Case từ ngày" className="h-9 w-40 text-xs" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></label>
        <label><span className="mb-1 block text-[11px] font-semibold text-slate-500">Đến ngày</span><Input aria-label="Use Case đến ngày" className="h-9 w-40 text-xs" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></label>
        <Button size="sm" variant="outline" disabled={!dateFrom && !dateTo} onClick={clearDateFilters}>Xóa lọc ngày</Button>
      </div>
      {!filteredItems.length ? <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500">Không có Use Case khớp bộ lọc.</p> : <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="min-w-[1040px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800"><tr><th className="px-3 py-3">Use Case</th><th className="px-3 py-3">Nguồn</th><th className="px-3 py-3">Trạng thái</th><th className="px-3 py-3">Actor</th><th className="px-3 py-3">Người tạo</th><th className="px-3 py-3">Ngày tạo</th><th className="px-3 py-3">Cập nhật</th><th className="px-3 py-3 text-right">Chi tiết</th></tr></thead><tbody>{visibleItems.map((item, index) => { const origin = getUseCaseOrigin(item); const itemDate = selectedDateValue(item); const currentDateKey = localDateKey(itemDate); const previousDateKey = index > 0 ? localDateKey(selectedDateValue(visibleItems[index - 1])) : ""; return [currentDateKey !== previousDateKey && <tr key={`date-${item._id}`} className="border-t border-slate-200 bg-violet-50/70 dark:border-slate-700 dark:bg-violet-950/20"><td colSpan="8" className="px-3 py-2"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-bold capitalize text-violet-800 dark:text-violet-200">{dateLabel(itemDate)}</span><span className="text-slate-500">{dateField === "created" ? "Ngày tạo" : "Ngày cập nhật"} · {currentDateKey || "Không rõ"}</span></div></td></tr>, <tr key={item._id} className="border-t border-slate-200 dark:border-slate-700"><td className="max-w-80 px-3 py-3"><p className="font-semibold text-slate-900 dark:text-white">{item.code || "Chưa có mã"} · {item.name}</p><p className="mt-1 truncate text-xs text-slate-500">{item.summary || "Chưa có mục tiêu"}</p></td><td className="px-3 py-3"><Badge tone={origin.tone}>{origin.label}</Badge></td><td className="px-3 py-3"><Badge tone={statusTone[item.status] || "slate"}>{item.status}</Badge></td><td className="px-3 py-3 text-xs">{item.actor || "—"}</td><td className="px-3 py-3 text-xs">{item.createdBy?.fullName || "Không rõ"}</td><td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600 dark:text-slate-300">{formatDocumentDate(item.createdAt)}</td><td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600 dark:text-slate-300">{formatDocumentDate(item.updatedAt)}</td><td className="px-3 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setSelectedItemId(item._id)}>Xem</Button></td></tr>]; })}</tbody></table></div>}
      {filteredItems.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 text-xs"><span>Trang {currentPage}/{totalPages} · {visibleItems.length} mục</span><div className="flex items-center gap-2"><Select aria-label="Số Use Case mỗi trang" className="h-8 w-28 text-xs" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="10">10 / trang</option><option value="20">20 / trang</option><option value="50">50 / trang</option></Select><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Trước</Button><Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Sau</Button></div></div>}
    </div> */}
    {selectedItem && <div className="pointer-events-none fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="false" aria-label={`Chi tiết ${selectedItem.code || selectedItem.name}`}><div className="pointer-events-auto flex h-full w-full max-w-5xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"><header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800"><div><p className="text-xs font-bold uppercase tracking-wide text-violet-600">Chi tiết Use Case</p><h3 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{selectedItem.code || "Chưa có mã"} · {selectedItem.name}</h3><p className="mt-1 text-xs text-slate-500">Có thể chỉnh sửa bản AI sinh trước khi duyệt.</p></div><button type="button" onClick={() => setSelectedItemId("")} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Đóng chi tiết Use Case"><X className="h-5 w-5" /></button></header><div className="flex-1 overflow-y-auto p-4 sm:p-5"><UseCaseSpecificationCard item={selectedItem} profile={profile} refresh={useCases.refetch} approveUseCase={approveUseCase} confirmOrigin={confirmOrigin} updateUseCase={updateUseCase} /></div></div></div>}
    {!intakeOnly && <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Có thể tiếp tục khi ít nhất một Requirement, Use Case hoặc User Story đã được xác nhận.</p><Button variant="outline" disabled={!canContinue} onClick={onNext}>Tiếp tục Test Plan <ArrowRight className="h-4 w-4" /></Button></div>}
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

export function UseCaseDiagram({ item }) {
  const svgRef = useRef(null);
  const invalidActor = (value) => /^(?:hệ\s*thống|system|app(?:lication)?|website|cần .+ xác nhận)$/i.test(String(value || "").trim());
  const actors = [item.actor, ...(Array.isArray(item.secondaryActors) ? item.secondaryActors : [])].map((value) => String(value || "").trim()).filter((value) => value && !invalidActor(value));
  const cleanStep = (value) => String(value || "").trim().replace(/^(?:A|Actor)\s*:\s*/i, "").replace(/^(?:\d+)?[a-z]\s*[:.)-]\s*/i, "");
  const meaningful = (value) => value && !/(?:chưa có|cần .+ xác nhận|thực hiện hành vi được nêu)/i.test(value);
  const included = [...new Set((Array.isArray(item.mainFlow) ? item.mainFlow : []).filter((step) => /^(?:A|Actor)\s*:/i.test(String(step || ""))).map(cleanStep).filter(meaningful))].slice(0, 8);
  const extended = [...new Set([...(Array.isArray(item.alternateFlows) ? item.alternateFlows : []), ...(Array.isArray(item.exceptionFlows) ? item.exceptionFlows : [])].map(cleanStep).filter(meaningful))].slice(0, 6);
  const rows = Math.max(included.length, extended.length, 1);
  const height = Math.max(500, 250 + rows * 82, 180 + Math.ceil(actors.length / 2) * 115);
  const rootY = 120;
  const systemName = item.systemProfile?.name || item.scope || "Hệ thống";
  const safeText = (value, limit = 42) => String(value || "").length > limit ? `${String(value).slice(0, limit - 1)}…` : String(value || "");
  const markerId = `uc-arrow-${String(item._id || item.code || "detail").replace(/[^a-z0-9]/gi, "")}`;
  const downloadSvg = () => {
    if (!svgRef.current) return;
    const source = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${String(item.code || "use-case").replace(/[^a-z0-9-_]/gi, "-")}-diagram.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const Actor = ({ x, y, label }) => <g aria-label={label}><circle cx={x} cy={y} r="10" fill="white" stroke="#475569" strokeWidth="2" /><path d={`M ${x} ${y + 10} V ${y + 43} M ${x - 17} ${y + 22} H ${x + 17} M ${x} ${y + 43} L ${x - 15} ${y + 63} M ${x} ${y + 43} L ${x + 15} ${y + 63}`} fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" /><text x={x} y={y + 82} textAnchor="middle" fill="#334155" fontSize="12" fontWeight="600">{safeText(label, 22)}</text></g>;
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60"><div><p className="text-sm font-bold">Sơ đồ chi tiết {item.code || "Use Case"}</p><p className="mt-0.5 text-xs text-slate-500">Chỉ dùng actor, Basic Flow, Alternate Flow và Exception Flow của Use Case đang xem; không lẫn Use Case khác trong cùng đợt.</p></div><Button type="button" size="sm" variant="outline" onClick={downloadSvg}><Download className="h-4 w-4" /> Tải SVG</Button></div>
      {!actors.length && <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><strong>Chưa thể vẽ association đúng:</strong> Use Case này chưa có actor bên ngoài hợp lệ. Actor “Hệ thống” không phải actor UML.</div>}
      {!included.length && !extended.length && <div className="border-b border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">Dữ liệu hiện tại không khai báo hành vi Actor hoặc luồng mở rộng đủ cụ thể. Khi đó một ellipse gốc là biểu diễn UML trung thực; hệ thống không tự bịa Use Case con.</div>}
      <div className="overflow-x-auto bg-white p-3 dark:bg-slate-900">
        <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 1040 ${height}`} className="min-w-[900px] w-full" role="img" aria-label={`Sơ đồ chi tiết ${item.code || item.name}`}>
          <defs><marker id={markerId} markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#7c3aed" /></marker></defs>
          <rect x="220" y="28" width="600" height={height - 56} rx="8" fill="#fafafa" stroke="#64748b" strokeWidth="2" />
          <text x="520" y="54" textAnchor="middle" fill="#1e293b" fontSize="15" fontWeight="700">{safeText(systemName, 65)}</text>
          {actors.map((actor, index) => { const left = index % 2 === 0; const x = left ? 82 : 958; const y = 105 + Math.floor(index / 2) * 115; return <g key={actor}><Actor x={x} y={y} label={actor} /><line x1={left ? x + 22 : x - 22} y1={y + 24} x2={left ? 360 : 680} y2={rootY} stroke="#64748b" strokeWidth="1.8" /></g>; })}
          <ellipse cx="520" cy={rootY} rx="160" ry="42" fill="#ede9fe" stroke="#7c3aed" strokeWidth="2.8" />
          <text x="520" y={rootY - 5} textAnchor="middle" fill="#5b21b6" fontSize="13" fontWeight="700">{safeText(item.code || "Use Case", 26)}</text>
          <text x="520" y={rootY + 15} textAnchor="middle" fill="#1e293b" fontSize="12">{safeText(item.name || "Chưa đặt tên", 48)}</text>
          {included.map((label, index) => { const y = 225 + index * 82; return <g key={`include-${label}`}><ellipse cx="405" cy={y} rx="135" ry="30" fill="#fff" stroke="#64748b" strokeWidth="1.8" /><text x="405" y={y + 4} textAnchor="middle" fill="#1e293b" fontSize="11">{safeText(label, 40)}</text><line x1="485" y1={rootY + 38} x2="430" y2={y - 29} stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="6 5" markerEnd={`url(#${markerId})`} /><text x="430" y={y - 40} fill="#6d28d9" fontSize="11">&lt;&lt;include&gt;&gt;</text></g>; })}
          {extended.map((label, index) => { const y = 225 + index * 82; return <g key={`extend-${label}`}><ellipse cx="650" cy={y} rx="135" ry="30" fill="#fff7ed" stroke="#c2410c" strokeWidth="1.8" /><text x="650" y={y + 4} textAnchor="middle" fill="#7c2d12" fontSize="11">{safeText(label, 40)}</text><line x1="620" y1={y - 29} x2="555" y2={rootY + 38} stroke="#c2410c" strokeWidth="1.5" strokeDasharray="6 5" markerEnd={`url(#${markerId})`} /><text x="590" y={y - 40} fill="#9a3412" fontSize="11">&lt;&lt;extend&gt;&gt;</text></g>; })}
        </svg>
      </div>
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
  if (type === "Test Plan") return item.origin === "AI" ? { label: "AI", tone: "purple" } : item.origin === "Rule" ? { label: "Quy tắc hệ thống", tone: "blue" } : item.origin === "Board" ? { label: "Test Board", tone: "blue" } : item.origin === "ImportedDocument" ? { label: "Tài liệu nhập", tone: "blue" } : item.origin === "Manual" ? { label: "Thủ công", tone: "slate" } : { label: "Chưa ghi nhận", tone: "amber" };
  if (type === "Test Suite") return item.origin === "SystemE2E" ? { label: "Tự tạo E2E", tone: "blue" } : item.origin === "Imported" ? { label: "Nhập dữ liệu", tone: "blue" } : { label: "Thủ công", tone: "slate" };
  const labels = { SystemE2E: "AI E2E từ Profile", UserStory: "AI từ User Story", UserStoryAndWeb: "AI từ User Story & Web", Manual: "Thủ công" };
  return { label: labels[item.generatedFrom] || "Chưa ghi nhận", tone: item.generatedFrom === "Manual" ? "slate" : item.generatedFrom ? "purple" : "amber" };
}

function DocumentRegister({ project, profile, profiles, requirements, useCases, stories, plans, suites, cases, setActiveStep, onResolveGap }) {
  const [typeFilter, setTypeFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const profileId = String(profile?._id || "");
  const [finalizations, setFinalizations] = useState(profile?.workflow?.finalizations || []);
  const [finalizationGap, setFinalizationGap] = useState([]);
  useEffect(() => setFinalizations(profile?.workflow?.finalizations || []), [profile?._id, profile?.workflow?.finalizations?.length]);
  const approvedPlan = [...plans].filter((item) => item.approvalStatus === "Approved").sort((left, right) => new Date(right.approvedAt || right.updatedAt || 0) - new Date(left.approvedAt || left.updatedAt || 0))[0];
  const approvedCases = approvedPlan ? cases.filter((item) => item.status === "Approved" && String(item.e2e?.testPlan?._id || item.e2e?.testPlan || "") === String(approvedPlan._id)) : [];
  const latestFinalization = finalizations[finalizations.length - 1];
  const basisUpdatedAt = new Map([...requirements, ...useCases, ...stories].map((item) => [String(item._id), new Date(item.updatedAt || item.createdAt || 0).getTime()]));
  const changedSinceFinalization = (latestFinalization?.basis?.versions || []).filter((item) => (basisUpdatedAt.get(String(item.id)) || 0) > new Date(item.updatedAt || 0).getTime()).length;
  const finalize = useMutation({ mutationFn: () => e2eApi.finalizeDocumentation(profileId), onSuccess: (result) => { setFinalizationGap([]); setFinalizations(result.profile?.workflow?.finalizations || [...finalizations, result.finalization]); toast.success(`Đã đóng băng bộ tài liệu revision ${result.finalization.revision}.`); }, onError: (error) => { const gaps = Array.isArray(error.details?.uncoveredBasis) ? error.details.uncoveredBasis : []; setFinalizationGap(gaps); toast.error(error.message || "Không thể hoàn tất bộ tài liệu.", gaps.length ? { description: gaps.slice(0, 3).map((item) => `${item.code ? `${item.code} · ` : ""}${item.title}`).join("; ") } : undefined); } });
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
    <SectionTitle title="Hoàn tất và xuất tài liệu" description="Đóng băng phiên bản Test Basis, Test Plan, Test Case đã duyệt, cấu hình sinh, giả định, evidence và traceability. Bước này không chạy test, không tạo automation hay bug." />
    {!profileId ? <p className="mt-5 rounded-lg border border-dashed p-4 text-sm text-slate-500">Chọn System Profile trước để xem danh mục tài liệu theo phạm vi.</p> : <>
      <section className="mt-5 rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">Documentation baseline</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{approvedPlan ? `Test Plan “${approvedPlan.name}” đã duyệt` : "Chưa có Test Plan đã duyệt"} · {approvedCases.length} Test Case đã duyệt thuộc Test Plan này · {finalizations.length} revision đã đóng băng.</p></div><Button disabled={!approvedPlan || !approvedCases.length || finalize.isPending} onClick={() => { if (window.confirm("Đóng băng phiên bản tài liệu hiện tại? Thay đổi nguồn sau này sẽ tạo revision mới, không sửa ngược bản này.")) finalize.mutate(); }}>{finalize.isPending ? "Đang hoàn tất…" : "Hoàn tất revision mới"}</Button></div>{finalizations.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{finalizations.map((item) => <Badge key={item.revision} tone="green">Revision {item.revision} · {formatDocumentDate(item.finalizedAt)}</Badge>)}</div>}</section>
      {finalizationGap.length > 0 && <section className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-950 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-100"><div><p className="font-semibold">Chưa thể hoàn tất revision</p><p className="mt-1 text-xs">Hệ thống đã kiểm tra các Test Case <b>Approved</b> thuộc đúng Test Plan và không tìm thấy traceability tới các nguồn sau:</p></div><ul className="mt-3 space-y-3">{finalizationGap.map((item) => <li key={`${item.type}-${item.id}`} className="rounded-xl border border-rose-200 bg-white/80 p-3 text-xs dark:border-rose-900 dark:bg-slate-950/30"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><Badge tone="red">{item.level}</Badge><b>{item.type}</b>{item.code && <span className="font-mono text-[11px] text-slate-500">{item.code}</span>}</div><p className="mt-2 text-sm font-semibold">{item.title}</p><div className="mt-2 grid gap-1 text-[11px] leading-5 text-rose-800 dark:text-rose-200"><p><b>Lỗi ở đâu:</b> không có Test Case Approved nào liên kết ID của Test Basis này.</p><p><b>Cần làm:</b> tạo Test Case từ đúng nguồn này, sau đó gửi QA duyệt.</p><p><b>Đạt khi:</b> Test Case có trạng thái Approved và traceability chứa Test Basis này.</p></div></div><Button size="sm" onClick={() => onResolveGap?.(item)}>Tạo Test Case cho nguồn này</Button></div></li>)}</ul><p className="mt-3 text-[11px]">Sau khi Test Case được duyệt, quay lại “Hoàn tất &amp; xuất file” và bấm hoàn tất revision lần nữa.</p></section>}
      {approvedCases.length > 0 && <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-emerald-950 dark:text-emerald-100">Bước tiếp theo · Lập kế hoạch thực thi</p><Badge tone="green">{approvedCases.length} Test Case trong Backlog</Badge></div><p className="mt-1 max-w-3xl text-xs leading-5 text-emerald-900/80 dark:text-emerald-200">Test Case được QA duyệt đã tự động xuất hiện trong Backlog của Test Board. Mở Board, chọn các Test Case cần chạy, tạo hoặc chọn Cycle rồi đưa chúng vào Todo. Sau đó tạo Test Run và thực thi theo luồng Todo → In Progress → In Review → Done.</p></div><div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" asChild><Link to={`/cycles?project=${project}`}>Quản lý Cycle</Link></Button><Button asChild><Link to={`/board?project=${project}&cycle=backlog`}>Mở Backlog &amp; Test Board <ArrowRight className="h-4 w-4" /></Link></Button></div></div></section>}
      <div className="mt-5"><SectionTitle title="Danh mục và xuất file" description="Xuất DOCX/PDF cho Test Plan; XLSX/CSV cho Test Case, traceability và coverage bằng các nút xuất trong từng tài liệu." /></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">{Object.entries(typeCount).map(([type, count]) => <button type="button" key={type} onClick={() => { setTypeFilter(type); setPage(1); }} className={`rounded-xl border p-3 text-left ${typeFilter === type ? "border-violet-400 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30" : "border-slate-200 dark:border-slate-700"}`}><p className="text-xl font-bold">{count}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{type}</p></button>)}</div>
      <div className="mt-5 flex flex-wrap gap-2"><Input className="h-9 w-64 text-xs" value={search} placeholder="Tìm tên, mã hoặc Test Case ID…" onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><Select className="h-9 min-w-40 text-xs" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}><option value="All">Tất cả loại tài liệu</option>{Object.keys(typeCount).map((type) => <option key={type} value={type}>{type}</option>)}</Select><Select className="h-9 min-w-44 text-xs" value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setPage(1); }}><option value="All">Tất cả nguồn tạo</option>{sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}</Select></div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="min-w-[1050px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800"><tr><th className="px-3 py-3">Tài liệu</th><th className="px-3 py-3">Loại</th><th className="px-3 py-3">Nguồn</th><th className="px-3 py-3">Trạng thái</th><th className="px-3 py-3">Chất lượng</th><th className="px-3 py-3">Người tạo</th><th className="px-3 py-3">Ngày tạo</th><th className="px-3 py-3">Cập nhật</th><th className="px-3 py-3 text-right">Thao tác</th></tr></thead><tbody>{pageRows.map((record) => <tr key={`${record.type}-${record.id}`} className="border-t border-slate-200 dark:border-slate-700"><td className="max-w-96 px-3 py-3 font-semibold">{record.name || "Chưa đặt tên"}</td><td className="px-3 py-3 text-xs">{record.type}</td><td className="px-3 py-3"><Badge tone={record.source.tone}>{record.source.label}</Badge></td><td className="px-3 py-3"><Badge tone={statusTone[record.status] || "slate"}>{record.status || "—"}</Badge></td><td className="px-3 py-3"><DocumentQualityBadge quality={record.item.quality} /></td><td className="px-3 py-3 text-xs">{record.item.createdBy?.fullName || "Không rõ"}</td><td className="whitespace-nowrap px-3 py-3 text-xs">{formatDocumentDate(record.item.createdAt)}</td><td className="whitespace-nowrap px-3 py-3 text-xs">{formatDocumentDate(record.item.updatedAt)}</td><td className="px-3 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setActiveStep(record.step)}>Mở</Button></td></tr>)}</tbody></table></div>
      {!pageRows.length && <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-slate-500">Không có tài liệu khớp điều kiện lọc.</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs"><span>{filtered.length} tài liệu · Trang {currentPage}/{totalPages}</span><div className="flex items-center gap-2"><Select className="h-8 w-28 text-xs" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="10">10 / trang</option><option value="20">20 / trang</option><option value="50">50 / trang</option></Select><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Trước</Button><Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Sau</Button></div></div>
    </>}
  </Card>;
}

function getUseCaseOrigin(item) {
  if (item.origin === "Manual") return { key: "Manual", label: "Use Case nhập tay", tone: "slate", detail: "Use Case nguồn do người dùng nhập trực tiếp" };
  if (item.origin === "AIProfile") return { key: "AIProfile", label: "Dẫn xuất AI từ Requirement", tone: "purple", detail: "Tài liệu dẫn xuất từ Requirement đã Baseline" };
  if (item.origin === "ImportedDocument" || item.evidence?.source === "UploadedUseCaseDocument") return { key: "ImportedDocument", label: "Tài liệu Use Case nguồn", tone: "blue", detail: item.originDetail?.fileName || item.evidence?.fileName || "Tài liệu đã tải lên" };
  return { key: "Legacy", label: "Chưa xác định nguồn", tone: "amber", detail: "Tạo trước khi hệ thống theo dõi nguồn" };
}

function formatDocumentDate(value) {
  if (!value) return "Chưa có dữ liệu";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Chưa có dữ liệu" : date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

const useCaseEditForm = (item) => ({
  code: item.code || "",
  name: item.name || "",
  actor: item.actor || "",
  secondaryActors: (item.secondaryActors || []).join("\n"),
  scope: item.scope || "",
  level: item.level || "User-goal",
  risk: item.risk || "Medium",
  summary: item.summary || "",
  trigger: item.trigger || "",
  preconditions: (item.preconditions || []).join("\n"),
  mainFlow: (item.mainFlow || []).join("\n"),
  alternateFlows: (item.alternateFlows || []).join("\n"),
  exceptionFlows: (item.exceptionFlows || []).join("\n"),
  postconditions: (item.postconditions || []).join("\n"),
  businessRules: (item.businessRules || []).join("\n"),
  assumptions: (item.assumptions || []).join("\n"),
  dependencies: (item.dependencies || []).join("\n"),
  stakeholders: (item.stakeholders || []).join("\n"),
  specialRequirements: (item.specialRequirements || []).join("\n"),
});

function UseCaseEditForm({ item, mutation, onCancel, onSaved }) {
  const [form, setForm] = useState(() => useCaseEditForm(item));
  useEffect(() => setForm(useCaseEditForm(item)), [item._id, item.updatedAt]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const required = form.code.trim() && form.name.trim() && form.actor.trim() && form.scope.trim() && form.summary.trim() && form.trigger.trim() && lines(form.preconditions).length && lines(form.mainFlow).length && lines(form.postconditions).length;
  const save = () => mutation.mutate({
    id: item._id,
    body: {
      ...form,
      secondaryActors: lines(form.secondaryActors),
      stakeholders: lines(form.stakeholders),
      specialRequirements: lines(form.specialRequirements),
      preconditions: lines(form.preconditions),
      mainFlow: lines(form.mainFlow),
      alternateFlows: lines(form.alternateFlows),
      exceptionFlows: lines(form.exceptionFlows),
      postconditions: lines(form.postconditions),
      businessRules: lines(form.businessRules),
      assumptions: lines(form.assumptions),
      dependencies: lines(form.dependencies),
    },
  }, { onSuccess: onSaved });
  return <div className="space-y-5">
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Nội dung do AI sinh chỉ là bản nháp. Khi lưu thay đổi, trạng thái đã duyệt hoặc chờ duyệt sẽ trở về Draft để kiểm tra lại.</div>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Mã Use Case *"><Input value={form.code} onChange={(e) => update("code", e.target.value)} /></Field>
      <Field label="Tên Use Case *"><Input value={form.name} onChange={(e) => update("name", e.target.value)} /></Field>
      <Field label="Actor chính *"><Input value={form.actor} onChange={(e) => update("actor", e.target.value)} /></Field>
      <Field label="Actor phụ" hint="Mỗi dòng một actor."><Textarea rows={3} value={form.secondaryActors} onChange={(e) => update("secondaryActors", e.target.value)} /></Field>
      <Field label="Phạm vi *"><Input value={form.scope} onChange={(e) => update("scope", e.target.value)} /></Field>
      <Field label="Mức độ ưu tiên *"><Select value={form.risk} onChange={(e) => update("risk", e.target.value)}>{["Critical", "High", "Medium", "Low"].map((value) => <option key={value}>{value}</option>)}</Select></Field>
      <Field label="Mô tả tóm tắt *"><Textarea rows={3} value={form.summary} onChange={(e) => update("summary", e.target.value)} /></Field>
      <Field label="Trigger / điều kiện kích hoạt *"><Textarea rows={3} value={form.trigger} onChange={(e) => update("trigger", e.target.value)} /></Field>
      <Field label="Pre-conditions *" hint="Mỗi dòng một điều kiện."><Textarea rows={4} value={form.preconditions} onChange={(e) => update("preconditions", e.target.value)} /></Field>
      <Field label="Post-conditions *" hint="Mỗi dòng một kết quả."><Textarea rows={4} value={form.postconditions} onChange={(e) => update("postconditions", e.target.value)} /></Field>
      <Field label="Basic Flow *" hint="Mỗi dòng một bước; A: Actor, S: System."><Textarea rows={7} value={form.mainFlow} onChange={(e) => update("mainFlow", e.target.value)} /></Field>
      <Field label="Luồng lỗi / ngoại lệ"><Textarea rows={7} value={form.exceptionFlows} onChange={(e) => update("exceptionFlows", e.target.value)} /></Field>
      <Field label="Luồng thay thế"><Textarea rows={4} value={form.alternateFlows} onChange={(e) => update("alternateFlows", e.target.value)} /></Field>
      <Field label="Business Rules"><Textarea rows={4} value={form.businessRules} onChange={(e) => update("businessRules", e.target.value)} /></Field>
      <Field label="Giả định"><Textarea rows={3} value={form.assumptions} onChange={(e) => update("assumptions", e.target.value)} /></Field>
      <Field label="Phụ thuộc"><Textarea rows={3} value={form.dependencies} onChange={(e) => update("dependencies", e.target.value)} /></Field>
    </div>
    <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700"><Button variant="outline" onClick={onCancel} disabled={mutation.isPending}>Hủy</Button><Button onClick={save} disabled={!required || mutation.isPending}>{mutation.isPending ? "Đang lưu…" : "Lưu thay đổi"}</Button></div>
  </div>;
}

function UseCaseSpecificationCard({ item, profile, refresh, approveUseCase, confirmOrigin, updateUseCase }) {
  const approved = item.status === "Approved";
  const origin = getUseCaseOrigin(item);
  const [activeTab, setActiveTab] = useState("specification");
  const [editing, setEditing] = useState(false);
  const [supplementOpen, setSupplementOpen] = useState(false);
  const [supplementResult, setSupplementResult] = useState(null);
  const [selectedChanges, setSelectedChanges] = useState({});
  const supplementDocument = useMutation({
    mutationFn: (file) => e2eApi.supplementUseCasesDocument(profile._id, file, item._id),
    onSuccess: (result) => {
      const defaults = {};
      (result.proposals || []).forEach((proposal, proposalIndex) => proposal.changes?.forEach((change) => { defaults[`${proposalIndex}-${change.field}`] = Boolean(change.safeDefault); }));
      setSelectedChanges(defaults);
      setSupplementResult(result);
      toast.success(result.message || "Đã phân tích tài liệu; chưa thay đổi Use Case.");
    },
    onError: (error) => toast.error(error.message || "Không thể phân tích tài liệu bổ sung."),
  });
  const applySupplement = useMutation({
    mutationFn: ({ proposal, proposalIndex }) => {
      const patch = Object.fromEntries((proposal.changes || []).filter((change) => selectedChanges[`${proposalIndex}-${change.field}`]).map((change) => [change.field, change.proposed]));
      return e2eApi.applyUseCaseSupplement(item._id, { patch, source: supplementResult?.source });
    },
    onSuccess: () => { toast.success("Đã cập nhật Use Case; cần rà soát lại trước khi duyệt."); setSupplementResult(null); refresh?.(); },
    onError: (error) => toast.error(error.message || "Không thể áp dụng thay đổi."),
  });
  const createSupplementUseCase = useMutation({
    mutationFn: ({ proposal }) => e2eApi.createUseCaseFromSupplement(profile._id, { patch: proposal.patch, source: supplementResult?.source }),
    onSuccess: () => { toast.success("Đã tạo Use Case nháp mới từ tài liệu."); refresh?.(); },
    onError: (error) => toast.error(error.message || "Không thể tạo Use Case mới."),
  });
  useEffect(() => setEditing(false), [item._id]);
  const tabs = [
    ["specification", "Đặc tả & luồng"],
    ["diagram", "Sơ đồ Use Case"],
    ["overview", "Tổng quan"],
  ];
  return (
    <article className="min-h-full rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-700 sm:flex-row sm:items-start sm:justify-between">
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
          Actor chính:{" "}
          <span className="font-semibold text-slate-900 dark:text-white">
            {item.actor || "Chưa khai báo"}
          </span>
          {!!item.secondaryActors?.length && <span className="mt-1 block text-xs font-normal text-slate-500">Actor phụ: {item.secondaryActors.join(", ")}</span>}
        </p>
      </div>
      <nav className="sticky top-0 z-10 flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95" aria-label="Nội dung chi tiết Use Case">
        {!editing && tabs.map(([key, label]) => <button key={key} type="button" onClick={() => setActiveTab(key)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${activeTab === key ? "bg-violet-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>{label}</button>)}
        <div className="ml-auto flex flex-wrap gap-2"><Button size="sm" variant={supplementOpen ? "default" : "outline"} onClick={() => setSupplementOpen((value) => !value)}><FileUp className="mr-1 h-4 w-4" />Bổ sung từ tài liệu</Button><Button size="sm" variant={editing ? "default" : "outline"} onClick={() => setEditing((value) => !value)}>{editing ? "Đóng chỉnh sửa" : "Chỉnh sửa"}</Button></div>
      </nav>
      <div className="p-4 pb-20">
        {supplementOpen && <div className="mb-5 space-y-3 rounded-xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/20"><div><p className="font-semibold">Bổ sung thông tin và tách Use Case từ tài liệu</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Tài liệu sẽ được đối chiếu với Use Case này. AI có thể đề xuất điền các trường còn thiếu và phát hiện hành trình mới; không thay đổi dữ liệu cho đến khi bạn chọn.</p></div><label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700"><FileUp className="mr-2 h-4 w-4" />{supplementDocument.isPending ? "Đang phân tích…" : "Chọn tài liệu bổ sung"}<input className="hidden" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={supplementDocument.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) supplementDocument.mutate(file); event.target.value = ""; }} /></label>{supplementResult && <div className="space-y-3 border-t border-sky-200 pt-3 dark:border-sky-800"><p className="text-xs font-semibold">{supplementResult.proposals?.length || 0} đề xuất từ {supplementResult.source?.fileName || "tài liệu"}</p>{(supplementResult.proposals || []).map((proposal, proposalIndex) => <div key={`${proposal.targetUseCaseId || "new"}-${proposalIndex}`} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">{proposal.targetName || "Use Case mới"}</p><p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{proposal.kind === "update" ? "Bổ sung cho Use Case hiện tại" : proposal.kind === "new" ? "Phát hiện Use Case mới" : "Cần QA xác nhận"}</p></div>{proposal.kind === "new" ? <Button size="sm" disabled={createSupplementUseCase.isPending || !proposal.patch?.name || !proposal.patch?.actor} onClick={() => createSupplementUseCase.mutate({ proposal })}>{createSupplementUseCase.isPending ? "Đang tạo…" : "Tạo Use Case nháp"}</Button> : <Button size="sm" disabled={applySupplement.isPending || !(proposal.changes || []).some((change) => selectedChanges[`${proposalIndex}-${change.field}`])} onClick={() => applySupplement.mutate({ proposal, proposalIndex })}>{applySupplement.isPending ? "Đang áp dụng…" : "Áp dụng mục đã chọn"}</Button>}</div>{proposal.kind !== "new" && <div className="mt-2 space-y-2">{(proposal.changes || []).map((change) => <label key={change.field} className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 p-2 text-xs dark:border-slate-700"><input type="checkbox" className="mt-0.5 accent-violet-600" checked={Boolean(selectedChanges[`${proposalIndex}-${change.field}`])} onChange={(event) => setSelectedChanges((current) => ({ ...current, [`${proposalIndex}-${change.field}`]: event.target.checked }))} /><span><strong className="capitalize">{change.field.replace(/([A-Z])/g, " $1")}</strong><span className="mt-1 block text-slate-500">Hiện tại: {Array.isArray(change.current) ? change.current.join(" · ") || "—" : change.current || "—"}</span><span className="block font-medium text-violet-700 dark:text-violet-300">Đề xuất: {Array.isArray(change.proposed) ? change.proposed.join(" · ") : change.proposed}</span></span></label>)}</div>}{proposal.evidence?.length > 0 && <p className="mt-2 text-xs text-slate-500">Căn cứ: {proposal.evidence.join(" · ")}</p>}</div>)}</div>}</div>}
        {editing && <UseCaseEditForm item={item} mutation={updateUseCase} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />}
        {!editing && <>
        {activeTab === "specification" && <div className="space-y-5">
          <div className="grid gap-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60 sm:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Mô tả tóm tắt</p><p className="mt-1 leading-6 text-slate-700 dark:text-slate-200">{item.summary || "Chưa khai báo"}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Trigger / kích hoạt</p><p className="mt-1 leading-6 text-slate-700 dark:text-slate-200">{item.trigger || "Chưa khai báo"}</p></div></div>
          <DocumentQualityNotice quality={item.quality} action="duyệt Use Case" />
          <div className="grid gap-x-8 gap-y-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700 md:grid-cols-2"><UseCaseList title="Pre-conditions / Tiền điều kiện" value={item.preconditions} /><UseCaseList title="Post-conditions / Hậu điều kiện" value={item.postconditions} /><UseCaseList title="Actor phụ" value={item.secondaryActors} /><UseCaseList title="Quy tắc nghiệp vụ" value={item.businessRules} /><UseCaseList title="Giả định" value={item.assumptions} /><UseCaseList title="Phụ thuộc" value={item.dependencies} /></div>
          <ScenarioTable title="Basic Flow / Luồng chính" value={item.mainFlow} actor={item.actor} />
          <ScenarioTable title="Luồng thay thế" value={item.alternateFlows} actor={item.actor} type="alternate" />
          <ScenarioTable title="Luồng lỗi / ngoại lệ" value={item.exceptionFlows} actor={item.actor} type="exception" />
        </div>}
        {activeTab === "diagram" && <UseCaseDiagram item={item} />}
        {activeTab === "overview" && <div className="space-y-4">
          <div className="grid gap-3 rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-800/60 sm:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Mục tiêu nghiệp vụ</p><p className="mt-1 leading-6">{item.summary || "Chưa khai báo"}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Nguồn tạo</p><p className="mt-1 leading-6">{origin.detail}</p></div></div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"><span>Tạo: {formatDocumentDate(item.createdAt)}</span><span>Cập nhật: {formatDocumentDate(item.updatedAt)}</span>{item.approvedAt && <span>Duyệt: {formatDocumentDate(item.approvedAt)}</span>}</div>
          {origin.key === "Legacy" && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><span className="font-medium">Xác nhận nguồn lịch sử:</span><Select aria-label="Xác nhận nguồn tạo Use Case" className="h-8 min-w-48 bg-white text-xs dark:bg-slate-900" defaultValue="" disabled={confirmOrigin?.isPending} onChange={(event) => { if (event.target.value) confirmOrigin?.mutate({ id: item._id, origin: event.target.value }); }}><option value="">Chọn nguồn thực tế</option><option value="Manual">QA soạn thủ công</option><option value="AIProfile">AI gợi ý từ Profile</option><option value="ImportedDocument">Trích xuất từ tài liệu</option></Select></div>}
        </div>}
        </>}
      </div>
      {!approved && !editing && (
        <div className="sticky bottom-0 flex justify-end border-t border-slate-200 bg-white/95 p-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <Button
            size="sm"
            onClick={() => { const reviewNote = window.prompt("Ghi chú duyệt; nếu tự duyệt hãy nêu lý do Project không có Business Owner khác (tối thiểu 10 ký tự):"); if (reviewNote?.trim()) approveUseCase.mutate({ id: item._id, reviewNote: reviewNote.trim() }); }}
            disabled={approveUseCase.isPending || item.quality?.canApprove === false}
          >
            Duyệt Use Case
          </Button>
        </div>
      )}
    </article>
  );
}
function DerivedDocumentsStep({ project, profile, requirements, useCases, stories }) {
  const qc = useQueryClient();
  const baselineRequirements = (requirements?.data || []).filter((item) => item.status === "Baselined");
  const approvedUseCases = (useCases?.data || []).filter((item) => item.status === "Approved");
  const approvedStories = (stories || []).filter((item) => item.approvalStatus === "Approved");
  const sourceRequirements = (requirements?.data || []).filter((item) => !["Rejected", "Retired"].includes(item.status));
  const sourceUseCases = (useCases?.data || []).filter((item) => item.origin !== "AIProfile" && !["Rejected", "Retired"].includes(item.status));
  const sourceStories = (stories || []).filter((item) => item.source !== "AI" && item.approvalStatus !== "Rejected");
  const candidates = [
    ...baselineRequirements.map((item) => ({ artifactType: "Requirement", artifactId: item._id, title: `${item.requirementId ? `${item.requirementId} · ` : ""}${item.title}` })),
    ...approvedUseCases.map((item) => ({ artifactType: "UseCase", artifactId: item._id, title: `${item.code ? `${item.code} · ` : ""}${item.name}` })),
    ...approvedStories.map((item) => ({ artifactType: "UserStory", artifactId: item._id, title: item.title })),
  ];
  const officialByType = { Requirement: sourceRequirements, UseCase: sourceUseCases, UserStory: sourceStories };
  const [selectedSources, setSelectedSources] = useState([]);
  const [targetType, setTargetType] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editorTitle, setEditorTitle] = useState("");
  const [editorValue, setEditorValue] = useState("");
  const [officialSelections, setOfficialSelections] = useState({});
  const [comparisons, setComparisons] = useState({});
  const [selectedMergeFields, setSelectedMergeFields] = useState({});
  const [sourceAnalysis, setSourceAnalysis] = useState(null);
  const derived = useQuery({ queryKey: ["derived-test-basis", project, profile?._id], queryFn: () => e2eApi.derivedTestBasis(project, profile?._id), enabled: Boolean(project) });
  const selectedSourcePayload = selectedSources.map((key) => { const [artifactType, artifactId] = key.split(":"); return { artifactType, artifactId }; });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["derived-test-basis", project, profile?._id] }); requirements?.refetch?.(); useCases?.refetch?.(); qc.invalidateQueries({ queryKey: ["e2e-stories"] }); };
  const generate = useMutation({ mutationFn: () => e2eApi.generateDerivedTestBasis({ targetType, systemProfile: profile?._id || null, sourceArtifacts: selectedSourcePayload }), onSuccess: () => { toast.success("Đã tạo tài liệu AI dẫn xuất ở trạng thái bản nháp."); setTargetType(""); refresh(); }, onError: (error) => toast.error(error.message) });
  const analyze = useMutation({ mutationFn: () => e2eApi.analyzeTestBasisSources({ sourceArtifacts: selectedSourcePayload }), onSuccess: (result) => { setSourceAnalysis(result); toast.success("Đã phân tích tính nhất quán của các nguồn được chọn."); }, onError: (error) => toast.error(error.message) });
  const update = useMutation({ mutationFn: ({ id, body }) => e2eApi.updateDerivedTestBasis(id, body), onSuccess: () => { toast.success("Đã lưu bản chỉnh sửa."); setEditingId(""); refresh(); }, onError: (error) => toast.error(error.message) });
  const accept = useMutation({ mutationFn: (id) => e2eApi.acceptDerivedTestBasis(id), onSuccess: () => { toast.success("Đã chấp nhận làm tài liệu hỗ trợ kiểm thử; tài liệu này vẫn không phải nguồn."); refresh(); }, onError: (error) => toast.error(error.message) });
  const archive = useMutation({ mutationFn: (id) => e2eApi.archiveDerivedTestBasis(id), onSuccess: () => { toast.success("Đã lưu trữ tài liệu dẫn xuất."); refresh(); }, onError: (error) => toast.error(error.message) });
  const adopt = useMutation({ mutationFn: (id) => e2eApi.adoptDerivedTestBasis(id), onSuccess: () => { toast.success("Đã sao chép thành nguồn nội bộ ở trạng thái Nháp; cần Business Owner/QA xác nhận."); refresh(); }, onError: (error) => toast.error(error.message) });
  const compare = useMutation({ mutationFn: ({ id, body }) => e2eApi.compareDerivedTestBasis(id, body), onSuccess: (result, variables) => { setComparisons((value) => ({ ...value, [variables.id]: result })); toast.success("Đã đối chiếu với tài liệu nguồn chính thức."); refresh(); }, onError: (error) => toast.error(error.message) });
  const supersede = useMutation({ mutationFn: ({ id, body }) => e2eApi.supersedeDerivedTestBasis(id, body), onSuccess: () => { toast.success("Đã đánh dấu bản AI được thay thế bởi nguồn chính thức."); refresh(); }, onError: (error) => toast.error(error.message) });
  const applyFields = useMutation({ mutationFn: ({ id, body }) => e2eApi.applyDerivedFields(id, body), onSuccess: (result) => { toast.success(`Đã áp dụng ${result.appliedFields?.length || 0} trường; nguồn chính thức được chuyển về trạng thái cần duyệt lại.`); refresh(); }, onError: (error) => toast.error(error.message) });
  const download = async (item, format) => { try { const blob = await e2eApi.downloadDerivedTestBasis(item._id, format); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `AI-Derived-${item.targetType}-${item._id}.${format}`; anchor.click(); URL.revokeObjectURL(url); } catch (error) { toast.error(error.message); } };
  const toggleSource = (candidate) => { const key = `${candidate.artifactType}:${candidate.artifactId}`; setSelectedSources((value) => value.includes(key) ? value.filter((item) => item !== key) : [...value, key]); };
  const targetLabels = { Requirement: "Requirement ứng viên", UseCase: "Use Case gợi ý", UserStory: "User Story gợi ý" };
  const statusLabels = { AIDraft: "Bản nháp AI", Edited: "Đã chỉnh sửa", AcceptedForTesting: "Được dùng hỗ trợ kiểm thử", Superseded: "Đã được nguồn chính thức thay thế", Archived: "Đã lưu trữ" };
  return <Card className="p-5">
    <SectionTitle title="Tài liệu AI dẫn xuất" description="Workspace tùy chọn trong bước Nguồn & Test Basis. Kết quả là tài liệu hỗ trợ có truy vết, không được tính là nguồn và không ảnh hưởng điều kiện sang Test Plan." />
    <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900 dark:bg-violet-950/20"><p className="text-sm font-bold text-violet-900 dark:text-violet-100">Quy tắc không thay đổi nguồn</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Nguồn gốc AIDerived là bất biến. “Chấp nhận để kiểm thử” không biến tài liệu thành nguồn. Muốn trở thành nguồn nội bộ, hệ thống tạo một bản sao Nháp riêng và yêu cầu người có thẩm quyền xác nhận.</p></div>
    <details className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer text-sm font-semibold text-violet-700 dark:text-violet-300">Xem logic cho tất cả tổ hợp nguồn</summary><div className="mt-3 grid gap-2 text-xs md:grid-cols-2"><p><strong>Chỉ Requirement:</strong> có thể tạo Use Case hoặc User Story.</p><p><strong>Chỉ Use Case:</strong> có thể tạo Requirement ứng viên hoặc User Story.</p><p><strong>Chỉ User Story:</strong> có thể tạo Requirement ứng viên hoặc Use Case.</p><p><strong>Requirement + Use Case:</strong> chỉ tạo User Story nếu chưa có nguồn User Story.</p><p><strong>Requirement + User Story:</strong> chỉ tạo Use Case nếu chưa có nguồn Use Case.</p><p><strong>Use Case + User Story:</strong> chỉ tạo Requirement ứng viên nếu chưa có Requirement nguồn.</p><p><strong>Đủ cả ba:</strong> không sinh thêm; dùng đối chiếu và quản lý bản AI đã có.</p><p><strong>Nguồn chính thức đến sau:</strong> đối chiếu, chọn nguồn chính thức thay thế hoặc giữ bản AI làm tham khảo; không ghi đè.</p></div></details>
    {!candidates.length ? <div className="mt-5 rounded-xl border border-dashed p-5 text-sm text-slate-500">Chưa có Test Basis nguồn được xác nhận. Hãy Baseline Requirement hoặc duyệt Use Case/User Story trước.</div> : <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-sm font-bold">1. Chọn tài liệu nguồn cụ thể</p><p className="mt-1 text-xs text-slate-500">Có thể chọn một hoặc nhiều nguồn cùng Project. AI phải truy vết về toàn bộ tài liệu đã chọn.</p><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{candidates.map((item) => { const key = `${item.artifactType}:${item.artifactId}`; return <label key={key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"><input className="mt-1 h-4 w-4 accent-violet-600" type="checkbox" checked={selectedSources.includes(key)} onChange={() => { toggleSource(item); setSourceAnalysis(null); }} /><span><strong>{item.artifactType}</strong><span className="mt-0.5 block text-xs text-slate-500">{item.title}</span></span></label>; })}</div>{selectedSources.length >= 2 && <Button className="mt-3" size="sm" variant="outline" disabled={analyze.isPending} onClick={() => analyze.mutate()}>{analyze.isPending ? "Đang phân tích…" : "Phân tích tính nhất quán các nguồn"}</Button>}</section>
      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-sm font-bold">2. Chọn định dạng muốn tạo</p><p className="mt-1 text-xs text-slate-500">Loại đã có nguồn chính thức được khóa để tránh tạo trùng.</p><div className="mt-3 space-y-2">{Object.entries(targetLabels).map(([type, label]) => { const hasOfficial = officialByType[type].length > 0; return <button key={type} type="button" disabled={hasOfficial} onClick={() => setTargetType(type)} className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-55 ${targetType === type ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30" : "border-slate-200 dark:border-slate-700"}`}><span><strong>{label}</strong><span className="mt-0.5 block text-xs text-slate-500">{hasOfficial ? `Đã có ${officialByType[type].length} nguồn chính thức — dùng đối chiếu thay vì sinh thêm` : "Chưa có nguồn cùng loại"}</span></span>{hasOfficial && <Badge tone="green">Có nguồn</Badge>}</button>; })}</div><Button className="mt-4 w-full" disabled={!selectedSources.length || !targetType || generate.isPending} onClick={() => generate.mutate()}>{generate.isPending ? "AI đang tạo bản nháp…" : "Tạo tài liệu AI dẫn xuất"}</Button></section>
    </div>}
    {sourceAnalysis && <section className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900 dark:bg-indigo-950/20"><p className="text-sm font-bold text-indigo-900 dark:text-indigo-100">Kết quả phân tích nguồn — không tự thay đổi tài liệu</p><p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-200">{sourceAnalysis.summary}</p><div className="mt-3 grid gap-3 md:grid-cols-2"><div><p className="text-xs font-bold">Khoảng trống</p><ul className="mt-1 list-disc pl-5 text-xs text-slate-600 dark:text-slate-300">{(sourceAnalysis.gaps || []).map((item, index) => <li key={index}>{item}</li>)}</ul></div><div><p className="text-xs font-bold">Trùng lặp</p><ul className="mt-1 list-disc pl-5 text-xs text-slate-600 dark:text-slate-300">{(sourceAnalysis.duplicates || []).map((item, index) => <li key={index}>{item}</li>)}</ul></div></div>{(sourceAnalysis.conflicts || []).length > 0 && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/20"><p className="text-xs font-bold text-amber-800 dark:text-amber-200">Mâu thuẫn cần người có thẩm quyền quyết định</p>{sourceAnalysis.conflicts.map((conflict, index) => <p key={index} className="mt-1 text-xs text-amber-700 dark:text-amber-300">{conflict.topic}: {conflict.reason} — {conflict.requiredDecision}</p>)}</div>}</section>}
    <section className="mt-7 border-t border-slate-200 pt-5 dark:border-slate-700"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold">Tài liệu AI dẫn xuất đã tạo</p><p className="mt-1 text-xs text-slate-500">Chỉnh sửa, tải xuống, chấp nhận để hỗ trợ kiểm thử hoặc đối chiếu khi nguồn chính thức xuất hiện.</p></div><Badge tone="blue">{derived.data?.length || 0} tài liệu</Badge></div>
      <div className="mt-4 space-y-3">{derived.isLoading ? <p className="text-sm text-slate-500">Đang tải…</p> : !(derived.data || []).length ? <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">Chưa có tài liệu AI dẫn xuất.</p> : (derived.data || []).map((item) => { const official = officialByType[item.targetType] || []; const comparison = comparisons[item._id] || item.reconciliation?.summary; const selectedOfficial = officialSelections[item._id] || official[0]?._id || ""; return <article key={item._id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><Badge tone="blue">AI dẫn xuất · không phải nguồn</Badge><Badge tone={item.status === "AcceptedForTesting" ? "green" : item.status === "Superseded" || item.status === "Archived" ? "slate" : "amber"}>{statusLabels[item.status] || item.status}</Badge><span className="text-xs font-bold text-violet-700 dark:text-violet-300">{targetLabels[item.targetType]}</span></div><h3 className="mt-2 font-bold">{item.title}</h3><p className="mt-1 text-xs text-slate-500">Dẫn xuất từ: {(item.sourceArtifacts || []).map((source) => `${source.artifactType} · ${source.title}`).join(" | ")}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => download(item, "docx")}><Download className="h-4 w-4" />DOCX</Button><Button size="sm" variant="outline" onClick={() => download(item, "pdf")}><Download className="h-4 w-4" />PDF</Button></div></div>
        {editingId === item._id ? <div className="mt-4"><Field label="Tiêu đề"><Input value={editorTitle} onChange={(event) => setEditorTitle(event.target.value)} /></Field><Field label="Nội dung JSON có cấu trúc"><Textarea className="font-mono text-xs" rows={16} value={editorValue} onChange={(event) => setEditorValue(event.target.value)} /></Field><div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditingId("")}>Hủy</Button><Button onClick={() => { try { update.mutate({ id: item._id, body: { title: editorTitle || item.title, content: JSON.parse(editorValue) } }); } catch { toast.error("Nội dung JSON không hợp lệ."); } }}>Lưu chỉnh sửa</Button></div></div> : <pre className="mt-4 max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700 dark:bg-slate-900 dark:text-slate-300">{JSON.stringify(item.content, null, 2)}</pre>}
        <div className="mt-4 flex flex-wrap gap-2">{!["Superseded", "Archived"].includes(item.status) && editingId !== item._id && <Button size="sm" variant="outline" onClick={() => { setEditingId(item._id); setEditorTitle(item.title); setEditorValue(JSON.stringify(item.content, null, 2)); }}>Chỉnh sửa</Button>}{["AIDraft", "Edited"].includes(item.status) && <Button size="sm" onClick={() => accept.mutate(item._id)}>Chấp nhận để hỗ trợ kiểm thử</Button>}{item.status === "AcceptedForTesting" && !item.adoptedSource?.artifactId && <Button size="sm" variant="outline" onClick={() => adopt.mutate(item._id)}>Đề xuất làm nguồn nội bộ</Button>}{!["Superseded", "Archived"].includes(item.status) && <Button size="sm" variant="outline" onClick={() => archive.mutate(item._id)}>Lưu trữ</Button>}</div>
        {item.adoptedSource?.artifactId && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">Đã tạo một bản nguồn nội bộ riêng ở trạng thái Nháp. Bản AI này vẫn giữ nguyên nguồn gốc để audit.</p>}
        {!!official.length && !["Superseded", "Archived"].includes(item.status) && <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/20"><p className="text-xs font-bold text-sky-900 dark:text-sky-100">Đã có nguồn chính thức cùng loại — cần đối chiếu</p><div className="mt-2 flex flex-wrap gap-2"><Select className="min-w-64 flex-1" value={selectedOfficial} onChange={(event) => { setOfficialSelections((value) => ({ ...value, [item._id]: event.target.value })); setComparisons((value) => ({ ...value, [item._id]: null })); setSelectedMergeFields((value) => ({ ...value, [item._id]: [] })); }}>{official.map((source) => <option key={source._id} value={source._id}>{item.targetType === "Requirement" ? `${source.requirementId || "REQ"} · ${source.title}` : item.targetType === "UseCase" ? `${source.code || "UC"} · ${source.name}` : source.title}</option>)}</Select><Button size="sm" variant="outline" onClick={() => compare.mutate({ id: item._id, body: { artifactType: item.targetType, artifactId: selectedOfficial } })}>Đối chiếu</Button>{comparison && <Button size="sm" onClick={() => supersede.mutate({ id: item._id, body: { artifactType: item.targetType, artifactId: selectedOfficial } })}>Dùng nguồn chính thức thay thế</Button>}</div>{comparison && <><p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Giống nhau: {comparison.same} · Chỉ có trong nguồn: {comparison.onlyInSource} · Chỉ có trong bản AI: {comparison.onlyInDerived} · Mâu thuẫn: {comparison.conflicts}. Hệ thống không tự chọn bên đúng.</p><div className="mt-3 space-y-2">{(comparison.differences || []).filter((difference) => ["OnlyInDerived", "Conflict"].includes(difference.classification)).map((difference) => { const selected = selectedMergeFields[item._id] || []; return <label key={difference.field} className="flex cursor-pointer items-start gap-2 rounded-lg border border-sky-200 bg-white p-2 text-xs dark:border-sky-900 dark:bg-slate-900"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-violet-600" checked={selected.includes(difference.field)} onChange={(event) => setSelectedMergeFields((value) => ({ ...value, [item._id]: event.target.checked ? [...selected, difference.field] : selected.filter((field) => field !== difference.field) }))} /><span><strong>{difference.field}</strong> · {difference.classification === "Conflict" ? "Mâu thuẫn — chỉ áp dụng khi đã xác minh" : "Chỉ có trong bản AI"}</span></label>; })}</div>{(selectedMergeFields[item._id] || []).length > 0 && <div className="mt-3 flex justify-end"><Button size="sm" variant="outline" onClick={() => applyFields.mutate({ id: item._id, body: { artifactType: item.targetType, artifactId: selectedOfficial, fields: selectedMergeFields[item._id] } })}>Áp dụng trường đã chọn vào nguồn</Button></div>}</>}</div>}
      </article>; })}</div>
    </section>
  </Card>;
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
  StoryDraftCard,
  user,
  updateStory,
  submitStory,
  qaReviewStory,
  download,
  onNext,
  onStored,
  canContinue,
}) {
  const qc = useQueryClient();
  const documentKind = "UserStory";
  const [mode, setMode] = useState("manual");
  const emptyDraft = () => ({ title: "", externalId: "", version: "", actor: "", goal: "", benefit: "", description: "", criteria: "", priority: "Medium", storyPoints: "3", estimatedHours: "", labels: "", businessValue: "", inScope: "", outOfScope: "", nonFunctionalRequirements: "", risks: "", assumptions: "", dependencies: "", definitionOfReady: "", definitionOfDone: "", testDataRequirements: "", dataRestrictions: "", parentRequirements: [], linkedUseCases: [] });
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
  const sourceStories = stories.filter((item) => item.source !== "AI");
  const approvedStories = sourceStories.filter(
    (item) => item.approvalStatus === "Approved",
  );
  const pendingStories = sourceStories.filter((item) => item.approvalStatus === "PendingApproval");
  const recentStories = [...sourceStories].sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0)).slice(0, 5);
  const storyLibraryUrl = `/documents?${new URLSearchParams({ project: String(project || ""), profile: String(profile?._id || ""), type: "User Story" }).toString()}`;
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
      e2e: { systemProfile: profile._id, requirements: draft.parentRequirements, useCases: draft.linkedUseCases, useCase: draft.linkedUseCases[0] || null, definitionOfDone: lines(draft.definitionOfDone), assumptions: lines(draft.assumptions), dependencies: lines(draft.dependencies) },
    }),
    onSuccess: () => {
      setDraft(emptyDraft());
      toast.success("Đã lưu User Story nháp.");
      qc.invalidateQueries({ queryKey: ["e2e-stories"] });
      onStored?.();
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
      onStored?.();
    },
    onError: (error) =>
      toast.error(error.message || "Không thể xử lý tài liệu.", {
        description: Array.isArray(error.details) ? error.details.join(" · ") : undefined,
      }),
  });
  return (
    <Card className="p-5">
      <SectionTitle
        title="User Story"
        description="User Story là một Test Basis độc lập, ngang hàng với Requirement và Use Case; có thể nhập trực tiếp từ backlog hoặc liên kết khi cần truy vết."
      />
      <div className="mt-4 flex flex-wrap gap-2">
        {[["manual", "Tự nhập"], ["upload", "Tải tài liệu có sẵn"]].map(([key, label]) => (
          <Button key={key} type="button" variant={mode === key ? "default" : "outline"} aria-pressed={mode === key} onClick={() => setMode(key)}>{label}</Button>
        ))}
      </div>
      {mode === "manual" && <div className="mt-4 space-y-4">
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20">
          <p className="text-sm font-semibold">Nội dung cốt lõi</p><p className="mt-1 text-xs text-slate-500">Chỉ cần hoàn thành các trường này để lưu bản nháp. Những thông tin chi tiết có thể bổ sung sau.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2"><Field className="md:col-span-2" label="Tiêu đề *"><Input maxLength={300} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="US-ORDER-001 · Đặt món từ nhà hàng" /></Field><Field label="Với vai trò *"><Input value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })} placeholder="Khách hàng" /></Field><Field label="Tôi muốn *"><Input value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} placeholder="chọn món và đặt hàng" /></Field><Field className="md:col-span-2" label="Để *"><Input value={draft.benefit} onChange={(e) => setDraft({ ...draft, benefit: e.target.value })} placeholder="nhận món phù hợp tại địa chỉ đã chọn." /></Field><Field className="md:col-span-2" label="Acceptance Criteria * · mỗi dòng một tiêu chí"><Textarea rows={4} value={draft.criteria} onChange={(e) => setDraft({ ...draft, criteria: e.target.value })} placeholder={"Given khách hàng đã chọn món hợp lệ\nWhen khách hàng xác nhận đặt hàng\nThen hệ thống tạo đơn và hiển thị mã đơn."} /></Field></div>
        </div>
        <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><summary className="cursor-pointer text-sm font-semibold text-violet-700 dark:text-violet-300">Bổ sung chi tiết: phạm vi, ưu tiên, truy vết, rủi ro và dữ liệu</summary><p className="mt-1 text-xs text-slate-500">Mở khi bạn cần làm rõ phạm vi hoặc chuẩn bị hồ sơ đầy đủ để review.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Phạm vi User Story" hint="Một lát cắt nhỏ có thể bàn giao và kiểm thử trong một feature hoặc flow."><Textarea rows={2} value={draft.inScope} onChange={(e) => setDraft({ ...draft, inScope: e.target.value })} placeholder="Ví dụ: Checkout — khách hàng áp mã voucher và xác nhận đơn hàng." /></Field><Field label="Mã nguồn / phiên bản"><div className="grid grid-cols-2 gap-2"><Input value={draft.externalId} onChange={(e) => setDraft({ ...draft, externalId: e.target.value })} placeholder="US-123" /><Input value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} placeholder="v1.0" /></div></Field><Field label="Ưu tiên · Story Point · Giờ ước tính"><div className="grid grid-cols-3 gap-2"><Select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>{["Critical", "High", "Medium", "Low"].map((item) => <option key={item}>{item}</option>)}</Select><Select value={draft.storyPoints} onChange={(e) => setDraft({ ...draft, storyPoints: e.target.value })}>{["1", "2", "3", "5", "8", "13", "21"].map((item) => <option key={item} value={item}>{item} SP</option>)}</Select><Input type="number" min="0" step="0.5" value={draft.estimatedHours} onChange={(e) => setDraft({ ...draft, estimatedHours: e.target.value })} placeholder="Giờ" /></div></Field><Field label="Giá trị nghiệp vụ"><Textarea rows={2} value={draft.businessValue} onChange={(e) => setDraft({ ...draft, businessValue: e.target.value })} placeholder="Giảm thời gian đặt món, tăng tỷ lệ hoàn tất đơn." /></Field><Field className="md:col-span-2" label="Diễn giải bổ sung"><Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Bổ sung bối cảnh nghiệp vụ nếu cần." /></Field><Field label="Requirement nguồn / truy vết"><Select multiple className="min-h-24" value={draft.parentRequirements} onChange={(event) => setDraft({ ...draft, parentRequirements: [...event.target.selectedOptions].map((item) => item.value) })}>{(requirements?.data || []).filter((item) => item.status === "Baselined").map((item) => <option key={item._id} value={item._id}>{item.requirementId} · {item.title}</option>)}</Select></Field><Field label="Definition of Ready"><Textarea rows={3} value={draft.definitionOfReady} onChange={(e) => setDraft({ ...draft, definitionOfReady: e.target.value })} placeholder="Requirement đã Baseline\nThiết kế/API liên quan đã rõ" /></Field><Field label="Tags · mỗi dòng một tag"><Input value={draft.labels} onChange={(e) => setDraft({ ...draft, labels: e.target.value })} placeholder="Order\nCustomer\nMVP" /></Field><Field label="Ngoài phạm vi"><Textarea rows={3} value={draft.outOfScope} onChange={(e) => setDraft({ ...draft, outOfScope: e.target.value })} /></Field><Field label="Yêu cầu phi chức năng"><Textarea rows={3} value={draft.nonFunctionalRequirements} onChange={(e) => setDraft({ ...draft, nonFunctionalRequirements: e.target.value })} placeholder="Phản hồi dưới 3 giây…" /></Field><Field label="Rủi ro"><Textarea rows={3} value={draft.risks} onChange={(e) => setDraft({ ...draft, risks: e.target.value })} /></Field><Field label="Giả định"><Textarea rows={3} value={draft.assumptions} onChange={(e) => setDraft({ ...draft, assumptions: e.target.value })} /></Field><Field label="Phụ thuộc"><Textarea rows={3} value={draft.dependencies} onChange={(e) => setDraft({ ...draft, dependencies: e.target.value })} /></Field><Field label="Dữ liệu test cần có"><Textarea rows={3} value={draft.testDataRequirements} onChange={(e) => setDraft({ ...draft, testDataRequirements: e.target.value })} /></Field><Field label="Dữ liệu cấm sử dụng"><Textarea rows={3} value={draft.dataRestrictions} onChange={(e) => setDraft({ ...draft, dataRestrictions: e.target.value })} placeholder="PII thật, mật khẩu, token, dữ liệu production" /></Field><Field className="md:col-span-2" label="Definition of Done"><Textarea rows={3} value={draft.definitionOfDone} onChange={(e) => setDraft({ ...draft, definitionOfDone: e.target.value })} placeholder="Acceptance Criteria được QA xác nhận\nKhông còn lỗi Critical/High\nTài liệu và bằng chứng đã cập nhật" /></Field></div></details>
        {!!approvedUseCases.length && <Field label="Liên kết Use Case hiện có · tùy chọn"><Select multiple className="min-h-24" value={draft.linkedUseCases} onChange={(event) => setDraft({ ...draft, linkedUseCases: [...event.target.selectedOptions].map((item) => item.value) })}>{approvedUseCases.map((item) => <option key={item._id} value={item._id}>{item.code} · {item.name}</option>)}</Select></Field>}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800"><p className="text-xs text-slate-500">User Story có thể độc lập hoặc liên kết nhiều Requirement và Use Case.</p><Button disabled={!draft.title.trim() || !draft.actor.trim() || !draft.goal.trim() || !draft.benefit.trim() || !lines(draft.criteria).length || createManual.isPending} onClick={() => createManual.mutate()}>{createManual.isPending ? "Đang lưu…" : "Lưu User Story nháp"}</Button></div>
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
      {!!sourceStories.length && <div className="mt-7 border-t border-slate-200 pt-5 dark:border-slate-700"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">User Story nguồn đã lưu</p><p className="mt-1 text-xs text-slate-500">Hiển thị 5 mục nguồn cập nhật gần nhất; tài liệu AI dẫn xuất được quản lý trong workspace riêng.</p></div><Button asChild><Link to={storyLibraryUrl}>Mở Thư viện User Story <ArrowRight className="h-4 w-4" /></Link></Button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-2xl font-bold">{sourceStories.length}</p><p className="mt-1 text-xs text-slate-500">Tổng User Story nguồn</p></div><div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20"><p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{pendingStories.length}</p><p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Đang chờ duyệt</p></div><div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"><p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{approvedStories.length}</p><p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Đã duyệt</p></div></div>
      <div className="mt-3 space-y-2">
        {recentStories.map((item) => (
          <StoryDraftCard
            key={`${item._id}-${item.updatedAt || ""}`}
            item={item}
            updateStory={updateStory}
            submitStory={submitStory}
            qaReviewStory={qaReviewStory}
            download={download}
          />
        ))}
      </div></div>}
      {!intakeOnly && <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Có thể tiếp tục khi ít nhất một Requirement, Use Case hoặc User Story đã được xác nhận.</p><Button variant="outline" disabled={!canContinue} onClick={onNext}>Tiếp tục Test Plan <ArrowRight className="h-4 w-4" /></Button></div>}
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
    mutationFn: ({ id, reviewNote }) =>
      executionApi.decidePlan(id, {
        decision: "Approved",
        reviewNote,
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
      toast.success("Đã gửi Test Plan cho QA duyệt");
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
        Gửi QA duyệt Test Plan
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
                onClick={() => { const reviewNote = window.prompt("Ghi chú duyệt; nếu tự duyệt hãy nêu lý do Project không có QA khác (tối thiểu 10 ký tự):"); if (reviewNote?.trim()) approve.mutate({ id: item._id, reviewNote: reviewNote.trim() }); }}
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
function SuiteStep({ project, profile, suites, createSuite, blocked, onNext, setActiveStep }) {
  const items = suites.data || [];
  const recentItems = [...items].sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0)).slice(0, 5);
  const suiteLibraryUrl = `/documents?${new URLSearchParams({ project: String(project || ""), profile: String(profile?._id || ""), type: "Test Suite" }).toString()}`;
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
      {!!items.length && <div className="mt-7 border-t border-slate-200 pt-5 dark:border-slate-700"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">Test Suite đã lưu</p><p className="mt-1 text-xs text-slate-500">Hiển thị 5 mục cập nhật gần nhất; quản lý toàn bộ trong Thư viện tài liệu.</p></div><Button asChild><Link to={suiteLibraryUrl}>Mở Thư viện Test Suite <ArrowRight className="h-4 w-4" /></Link></Button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-2xl font-bold">{items.length}</p><p className="mt-1 text-xs text-slate-500">Tổng Test Suite</p></div><div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20"><p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{items.filter((item) => item.quality?.canApprove === false).length}</p><p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Cần bổ sung</p></div><div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"><p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{items.filter((item) => item.quality?.canApprove !== false).length}</p><p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Sẵn sàng</p></div></div>
      <div className="mt-3 space-y-2">
        {recentItems.map((item) => (
          <div key={item._id} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.name}</strong><DocumentQualityBadge quality={item.quality} /></div>
            <p className="mt-1 text-xs text-slate-500">{item.description}</p>
            <div className="mt-2"><DocumentQualityNotice quality={item.quality} action="dùng Test Suite" /></div>
          </div>
        ))}
      </div></div>}
      {!blocked && items.length > 0 && (
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
        description="Chọn đúng Use Case, User Story và nhóm Test Case nội bộ; chỉ sinh case trong cùng phạm vi."
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
          <option value="">Module / nhóm Test Case</option>
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
  onBound,
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
  const bindEnvironment = (environmentId) => {
    if (!environmentId || updateProfile.isPending) return;
    updateProfile.mutate(
      { environment: environmentId, baseUrl: "" },
      {
        onSuccess: () => {
          environments.refetch();
          toast.success("Đã gắn môi trường vào Test Run.");
          onBound?.();
        },
      },
    );
  };
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
            onClick={() => bindEnvironment(selected)}
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
              setShowBuilder(false);
              bindEnvironment(String(item._id));
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
      {openedRun && <TestRunExecutionPanel key={openedRun._id} runId={openedRun._id} project={project} profile={profile?._id} onBindEnvironment={() => setActiveStep("runtime")} />}
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

function PlanEmpty() {
  return <p className="text-xs italic text-slate-400">Chưa khai báo</p>;
}

function PlanList({ value, ordered = false }) {
  const rows = planLines(value);
  if (!rows.length) return <PlanEmpty />;
  const Tag = ordered ? "ol" : "ul";
  return <Tag className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5 text-sm leading-5 text-slate-700 dark:text-slate-200`}>{rows.map((row, index) => <li key={index}>{row}</li>)}</Tag>;
}

function PlanTable({ rows = [], columns }) {
  const visibleRows = (Array.isArray(rows) ? rows : []).filter((row) => row && columns.some(({ key }) => Array.isArray(row[key]) ? row[key].length : row[key]));
  if (!visibleRows.length) return <PlanEmpty />;
  return <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700"><table className="w-full min-w-[620px] table-fixed text-left text-xs"><thead className="bg-slate-100/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr>{columns.map(({ key, label, width }) => <th key={key} className="px-3 py-2 font-semibold" style={width ? { width } : undefined}>{label}</th>)}</tr></thead><tbody>{visibleRows.map((row, index) => <tr key={index} className="border-t border-slate-200 align-top dark:border-slate-700">{columns.map(({ key }) => <td key={key} className="whitespace-pre-wrap break-words px-3 py-2 leading-5 text-slate-700 dark:text-slate-200">{Array.isArray(row[key]) ? row[key].join(", ") : row[key] || "—"}</td>)}</tr>)}</tbody></table></div>;
}

function PlanPanel({ number, title, subtitle, children, wide = false }) {
  return <section className={`min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/25 ${wide ? "lg:col-span-2" : ""}`}><div className="mb-3 flex items-start gap-3"><span className="grid h-7 min-w-7 place-items-center rounded-lg bg-violet-100 px-1 text-[11px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">{number}</span><div><h4 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h4>{subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}</div></div>{children}</section>;
}

function PrintList({ value, empty = "Chưa khai báo" }) {
  const rows = planLines(value);
  return rows.length ? <ul className="list-disc space-y-1 pl-5 text-[11px] leading-5 text-slate-800">{rows.map((row, index) => <li key={index}>{row}</li>)}</ul> : <p className="text-[11px] italic text-slate-400">{empty}</p>;
}

function PrintTable({ rows = [], columns }) {
  const visibleRows = (Array.isArray(rows) ? rows : []).filter((row) => row && columns.some(({ key }) => Array.isArray(row[key]) ? row[key].length : row[key]));
  if (!visibleRows.length) return <p className="text-[11px] italic text-slate-400">Chưa khai báo</p>;
  return <div className="overflow-hidden border border-slate-400"><table className="w-full table-fixed border-collapse text-left text-[10px]"><thead className="bg-slate-100"><tr>{columns.map(({ key, label, width }) => <th key={key} className="border-r border-slate-400 px-2 py-1.5 font-bold last:border-r-0" style={width ? { width } : undefined}>{label}</th>)}</tr></thead><tbody>{visibleRows.map((row, index) => <tr key={index} className="border-t border-slate-300 align-top">{columns.map(({ key }) => <td key={key} className="whitespace-pre-wrap break-words border-r border-slate-300 px-2 py-1.5 leading-4 last:border-r-0">{Array.isArray(row[key]) ? row[key].join(", ") : row[key] || "—"}</td>)}</tr>)}</tbody></table></div>;
}

function PrintSection({ number, title, children }) {
  return <section className="break-inside-avoid"><h2 className="mb-2 border-b border-slate-400 pb-1 text-[12px] font-bold uppercase tracking-wide text-slate-900"><span className="mr-2 text-violet-700">{number}.</span>{title}</h2>{children}</section>;
}

function PrintPage({ page, total, documentId, children }) {
  return <section className="relative mx-auto min-h-[760px] w-full max-w-[794px] bg-white px-[7%] pb-14 pt-12 text-slate-900 shadow-[0_12px_40px_rgba(15,23,42,0.14)] ring-1 ring-slate-300 sm:min-h-[1000px] sm:px-14 sm:pb-16 sm:pt-14"><div className="absolute left-[7%] right-[7%] top-5 flex items-center justify-between border-b border-slate-200 pb-2 text-[9px] uppercase tracking-[0.14em] text-slate-400 sm:left-14 sm:right-14"><span>{documentId || "TEST PLAN"}</span><span>Quality Assurance</span></div><div className="space-y-6">{children}</div><div className="absolute bottom-5 left-[7%] right-[7%] flex items-center justify-between border-t border-slate-200 pt-2 text-[9px] text-slate-400 sm:left-14 sm:right-14"><span>Tài liệu Test Plan</span><span>Trang {page} / {total}</span></div></section>;
}

function TestPlanPrintPreview({ plan, risks, planTypeLabel }) {
  const control = plan.documentControl || {};
  const testItems = plan.testItemMatrix?.length ? plan.testItemMatrix : planLines(plan.testItems).map((module, index) => ({ itemId: `TI-${String(index + 1).padStart(2, "0")}`, module, description: "" }));
  const riskRows = plan.riskMatrix?.length ? plan.riskMatrix : risks.map((item) => ({ ...item, impact: "" }));
  const total = 5;
  return <div className="space-y-5 bg-slate-200/70 p-3 sm:p-6 dark:bg-slate-950/60">
    <PrintPage page={1} total={total} documentId={control.documentId || plan.planId}>
      <div className="flex min-h-[280px] flex-col items-center justify-center border-y-4 border-violet-700 py-12 text-center"><p className="text-[11px] font-bold uppercase tracking-[0.3em] text-violet-700">{planTypeLabel}</p><h1 className="mt-5 max-w-2xl text-2xl font-bold leading-tight sm:text-4xl">{plan.name || "TEST PLAN"}</h1><p className="mt-4 max-w-xl text-xs leading-5 text-slate-500">{plan.description || "Kế hoạch kiểm thử phần mềm"}</p><div className="mt-8 grid w-full max-w-xl grid-cols-2 gap-x-8 gap-y-3 text-left text-[10px] sm:grid-cols-3"><div><span className="block text-slate-400">Document ID</span><b>{control.documentId || plan.planId || "—"}</b></div><div><span className="block text-slate-400">Version</span><b>{control.version || "—"}</b></div><div><span className="block text-slate-400">Status</span><b>{control.documentStatus || plan.approvalStatus || "Draft"}</b></div><div><span className="block text-slate-400">Author</span><b>{control.author || "—"}</b></div><div><span className="block text-slate-400">Reviewer</span><b>{control.reviewer || "—"}</b></div><div><span className="block text-slate-400">Date</span><b>{control.documentDate ? String(control.documentDate).slice(0, 10) : "—"}</b></div></div></div>
      <PrintSection number="1" title="Document Control"><PrintTable rows={control.versionHistory} columns={[{ key: "version", label: "Version", width: "14%" }, { key: "date", label: "Date", width: "18%" }, { key: "author", label: "Author", width: "24%" }, { key: "description", label: "Description" }]} /></PrintSection>
      <PrintSection number="2" title="Introduction"><p className="text-[11px] leading-5">{plan.introduction?.purpose || "Chưa khai báo mục đích tài liệu."}</p>{plan.introduction?.background && <p className="mt-2 text-[11px] leading-5">{plan.introduction.background}</p>}<h3 className="mb-1 mt-3 text-[10px] font-bold uppercase">Objectives</h3><PrintList value={plan.objectives} /></PrintSection>
    </PrintPage>
    <PrintPage page={2} total={total} documentId={control.documentId || plan.planId}>
      <PrintSection number="3" title="System Under Test"><div className="grid gap-3 text-[11px] sm:grid-cols-2"><p><b>System name:</b> {plan.systemUnderTest?.name || "Chưa khai báo"}</p><p className="break-all"><b>Target URL:</b> {plan.systemUnderTest?.targetUrl || "Chưa khai báo"}</p></div><div className="mt-2"><PrintList value={plan.systemUnderTest?.primaryModules} /></div></PrintSection>
      <PrintSection number="4" title="Test Scope"><div className="grid gap-5 sm:grid-cols-2"><div><h3 className="mb-1 text-[10px] font-bold uppercase text-emerald-700">In scope</h3><PrintList value={plan.scope} /></div><div><h3 className="mb-1 text-[10px] font-bold uppercase text-rose-700">Out of scope</h3><PrintList value={plan.outOfScope} /></div></div></PrintSection>
      <PrintSection number="5" title="Test Items & Features"><PrintTable rows={testItems} columns={[{ key: "itemId", label: "ID", width: "16%" }, { key: "module", label: "Test Item / Module", width: "35%" }, { key: "description", label: "Description" }]} /></PrintSection>
      <PrintSection number="6" title="Test Strategy & Methodology"><PrintList value={[...planLines(plan.testStrategy), ...planLines(plan.methodologies)]} /></PrintSection>
      <PrintSection number="7" title="Test Levels & Test Types"><div className="grid gap-5 sm:grid-cols-2"><div><h3 className="mb-1 text-[10px] font-bold uppercase">Test levels</h3><PrintList value={plan.testLevels} /></div><div><h3 className="mb-1 text-[10px] font-bold uppercase">Test types</h3><PrintList value={plan.testTypes} /></div></div><div className="mt-3"><PrintTable rows={plan.testTypeMatrix} columns={[{ key: "testType", label: "Test Type", width: "35%" }, { key: "purpose", label: "Purpose" }]} /></div></PrintSection>
    </PrintPage>
    <PrintPage page={3} total={total} documentId={control.documentId || plan.planId}>
      <PrintSection number="8" title="Test Environment"><PrintList value={plan.environmentRequirements || plan.environment} /><div className="mt-3"><PrintTable rows={plan.environmentSpecifications} columns={[{ key: "category", label: "Category", width: "32%" }, { key: "specification", label: "Configuration / Specification" }]} /></div></PrintSection>
      <PrintSection number="9" title="Test Data"><PrintList value={plan.testDataRequirements} />{plan.testData && <p className="mt-2 text-[11px] leading-5">{plan.testData}</p>}</PrintSection>
      <PrintSection number="10" title="Test Execution Schedule & Milestones"><PrintTable rows={plan.milestones} columns={[{ key: "phase", label: "Phase", width: "20%" }, { key: "activity", label: "Milestone / Activity" }, { key: "timeframe", label: "Timeframe", width: "28%" }]} /></PrintSection>
      <PrintSection number="11" title="Entry & Exit Criteria"><div className="grid gap-5 sm:grid-cols-2"><div><h3 className="mb-1 text-[10px] font-bold uppercase">Entry criteria</h3><PrintList value={plan.entryCriteria} /></div><div><h3 className="mb-1 text-[10px] font-bold uppercase">Exit criteria</h3><PrintList value={plan.exitCriteria} /></div></div></PrintSection>
      <PrintSection number="12" title="Pass / Fail Criteria"><div className="space-y-2 text-[11px] leading-5"><p><b>PASS:</b> {plan.passFailCriteria?.testCasePass || "Chưa khai báo"}</p><p><b>FAIL:</b> {plan.passFailCriteria?.testCaseFail || "Chưa khai báo"}</p><p><b>Test cycle:</b> {plan.passFailCriteria?.testCycleCompletion || "Chưa khai báo"}</p></div></PrintSection>
    </PrintPage>
    <PrintPage page={4} total={total} documentId={control.documentId || plan.planId}>
      <PrintSection number="13" title="Defect Management & Severity / Priority"><p className="text-[11px] leading-5"><b>Workflow:</b> {planLines(plan.defectManagement?.workflow).join(" → ") || "Chưa khai báo"}</p><div className="mt-3 grid gap-4 sm:grid-cols-2"><PrintTable rows={plan.defectManagement?.severityDefinitions} columns={[{ key: "level", label: "Severity", width: "35%" }, { key: "definition", label: "Definition" }]} /><PrintTable rows={plan.defectManagement?.priorityDefinitions} columns={[{ key: "level", label: "Priority", width: "35%" }, { key: "definition", label: "Definition" }]} /></div></PrintSection>
      <PrintSection number="14" title="Roles & Responsibilities"><PrintTable rows={plan.rolesResponsibilities} columns={[{ key: "role", label: "Role", width: "32%" }, { key: "responsibilities", label: "Responsibilities" }]} /></PrintSection>
      <PrintSection number="15" title="Deliverables"><PrintList value={plan.deliverables} /></PrintSection>
      <PrintSection number="16" title="Risks, Assumptions & Dependencies"><PrintTable rows={riskRows} columns={[{ key: "risk", label: "Risk", width: "27%" }, { key: "impact", label: "Impact", width: "16%" }, { key: "mitigation", label: "Mitigation" }, { key: "owner", label: "Owner", width: "16%" }]} /><div className="mt-4 grid gap-5 sm:grid-cols-2"><div><h3 className="mb-1 text-[10px] font-bold uppercase">Assumptions</h3><PrintList value={plan.assumptions} /></div><div><h3 className="mb-1 text-[10px] font-bold uppercase">Dependencies</h3><PrintList value={plan.dependencies} /></div></div></PrintSection>
    </PrintPage>
    <PrintPage page={5} total={total} documentId={control.documentId || plan.planId}>
      <PrintSection number="17" title="Traceability Matrix"><PrintTable rows={plan.traceabilityMatrix} columns={[{ key: "feature", label: "Feature", width: "22%" }, { key: "basisReference", label: "Test Case ID / Basis", width: "21%" }, { key: "testType", label: "Test Type", width: "18%" }, { key: "coverageStatus", label: "Status", width: "16%" }, { key: "notes", label: "Bug ID / Notes" }]} /></PrintSection>
      <PrintSection number="18" title="Approval & Sign-off"><PrintTable rows={plan.signOff} columns={[{ key: "role", label: "Role", width: "24%" }, { key: "name", label: "Name" }, { key: "date", label: "Date", width: "20%" }, { key: "status", label: "Signature / Status", width: "22%" }]} /></PrintSection>
      <div className="mt-16 border-t border-slate-300 pt-8 text-center"><p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">End of Test Plan</p><p className="mt-2 text-[10px] text-slate-400">Nội dung trên bản xem trước được lấy từ bản nháp hiện tại.</p></div>
    </PrintPage>
  </div>;
}

function TestPlanDocument({
  plan,
  onApprove,
  approving,
  isDraft = false,
  onEdit,
  onSupplement,
  project,
}) {
  const [exporting, setExporting] = useState("");
  const [documentGroup, setDocumentGroup] = useState("overview");
  const [previewMode, setPreviewMode] = useState("document");
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
  const control = plan.documentControl || {};
  const groups = [
    ["overview", "1–5", "Tổng quan"], ["strategy", "6–7", "Chiến lược"],
    ["resources", "8–10", "Nguồn lực"], ["governance", "11–16", "Quản trị"],
    ["traceability", "17–18", "Truy vết & duyệt"],
  ];
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
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-slate-500">Document ID</dt>
            <dd className="mt-1 font-semibold">
              {control.documentId || plan.planId || "Sẽ tạo khi lưu"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Phiên bản</dt>
            <dd className="mt-1 font-semibold">{control.version || "Chưa xác định"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Hệ thống</dt>
            <dd className="mt-1 font-semibold">{plan.systemUnderTest?.name || "Chưa xác định"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Trạng thái phê duyệt</dt>
            <dd className="mt-1 font-semibold">{approval}</dd>
          </div>
        </dl>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-900"><div><p className="text-xs font-semibold">Chế độ xem trước</p><p className="mt-0.5 text-[11px] text-slate-500">Bản A4 và file xuất luôn lấy dữ liệu mới nhất đang hiển thị; dữ liệu theo nhóm dùng để rà soát nhanh.</p></div><div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Chế độ xem Test Plan"><button type="button" role="tab" aria-selected={previewMode === "document"} onClick={() => setPreviewMode("document")} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${previewMode === "document" ? "bg-white text-violet-700 shadow-sm dark:bg-slate-700 dark:text-violet-200" : "text-slate-500"}`}>Bản in A4</button><button type="button" role="tab" aria-selected={previewMode === "data"} onClick={() => setPreviewMode("data")} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${previewMode === "data" ? "bg-white text-violet-700 shadow-sm dark:bg-slate-700 dark:text-violet-200" : "text-slate-500"}`}>Dữ liệu theo nhóm</button></div></div>
      {previewMode === "document" ? <TestPlanPrintPreview plan={plan} risks={risks} planTypeLabel={planTypeLabel} /> : <div className="p-5">
        <DocumentQualityNotice quality={plan.quality} action="duyệt Test Plan" />
        <div className="mt-4 flex gap-2 overflow-x-auto border-b border-slate-200 pb-3 dark:border-slate-700" role="tablist" aria-label="Nhóm nội dung Test Plan">{groups.map(([id, number, label]) => <button key={id} type="button" role="tab" aria-selected={documentGroup === id} onClick={() => setDocumentGroup(id)} className={`shrink-0 rounded-lg px-3 py-2 text-left text-xs transition ${documentGroup === id ? "bg-violet-600 font-semibold text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}><span className="mr-1.5 opacity-75">{number}</span>{label}</button>)}</div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {documentGroup === "overview" && <>
            <PlanPanel number="1" title="Document Control" subtitle="Mã, phiên bản, tác giả và lịch sử thay đổi" wide><dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">{[["Tiêu đề", control.documentTitle || plan.name], ["Tác giả", control.author], ["Người rà soát", control.reviewer], ["Ngày", control.documentDate ? String(control.documentDate).slice(0, 10) : ""]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-0.5 font-semibold">{value || "Chưa khai báo"}</dd></div>)}</dl><div className="mt-3"><PlanTable rows={control.versionHistory} columns={[{ key: "version", label: "Phiên bản", width: "14%" }, { key: "date", label: "Ngày", width: "18%" }, { key: "author", label: "Tác giả", width: "22%" }, { key: "description", label: "Mô tả" }]} /></div></PlanPanel>
            <PlanPanel number="2" title="Introduction">{plan.introduction?.purpose ? <p className="text-sm leading-5 text-slate-700 dark:text-slate-200">{plan.introduction.purpose}</p> : <PlanEmpty />}{plan.introduction?.background && <p className="mt-2 text-sm leading-5 text-slate-600 dark:text-slate-300">{plan.introduction.background}</p>}<div className="mt-3"><p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Mục tiêu</p><PlanList value={plan.objectives} /></div></PlanPanel>
            <PlanPanel number="3" title="System Under Test"><dl className="space-y-2 text-sm"><div><dt className="text-xs text-slate-500">Tên hệ thống</dt><dd className="font-semibold">{plan.systemUnderTest?.name || "Chưa khai báo"}</dd></div><div><dt className="text-xs text-slate-500">Target URL</dt><dd className="break-all">{plan.systemUnderTest?.targetUrl || "Chưa khai báo"}</dd></div></dl><div className="mt-3"><PlanList value={plan.systemUnderTest?.primaryModules} /></div></PlanPanel>
            <PlanPanel number="4" title="Test Scope"><div className="grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-[11px] font-semibold uppercase text-emerald-700">Trong phạm vi</p><PlanList value={plan.scope} /></div><div><p className="mb-1 text-[11px] font-semibold uppercase text-rose-700">Ngoài phạm vi</p><PlanList value={plan.outOfScope} /></div></div></PlanPanel>
            <PlanPanel number="5" title="Test Items & Features" wide><PlanTable rows={plan.testItemMatrix?.length ? plan.testItemMatrix : planLines(plan.testItems).map((module, index) => ({ itemId: `TI-${String(index + 1).padStart(2, "0")}`, module, description: "" }))} columns={[{ key: "itemId", label: "ID", width: "15%" }, { key: "module", label: "Module", width: "32%" }, { key: "description", label: "Mô tả" }]} /></PlanPanel>
          </>}
          {documentGroup === "strategy" && <>
            <PlanPanel number="6" title="Test Strategy & Methodology"><PlanList value={[...planLines(plan.testStrategy), ...planLines(plan.methodologies)]} /></PlanPanel>
            <PlanPanel number="7" title="Test Levels & Test Types"><div className="grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Test level</p><PlanList value={plan.testLevels} /></div><div><p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Test type</p><PlanList value={plan.testTypes} /></div></div><div className="mt-3"><PlanTable rows={plan.testTypeMatrix} columns={[{ key: "testType", label: "Loại", width: "35%" }, { key: "purpose", label: "Mục đích" }]} /></div><div className="mt-3"><p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Coverage</p><PlanList value={plan.coverageTargets} /></div></PlanPanel>
          </>}
          {documentGroup === "resources" && <>
            <PlanPanel number="8" title="Test Environment"><PlanList value={plan.environmentRequirements || plan.environment} /><div className="mt-3"><PlanTable rows={plan.environmentSpecifications} columns={[{ key: "category", label: "Hạng mục", width: "32%" }, { key: "specification", label: "Cấu hình / đặc tả" }]} /></div></PlanPanel>
            <PlanPanel number="9" title="Test Data"><PlanList value={plan.testDataRequirements} />{plan.testData && <p className="mt-3 rounded-lg bg-slate-100 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{plan.testData}</p>}</PlanPanel>
            <PlanPanel number="10" title="Execution Schedule & Milestones" wide><PlanTable rows={plan.milestones} columns={[{ key: "phase", label: "Giai đoạn", width: "20%" }, { key: "activity", label: "Hoạt động" }, { key: "timeframe", label: "Thời gian", width: "28%" }]} />{(plan.startDate || plan.endDate) && <p className="mt-3 text-xs text-slate-500">{plan.startDate ? `Bắt đầu: ${String(plan.startDate).slice(0, 10)}` : ""}{plan.startDate && plan.endDate ? " · " : ""}{plan.endDate ? `Kết thúc: ${String(plan.endDate).slice(0, 10)}` : ""}</p>}</PlanPanel>
          </>}
          {documentGroup === "governance" && <>
            <PlanPanel number="11" title="Entry & Exit Criteria"><div className="grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-[11px] font-semibold uppercase text-emerald-700">Entry</p><PlanList value={plan.entryCriteria} /></div><div><p className="mb-1 text-[11px] font-semibold uppercase text-rose-700">Exit</p><PlanList value={plan.exitCriteria} /></div></div></PlanPanel>
            <PlanPanel number="12" title="Pass / Fail Criteria"><dl className="space-y-2 text-xs">{[["PASS", plan.passFailCriteria?.testCasePass], ["FAIL", plan.passFailCriteria?.testCaseFail], ["Test cycle", plan.passFailCriteria?.testCycleCompletion]].map(([label, value]) => <div key={label} className="rounded-lg bg-white p-2 dark:bg-slate-900"><dt className="font-bold text-slate-500">{label}</dt><dd className="mt-1 leading-5">{value || "Chưa khai báo"}</dd></div>)}</dl></PlanPanel>
            <PlanPanel number="13" title="Defect Management"><div className="flex flex-wrap items-center gap-1.5">{planLines(plan.defectManagement?.workflow).length ? planLines(plan.defectManagement.workflow).map((step, index, all) => <span key={index} className="contents"><span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-medium dark:bg-slate-700">{step}</span>{index < all.length - 1 && <span className="text-slate-400">→</span>}</span>) : <PlanEmpty />}</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><PlanTable rows={plan.defectManagement?.severityDefinitions} columns={[{ key: "level", label: "Severity", width: "35%" }, { key: "definition", label: "Định nghĩa" }]} /><PlanTable rows={plan.defectManagement?.priorityDefinitions} columns={[{ key: "level", label: "Priority", width: "35%" }, { key: "definition", label: "Định nghĩa" }]} /></div></PlanPanel>
            <PlanPanel number="14" title="Roles & Responsibilities"><PlanTable rows={plan.rolesResponsibilities} columns={[{ key: "role", label: "Vai trò", width: "32%" }, { key: "responsibilities", label: "Trách nhiệm" }]} /></PlanPanel>
            <PlanPanel number="15" title="Deliverables"><PlanList value={plan.deliverables} /></PlanPanel>
            <PlanPanel number="16" title="Risks, Assumptions & Dependencies"><PlanTable rows={plan.riskMatrix?.length ? plan.riskMatrix : risks.map((item) => ({ ...item, impact: "" }))} columns={[{ key: "risk", label: "Rủi ro", width: "28%" }, { key: "impact", label: "Tác động", width: "18%" }, { key: "mitigation", label: "Giảm thiểu" }, { key: "owner", label: "Phụ trách", width: "18%" }]} /><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Giả định</p><PlanList value={plan.assumptions} /></div><div><p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Phụ thuộc</p><PlanList value={plan.dependencies} /></div></div></PlanPanel>
          </>}
          {documentGroup === "traceability" && <>
            <PlanPanel number="17" title="Traceability Matrix" wide><PlanTable rows={plan.traceabilityMatrix} columns={[{ key: "feature", label: "Feature", width: "22%" }, { key: "basisReference", label: "Test Basis", width: "20%" }, { key: "testType", label: "Test type", width: "18%" }, { key: "coverageStatus", label: "Coverage", width: "16%" }, { key: "notes", label: "Ghi chú" }]} /></PlanPanel>
            <PlanPanel number="18" title="Approval & Sign-off" wide><PlanTable rows={plan.signOff} columns={[{ key: "role", label: "Vai trò", width: "24%" }, { key: "name", label: "Họ tên" }, { key: "date", label: "Ngày", width: "20%" }, { key: "status", label: "Trạng thái", width: "20%" }]} /></PlanPanel>
          </>}
        </div>
      </div>}
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
        {!isDraft && onSupplement && plan.quality?.canApprove === false && (
          <Button onClick={onSupplement}>
            Bổ sung thông tin
          </Button>
        )}
        {(isDraft || onEdit) && (
          <Button variant="outline" onClick={onEdit}>
            Chỉnh sửa
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

const parsePlanRows = (value, keys) => planLines(value).map((line) => {
  const cells = String(line).split("|").map((cell) => cell.trim());
  return Object.fromEntries(keys.map((key, index) => [key, cells[index] || ""]));
}).filter((row) => Object.values(row).some(Boolean));
const planRowsText = (rows, keys) => (rows || []).map((row) => keys.map((key) => Array.isArray(row?.[key]) ? row[key].join(", ") : row?.[key] || "").join(" | ")).join("\n");

const testPlanRequiredFields = [
  { key: "documentId", label: "Document ID", placeholder: "TP-PROJECT-001" },
  { key: "name", label: "Tên Test Plan" },
  { key: "version", label: "Phiên bản tài liệu", placeholder: "1.0" },
  { key: "purpose", label: "Mục đích tài liệu", multiline: true },
  { key: "background", label: "Bối cảnh hệ thống", multiline: true },
  { key: "systemName", label: "Hệ thống dưới kiểm thử" },
  { key: "scope", label: "Phạm vi", multiline: true },
  { key: "objectives", label: "Mục tiêu kiểm thử", multiline: true, placeholder: "Mỗi dòng một mục tiêu" },
  { key: "testItemMatrix", label: "Test item", multiline: true, placeholder: "ID | module | mô tả" },
  { key: "strategy", label: "Chiến lược kiểm thử", multiline: true },
  { key: "testLevels", label: "Test level", multiline: true, placeholder: "Mỗi dòng một mức" },
  { key: "testTypes", label: "Test type", multiline: true, placeholder: "Mỗi dòng một loại" },
  { key: "coverageTargets", label: "Mục tiêu coverage", multiline: true },
  { key: "environmentRequirements", label: "Yêu cầu môi trường", multiline: true },
  { key: "testDataRequirements", label: "Yêu cầu dữ liệu kiểm thử", multiline: true },
  { key: "entryCriteria", label: "Entry criteria", multiline: true },
  { key: "exitCriteria", label: "Exit criteria", multiline: true },
  { key: "testCasePass", label: "Điều kiện Test Case Pass", multiline: true },
  { key: "testCaseFail", label: "Điều kiện Test Case Fail", multiline: true },
  { key: "testCycleCompletion", label: "Điều kiện hoàn tất Test Cycle", multiline: true },
  { key: "defectWorkflow", label: "Quy trình quản lý defect", multiline: true },
  { key: "rolesResponsibilities", label: "Vai trò và trách nhiệm", multiline: true, placeholder: "Vai trò | trách nhiệm" },
  { key: "deliverables", label: "Deliverables", multiline: true },
  { key: "riskMatrix", label: "Rủi ro và phương án xử lý", multiline: true, placeholder: "Rủi ro | tác động | giảm thiểu | phụ trách" },
  { key: "traceabilityMatrix", label: "Ma trận truy vết", multiline: true, placeholder: "Feature | Test Basis | test type | coverage | ghi chú" },
];

function FullTestPlanEditor({ form, update, onPreview, onSaveDraft, onSupplementFile, saving, supplementing }) {
  const supplementInputRef = useRef(null);
  const sections = [
    ["control", "1", "Kiểm soát tài liệu"], ["overview", "2–5", "Tổng quan & phạm vi"],
    ["strategy", "6–7", "Chiến lược kiểm thử"], ["resources", "8–10", "Môi trường, dữ liệu & lịch"],
    ["governance", "11–16", "Tiêu chí & quản trị"], ["traceability", "17–18", "Truy vết & phê duyệt"],
  ];
  const [active, setActive] = useState("control");
  const T = ({ label, name, rows = 3, placeholder = "" }) => <Field label={label}><Textarea rows={rows} value={form[name] || ""} onChange={(event) => update(name, event.target.value)} placeholder={placeholder} /></Field>;
  const I = ({ label, name, type = "text", placeholder = "" }) => <Field label={label}><Input type={type} value={form[name] || ""} onChange={(event) => update(name, event.target.value)} placeholder={placeholder} /></Field>;
  return <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-950/40"><div><p className="font-bold">Soạn Test Plan đầy đủ</p><p className="mt-1 text-xs text-slate-500">18 phần được chia thành 6 nhóm. Nội dung đã nhập được giữ nguyên khi chuyển nhóm.</p></div>{onSupplementFile && <><Button type="button" variant="outline" disabled={supplementing} onClick={() => supplementInputRef.current?.click()}><FileUp className="h-4 w-4" />{supplementing ? "Đang lấy thông tin…" : "Tải file bổ sung"}</Button><input ref={supplementInputRef} className="hidden" type="file" accept=".pdf,.doc,.docx,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const file = event.target.files?.[0]; if (file) onSupplementFile(file); event.target.value = ""; }} /></>}</div>
    <div className="grid lg:grid-cols-[250px_minmax(0,1fr)]">
      <nav aria-label="Các phần của Test Plan" className="border-b border-slate-200 p-3 dark:border-slate-700 lg:border-b-0 lg:border-r">{sections.map(([id, number, label]) => <button key={id} type="button" onClick={() => setActive(id)} className={`mb-2 flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm ${active === id ? "border-violet-500 bg-violet-50 font-bold text-violet-800 dark:bg-violet-950/30 dark:text-violet-200" : "border-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[11px] font-bold shadow-sm dark:bg-slate-800">{number}</span><span>{label}</span></button>)}</nav>
      <div className="min-w-0 p-5">
        {active === "control" && <div className="grid gap-4 md:grid-cols-2"><I label="Document ID *" name="documentId" placeholder="TP-PROJECT-001" /><I label="Tên Test Plan *" name="name" /><I label="Phiên bản *" name="version" /><I label="Ngày tài liệu" name="documentDate" type="date" /><I label="Tác giả" name="author" /><I label="Người rà soát" name="reviewer" /><div className="md:col-span-2"><T label="Lịch sử phiên bản · phiên bản | ngày | tác giả | mô tả" name="versionHistory" placeholder="1.0 | 13/11/2026 | Nguyễn Văn A | Tạo mới" /></div></div>}
        {active === "overview" && <div className="grid gap-4 md:grid-cols-2"><T label="2.1 Mục đích tài liệu *" name="purpose" /><T label="2.2 Bối cảnh hệ thống *" name="background" /><T label="2.3 Mục tiêu kiểm thử · mỗi dòng một mục *" name="objectives" /><I label="3.1 Tên hệ thống dưới kiểm thử *" name="systemName" /><I label="3.2 URL mục tiêu (nếu đã biết)" name="targetUrl" /><T label="3.3 Module chính · mỗi dòng một module" name="primaryModules" /><T label="4.1 Trong phạm vi *" name="scope" /><T label="4.2 Ngoài phạm vi" name="outOfScope" /><div className="md:col-span-2"><T label="5. Test item · ID | module | mô tả *" name="testItemMatrix" rows={5} placeholder="TI-01 | Authentication | Đăng nhập và phân quyền" /></div></div>}
        {active === "strategy" && <div className="grid gap-4 md:grid-cols-2"><T label="6. Chiến lược và phương pháp *" name="strategy" rows={5} /><T label="Phương pháp · mỗi dòng một mục" name="methodologies" /><T label="7.1 Test level · mỗi dòng một mức *" name="testLevels" /><T label="7.2 Test type · mỗi dòng một loại *" name="testTypes" /><div className="md:col-span-2"><T label="Ma trận loại kiểm thử · loại | mục đích" name="testTypeMatrix" placeholder="Functional | Xác nhận hành vi nghiệp vụ" /></div><div className="md:col-span-2"><T label="Mục tiêu coverage *" name="coverageTargets" /></div></div>}
        {active === "resources" && <div className="grid gap-4 md:grid-cols-2"><T label="8. Yêu cầu môi trường *" name="environmentRequirements" /><T label="Cấu hình · hạng mục | đặc tả" name="environmentSpecifications" placeholder="Browser | Chrome phiên bản hỗ trợ" /><T label="9. Yêu cầu dữ liệu kiểm thử *" name="testDataRequirements" /><T label="Ràng buộc dữ liệu" name="data" /><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(form.scheduleRequired)} onChange={(event) => update("scheduleRequired", event.target.checked)} /> Kế hoạch này cần lịch cụ thể</label><span />{form.scheduleRequired && <><I label="Ngày bắt đầu" name="startDate" type="date" /><I label="Ngày kết thúc" name="endDate" type="date" /></>}<div className="md:col-span-2"><T label="10. Mốc thời gian · giai đoạn | hoạt động | thời gian" name="milestones" placeholder="Planning | Hoàn tất Test Plan | Tuần 1" /></div></div>}
        {active === "governance" && <div className="grid gap-4 md:grid-cols-2"><T label="11. Entry criteria *" name="entryCriteria" /><T label="11. Exit criteria *" name="exitCriteria" /><T label="12. Điều kiện Test Case Pass *" name="testCasePass" /><T label="12. Điều kiện Test Case Fail *" name="testCaseFail" /><T label="12. Điều kiện hoàn tất Test Cycle *" name="testCycleCompletion" /><T label="13. Defect workflow *" name="defectWorkflow" /><T label="Severity · mức | định nghĩa" name="severityDefinitions" /><T label="Priority · mức | định nghĩa" name="priorityDefinitions" /><T label="14. Vai trò · vai trò | trách nhiệm *" name="rolesResponsibilities" /><T label="15. Deliverables *" name="deliverables" /><T label="16. Rủi ro · rủi ro | tác động | giảm thiểu | phụ trách *" name="riskMatrix" /><T label="Giả định" name="assumptions" /><div className="md:col-span-2"><T label="Phụ thuộc" name="dependencies" /></div></div>}
        {active === "traceability" && <div className="grid gap-4"><T label="17. Traceability · feature | Test Basis | test type | coverage | ghi chú *" name="traceabilityMatrix" rows={7} placeholder="Đăng nhập | REQ-AUTH-01 | Functional, Security | Planned |" /><T label="18. Sign-off · vai trò | họ tên | ngày | trạng thái" name="signOff" rows={4} placeholder="QA Lead | | | Pending" /></div>}
        <div className="sticky bottom-0 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 pt-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"><p className="text-xs text-slate-500">Có thể lưu Draft dù chưa đủ; hệ thống chỉ cho gửi duyệt khi đủ trường bắt buộc.</p><div className="flex gap-2"><Button variant="outline" disabled={saving || !form.name} onClick={onSaveDraft}>{saving ? "Đang lưu…" : "Lưu Draft"}</Button><Button disabled={!form.name || !form.scope} onClick={onPreview}>Xem bản tóm tắt</Button></div></div>
      </div>
    </div>
  </div>;
}

function TestBasisScopeGroup({ title, items, selectedIds, labelOf, onToggle, onSelectAll, onClear }) {
  const selected = new Set(selectedIds.map(String));
  return <details className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><summary className="cursor-pointer list-none px-4 py-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-[11px] text-slate-500">{selected.size}/{items.length} đang được dùng làm Test Basis</p></div><Badge tone={selected.size ? "violet" : "slate"}>{selected.size}/{items.length}</Badge></div></summary><div className="border-t border-slate-200 p-3 dark:border-slate-700">{items.length ? <><div className="grid max-h-72 gap-2 overflow-y-auto pr-1 md:grid-cols-2">{items.map((item) => { const id = String(item._id); return <label key={id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-100 p-2 text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"><input className="mt-0.5 accent-violet-700" type="checkbox" checked={selected.has(id)} onChange={() => onToggle(id)} /><span>{labelOf(item)}</span></label>; })}</div><div className="mt-3 flex gap-3 text-xs"><button type="button" className="font-semibold text-violet-700 underline dark:text-violet-300" onClick={onSelectAll}>Chọn tất cả</button><button type="button" className="underline" onClick={onClear}>Bỏ chọn tất cả</button></div></> : <p className="text-xs italic text-slate-400">Không có tài liệu hợp lệ trong phạm vi đã xác nhận.</p>}</div></details>;
}

function TestPlanningDocumentEditor({ activeProject, profile, requirements = [], stories, useCases = [], items, onNext }) {
  const qc = useQueryClient();
  const generationRequest = useRef(null);
  const planImportInputRef = useRef(null);
  const supplementPlanInputRef = useRef(null);
  const supplementImportRef = useRef(false);
  const [generationError, setGenerationError] = useState("");
  useEffect(() => () => generationRequest.current?.abort(), []);
  const [screen, setScreen] = useState("start");
  const [editingPlanId, setEditingPlanId] = useState("");
  const [excludedBasisIds, setExcludedBasisIds] = useState({ requirements: [], stories: [], useCases: [] });
  const [planOrigin, setPlanOrigin] = useState("Manual");
  const [importMode, setImportMode] = useState("new");
  const [libraryPlanId, setLibraryPlanId] = useState("");
  const [importReport, setImportReport] = useState(null);
  const [importSource, setImportSource] = useState(null);
  const [importNeedsDraftSave, setImportNeedsDraftSave] = useState(false);
  const [form, setForm] = useState({ name: "", scope: "", objectives: "", testItems: "", outOfScope: "", strategy: "", entryCriteria: "", exitCriteria: "", data: "", environmentRequirements: "", risks: "", deliverables: "", testLevels: "System", testTypes: "Functional", coverageTargets: "Requirement / Use Case / User Story\nBusiness rule\nProduct risk\nPositive và negative", releaseOrSprint: "", moduleOrFeatures: "", changeType: "", releaseGoal: "", deadline: "", systemLifecycle: "Existing", criticalFunctions: "", compliance: "", nfrOrSla: "", constraints: "", estimatedEffortHours: "", startDate: "", endDate: "", scheduleRequired: false, documentId: "", version: "1.0", author: "", reviewer: "", documentDate: new Date().toISOString().slice(0, 10), versionHistory: "", purpose: "", background: "", systemName: "", targetUrl: "", primaryModules: "", testItemMatrix: "", methodologies: "Risk-based testing\nRequirements-based testing", testTypeMatrix: "", environmentSpecifications: "", testDataRequirements: "", milestones: "", testCasePass: "", testCaseFail: "", testCycleCompletion: "", defectWorkflow: "New\nAssigned\nIn Progress\nResolved\nRetest\nClosed / Reopened", severityDefinitions: "", priorityDefinitions: "", rolesResponsibilities: "", riskMatrix: "", assumptions: "", dependencies: "", traceabilityMatrix: "", signOff: "" });
  const selection = profile?.workflow?.testBasisSelection;
  const selectedSourceIds = new Set([...(selection?.requirements || []), ...(selection?.useCases || []), ...(selection?.userStories || [])].map((item) => String(item?._id || item)));
  const approvedStories = stories.filter((item) => item.approvalStatus === "Approved" && item.source !== "AI" && selectedSourceIds.has(String(item._id)));
  const approvedRequirements = requirements.filter((item) => item.status === "Baselined" && selectedSourceIds.has(String(item._id)));
  const approvedUseCases = useCases.filter((item) => item.status === "Approved" && item.origin !== "AIProfile" && selectedSourceIds.has(String(item._id)));
  const selectedRequirements = approvedRequirements.filter((item) => !excludedBasisIds.requirements.includes(String(item._id)));
  const selectedStories = approvedStories.filter((item) => !excludedBasisIds.stories.includes(String(item._id)));
  const selectedUseCases = approvedUseCases.filter((item) => !excludedBasisIds.useCases.includes(String(item._id)));
  const storiesForPlan = selectedStories;
  const hasAvailableTestBasis = Boolean(approvedRequirements.length || approvedStories.length || approvedUseCases.length);
  const hasTestBasis = Boolean(selectedRequirements.length || selectedStories.length || selectedUseCases.length);
  const toggleBasis = (kind, id) => setExcludedBasisIds((current) => ({ ...current, [kind]: current[kind].includes(String(id)) ? current[kind].filter((item) => item !== String(id)) : [...current[kind], String(id)] }));
  const selectAllBasis = (kind) => setExcludedBasisIds((current) => ({ ...current, [kind]: [] }));
  const clearBasis = (kind, source) => setExcludedBasisIds((current) => ({ ...current, [kind]: source.map((item) => String(item._id)) }));
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value, ...(key === "environment" ? { environmentRequirements: value } : {}) }));
  const planToForm = (plan = {}) => ({ name: plan.name || "", scope: plan.scope || "", objectives: planListText(plan.objectives), testItems: planListText(plan.testItems), outOfScope: planListText(plan.outOfScope), strategy: plan.testStrategy || plan.strategy || "", entryCriteria: planListText(plan.entryCriteria), exitCriteria: planListText(plan.exitCriteria), data: plan.testData || plan.data || "", environmentRequirements: plan.environmentRequirements || plan.environment || "", risks: planRiskText(plan.risks), deliverables: planListText(plan.deliverables), testLevels: planListText(plan.testLevels), testTypes: planListText(plan.testTypes), coverageTargets: planListText(plan.coverageTargets), releaseOrSprint: plan.planningContext?.releaseOrSprint || "", moduleOrFeatures: planListText(plan.planningContext?.moduleOrFeatures), changeType: plan.planningContext?.changeType || "", releaseGoal: plan.planningContext?.releaseGoal || "", deadline: plan.planningContext?.deadline ? String(plan.planningContext.deadline).slice(0, 10) : "", systemLifecycle: plan.planningContext?.systemLifecycle || "Existing", criticalFunctions: planListText(plan.planningConstraints?.criticalFunctions), compliance: planListText(plan.planningConstraints?.compliance), nfrOrSla: planListText(plan.planningConstraints?.nfrOrSla), constraints: planListText(plan.planningConstraints?.dataEnvironmentLimits), scheduleRequired: Boolean(plan.planningContext?.scheduleRequired), estimatedEffortHours: plan.estimatedEffortHours || "", startDate: plan.startDate ? String(plan.startDate).slice(0, 10) : "", endDate: plan.endDate ? String(plan.endDate).slice(0, 10) : "", documentId: plan.documentControl?.documentId || "", version: plan.documentControl?.version || "1.0", author: plan.documentControl?.author || "", reviewer: plan.documentControl?.reviewer || "", documentDate: plan.documentControl?.documentDate ? String(plan.documentControl.documentDate).slice(0, 10) : "", versionHistory: planRowsText(plan.documentControl?.versionHistory, ["version", "date", "author", "description"]), purpose: plan.introduction?.purpose || "", background: plan.introduction?.background || "", systemName: plan.systemUnderTest?.name || "", targetUrl: plan.systemUnderTest?.targetUrl || "", primaryModules: planListText(plan.systemUnderTest?.primaryModules), testItemMatrix: planRowsText(plan.testItemMatrix, ["itemId", "module", "description"]), methodologies: planListText(plan.methodologies), testTypeMatrix: planRowsText(plan.testTypeMatrix, ["testType", "purpose"]), environmentSpecifications: planRowsText(plan.environmentSpecifications, ["category", "specification"]), testDataRequirements: planListText(plan.testDataRequirements), milestones: planRowsText(plan.milestones, ["phase", "activity", "timeframe"]), testCasePass: plan.passFailCriteria?.testCasePass || "", testCaseFail: plan.passFailCriteria?.testCaseFail || "", testCycleCompletion: plan.passFailCriteria?.testCycleCompletion || "", defectWorkflow: planListText(plan.defectManagement?.workflow), severityDefinitions: planRowsText(plan.defectManagement?.severityDefinitions, ["level", "definition"]), priorityDefinitions: planRowsText(plan.defectManagement?.priorityDefinitions, ["level", "definition"]), rolesResponsibilities: planRowsText(plan.rolesResponsibilities, ["role", "responsibilities"]), riskMatrix: planRowsText(plan.riskMatrix, ["risk", "impact", "mitigation", "owner"]), assumptions: planListText(plan.assumptions), dependencies: planListText(plan.dependencies), traceabilityMatrix: planRowsText(plan.traceabilityMatrix, ["feature", "basisReference", "testType", "coverageStatus", "notes"]), signOff: planRowsText(plan.signOff, ["role", "name", "date", "status"]) });
  const mergeText = (left, right) => [...new Set([...lines(left), ...lines(right)])].join("\n");
  const applyImportedPlan = (plan, source, report = {}, requestedMode = importMode) => {
    const imported = planToForm(plan);
    if (requestedMode === "new") { setEditingPlanId(""); setForm(imported); }
    else if (requestedMode === "replace") setForm(imported);
    else setForm((current) => ({
      ...current,
      ...Object.fromEntries(Object.entries(imported).map(([key, value]) => [key, current[key] || value])),
      objectives: mergeText(current.objectives, imported.objectives), testItems: mergeText(current.testItems, imported.testItems), outOfScope: mergeText(current.outOfScope, imported.outOfScope),
      entryCriteria: mergeText(current.entryCriteria, imported.entryCriteria), exitCriteria: mergeText(current.exitCriteria, imported.exitCriteria), risks: mergeText(current.risks, imported.risks),
      deliverables: mergeText(current.deliverables, imported.deliverables), testLevels: mergeText(current.testLevels, imported.testLevels), testTypes: mergeText(current.testTypes, imported.testTypes),
      coverageTargets: mergeText(current.coverageTargets, imported.coverageTargets), testDataRequirements: mergeText(current.testDataRequirements, imported.testDataRequirements),
      defectWorkflow: mergeText(current.defectWorkflow, imported.defectWorkflow), assumptions: mergeText(current.assumptions, imported.assumptions), dependencies: mergeText(current.dependencies, imported.dependencies),
    }));
    setPlanOrigin("ImportedDocument");
    setImportSource(source);
    setImportReport(report);
    setImportNeedsDraftSave(true);
    setGenerationError("");
    setScreen("preview");
  };
  const missingRequiredFields = testPlanRequiredFields.filter(({ key }) => !String(form[key] || "").trim());
  if (form.scheduleRequired && !form.startDate) missingRequiredFields.push({ key: "startDate", label: "Ngày bắt đầu", type: "date" });
  if (form.scheduleRequired && !form.endDate) missingRequiredFields.push({ key: "endDate", label: "Ngày kết thúc", type: "date" });
  const preview = {
    planId: "", name: form.name, description: "Bản nháp Test Plan. QA cần rà soát trước khi gửi duyệt.",
    scope: form.scope, objectives: planLines(form.objectives), testItems: planLines(form.testItems), outOfScope: planLines(form.outOfScope),
    testStrategy: form.strategy, entryCriteria: planLines(form.entryCriteria), exitCriteria: planLines(form.exitCriteria),
    testData: form.data, environment: form.environmentRequirements, environmentRequirements: form.environmentRequirements,
    risks: planRisks(form.risks), deliverables: planLines(form.deliverables), testLevels: planLines(form.testLevels),
    testTypes: planLines(form.testTypes), coverageTargets: planLines(form.coverageTargets), estimatedEffortHours: Number(form.estimatedEffortHours) || 0,
    startDate: form.startDate || null, endDate: form.endDate || null, approvalStatus: "Draft", planLevel: "Feature",
    documentControl: { documentId: form.documentId, documentTitle: form.name, version: form.version, author: form.author, reviewer: form.reviewer, documentStatus: "Draft", documentDate: form.documentDate || null, versionHistory: parsePlanRows(form.versionHistory, ["version", "date", "author", "description"]) },
    introduction: { purpose: form.purpose, background: form.background },
    systemUnderTest: { name: form.systemName, targetUrl: form.targetUrl, primaryModules: planLines(form.primaryModules) },
    testItemMatrix: parsePlanRows(form.testItemMatrix, ["itemId", "module", "description"]),
    methodologies: planLines(form.methodologies), testTypeMatrix: parsePlanRows(form.testTypeMatrix, ["testType", "purpose"]),
    environmentSpecifications: parsePlanRows(form.environmentSpecifications, ["category", "specification"]),
    testDataRequirements: planLines(form.testDataRequirements), milestones: parsePlanRows(form.milestones, ["phase", "activity", "timeframe"]),
    passFailCriteria: { testCasePass: form.testCasePass, testCaseFail: form.testCaseFail, testCycleCompletion: form.testCycleCompletion },
    defectManagement: { workflow: planLines(form.defectWorkflow), severityDefinitions: parsePlanRows(form.severityDefinitions, ["level", "definition"]), priorityDefinitions: parsePlanRows(form.priorityDefinitions, ["level", "definition"]) },
    rolesResponsibilities: parsePlanRows(form.rolesResponsibilities, ["role", "responsibilities"]).map((item) => ({ ...item, responsibilities: planLines(String(item.responsibilities || "").replace(/,/g, "\n")) })),
    riskMatrix: parsePlanRows(form.riskMatrix, ["risk", "impact", "mitigation", "owner"]), assumptions: planLines(form.assumptions), dependencies: planLines(form.dependencies),
    traceabilityMatrix: parsePlanRows(form.traceabilityMatrix, ["feature", "basisReference", "testType", "coverageStatus", "notes"]),
    signOff: parsePlanRows(form.signOff, ["role", "name", "date", "status"]),
  };
  const canSubmitPlan = Boolean(form.documentId?.trim() && form.name.trim() && form.version?.trim() && form.purpose?.trim() && form.background?.trim() && form.systemName?.trim() && form.scope.trim() && planLines(form.objectives).length && planLines(form.testItemMatrix).length && form.strategy.trim() && planLines(form.testLevels).length && planLines(form.testTypes).length && planLines(form.coverageTargets).length && form.environmentRequirements.trim() && planLines(form.testDataRequirements).length && planLines(form.entryCriteria).length && planLines(form.exitCriteria).length && form.testCasePass?.trim() && form.testCaseFail?.trim() && form.testCycleCompletion?.trim() && planLines(form.defectWorkflow).length && planLines(form.rolesResponsibilities).length && planLines(form.deliverables).length && planLines(form.riskMatrix).length && planLines(form.traceabilityMatrix).length && (!form.scheduleRequired || (form.startDate && form.endDate)) && hasTestBasis);
  const suggest = useMutation({
    mutationFn: async () => {
      setGenerationError("");
      const controller = new AbortController();
      generationRequest.current = controller;
      try {
        return await executionApi.suggestPlanFromRequirements({ project: activeProject, requirements: selectedRequirements.map((item) => ({ requirementId: item.requirementId, title: item.title, description: item.description, acceptanceCriteria: item.acceptanceCriteria })), userStories: storiesForPlan.map((item) => ({ title: item.title, description: item.description, acceptanceCriteria: item.acceptanceCriteria })), useCases: selectedUseCases.map((item) => ({ code: item.code, name: item.name, summary: item.summary, mainFlow: item.mainFlow })), environmentRequirements: form.environmentRequirements, testLevels: planLines(form.testLevels), testTypes: planLines(form.testTypes), coverageTargets: planLines(form.coverageTargets), planningContext: { releaseOrSprint: form.releaseOrSprint, moduleOrFeatures: planLines(form.moduleOrFeatures), changeType: form.changeType, releaseGoal: form.releaseGoal, deadline: form.deadline || null, systemLifecycle: form.systemLifecycle, scheduleRequired: form.scheduleRequired }, planningConstraints: { criticalFunctions: planLines(form.criticalFunctions), compliance: planLines(form.compliance), nfrOrSla: planLines(form.nfrOrSla), dataEnvironmentLimits: planLines(form.constraints) } }, { signal: controller.signal });
      } finally { if (generationRequest.current === controller) generationRequest.current = null; }
    },
    onSuccess: ({ suggestion, fallback }) => { setPlanOrigin(fallback ? "Rule" : "AI"); setForm((current) => ({ ...current, name: suggestion.name || current.name, scope: suggestion.scope || current.scope, objectives: planListText(suggestion.objectives) || current.objectives, testItems: planListText(suggestion.testItems) || current.testItems, outOfScope: planListText(suggestion.outOfScope), strategy: suggestion.testStrategy || current.strategy, entryCriteria: planListText(suggestion.entryCriteria) || current.entryCriteria, exitCriteria: planListText(suggestion.exitCriteria) || current.exitCriteria, environmentRequirements: suggestion.environmentRequirements || current.environmentRequirements, risks: planRiskText(suggestion.risks), deliverables: planListText(suggestion.deliverables), testLevels: planListText(suggestion.testLevels) || current.testLevels, testTypes: planListText(suggestion.testTypes) || current.testTypes, coverageTargets: planListText(suggestion.coverageTargets) || current.coverageTargets })); setScreen("preview"); toast.success(fallback ? "Đã tạo bản nháp từ Test Basis để QA rà soát." : "AI đã tạo bản nháp Test Plan."); },
    onError: (error) => { if (error.code === "ERR_CANCELED") return; setGenerationError(error.message || "Không thể tạo Test Plan từ AI."); toast.error(error.message); },
  });
  const importDocument = useMutation({
    mutationFn: (file) => executionApi.importPlanDocument(activeProject, profile._id, file),
    onSuccess: (result) => {
      const isSupplement = supplementImportRef.current;
      supplementImportRef.current = false;
      applyImportedPlan(result.suggestion, result.source, result, isSupplement ? "merge" : importMode);
      toast.success(isSupplement ? "Đã lấy thêm thông tin từ tài liệu và cập nhật bản nháp." : "Đã trích xuất Test Plan thành bản nháp để đối chiếu.");
    },
    onError: (error) => { supplementImportRef.current = false; toast.error(error.message || "Không thể đọc Test Plan."); },
  });
  const create = useMutation({
    mutationFn: (submitForReview = true) => { const body = { project: activeProject, systemProfile: profile._id, requirements: selectedRequirements.map((item) => item._id), userStories: storiesForPlan.map((story) => story._id), useCases: selectedUseCases.map((item) => item._id), kind: "TestPlan", planLevel: "Feature", origin: planOrigin, importSource: planOrigin === "ImportedDocument" ? importSource : undefined, name: form.name, description: preview.description, testData: form.data, scope: form.scope, objectives: planLines(form.objectives), testStrategy: form.strategy, testItems: planLines(form.testItems), outOfScope: planLines(form.outOfScope), entryCriteria: planLines(form.entryCriteria), exitCriteria: planLines(form.exitCriteria), risks: planRisks(form.risks), deliverables: planLines(form.deliverables), testLevels: planLines(form.testLevels), testTypes: planLines(form.testTypes), coverageTargets: planLines(form.coverageTargets), environmentRequirements: form.environmentRequirements, planningContext: { releaseOrSprint: form.releaseOrSprint, moduleOrFeatures: planLines(form.moduleOrFeatures), changeType: form.changeType, releaseGoal: form.releaseGoal, deadline: form.deadline || null, systemLifecycle: form.systemLifecycle, scheduleRequired: form.scheduleRequired }, planningConstraints: { criticalFunctions: planLines(form.criticalFunctions), compliance: planLines(form.compliance), nfrOrSla: planLines(form.nfrOrSla), dataEnvironmentLimits: planLines(form.constraints) }, estimatedEffortHours: Number(form.estimatedEffortHours) || 0, startDate: form.startDate || null, endDate: form.endDate || null, documentControl: { documentId: form.documentId, documentTitle: form.name, version: form.version, author: form.author, reviewer: form.reviewer, documentStatus: submitForReview ? "PendingApproval" : "Draft", documentDate: form.documentDate || null, versionHistory: parsePlanRows(form.versionHistory, ["version", "date", "author", "description"]) }, introduction: { purpose: form.purpose, background: form.background }, systemUnderTest: { name: form.systemName, targetUrl: form.targetUrl, primaryModules: planLines(form.primaryModules) }, testItemMatrix: parsePlanRows(form.testItemMatrix, ["itemId", "module", "description"]), methodologies: planLines(form.methodologies), testTypeMatrix: parsePlanRows(form.testTypeMatrix, ["testType", "purpose"]), environmentSpecifications: parsePlanRows(form.environmentSpecifications, ["category", "specification"]), testDataRequirements: planLines(form.testDataRequirements), milestones: parsePlanRows(form.milestones, ["phase", "activity", "timeframe"]), passFailCriteria: { testCasePass: form.testCasePass, testCaseFail: form.testCaseFail, testCycleCompletion: form.testCycleCompletion }, defectManagement: { workflow: planLines(form.defectWorkflow), severityDefinitions: parsePlanRows(form.severityDefinitions, ["level", "definition"]), priorityDefinitions: parsePlanRows(form.priorityDefinitions, ["level", "definition"]) }, rolesResponsibilities: parsePlanRows(form.rolesResponsibilities, ["role", "responsibilities"]).map((item) => ({ ...item, responsibilities: planLines(String(item.responsibilities || "").replace(/,/g, "\n")) })), riskMatrix: parsePlanRows(form.riskMatrix, ["risk", "impact", "mitigation", "owner"]), assumptions: planLines(form.assumptions), dependencies: planLines(form.dependencies), traceabilityMatrix: parsePlanRows(form.traceabilityMatrix, ["feature", "basisReference", "testType", "coverageStatus", "notes"]), signOff: parsePlanRows(form.signOff, ["role", "name", "date", "status"]), approvalStatus: submitForReview ? "PendingApproval" : "Draft" }; return editingPlanId ? executionApi.updatePlan(editingPlanId, body) : executionApi.createPlan(body); },
    onSuccess: (saved, submitForReview) => { toast.success(submitForReview === false ? "Đã lưu Test Plan Draft" : editingPlanId ? "Đã cập nhật và gửi QA rà soát" : "Đã gửi Test Plan cho QA duyệt"); if (submitForReview === false) { setEditingPlanId(saved?._id || editingPlanId); setImportNeedsDraftSave(false); } else { setEditingPlanId(""); setImportReport(null); setImportSource(null); setImportNeedsDraftSave(false); } qc.invalidateQueries({ queryKey: ["e2e-plans"] }); if (submitForReview !== false) onNext(); }, onError: (error) => toast.error(error.message),
  });
  const approve = useMutation({ mutationFn: ({ id, reviewNote }) => executionApi.decidePlan(id, { decision: "Approved", reviewNote }), onSuccess: () => { toast.success("Đã duyệt Test Plan"); qc.invalidateQueries({ queryKey: ["e2e-plans"] }); }, onError: (error) => toast.error(error.message) });
  const summary = (plan) => <div className="grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3"><span><b>Phạm vi:</b> {plan.scope || "Chưa khai báo"}</span><span><b>Môi trường:</b> {plan.environment || "Chưa khai báo"}</span><span><b>Rủi ro:</b> {(plan.risks || []).length || 0} mục</span></div>;
  const approvedPlanCount = items.filter((item) => item.approvalStatus === "Approved").length;
  const pendingPlanCount = items.filter((item) => item.approvalStatus === "PendingApproval").length;
  const recentPlans = [...items].sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0)).slice(0, 5);
  const selectedLibraryPlan = items.find((item) => String(item._id) === String(libraryPlanId));
  const importFromLibrary = () => {
    if (!selectedLibraryPlan) return toast.error("Hãy chọn một Test Plan trong thư viện.");
    const missingFields = [["name", "Tên Test Plan", selectedLibraryPlan.name], ["scope", "Phạm vi", selectedLibraryPlan.scope], ["objectives", "Mục tiêu", selectedLibraryPlan.objectives?.length], ["testStrategy", "Chiến lược", selectedLibraryPlan.testStrategy], ["entryCriteria", "Tiêu chí bắt đầu", selectedLibraryPlan.entryCriteria?.length], ["exitCriteria", "Tiêu chí kết thúc", selectedLibraryPlan.exitCriteria?.length], ["environment", "Môi trường", selectedLibraryPlan.environment]].filter(([, , value]) => !value).map(([field, label]) => ({ field, label }));
    const conflicts = selectedLibraryPlan.approvalStatus === "Approved" ? ["Trạng thái Approved của bản nguồn không được sao chép; bản nhập mới luôn là Draft."] : [];
    applyImportedPlan(selectedLibraryPlan, { sourceType: "Library", fileName: `Thư viện · ${selectedLibraryPlan.name}`, sourcePlan: selectedLibraryPlan._id, extractionMethod: "library-copy", textLength: 0 }, { missingFields, conflicts, basisMatch: { matched: [], totalAvailable: selectedRequirements.length + selectedStories.length + selectedUseCases.length } });
    toast.success("Đã sao chép Test Plan từ thư viện thành bản nháp.");
  };
  const openSavedPlan = (plan, targetScreen) => { setEditingPlanId(plan._id); setPlanOrigin(plan.origin || "Manual"); setImportSource(plan.importSource || null); setImportReport(null); setImportNeedsDraftSave(false); setForm(planToForm(plan)); setScreen(targetScreen); };
  const editSavedPlan = (plan) => openSavedPlan(plan, "full");
  const supplementSavedPlan = (plan) => openSavedPlan(plan, "supplement");
  const planLibraryUrl = `/documents?${new URLSearchParams({ project: String(activeProject || ""), profile: String(profile?._id || ""), type: "Test Plan" }).toString()}`;
  return <Card className="p-5">
    <SectionTitle title="Feature Test Plan" description="Tạo bản nháp từ Requirement, User Story hoặc Use Case đã xác nhận; QA có thể thiết kế Test Case trong lúc kế hoạch chờ duyệt." />
    <Dialog open={screen === "full"} onOpenChange={(open) => { if (!open) setScreen("start"); }} title={editingPlanId ? "Chỉnh sửa Test Plan" : "Soạn Test Plan"} description="Chỉnh sửa toàn bộ nội dung và lưu lại bản kế hoạch." className="max-w-6xl p-4 sm:p-6">
      <FullTestPlanEditor form={form} update={update} onPreview={() => setScreen("preview")} onSaveDraft={() => create.mutate(false)} saving={create.isPending} />
    </Dialog>
    <Dialog open={screen === "supplement"} onOpenChange={(open) => { if (!open) setScreen("start"); }} title="Bổ sung thông tin từ tài liệu" description="Chọn một tài liệu để AI trích xuất thông tin còn thiếu và hợp nhất vào Test Plan hiện tại." className="max-w-3xl">
      {missingRequiredFields.length > 0 && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100"><p className="font-semibold">Test Plan đang thiếu {missingRequiredFields.length} trường</p><div className="mt-3 flex flex-wrap gap-2">{missingRequiredFields.map((field) => <span key={field.key} className="rounded-full border border-amber-300 bg-white/70 px-3 py-1 text-xs font-medium dark:border-amber-800 dark:bg-amber-950/40">{field.label}</span>)}</div></div>}
      <div className="mt-4 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/50 p-8 text-center dark:border-violet-800 dark:bg-violet-950/20"><FileUp className="mx-auto h-8 w-8 text-violet-600 dark:text-violet-300" /><p className="mt-3 text-sm font-semibold">Tải tài liệu có thông tin bổ sung</p><p className="mt-1 text-xs text-slate-500">PDF, DOC, DOCX hoặc XLSX · tối đa 10 MB. Nội dung hiện có sẽ được giữ nguyên.</p><Button type="button" className="mt-4" disabled={importDocument.isPending} onClick={() => { supplementImportRef.current = true; supplementPlanInputRef.current?.click(); }}>{importDocument.isPending ? "AI đang đọc tài liệu…" : "Chọn file bổ sung"}</Button><input ref={supplementPlanInputRef} className="hidden" type="file" accept=".pdf,.doc,.docx,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const file = event.target.files?.[0]; if (file) importDocument.mutate(file); else supplementImportRef.current = false; event.target.value = ""; }} /></div>
    </Dialog>
    {screen === "edit" && <div className="mt-3 flex justify-end"><Button variant="outline" disabled={!form.name || !form.scope || create.isPending} onClick={() => create.mutate(false)}>Lưu Test Plan Draft</Button></div>}
    {screen === "edit" && <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700 md:grid-cols-2"><Field label="Release / sprint / milestone"><Input value={form.releaseOrSprint} onChange={(event) => update("releaseOrSprint", event.target.value)} placeholder="Dữ kiện thực tế; AI không tự bịa" /></Field><Field label="Module / feature · mỗi dòng một mục"><Textarea rows={2} value={form.moduleOrFeatures} onChange={(event) => update("moduleOrFeatures", event.target.value)} /></Field><Field label="Test level · mỗi dòng một mức"><Textarea rows={3} value={form.testLevels} onChange={(event) => update("testLevels", event.target.value)} placeholder="Integration\nSystem\nAcceptance" /></Field><Field label="Test type · mỗi dòng một loại"><Textarea rows={3} value={form.testTypes || ""} onChange={(event) => update("testTypes", event.target.value)} placeholder="Functional\nRegression\nUI\nAPI" /></Field><Field label="Mục tiêu coverage · mỗi dòng một loại"><Textarea rows={4} value={form.coverageTargets} onChange={(event) => update("coverageTargets", event.target.value)} placeholder="Business rule\nProduct risk\nState\nPositive và negative" /></Field><Field label="Yêu cầu môi trường (không phải Environment Profile)"><Textarea rows={4} value={form.environmentRequirements} onChange={(event) => update("environmentRequirements", event.target.value)} placeholder="Trình duyệt cần hỗ trợ, dependency, dữ liệu và điều kiện tích hợp cần có" /></Field><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.scheduleRequired} onChange={(event) => update("scheduleRequired", event.target.checked)} />Lập lịch và nguồn lực trong Test Plan này</label>{form.scheduleRequired && <><Field label="Ước tính QA (giờ)"><Input type="number" min="0" value={form.estimatedEffortHours || ""} onChange={(event) => update("estimatedEffortHours", event.target.value)} /></Field><Field label="Ngày bắt đầu dự kiến"><Input type="date" value={form.startDate || ""} onChange={(event) => update("startDate", event.target.value)} /></Field><Field label="Ngày kết thúc dự kiến"><Input type="date" min={form.startDate || undefined} value={form.endDate || ""} onChange={(event) => update("endDate", event.target.value)} /></Field></>}</div>}
    {!hasAvailableTestBasis ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">Chưa có test basis được xác nhận. Hãy Baseline Requirement, xác nhận User Story hoặc duyệt Use Case trước.</div> : <>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"><b>{selectedRequirements.length}/{approvedRequirements.length}</b><p className="text-xs text-slate-500">Requirement Baseline được chọn</p></div><div className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"><b>{selectedStories.length}/{approvedStories.length}</b><p className="text-xs text-slate-500">User Story được chọn</p></div><div className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"><b>{selectedUseCases.length}/{approvedUseCases.length}</b><p className="text-xs text-slate-500">Use Case được chọn</p></div></div>
      <details className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer text-sm font-semibold">Phạm vi Test Basis · {selectedRequirements.length + selectedStories.length + selectedUseCases.length}/{approvedRequirements.length + approvedStories.length + approvedUseCases.length} tài liệu</summary><p className="mt-1 text-xs text-slate-500">Mặc định dùng tất cả Requirement, User Story và Use Case trong phạm vi đã xác nhận. Mở từng nhóm để bỏ chọn những tài liệu không thuộc Test Plan này.</p><div className="mt-4 grid gap-3 lg:grid-cols-3"><TestBasisScopeGroup title="Requirement Baseline" items={approvedRequirements} selectedIds={selectedRequirements.map((item) => item._id)} labelOf={(item) => `${item.requirementId ? `${item.requirementId} · ` : ""}${item.title}`} onToggle={(id) => toggleBasis("requirements", id)} onSelectAll={() => selectAllBasis("requirements")} onClear={() => clearBasis("requirements", approvedRequirements)} /><TestBasisScopeGroup title="User Story đã xác nhận" items={approvedStories} selectedIds={selectedStories.map((item) => item._id)} labelOf={(item) => item.title} onToggle={(id) => toggleBasis("stories", id)} onSelectAll={() => selectAllBasis("stories")} onClear={() => clearBasis("stories", approvedStories)} /><TestBasisScopeGroup title="Use Case đã duyệt" items={approvedUseCases} selectedIds={selectedUseCases.map((item) => item._id)} labelOf={(item) => `${item.code ? `${item.code} · ` : ""}${item.name}`} onToggle={(id) => toggleBasis("useCases", id)} onSelectAll={() => selectAllBasis("useCases")} onClear={() => clearBasis("useCases", approvedUseCases)} /></div></details>
      {!hasTestBasis && <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">Hãy chọn ít nhất một Requirement, User Story hoặc Use Case để tạo Test Plan.</div>}
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-700 dark:bg-slate-900/50"><div className="grid gap-1 sm:grid-cols-3" role="tablist" aria-label="Cách tạo Test Plan"><button type="button" role="tab" aria-selected={screen === "start"} className={`rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${screen === "start" ? "bg-white text-violet-700 shadow-sm ring-1 ring-violet-200 dark:bg-slate-800 dark:text-violet-200" : "text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800"}`} onClick={() => suggest.mutate()} disabled={suggest.isPending || !hasTestBasis}>{suggest.isPending ? "AI đang lập kế hoạch…" : "AI tạo từ Test Basis"}</button><button type="button" role="tab" aria-selected={screen === "import"} className={`rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${screen === "import" ? "bg-white text-violet-700 shadow-sm ring-1 ring-violet-200 dark:bg-slate-800 dark:text-violet-200" : "text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800"}`} onClick={() => { generationRequest.current?.abort(); setGenerationError(""); setScreen("import"); }}>Nhập tài liệu có sẵn</button><button type="button" role="tab" aria-selected={screen === "full"} className={`rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${screen === "full" ? "bg-white text-violet-700 shadow-sm ring-1 ring-violet-200 dark:bg-slate-800 dark:text-violet-200" : "text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800"}`} onClick={() => { generationRequest.current?.abort(); setGenerationError(""); setPlanOrigin("Manual"); setImportReport(null); setImportSource(null); setImportNeedsDraftSave(false); setScreen("full"); }}>Tự soạn / chỉnh sửa</button></div><p className="px-3 pb-1 pt-2 text-xs text-slate-500">{screen === "import" ? "Tải PDF, DOC, DOCX, XLSX hoặc chọn Test Plan trong thư viện." : screen === "full" ? "Mở trình soạn đầy đủ 18 phần; có thể lưu Draft khi chưa hoàn tất." : `AI đề xuất bản nháp từ ${selectedRequirements.length} Requirement, ${selectedStories.length} User Story và ${selectedUseCases.length} Use Case đang chọn; QA vẫn rà soát trước khi duyệt.`}</p></div>
      {screen === "import" && <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20"><div><p className="text-sm font-semibold">Cách áp dụng tài liệu</p><p className="mt-1 text-xs text-slate-500">Hệ thống chỉ tạo bản nháp để đối chiếu, không kế thừa trạng thái duyệt và không ghi đè âm thầm.</p></div><div className="mt-3 grid gap-2 sm:grid-cols-3">{[["new", "Tạo Test Plan mới"], ["merge", "Hợp nhất vào bản nháp"], ["replace", "Thay thế bản nháp"]].map(([value, label]) => <button type="button" key={value} onClick={() => setImportMode(value)} className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold ${importMode === value ? "border-violet-400 bg-white text-violet-700 ring-1 ring-violet-200 dark:bg-slate-900" : "border-slate-200 bg-white/60 text-slate-600 dark:border-slate-700 dark:bg-slate-900/50"}`}>{label}</button>)}</div><div className="mt-4 grid gap-3 lg:grid-cols-2"><div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><p className="text-xs font-semibold">Từ Thư viện Test Plan</p><div className="mt-2 flex gap-2"><Select value={libraryPlanId} onChange={(event) => setLibraryPlanId(event.target.value)}><option value="">Chọn Test Plan đã lưu…</option>{items.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.approvalStatus}</option>)}</Select><Button variant="outline" disabled={!libraryPlanId} onClick={importFromLibrary}>Sử dụng</Button></div></div><div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><p className="text-xs font-semibold">Tải tài liệu lên</p><p className="mt-1 text-[11px] text-slate-500">Tối đa 10 MB · PDF, DOC, DOCX hoặc XLSX.</p><Button className="mt-2" variant="outline" disabled={importDocument.isPending} onClick={() => planImportInputRef.current?.click()}><FileUp className="h-4 w-4" />{importDocument.isPending ? "Đang trích xuất…" : "Chọn tài liệu"}</Button><input ref={planImportInputRef} className="hidden" type="file" accept=".pdf,.doc,.docx,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const file = event.target.files?.[0]; if (file) importDocument.mutate(file); event.target.value = ""; }} /></div></div></div>}
      {suggest.isPending && <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm dark:border-violet-900 dark:bg-violet-950/30"><p>Đang chờ AI tạo bản nháp. Bạn có thể hủy để tự soạn; kết quả sẽ hiển thị ở phần tóm tắt khi hoàn tất.</p><Button variant="outline" onClick={() => generationRequest.current?.abort()}>Hủy tạo AI</Button></div>}{generationError && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200"><p>{generationError}</p><p className="mt-1">Bấm Tạo nhanh từ User Story để thử lại hoặc chọn Tự soạn Test Plan. Nội dung đang nhập vẫn được giữ.</p></div>}{screen === "edit" && !suggest.isPending && <div className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="grid gap-4 md:grid-cols-2"><Field label="Tên Feature Test Plan"><Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Feature Test Plan · Nộp bài tập lớn" /></Field><Field label="Môi trường"><Input value={form.environment} onChange={(e) => update("environment", e.target.value)} placeholder="Staging · Chrome" /></Field><Field label="Mục tiêu · mỗi dòng một mục"><Textarea rows={3} value={form.objectives} onChange={(e) => update("objectives", e.target.value)} /></Field><Field label="Phạm vi kiểm thử"><Textarea rows={3} value={form.scope} onChange={(e) => update("scope", e.target.value)} /></Field></div><details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-violet-700 dark:text-violet-300">Mở nội dung chi tiết khi cần</summary><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Hạng mục kiểm thử"><Textarea rows={3} value={form.testItems} onChange={(e) => update("testItems", e.target.value)} /></Field><Field label="Ngoài phạm vi"><Textarea rows={3} value={form.outOfScope} onChange={(e) => update("outOfScope", e.target.value)} /></Field><Field label="Chiến lược"><Textarea rows={3} value={form.strategy} onChange={(e) => update("strategy", e.target.value)} /></Field><Field label="Dữ liệu kiểm thử"><Textarea rows={3} value={form.data} onChange={(e) => update("data", e.target.value)} /></Field><Field label="Tiêu chí bắt đầu"><Textarea rows={3} value={form.entryCriteria} onChange={(e) => update("entryCriteria", e.target.value)} /></Field><Field label="Tiêu chí kết thúc"><Textarea rows={3} value={form.exitCriteria} onChange={(e) => update("exitCriteria", e.target.value)} /></Field><Field label="Rủi ro | giảm thiểu | phụ trách"><Textarea rows={3} value={form.risks} onChange={(e) => update("risks", e.target.value)} /></Field><Field label="Deliverables"><Textarea rows={3} value={form.deliverables} onChange={(e) => update("deliverables", e.target.value)} /></Field></div></details><div className="mt-4 flex justify-end"><Button disabled={!form.name || !form.scope} onClick={() => setScreen("preview")}>Xem bản tóm tắt</Button></div></div>}
      {screen === "preview" && <div className="mt-5"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-700"><div><p className="text-sm font-semibold">{preview.name || "Test Plan chưa đặt tên"}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{editingPlanId ? "Bản cập nhật đang được rà soát." : "Bản nháp, chưa gửi duyệt."}</p>{importSource && <p className="mt-1 text-[11px] text-violet-700 dark:text-violet-300">Nguồn nhập: {importSource.fileName || (importSource.sourceType === "Library" ? "Thư viện Test Plan" : "Tài liệu tải lên")}</p>}</div><Button size="sm" variant="outline" onClick={() => setScreen("full")}>Chỉnh sửa</Button></div><div className="mt-4">{summary(preview)}</div>{missingRequiredFields.length > 0 && <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50/80 p-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">Cần bổ sung {missingRequiredFields.length} trường</p><p className="mt-1 text-xs">Nhập trực tiếp bên dưới hoặc tải thêm tài liệu; thông tin mới sẽ được hợp nhất vào bản nháp hiện tại.</p></div><Button type="button" variant="outline" size="sm" disabled={importDocument.isPending} onClick={() => { supplementImportRef.current = true; supplementPlanInputRef.current?.click(); }}><FileUp className="h-4 w-4" />{importDocument.isPending ? "Đang lấy thông tin…" : "Tải file bổ sung"}</Button><input ref={supplementPlanInputRef} className="hidden" type="file" accept=".pdf,.doc,.docx,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const file = event.target.files?.[0]; if (file) importDocument.mutate(file); else supplementImportRef.current = false; event.target.value = ""; }} /></div><div className="mt-4 grid gap-3 md:grid-cols-2">{missingRequiredFields.map((field) => <Field key={field.key} label={`${field.label} *`}>{field.multiline ? <Textarea rows={3} value={form[field.key] || ""} onChange={(event) => update(field.key, event.target.value)} placeholder={field.placeholder || "Nhập thông tin còn thiếu"} /> : <Input type={field.type || "text"} value={form[field.key] || ""} onChange={(event) => update(field.key, event.target.value)} placeholder={field.placeholder || "Nhập thông tin còn thiếu"} />}</Field>)}</div><div className="mt-3 flex justify-end"><Button type="button" variant="outline" size="sm" onClick={() => setScreen("full")}>Mở trình soạn đầy đủ</Button></div></div>}{(importReport?.missingFields?.length || importReport?.conflicts?.length) && <div className="mt-4 grid gap-3 md:grid-cols-2"><div className={`rounded-lg border p-3 text-xs ${importReport.missingFields?.length ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100" : "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100"}`}><p className="font-semibold">Kết quả trích xuất tài liệu</p><p className="mt-1">{importReport.missingFields?.length ? `Tài liệu chưa cung cấp: ${importReport.missingFields.map((item) => item.label).join(", ")}` : "Tài liệu đã cung cấp đủ các trường cốt lõi có thể trích xuất."}</p></div><div className={`rounded-lg border p-3 text-xs ${importReport.conflicts?.length ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-100" : "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-100"}`}><p className="font-semibold">Đối chiếu và xung đột</p>{importReport.conflicts?.length ? <ul className="mt-1 list-disc space-y-1 pl-4">{importReport.conflicts.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-1">Chưa phát hiện xung đột rõ ràng; QA vẫn cần rà soát với Test Basis.</p>}</div></div>}{!canSubmitPlan && missingRequiredFields.length === 0 && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-100">Test Plan chưa đủ trường bắt buộc để gửi duyệt. Hãy hoàn tất các trường được đánh dấu ở trên.</div>}<details className="mt-4 rounded-lg border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-950/30"><summary className="cursor-pointer text-xs font-semibold">Bản in A4 / file xuất <span className="ml-2 font-normal text-emerald-700">Cập nhật tức thời theo dữ liệu đang nhập</span></summary><TestPlanDocument plan={preview} project={activeProject} isDraft onEdit={() => setScreen("full")} /></details><div className="mt-4 flex flex-wrap justify-end gap-2">{importNeedsDraftSave && <p className="mr-auto self-center text-xs font-medium text-amber-700">Tài liệu nhập phải được lưu Draft trước khi có thể gửi duyệt.</p>}{editingPlanId && <Button variant="outline" disabled={create.isPending} onClick={() => create.mutate(false)}>Lưu bổ sung dạng Draft</Button>}<Button disabled={create.isPending || (!importNeedsDraftSave && !canSubmitPlan)} onClick={() => create.mutate(importNeedsDraftSave ? false : true)}>{create.isPending ? "Đang lưu…" : importNeedsDraftSave ? "Lưu bản nháp nhập" : editingPlanId ? "Lưu và gửi QA rà soát" : "Gửi QA duyệt"}</Button></div></div>}
    </>}
    {!!items.length && <div className="mt-7 border-t border-slate-200 pt-5 dark:border-slate-700"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">Test Plan đã lưu</p><p className="mt-1 text-xs text-slate-500">Hiển thị 5 mục cập nhật gần nhất; quản lý toàn bộ trong Thư viện tài liệu.</p></div><Button asChild><Link to={planLibraryUrl}>Mở Thư viện Test Plan <ArrowRight className="h-4 w-4" /></Link></Button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-2xl font-bold">{items.length}</p><p className="mt-1 text-xs text-slate-500">Tổng Test Plan</p></div><div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20"><p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{pendingPlanCount}</p><p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Đang chờ duyệt</p></div><div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"><p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{approvedPlanCount}</p><p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Đã duyệt</p></div></div><div className="mt-3 space-y-3">{recentPlans.map((item) => <details key={item._id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-2"><div><Badge tone={statusTone[item.approvalStatus] || "slate"}>{item.approvalStatus}</Badge><p className="mt-2 text-sm font-semibold">{item.name}</p></div><span className="text-xs font-semibold text-violet-700 dark:text-violet-300">Xem chi tiết</span></div><div className="mt-3">{summary(item)}</div></summary><div className="mt-4 border-t pt-4 dark:border-slate-700"><TestPlanDocument plan={item} project={activeProject} approving={approve.isPending} onEdit={() => editSavedPlan(item)} onSupplement={() => supplementSavedPlan(item)} onApprove={() => { const reviewNote = window.prompt("Ghi chú duyệt; nếu tự duyệt hãy nêu lý do Project không có QA khác (tối thiểu 10 ký tự):"); if (reviewNote?.trim()) approve.mutate({ id: item._id, reviewNote: reviewNote.trim() }); }} /></div></details>)}</div></div>}
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
  const [reviewNote, setReviewNote] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const drafts = cases.filter((item) =>
    ["Draft", "Rejected"].includes(item.status || "Draft"),
  );
  const readyDrafts = drafts.filter((item) => item.quality?.canApprove !== false);
  const blockedDrafts = drafts.filter((item) => item.quality?.canApprove === false);
  const pending = cases.filter((item) => item.status === "NeedsReview");
  const approved = cases.filter((item) => item.status === "Approved");
  const send = (item) =>
    submitCase.mutate({
      id: item._id,
      body: {
        reviewer,
        reviewNote: reviewNote.trim(),
      },
    });
  const allSelected = readyDrafts.length > 0 && readyDrafts.every((item) => selectedIds.includes(String(item._id)));
  const toggleAll = () => setSelectedIds(allSelected ? [] : readyDrafts.map((item) => String(item._id)));
  const sendSelected = async () => {
    if (bulkSubmitting || !reviewer || !selectedIds.length || reviewNote.trim().length < 10) return;
    const idsToSubmit = [...selectedIds];
    setBulkSubmitting(true);
    try {
      const results = await Promise.allSettled(
        idsToSubmit.map((id) =>
          submitCase.mutateAsync({
            id,
            body: { reviewer, reviewNote: reviewNote.trim() },
            silent: true,
          }),
        ),
      );
      const succeeded = results.filter((result) => result.status === "fulfilled").length;
      const failedResults = results.filter((result) => result.status === "rejected");
      const failed = failedResults.length;

      if (!failed) {
        toast.success(`Đã gửi ${succeeded} Test Case cho QA duyệt.`);
        setSelectedIds([]);
        return;
      }

      const firstError = failedResults[0]?.reason?.message;
      if (succeeded) {
        toast.error(
          `Đã gửi ${succeeded}/${idsToSubmit.length} Test Case; ${failed} mục chưa gửi được${firstError ? `: ${firstError}` : "."}`,
        );
        setSelectedIds(
          idsToSubmit.filter((_, index) => results[index].status === "rejected"),
        );
        return;
      }

      toast.error(
        firstError
          ? `Không thể gửi ${failed} Test Case: ${firstError}`
          : `Không thể gửi ${failed} Test Case cho QA duyệt.`,
      );
    } finally {
      setBulkSubmitting(false);
    }
  };
  return (
    <Card className="p-5">
      <SectionTitle
        title="QA review / approve"
        description="Chọn một hoặc nhiều Test Case và gửi cho một QA khác theo nguyên tắc maker-checker."
      />
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900">
          <strong className="text-2xl">{drafts.length}</strong>
          <p className="mt-1 text-xs text-slate-500">Chưa gửi duyệt</p>
          {blockedDrafts.length > 0 && <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-300">{blockedDrafts.length} mục cần bổ sung dữ liệu</p>}
        </div>
        <div className="rounded-xl bg-amber-50 p-4 dark:bg-amber-950/30">
          <strong className="text-2xl">{pending.length}</strong>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            Đang chờ QA
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
          <Field label="QA nhận review">
            <Select
              value={reviewer}
              onChange={(event) => setReviewer(event.target.value)}
            >
              <option value="">Chọn QA reviewer</option>
              {reviewers.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.fullName || item.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ghi chú / lý do ngoại lệ">
            <Textarea rows={3} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Nếu tự duyệt, nêu rõ vì sao Project không có QA khác (tối thiểu 10 ký tự)." />
          </Field>
          {!reviewers.length && (
            <div className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <p>
                Project chưa có QA khác để duyệt độc lập. Mời một người
                và gán vai trò <b>QA</b>, sau đó quay lại đây.
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
          {blockedDrafts.length > 0 && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-200"><p className="font-semibold">{blockedDrafts.length} Test Case chưa đủ điều kiện gửi duyệt</p><p className="mt-1">Các mục này không được chọn hàng loạt. Hãy bổ sung những trường được ghi ngay dưới từng Test Case.</p></div>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200 bg-white p-3 dark:border-violet-800 dark:bg-slate-900"><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={bulkSubmitting || !readyDrafts.length} className="h-4 w-4 accent-violet-600" />Chọn tất cả Test Case đủ điều kiện ({readyDrafts.length})</label><div className="flex items-center gap-2"><span className="text-xs">Đã chọn {selectedIds.length}</span><Button size="sm" disabled={!reviewer || !selectedIds.length || reviewNote.trim().length < 10 || submitCase?.isPending || bulkSubmitting} onClick={sendSelected}>{bulkSubmitting ? `Đang gửi ${selectedIds.length} mục…` : "Gửi các mục đã chọn"}</Button></div></div>
          <div className="mt-4 space-y-2">
            {drafts.map((item) => {
              const missingFields = item.quality?.requiredMissing?.map((field) => field.label) || [];
              const isBlocked = item.quality?.canApprove === false;
              return (
              <div
                key={item._id}
                className={`flex flex-col gap-3 rounded-lg border bg-white p-3 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between ${isBlocked ? "border-rose-200 dark:border-rose-900" : "border-slate-200 dark:border-slate-700"}`}
              >
                <div className="flex min-w-0 items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-violet-600" checked={selectedIds.includes(String(item._id))} disabled={isBlocked || bulkSubmitting} onChange={() => setSelectedIds((current) => current.includes(String(item._id)) ? current.filter((id) => id !== String(item._id)) : [...current, String(item._id)])} /><div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {item.testCaseId || "TC"} · {item.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.testSteps?.length || 0} bước ·{" "}
                    {item.priority || "Medium"}
                  </p>
                  {isBlocked && <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-300">Cần bổ sung: {missingFields.join(", ") || "trường bắt buộc"}</p>}
                </div></div>
                <Button
                  size="sm"
                  disabled={isBlocked || !reviewer || reviewNote.trim().length < 10 || submitCase?.isPending || bulkSubmitting}
                  onClick={() => send(item)}
                >
                  {submitCase?.isPending &&
                  String(submitCase.variables?.id) === String(item._id)
                    ? "Đang gửi…"
                    : "Gửi QA duyệt"}
                </Button>
              </div>
            );})}
          </div>
        </div>
      )}
      {pending.length > 0 && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          Đã gửi {pending.length} Test Case. QA reviewer duyệt chúng trong Approval Inbox.
        </div>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
        <Button variant="outline" asChild>
          <Link to="/approvals">Mở hàng chờ QA review</Link>
        </Button>
        <Button disabled={!approved.length} onClick={onNext}>
          Hoàn tất và mở thư viện <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
