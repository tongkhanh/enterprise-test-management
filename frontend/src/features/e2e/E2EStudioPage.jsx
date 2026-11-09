/* eslint-disable no-unreachable */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileCheck2,
  FileCode2,
  FileText,
  GitBranch,
  Layers3,
  PlayCircle,
  Plus,
  Route,
  Settings2,
  Sparkles,
  TestTube2,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  automationLabApi,
  catalogApi,
  e2eApi,
  executionApi,
  requirementApi,
  testCaseApi,
  testSuiteApi,
  workspaceApi,
} from "@/api/client";
import {
  Badge,
  Button,
  Card,
  Dialog,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import {
  EmptyState,
  PageHeader,
  SectionTitle,
} from "@/components/common/PageKit";
import TestCaseCard from "@/features/ai-generator/TestCaseCard";
import { useAuthStore } from "@/store/authStore";
import E2EVisualHero from "@/components/visuals/E2EVisualHero";
import QAWorkflow from "./QAWorkflow";
import GitHubSourceSelector from "./GitHubSourceSelector";

const blankUseCase = {
  code: "",
  name: "",
  scope: "",
  level: "User-goal",
  stakeholders: "",
  specialRequirements: "",
  summary: "",
  actor: "",
  trigger: "",
  preconditions: "",
  mainFlow: "",
  alternateFlows: "",
  exceptionFlows: "",
  postconditions: "",
  businessRules: "",
  assumptions: "",
  dependencies: "",
  risk: "High",
};
const emptyProfile = () => ({
  name: "",
  description: "",
  referenceUrl: "",
  environment: "",
  baseUrl: "",
  allowedHosts: "",
  roles: "",
  testData: "{}",
  seedUrl: "",
  cleanupUrl: "",
});
const statusTone = {
  Draft: "slate",
  PendingApproval: "amber",
  Approved: "green",
  Rejected: "red",
  Ready: "green",
};
const lines = (value) =>
  String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
const profileToForm = (item) => ({
  name: item?.name || "",
  description: item?.description || "",
  referenceUrl: item?.referenceUrl || "",
  environment: item?.environment?._id || item?.environment || "",
  baseUrl: item?.baseUrl || "",
  allowedHosts: (item?.allowedHosts || []).join("\n"),
  roles: (item?.roles || [])
    .map(
      (role) =>
        `${role.name || ""} | ${role.loginUrl || ""} | ${role.credentialSecretRef || ""}`,
    )
    .join("\n"),
  testData: JSON.stringify(item?.testData || {}, null, 2),
  seedUrl: item?.hooks?.seedUrl || "",
  cleanupUrl: item?.hooks?.cleanupUrl || "",
});
const workflowStepIds = new Set([
  "requirement",
  "evidence",
  "usecase",
  "story",
  "plan",
  "suite",
  "testcase",
  "review",
  "agile",
  "runtime",
  "automation",
  "execution",
  "result",
  "documents",
]);

export default function E2EStudioPage() {
  const qc = useQueryClient();
  const [search] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const [project, setProject] = useState("");
  const ensuredScopeProject = useRef("");
  const [activeStep, setActiveStep] = useState(() =>
    workflowStepIds.has(search.get("step"))
      ? search.get("step")
      : search.get("mode") === "github"
        ? "evidence"
        : "requirement",
  );
  const [profile, setProfile] = useState(emptyProfile);
  const [profileEditor, setProfileEditor] = useState("create");
  const [profileMode, setProfileMode] = useState("SystemProfile");
  const [selectedProfile, setSelectedProfile] = useState(
    () => search.get("profile") || null,
  );
  const [useCase, setUseCase] = useState(blankUseCase);
  const [caseTarget, setCaseTarget] = useState({
    useCaseId: "",
    storyId: "",
    suiteId: "",
  });
  const [git, setGit] = useState({
    integrationId: "",
    repository: "",
    ref: "main",
    commitSha: "",
    pullRequestNumber: "",
    paths: "",
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: workspaceApi.projects,
  });
  const requestedEnvironment = search.get("environment") || "";
  const requestedRun = search.get("run") || "";
  const requestedGitIntegration = search.get("integration") || "";
  const requestedRepository = search.get("repository") || "";
  const requestedProfileName = search.get("profileName") || "";
  const requestedRef = search.get("ref") || "";
  const requestedPaths = search.get("paths") || "";
  const activeProject =
    project || search.get("project") || projects.data?.[0]?._id || "";
  const activeProjectRecord = (projects.data || []).find(
    (item) => String(item._id) === String(activeProject),
  );
  const environments = useQuery({
    queryKey: ["e2e-environments", activeProject],
    queryFn: () => automationLabApi.environments(activeProject),
    enabled: Boolean(activeProject),
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.status === "Provisioning")
        ? 2000
        : false,
  });
  const integrations = useQuery({
    queryKey: ["integrations", activeProject],
    // Fetch the Workspace catalogue and filter client-side. This keeps legacy
    // project-bound GitHub records reusable while older running API processes
    // are being restarted after the Workspace-scope rollout.
    queryFn: () => workspaceApi.integrations(),
    enabled: Boolean(activeProject),
  });
  const profiles = useQuery({
    queryKey: ["system-profiles", activeProject],
    queryFn: () => e2eApi.profiles(activeProject),
    enabled: Boolean(activeProject),
  });
  const ensureTestScope = useMutation({
    mutationFn: () => e2eApi.ensureProfile(activeProject),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["system-profiles", activeProject] }),
    onError: (error) => toast.error(error.message),
  });
  useEffect(() => {
    if (activeProject && profiles.isSuccess && !(profiles.data || []).length && !ensureTestScope.isPending && ensuredScopeProject.current !== activeProject) {
      ensuredScopeProject.current = activeProject;
      ensureTestScope.mutate();
    }
  }, [activeProject, profiles.isSuccess, profiles.data, ensureTestScope.isPending]);
  const currentProfile =
    selectedProfile === null
      ? (profiles.data || [])[0]
      : (profiles.data || []).find((item) => item._id === selectedProfile);
  const useCases = useQuery({
    queryKey: ["use-cases", activeProject, currentProfile?._id],
    queryFn: () => e2eApi.useCases(activeProject, currentProfile?._id),
    enabled: Boolean(activeProject && currentProfile?._id),
  });
  const requirements = useQuery({
    queryKey: ["e2e-requirements", activeProject, currentProfile?._id],
    queryFn: () => e2eApi.requirements(currentProfile?._id),
    enabled: Boolean(activeProject && currentProfile?._id),
  });
  const stories = useQuery({
    queryKey: ["e2e-stories", activeProject],
    queryFn: () => catalogApi.stories(activeProject),
    enabled: Boolean(activeProject),
  });
  const suites = useQuery({
    queryKey: ["e2e-suites", activeProject],
    queryFn: () => catalogApi.suites(activeProject),
    enabled: Boolean(activeProject),
  });
  const members = useQuery({
    queryKey: ["e2e-members", activeProject],
    queryFn: () => catalogApi.members(activeProject),
    enabled: Boolean(activeProject),
  });
  const e2eCases = useQuery({
    queryKey: ["e2e-cases", activeProject],
    queryFn: () => testCaseApi.list(`project=${activeProject}&limit=100`),
    enabled: Boolean(activeProject),
  });
  const plans = useQuery({
    queryKey: ["e2e-plans", activeProject],
    queryFn: () => executionApi.plans(activeProject),
    enabled: Boolean(activeProject),
  });
  const github = useMemo(
    () =>
      (integrations.data || []).filter(
        (item) =>
          item.provider === "GitHub" &&
          item.status === "Connected" &&
          String(item.workspace?._id || item.workspace || "") ===
            String(activeProjectRecord?.workspace?._id || activeProjectRecord?.workspace || ""),
      ),
    [integrations.data, activeProjectRecord?.workspace],
  );
  const currentCases = (e2eCases.data || []).filter(
    (item) =>
      item.generatedFrom === "SystemE2E" &&
      String(item.e2e?.systemProfile?._id || item.e2e?.systemProfile || "") ===
        String(currentProfile?._id || ""),
  );
  const currentStories = (stories.data || []).filter(
    (item) =>
      String(item.e2e?.systemProfile?._id || item.e2e?.systemProfile || "") ===
      String(currentProfile?._id || ""),
  );
  const reviewers = (members.data || []).filter(
    (item) =>
      item.projectRole === "QA_Manager" &&
      String(item._id) !== String(user?._id),
  );
  useEffect(() => {
    if (search.get("mode") === "github") {
      // The QA workflow keeps one Project scope/profile and attaches GitHub
      // evidence to it. Selecting the default profile lets the evidence step
      // open immediately after returning from Settings.
      setSelectedProfile(search.get("profile") || null);
      setProfileMode("GitHubE2E");
      if (requestedProfileName || requestedRepository)
        setProfile((current) => ({
          ...current,
          name:
            current.name ||
            requestedProfileName ||
            `GitHub E2E · ${requestedRepository}`,
        }));
      setGit((current) => ({
        ...current,
        integrationId: requestedGitIntegration,
        repository: requestedRepository,
        ref: requestedRef || current.ref || "main",
        paths: requestedPaths || current.paths,
      }));
    }
  }, [
    search,
    requestedGitIntegration,
    requestedRepository,
    requestedProfileName,
    requestedRef,
    requestedPaths,
  ]);
  const refreshProfiles = () =>
    qc.invalidateQueries({ queryKey: ["system-profiles", activeProject] });
  const serialiseProfile = () => {
    let testData = {};
    try {
      testData = JSON.parse(profile.testData || "{}");
    } catch {
      throw new Error("Test data phải là JSON hợp lệ.");
    }
    return {
      name: profile.name,
      description: profile.description || "",
      referenceUrl: profile.referenceUrl || "",
      environment: profile.environment || null,
      baseUrl: profile.baseUrl,
      allowedHosts: lines(profile.allowedHosts),
      roles: lines(profile.roles).map((line) => {
        const [name, loginUrl, credentialSecretRef] = line
          .split("|")
          .map((item) => item.trim());
        return {
          name,
          loginUrl,
          credentialSecretRef,
          startState: "authenticated",
        };
      }),
      testData,
      hooks: {
        seedUrl: profile.seedUrl.trim(),
        cleanupUrl: profile.cleanupUrl.trim(),
      },
    };
  };
  const createProfile = useMutation({
    mutationFn: () =>
      e2eApi.createProfile({
        project: activeProject,
        mode: profileMode,
        ...serialiseProfile(),
      }),
    onSuccess: (result) => {
      toast.success("Đã lưu System Profile");
      setSelectedProfile(result._id);
      setProfileEditor("edit");
      refreshProfiles();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateProfile = useMutation({
    mutationFn: (overrides) =>
      e2eApi.updateProfile(currentProfile._id, overrides || serialiseProfile()),
    onSuccess: (result) => {
      toast.success("Đã cập nhật System Profile");
      setSelectedProfile(result._id);
      setProfileEditor("edit");
      setProfile(profileToForm(result));
      refreshProfiles();
    },
    onError: (error) => toast.error(error.message),
  });
  const analyzeGithub = useMutation({
    mutationFn: () =>
      e2eApi.analyzeGithub({
        projectId: activeProject,
        systemProfile: currentProfile?._id || undefined,
        name: profile.name || `GitHub E2E · ${git.repository}`,
        environment: profile.environment || null,
        ...git,
        pullRequestNumber: git.pullRequestNumber
          ? Number(git.pullRequestNumber)
          : null,
        paths: lines(git.paths),
        confirmSendToAI: true,
      }),
    onSuccess: (result) => {
      toast.success("Đã tạo System Specification từ GitHub");
      setSelectedProfile(result.profile._id);
      setProfileEditor("edit");
      setProfile(profileToForm(result.profile));
      refreshProfiles();
    },
    onError: (error) => toast.error(error.message),
  });
  const suggestUseCases = useMutation({
    mutationFn: () => e2eApi.suggestUseCases(currentProfile._id),
    onSuccess: (result) => {
      toast.success(
        result._e2eFallback
          ? `Gemini đã hết quota: đã tạo ${result.length} Use Case E2E nháp theo Profile`
          : `Gemini đã tạo ${result.length} Use Case nháp`,
      );
      qc.invalidateQueries({ queryKey: ["use-cases"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const addUseCase = useMutation({
    mutationFn: (reference = "") =>
      e2eApi.createUseCase({
        ...blankUseCase,
        ...useCase,
        reference,
        systemProfile: currentProfile._id,
        stakeholders: lines(useCase.stakeholders),
        specialRequirements: lines(useCase.specialRequirements),
        preconditions: lines(useCase.preconditions),
        mainFlow: lines(useCase.mainFlow),
        alternateFlows: lines(useCase.alternateFlows),
        exceptionFlows: lines(useCase.exceptionFlows),
        postconditions: lines(useCase.postconditions),
        businessRules: lines(useCase.businessRules),
        assumptions: lines(useCase.assumptions),
        dependencies: lines(useCase.dependencies),
      }),
    onSuccess: () => {
      toast.success("Đã thêm Use Case chuẩn");
      setUseCase(blankUseCase);
      qc.invalidateQueries({ queryKey: ["use-cases"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const approveUseCase = useMutation({
    mutationFn: (id) =>
      e2eApi.decideUseCase(id, {
        decision: "Approved",
        reviewNote: "Use Case E2E đã được QA Manager duyệt.",
      }),
    onSuccess: () => {
      toast.success("Đã duyệt Use Case");
      qc.invalidateQueries({ queryKey: ["use-cases"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const generateStory = useMutation({
    mutationFn: e2eApi.generateStory,
    onSuccess: (result) => {
      toast.success(
        result._e2eFallback
          ? "Gemini đã hết quota: đã tạo User Story E2E nháp"
          : "Gemini đã tạo User Story E2E nháp để bạn chỉnh sửa",
      );
      qc.invalidateQueries({ queryKey: ["e2e-stories"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const updateStory = useMutation({
    mutationFn: ({ id, body }) => requirementApi.updateStory(id, body),
    onSuccess: () => {
      toast.success("Đã lưu bản nháp User Story");
      qc.invalidateQueries({ queryKey: ["e2e-stories"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const submitStory = useMutation({
    mutationFn: async ({ id, body }) => {
      await requirementApi.updateStory(id, body);
      return requirementApi.submitApproval(id);
    },
    onSuccess: () => {
      toast.success("Đã gửi User Story để PO/BA xác nhận nghiệp vụ");
      qc.invalidateQueries({ queryKey: ["e2e-stories"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const qaReviewStory = useMutation({
    mutationFn: ({ id, decision, reviewNote }) => requirementApi.decideQaTestability(id, { decision, reviewNote }),
    onSuccess: (_, variables) => {
      toast.success(variables.decision === "Testable" ? "QA đã xác nhận User Story có thể thiết kế kiểm thử" : "QA đã yêu cầu làm rõ User Story");
      qc.invalidateQueries({ queryKey: ["e2e-stories"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const reviseStory = useMutation({
    mutationFn: (story) =>
      requirementApi.createStory({
        project: story.project?._id || story.project,
        title: story.title,
        description: story.description,
        acceptanceCriteria: (story.acceptanceCriteria || []).map((item) => ({
          criteria: item.criteria || item,
          isCompleted: false,
        })),
        priority: story.priority || "Medium",
        storyPoints: story.storyPoints || 0,
        source: "AI",
        approvalStatus: "Draft",
        aiSuggestion: story.aiSuggestion || null,
        e2e: story.e2e || {},
      }),
    onSuccess: () => {
      toast.success("Đã tạo bản nháp để chỉnh sửa và gửi duyệt lại");
      qc.invalidateQueries({ queryKey: ["e2e-stories"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const createSuite = useMutation({
    mutationFn: () =>
      testSuiteApi.create({
        project: activeProject,
        name: `E2E · ${currentProfile?.name || "System journey"}`,
        description:
          "Test Suite tự tạo cho các E2E journey trong System Profile.",
        origin: "SystemE2E",
      }),
    onSuccess: (result) => {
      setCaseTarget((item) => ({ ...item, suiteId: result._id }));
      toast.success("Đã tạo Test Suite E2E");
      qc.invalidateQueries({ queryKey: ["e2e-suites"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const generateCases = useMutation({
    mutationFn: () => {
      const body = {
        userStoryId: caseTarget.storyId,
        testSuiteId: caseTarget.suiteId,
        testPlanId: (plans.data || []).find(
          (item) =>
            item.kind === "TestPlan" &&
            item.approvalStatus === "Approved" &&
            String(item.systemProfile?._id || item.systemProfile) ===
              String(currentProfile?._id) &&
            (item.userStories || []).some(
              (id) => String(id._id || id) === String(caseTarget.storyId),
            ),
        )?._id,
      };
      return caseTarget.useCaseId
        ? e2eApi.generateCases(caseTarget.useCaseId, body)
        : e2eApi.generateCasesFromStory(caseTarget.storyId, {
            testSuiteId: body.testSuiteId,
            testPlanId: body.testPlanId,
          });
    },
    onSuccess: (result) => {
      toast.success(
        result._e2eFallback
          ? `Gemini đã hết quota: đã tạo ${result.length} Test Case E2E nháp`
          : `Gemini đã tạo ${result.length} E2E Test Case Draft`,
      );
      qc.invalidateQueries({ queryKey: ["e2e-cases"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const editCase = useMutation({
    mutationFn: ({ id, body }) => testCaseApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["e2e-cases"] }),
    onError: (error) => toast.error(error.message),
  });
  const submitCase = useMutation({
    mutationFn: ({ id, body }) => testCaseApi.submitReview(id, body),
    onSuccess: () => {
      toast.success("Đã gửi Test Case cho QA Manager");
      qc.invalidateQueries({ queryKey: ["e2e-cases"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const suggestPlan = useMutation({
    mutationFn: () =>
      executionApi.suggestPlan({
        project: activeProject,
        testCaseIds: currentCases
          .filter((item) => item.status === "Approved")
          .map((item) => item._id),
        environment: currentProfile?.baseUrl || "Staging",
      }),
    onSuccess: () => {
      toast.success("Đã tạo Test Plan E2E");
      qc.invalidateQueries({ queryKey: ["e2e-plans"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const approvePlan = useMutation({
    mutationFn: (id) =>
      executionApi.decidePlan(id, {
        decision: "Approved",
        reviewNote: "Test Plan E2E đã được QA Manager duyệt.",
      }),
    onSuccess: () => {
      toast.success("Đã duyệt Test Plan E2E");
      qc.invalidateQueries({ queryKey: ["e2e-plans"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const download = async (request, fileName) => {
    try {
      const response = await request();
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(error.message || "Không thể xuất tài liệu.");
    }
  };
  const newProfile = () => {
    setSelectedProfile("");
    setProfileEditor("create");
    setProfileMode("SystemProfile");
    setProfile(emptyProfile());
    setCaseTarget({ useCaseId: "", storyId: "", suiteId: "" });
    setUseCase(blankUseCase);
  };
  const selectProfile = (id) => {
    const item = (profiles.data || []).find(
      (profileItem) => profileItem._id === id,
    );
    if (!item) return newProfile();
    setSelectedProfile(id);
    setProfileEditor("edit");
    setProfileMode(item.mode || "SystemProfile");
    setProfile(profileToForm(item));
    setCaseTarget({ useCaseId: "", storyId: "", suiteId: "" });
    setUseCase(blankUseCase);
  };
  useEffect(() => {
    if (currentProfile?._id) {
      setProfile(profileToForm(currentProfile));
      setProfileMode(currentProfile.mode || "SystemProfile");
      setProfileEditor("edit");
    }
  }, [currentProfile?._id]);
  const _storyRevision = reviseStory;
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    let changed = false;
    if (query.get("step") !== activeStep) {
      query.set("step", activeStep);
      changed = true;
    }
    if (activeProject && query.get("project") !== String(activeProject)) {
      query.set("project", activeProject);
      changed = true;
    }
    if (
      currentProfile?._id &&
      query.get("profile") !== String(currentProfile._id)
    ) {
      query.set("profile", currentProfile._id);
      changed = true;
    }
    if (changed)
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${query.toString()}${window.location.hash}`,
      );
  }, [activeStep, activeProject, currentProfile?._id]);
  return (
    <QAWorkflow
      {...{
        activeProject,
        activeStep,
        setActiveStep,
        projects,
        project,
        setProject,
        currentProfile,
        profiles,
        profile,
        setProfile,
        profileEditor,
        profileMode,
        setProfileMode,
        environments,
        integrations,
        github,
        git,
        setGit,
        requestedEnvironment,
        requestedRun,
        createProfile,
        updateProfile,
        analyzeGithub,
        newProfile,
        selectProfile,
        useCases,
        requirements,
        useCase,
        setUseCase,
        suggestUseCases,
        addUseCase,
        approveUseCase,
        generateStory,
        currentStories,
        user,
        updateStory,
        submitStory,
        qaReviewStory,
        suites,
        caseTarget,
        setCaseTarget,
        createSuite,
        generateCases,
        currentCases,
        members: members.data || [],
        reviewers,
        editCase,
        submitCase,
        plans,
        download,
        GitHubForm,
        StoryDraftCard,
        TestCaseStep,
      }}
    />
  );
  const steps = [
    {
      id: "profile",
      label: "Profile",
      icon: Layers3,
      done: Boolean(currentProfile),
    },
    {
      id: "usecase",
      label: "Hành trình",
      icon: Route,
      done: (useCases.data || []).some((item) => item.status === "Approved"),
    },
    {
      id: "story",
      label: "Yêu cầu",
      icon: FileText,
      done: currentStories.some((item) => item.approvalStatus === "Approved"),
    },
    {
      id: "testcase",
      label: "Kiểm thử",
      icon: ClipboardCheck,
      done: currentCases.some((item) => item.status === "Approved"),
    },
    {
      id: "plan",
      label: "Kế hoạch",
      icon: FileCheck2,
      done: (plans.data || []).some(
        (item) => item.approvalStatus === "Approved",
      ),
    },
    { id: "run", label: "Chạy & báo cáo", icon: PlayCircle, done: false },
  ];
  const activeIndex = steps.findIndex((step) => step.id === activeStep);
  return (
    <div className="space-y-5 pb-8">
      <E2EVisualHero />
      <PageHeader
        eyebrow="E2E workspace"
        title="Thiết kế hành trình kiểm thử"
        description="Một luồng rõ ràng từ ngữ cảnh hệ thống đến lần chạy cuối cùng."
        actions={
          <Button variant="outline" asChild>
            <Link to="/automation">
              <TestTube2 className="h-4 w-4" />
              Automation Lab
            </Link>
          </Button>
        }
      />
      <Card className="overflow-hidden border-slate-200 shadow-sm dark:border-slate-800">
        <div className="flex flex-col gap-4 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-4 dark:from-violet-950/30 dark:via-[#17181d] dark:to-slate-900 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <label className="label">Không gian làm việc</label>
            <Select
              value={activeProject}
              onChange={(event) => {
                setProject(event.target.value);
                newProfile();
                setActiveStep("profile");
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
          <div className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-white">
              {currentProfile?.name || "Chưa chọn System Profile"}
            </span>
            <span className="mx-2 text-slate-300">/</span>
            {activeIndex + 1} trên {steps.length}
          </div>
        </div>
        <nav className="flex overflow-x-auto border-t border-slate-100 px-2 py-2 dark:border-slate-800">
          {steps.map((step, index) => {
            const active = step.id === activeStep;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(step.id)}
                className={`group flex min-w-[118px] flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left transition ${active ? "bg-violet-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"}`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${active ? "bg-white/20" : step.done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}
                >
                  {step.done && !active ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">
                    {step.label}
                  </span>
                  <span
                    className={`block text-[10px] ${active ? "text-violet-100" : "text-slate-400"}`}
                  >
                    {step.done ? "Hoàn tất" : "Tiếp theo"}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </Card>
      {activeStep === "profile" && (
        <ProfileStep
          {...{
            activeProject,
            profiles,
            currentProfile,
            profile,
            setProfile,
            profileEditor,
            profileMode,
            setProfileMode,
            environments,
            github,
            git,
            setGit,
            createProfile,
            updateProfile,
            analyzeGithub,
            newProfile,
            selectProfile,
          }}
        />
      )}
      {activeStep === "usecase" && (
        <JourneyStep
          {...{
            currentProfile,
            profiles,
            useCases,
            useCase,
            setUseCase,
            suggestUseCases,
            addUseCase,
            approveUseCase,
            generateStory,
            selectProfile,
            download,
          }}
        />
      )}
      {activeStep === "story" && (
        <StoryStep
          {...{
            currentProfile,
            currentStories,
            user,
            updateStory,
            submitStory,
            download,
            setActiveStep,
          }}
        />
      )}
      {activeStep === "testcase" && (
        <TestCaseStep
          {...{
            currentProfile,
            useCases,
            currentStories,
            suites,
            caseTarget,
            setCaseTarget,
            createSuite,
            generateCases,
            currentCases,
            reviewers,
            user,
            editCase,
            submitCase,
            download,
          }}
        />
      )}
      {activeStep === "plan" && (
        <PlanStep
          {...{ currentCases, plans, suggestPlan, approvePlan, download }}
        />
      )}
      {activeStep === "run" && (
        <RunStep
          activeProject={activeProject}
          plans={plans.data || []}
          runs={runs.data || []}
          requestedRun={requestedRun}
        />
      )}
    </div>
  );
}

function ProfileStep({
  activeProject,
  profiles,
  currentProfile,
  profile,
  setProfile,
  profileEditor,
  profileMode,
  setProfileMode,
  environments,
  github,
  git,
  setGit,
  createProfile,
  updateProfile,
  analyzeGithub,
  newProfile,
  selectProfile,
}) {
  const update = (key, value) => setProfile({ ...profile, [key]: value });
  const isGitHub = profileMode === "GitHubE2E";
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
        <SectionTitle
          title="Điểm bắt đầu"
          description="Xác định hệ thống và môi trường trước khi thiết kế hành trình."
        />
        <Button variant="outline" onClick={newProfile}>
          <Plus className="h-4 w-4" />
          Profile mới
        </Button>
      </div>
      <div className="grid gap-6 p-5 xl:grid-cols-[260px_1fr]">
        <aside className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            System Profile
          </p>
          <Select
            value={profileEditor === "edit" ? currentProfile?._id || "" : ""}
            onChange={(event) => selectProfile(event.target.value)}
          >
            <option value="">Tạo System Profile mới</option>
            {(profiles.data || []).map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </Select>
          <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500 dark:bg-slate-900">
            Lưu profile một lần, các bước sau tự động dùng chung ngữ cảnh này.
          </div>
        </aside>
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeOption
              active={!isGitHub}
              disabled={profileEditor === "edit"}
              icon={Layers3}
              title="Khai báo thủ công"
              description="Nhập hệ thống, role và môi trường."
              onClick={() => setProfileMode("SystemProfile")}
            />
            <ModeOption
              active={isGitHub}
              disabled={profileEditor === "edit"}
              icon={GitBranch}
              title="Phân tích GitHub"
              description="Tạo specification từ nguồn đã chọn."
              onClick={() => setProfileMode("GitHubE2E")}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Tên System Profile" required>
              <Input
                value={profile.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Checkout · Release 1.2"
              />
            </Field>
            <Field label="Environment">
              <Select
                value={profile.environment}
                onChange={(event) => update("environment", event.target.value)}
              >
                <option value="">Chọn sau / dùng URL</option>
                {(environments.data || [])
                  .filter((item) => item.status === "Ready")
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name} · {item.targetUrl}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
          {isGitHub ? (
            <GitHubForm
              {...{
                github,
                git,
                setGit,
                analyzeGithub,
                activeProject,
                profile,
              }}
            />
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Base URL" required>
                  <Input
                    value={profile.baseUrl}
                    onChange={(event) => update("baseUrl", event.target.value)}
                    placeholder="https://staging.example.com"
                  />
                </Field>
                <Field label="Allowed hosts">
                  <Input
                    value={profile.allowedHosts}
                    onChange={(event) =>
                      update("allowedHosts", event.target.value)
                    }
                    placeholder="api.example.com, mỗi dòng một host"
                  />
                </Field>
              </div>
              <details className="group rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
                  Thiết lập nâng cao{" "}
                  <Settings2 className="h-4 w-4 text-slate-400 transition group-open:rotate-90" />
                </summary>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Field label="Role | login URL | secret ref">
                    <Textarea
                      value={profile.roles}
                      onChange={(event) => update("roles", event.target.value)}
                      className="min-h-28 font-mono text-xs"
                    />
                  </Field>
                  <Field label="Test data (JSON)">
                    <Textarea
                      value={profile.testData}
                      onChange={(event) =>
                        update("testData", event.target.value)
                      }
                      className="min-h-28 font-mono text-xs"
                    />
                  </Field>
                  <Field label="Seed hook">
                    <Input
                      value={profile.seedUrl}
                      onChange={(event) =>
                        update("seedUrl", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Cleanup hook">
                    <Input
                      value={profile.cleanupUrl}
                      onChange={(event) =>
                        update("cleanupUrl", event.target.value)
                      }
                    />
                  </Field>
                </div>
              </details>
              <Button
                disabled={
                  !activeProject ||
                  !profile.name ||
                  !profile.baseUrl ||
                  createProfile.isPending ||
                  updateProfile.isPending
                }
                onClick={() =>
                  profileEditor === "edit"
                    ? updateProfile.mutate()
                    : createProfile.mutate()
                }
              >
                <CheckCircle2 className="h-4 w-4" />
                {profileEditor === "edit"
                  ? "Lưu thay đổi"
                  : "Lưu System Profile"}
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
function JourneyStep({
  currentProfile,
  profiles,
  useCases,
  useCase,
  setUseCase,
  suggestUseCases,
  addUseCase,
  approveUseCase,
  generateStory,
  selectProfile,
  download,
}) {
  if (!currentProfile)
    return (
      <ProfileRequired profiles={profiles} selectProfile={selectProfile} />
    );
  const update = (key, value) => setUseCase({ ...useCase, [key]: value });
  return (
    <AcademicJourneyWorkspace
      {...{
        currentProfile,
        useCases,
        useCase,
        update,
        suggestUseCases,
        addUseCase,
        approveUseCase,
        generateStory,
        download,
      }}
    />
  );
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="p-5">
        <SectionTitle
          title="Hành trình nghiệp vụ"
          description="Use Case E2E theo cấu trúc chuẩn: mục tiêu, tác nhân, điều kiện, luồng, ngoại lệ, hậu điều kiện và ràng buộc."
          action={
            <Button
              size="sm"
              onClick={() => suggestUseCases.mutate()}
              disabled={suggestUseCases.isPending}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Đề xuất bằng AI
            </Button>
          }
        />
        <div className="mt-5 rounded-xl border border-dashed border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Tên Use Case" required>
              <Input
                value={useCase.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Sinh viên nộp bài tập"
              />
            </Field>
            <Field label="Actor / tác nhân" required>
              <Input
                value={useCase.actor}
                onChange={(event) => update("actor", event.target.value)}
                placeholder="Sinh viên"
              />
            </Field>
            <Field label="Mã Use Case">
              <Input
                value={useCase.code}
                onChange={(event) => update("code", event.target.value)}
                placeholder="UC-OOP-01"
              />
            </Field>
            <Field label="Mức rủi ro">
              <Select
                value={useCase.risk}
                onChange={(event) => update("risk", event.target.value)}
              >
                {["Critical", "High", "Medium", "Low"].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-3 grid gap-3">
            <Field label="Mục tiêu / giá trị nghiệp vụ" required>
              <Textarea
                value={useCase.summary}
                onChange={(event) => update("summary", event.target.value)}
                placeholder="Giá trị nghiệp vụ cần bảo vệ và kết quả cuối cùng cần đạt."
              />
            </Field>
            <Field label="Sự kiện kích hoạt">
              <Input
                value={useCase.trigger}
                onChange={(event) => update("trigger", event.target.value)}
                placeholder="Sinh viên chọn nộp bài tập trong khóa học."
              />
            </Field>
            <Field label="Luồng chính · mỗi dòng một bước" required>
              <Textarea
                className="min-h-28"
                value={useCase.mainFlow}
                onChange={(event) => update("mainFlow", event.target.value)}
                placeholder={
                  "Đăng nhập\nMở khóa học OOP\nChọn bài tập\nTải tệp và nộp bài\nXác nhận trạng thái nộp bài"
                }
              />
            </Field>
          </div>
          <details className="group mt-3 rounded-xl border border-slate-200 bg-white/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
            <summary className="cursor-pointer text-sm font-semibold">
              Thành phần Use Case chuẩn · mở để khai báo đầy đủ
            </summary>
            <p className="mt-1 text-xs text-slate-500">
              Mỗi dòng là một mục để xuất tài liệu và sinh E2E Test Case có cấu
              trúc rõ ràng.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="Tiền điều kiện">
                <Textarea
                  value={useCase.preconditions}
                  onChange={(event) =>
                    update("preconditions", event.target.value)
                  }
                  placeholder="Đã đăng nhập\nĐã ghi danh khóa học OOP"
                />
              </Field>
              <Field label="Hậu điều kiện">
                <Textarea
                  value={useCase.postconditions}
                  onChange={(event) =>
                    update("postconditions", event.target.value)
                  }
                  placeholder="Bài nộp được lưu\nTrạng thái hiển thị chính xác"
                />
              </Field>
              <Field label="Luồng thay thế">
                <Textarea
                  value={useCase.alternateFlows}
                  onChange={(event) =>
                    update("alternateFlows", event.target.value)
                  }
                  placeholder="Lưu nháp khi chưa nộp\nThay tệp trước thời hạn"
                />
              </Field>
              <Field label="Luồng lỗi / recovery">
                <Textarea
                  value={useCase.exceptionFlows}
                  onChange={(event) =>
                    update("exceptionFlows", event.target.value)
                  }
                  placeholder="Tệp không hợp lệ: báo lỗi\nPhiên hết hạn: yêu cầu đăng nhập lại"
                />
              </Field>
              <Field label="Quy tắc nghiệp vụ">
                <Textarea
                  value={useCase.businessRules}
                  onChange={(event) =>
                    update("businessRules", event.target.value)
                  }
                  placeholder="Chỉ được nộp trước hạn\nChỉ sinh viên đã ghi danh được nộp"
                />
              </Field>
              <Field label="Giả định">
                <Textarea
                  value={useCase.assumptions}
                  onChange={(event) =>
                    update("assumptions", event.target.value)
                  }
                  placeholder="Tài khoản và dữ liệu E2E đã được cấp"
                />
              </Field>
              <Field label="Phụ thuộc / tích hợp">
                <Textarea
                  value={useCase.dependencies}
                  onChange={(event) =>
                    update("dependencies", event.target.value)
                  }
                  placeholder="Xác thực\nLưu trữ tệp\nDịch vụ khóa học"
                />
              </Field>
            </div>
          </details>
          <Button
            className="mt-3"
            variant="outline"
            disabled={
              !useCase.name ||
              !useCase.actor ||
              !useCase.summary ||
              !lines(useCase.mainFlow).length ||
              addUseCase.isPending
            }
            onClick={() => addUseCase.mutate()}
          >
            <Plus className="h-4 w-4" />
            Thêm Use Case
          </Button>
        </div>
        <div className="mt-5 space-y-3">
          {(useCases.data || []).map((item) => (
            <article key={item._id} className="rounded-xl border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex gap-2">
                    <Badge tone={statusTone[item.status]}>{item.status}</Badge>
                    <Badge tone="purple">{item.risk}</Badge>
                    <span className="text-xs text-slate-400">{item.code}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{item.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Actor: {item.actor} · {item.mainFlow?.length || 0} bước
                    chính · {item.exceptionFlows?.length || 0} ngoại lệ
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {item.status !== "Approved" ? (
                    <Button
                      size="sm"
                      onClick={() => approveUseCase.mutate(item._id)}
                      disabled={approveUseCase.isPending}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Duyệt
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => generateStory.mutate(item._id)}
                      disabled={generateStory.isPending}
                    >
                      <Bot className="h-3.5 w-3.5" />
                      Sinh yêu cầu
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      download(
                        () =>
                          e2eApi.exportArtifact("use-case", item._id, "docx"),
                          `use-case-${item.code || item._id}.docx`,
                      )
                    }
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <details className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <summary className="cursor-pointer font-semibold">
                  Xem Use Case đầy đủ
                </summary>
                <UseCaseList
                  label="Mục tiêu"
                  value={item.summary ? [item.summary] : []}
                />
                <UseCaseList
                  label="Kích hoạt"
                  value={item.trigger ? [item.trigger] : []}
                />
                <UseCaseList
                  label="Tiền điều kiện"
                  value={item.preconditions}
                />
                <UseCaseList label="Luồng chính" value={item.mainFlow} />
                <UseCaseList
                  label="Luồng thay thế"
                  value={item.alternateFlows}
                />
                <UseCaseList
                  label="Luồng lỗi / recovery"
                  value={item.exceptionFlows}
                />
                <UseCaseList
                  label="Hậu điều kiện"
                  value={item.postconditions}
                />
                <UseCaseList
                  label="Quy tắc nghiệp vụ"
                  value={item.businessRules}
                />
                <UseCaseList label="Giả định" value={item.assumptions} />
                <UseCaseList
                  label="Phụ thuộc / tích hợp"
                  value={item.dependencies}
                />
              </details>
            </article>
          ))}
          {!(useCases.data || []).length && (
            <p className="py-8 text-center text-sm text-slate-400">
              Chưa có hành trình nào.
            </p>
          )}
        </div>
      </Card>
      <ContextCard
        profile={currentProfile}
        label="Hành trình"
        items={[
          ["Đã tạo", useCases.data?.length || 0],
          [
            "Đã duyệt",
            (useCases.data || []).filter((item) => item.status === "Approved")
              .length,
          ],
          ["Roles", currentProfile.roles?.length || 0],
        ]}
      />
    </div>
  );
}
function UseCaseList({ label, value }) {
  const rows = Array.isArray(value) ? value.filter(Boolean) : [];
  return rows.length ? (
    <div className="mt-3">
      <p className="font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5">
        {rows.map((row, index) => (
          <li key={index}>{row}</li>
        ))}
      </ol>
    </div>
  ) : null;
}
function AcademicJourneyWorkspace({
  currentProfile,
  useCases,
  useCase,
  update,
  suggestUseCases,
  addUseCase,
  approveUseCase,
  generateStory,
  download,
}) {
  const textFields = [
    [
      "stakeholders",
      "Các bên liên quan / lợi ích",
      "Sinh viên: nộp bài đúng hạn\nGiảng viên: nhận bài để chấm",
    ],
    [
      "specialRequirements",
      "Yêu cầu đặc biệt",
      "Tệp được quét an toàn\nPhản hồi dưới 3 giây",
    ],
    [
      "preconditions",
      "Tiền điều kiện",
      "Đã đăng nhập\nĐã ghi danh khóa học OOP",
    ],
    [
      "postconditions",
      "Hậu điều kiện",
      "Bài nộp được lưu\nTrạng thái được cập nhật",
    ],
    ["alternateFlows", "Luồng thay thế", "Lưu nháp\nThay tệp trước hạn"],
    [
      "exceptionFlows",
      "Luồng lỗi / recovery",
      "Tệp không hợp lệ: báo lỗi\nPhiên hết hạn: yêu cầu đăng nhập lại",
    ],
    [
      "businessRules",
      "Quy tắc nghiệp vụ",
      "Chỉ nộp trước hạn\nChỉ sinh viên đã ghi danh được nộp",
    ],
    ["assumptions", "Giả định", "Tài khoản và dữ liệu E2E đã được cấp"],
    [
      "dependencies",
      "Phụ thuộc / tích hợp",
      "Xác thực\nLưu trữ tệp\nDịch vụ khóa học",
    ],
  ];
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="p-5">
        <SectionTitle
          title="Hành trình nghiệp vụ"
          description="Use Case chuẩn phục vụ đặc tả, E2E test, truy vết và export."
          action={
            <Button
              size="sm"
              onClick={() => suggestUseCases.mutate()}
              disabled={suggestUseCases.isPending}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Đề xuất bằng AI
            </Button>
          }
        />
        <div className="mt-5 rounded-xl border border-dashed border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Tên Use Case" required>
              <Input
                value={useCase.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </Field>
            <Field label="Actor / tác nhân chính" required>
              <Input
                value={useCase.actor}
                onChange={(event) => update("actor", event.target.value)}
              />
            </Field>
            <Field label="Mã Use Case">
              <Input
                value={useCase.code}
                onChange={(event) => update("code", event.target.value)}
                placeholder="UC-OOP-01"
              />
            </Field>
            <Field label="Mức rủi ro">
              <Select
                value={useCase.risk}
                onChange={(event) => update("risk", event.target.value)}
              >
                {["Critical", "High", "Medium", "Low"].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </Field>
            <Field label="Phạm vi hệ thống">
              <Input
                value={useCase.scope}
                onChange={(event) => update("scope", event.target.value)}
                placeholder="e-Learning · Quản lý bài tập"
              />
            </Field>
            <Field label="Cấp độ">
              <Select
                value={useCase.level}
                onChange={(event) => update("level", event.target.value)}
              >
                {["User-goal", "Sub-function", "Summary"].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-3 grid gap-3">
            <Field label="Mục tiêu / giá trị nghiệp vụ" required>
              <Textarea
                value={useCase.summary}
                onChange={(event) => update("summary", event.target.value)}
              />
            </Field>
            <Field label="Sự kiện kích hoạt">
              <Input
                value={useCase.trigger}
                onChange={(event) => update("trigger", event.target.value)}
              />
            </Field>
            <Field label="Luồng chính · mỗi dòng một bước" required>
              <Textarea
                className="min-h-28"
                value={useCase.mainFlow}
                onChange={(event) => update("mainFlow", event.target.value)}
              />
            </Field>
          </div>
          <details className="group mt-3 rounded-xl border border-slate-200 bg-white/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
            <summary className="cursor-pointer text-sm font-semibold">
              Thành phần Use Case chuẩn · mở để khai báo đầy đủ
            </summary>
            <p className="mt-1 text-xs text-slate-500">
              Các thành phần này được lưu riêng để đưa vào tài liệu và sinh test
              theo hành trình.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {textFields.map(([key, label, placeholder]) => (
                <Field key={key} label={label}>
                  <Textarea
                    value={useCase[key] || ""}
                    onChange={(event) => update(key, event.target.value)}
                    placeholder={placeholder}
                  />
                </Field>
              ))}
            </div>
          </details>
          <Button
            className="mt-3"
            variant="outline"
            disabled={
              !useCase.name ||
              !useCase.actor ||
              !useCase.summary ||
              !lines(useCase.mainFlow).length ||
              addUseCase.isPending
            }
            onClick={() => addUseCase.mutate()}
          >
            <Plus className="h-4 w-4" />
            Thêm Use Case chuẩn
          </Button>
        </div>
        <div className="mt-5 space-y-3">
          {(useCases.data || []).map((item) => (
            <article key={item._id} className="rounded-xl border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={statusTone[item.status]}>{item.status}</Badge>
                    <Badge tone="purple">{item.risk}</Badge>
                    <span className="text-xs text-slate-400">{item.code}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{item.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.scope || "Chưa khai báo phạm vi"} ·{" "}
                    {item.level || "User-goal"} · Actor: {item.actor}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {item.status !== "Approved" ? (
                    <Button
                      size="sm"
                      onClick={() => approveUseCase.mutate(item._id)}
                      disabled={approveUseCase.isPending}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Duyệt
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => generateStory.mutate(item._id)}
                      disabled={generateStory.isPending}
                    >
                      <Bot className="h-3.5 w-3.5" />
                      Sinh yêu cầu
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      download(
                        () =>
                          e2eApi.exportArtifact("use-case", item._id, "docx"),
                          `use-case-${item.code || item._id}.docx`,
                      )
                    }
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <details className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <summary className="cursor-pointer font-semibold">
                  Xem Use Case đầy đủ
                </summary>
                <UseCaseList
                  label="Mục tiêu"
                  value={item.summary ? [item.summary] : []}
                />
                <UseCaseList
                  label="Kích hoạt"
                  value={item.trigger ? [item.trigger] : []}
                />
                <UseCaseList
                  label="Các bên liên quan / lợi ích"
                  value={item.stakeholders}
                />
                <UseCaseList
                  label="Tiền điều kiện"
                  value={item.preconditions}
                />
                <UseCaseList label="Luồng chính" value={item.mainFlow} />
                <UseCaseList
                  label="Luồng thay thế"
                  value={item.alternateFlows}
                />
                <UseCaseList
                  label="Luồng lỗi / recovery"
                  value={item.exceptionFlows}
                />
                <UseCaseList
                  label="Hậu điều kiện"
                  value={item.postconditions}
                />
                <UseCaseList
                  label="Quy tắc nghiệp vụ"
                  value={item.businessRules}
                />
                <UseCaseList
                  label="Yêu cầu đặc biệt"
                  value={item.specialRequirements}
                />
                <UseCaseList label="Giả định" value={item.assumptions} />
                <UseCaseList
                  label="Phụ thuộc / tích hợp"
                  value={item.dependencies}
                />
              </details>
            </article>
          ))}
          {!(useCases.data || []).length && (
            <p className="py-8 text-center text-sm text-slate-400">
              Chưa có Use Case nào.
            </p>
          )}
        </div>
      </Card>
      <ContextCard
        profile={currentProfile}
        label="Hành trình"
        items={[
          ["Đã tạo", useCases.data?.length || 0],
          [
            "Đã duyệt",
            (useCases.data || []).filter((item) => item.status === "Approved")
              .length,
          ],
          ["Roles", currentProfile.roles?.length || 0],
        ]}
      />
    </div>
  );
}
function StoryStep({
  currentProfile,
  currentStories,
  user,
  updateStory,
  submitStory,
  download,
  setActiveStep,
}) {
  if (!currentProfile) return <ProfileRequired />;
  const hasApprovedStory = currentStories.some(
    (item) => item.approvalStatus === "Approved",
  );
  return (
    <Card className="p-5">
      <SectionTitle
        title="Yêu cầu E2E"
        description="Gemini tạo bản nháp trước. Người yêu cầu sinh chỉnh sửa và chủ động gửi QA Manager duyệt."
        action={
          hasApprovedStory ? (
            <Button size="sm" onClick={() => setActiveStep("testcase")}>
              <ArrowRight className="h-3.5 w-3.5" />
              Tiếp tục: Sinh Test Case
            </Button>
          ) : null
        }
      />
      <div className="mt-5 space-y-3">
        {currentStories.map((item) => (
          <StoryDraftCard
            key={`${item._id}-${item.updatedAt || ""}`}
            item={item}
            currentUser={user}
            updateStory={updateStory}
            submitStory={submitStory}
            download={download}
          />
        ))}
        {!currentStories.length && (
          <EmptyState
            title="Chưa có User Story"
            description="Duyệt một hành trình, rồi chọn “Sinh yêu cầu” ở bước Hành trình."
          />
        )}
        {hasApprovedStory && (
          <div className="flex justify-end border-t pt-4 dark:border-slate-800">
            <Button onClick={() => setActiveStep("testcase")}>
              <ArrowRight className="h-4 w-4" />
              Tiếp tục: Sinh Test Case
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
function StoryDraftCard({
  item,
  currentUser,
  updateStory,
  submitStory,
  qaReviewStory,
  download,
}) {
  const [open, setOpen] = useState(false);
  const isOwner =
    String(item.createdBy?._id || item.createdBy || "") ===
    String(currentUser?._id || "");
  // An approved AI story can be reopened by its requester.  Saving changes
  // returns it to Draft and sends it through QA approval again.
  const editable = ["Draft", "Rejected", "Approved"].includes(
    item.approvalStatus,
  );
  const [draft, setDraft] = useState({
    title: item.title || "",
    description: item.description || "",
    priority: item.priority || "Medium",
    storyPoints: item.storyPoints || 0,
    acceptanceCriteria: (item.acceptanceCriteria || [])
      .map((criterion) => criterion.criteria || "")
      .filter(Boolean)
      .join("\n"),
  });
  const body = () => ({
    title: draft.title.trim(),
    description: draft.description.trim(),
    priority: draft.priority,
    storyPoints: Number(draft.storyPoints) || 0,
    acceptanceCriteria: lines(draft.acceptanceCriteria).map((criteria) => ({
      criteria,
      isCompleted: false,
    })),
  });
  const invalid =
    !draft.title.trim() ||
    !draft.description.trim() ||
    !lines(draft.acceptanceCriteria).length;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-950/30"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone[item.approvalStatus] || "slate"}>
              {item.approvalStatus}
            </Badge>
            {item.source === "AI" && <Badge tone="purple">AI suggestion</Badge>}
            {item.source === "ImportedDocument" && <Badge tone="blue">Tài liệu User Story</Badge>}
            <Badge tone={item.businessApprovalStatus === "BusinessConfirmed" ? "green" : item.businessApprovalStatus === "BusinessRejected" ? "red" : item.businessApprovalStatus === "PendingBusinessConfirmation" ? "amber" : "slate"}>Nghiệp vụ: {item.businessApprovalStatus === "BusinessConfirmed" ? "đã xác nhận" : item.businessApprovalStatus === "PendingBusinessConfirmation" ? "chờ PO/BA" : item.businessApprovalStatus === "BusinessRejected" ? "từ chối" : "chưa xác nhận"}</Badge>
            <Badge tone={item.qaTestabilityStatus === "Testable" ? "green" : item.qaTestabilityStatus === "NeedsClarification" ? "amber" : "slate"}>QA: {item.qaTestabilityStatus === "Testable" ? "có thể test" : item.qaTestabilityStatus === "NeedsClarification" ? "cần làm rõ" : "chưa rà soát"}</Badge>
          </div>
          <span className="text-xs font-semibold text-violet-600">
            Mở để xem / sửa
          </span>
        </div>
        <h3 className="mt-3 text-sm font-semibold">{item.title}</h3>
        {item.sourceDocument?.fileName && <p className="mt-1 text-[11px] text-slate-400">Nguồn: {item.sourceDocument.fileName}</p>}
        {(item.externalReference?.externalId || item.externalReference?.version || item.externalReference?.effectiveAt) && <p className="mt-1 text-[11px] text-slate-400">{item.externalReference?.system || 'Nguồn ngoài'}{item.externalReference?.externalId ? ` · ${item.externalReference.externalId}` : ''}{item.externalReference?.version ? ` · ${item.externalReference.version}` : ''}{item.externalReference?.effectiveAt ? ` · hiệu lực ${new Date(item.externalReference.effectiveAt).toLocaleDateString('vi-VN')}` : ''}</p>}
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">
          {item.description}
        </p>
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          {(item.acceptanceCriteria || [])
            .slice(0, 2)
            .map((criterion, index) => (
              <p key={index}>
                AC {index + 1}: {criterion.criteria}
              </p>
            ))}
          {(item.acceptanceCriteria || []).length > 2 && (
            <p className="mt-1 text-slate-400">
              + {(item.acceptanceCriteria || []).length - 2} tiêu chí khác
            </p>
          )}
        </div>
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editable ? "Chỉnh sửa User Story" : "Chi tiết User Story"}
        description={
          editable
            ? "Sửa nội dung rồi lưu nháp hoặc gửi QA Manager duyệt."
            : "Nội dung đang chờ QA Manager duyệt nên tạm thời không thể chỉnh sửa."
        }
        className="max-w-3xl"
      >
        {editable ? (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_150px_110px]">
              <Field label="Tiêu đề" required>
                <Input
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                />
              </Field>
              <Field label="Ưu tiên">
                <Select
                  value={draft.priority}
                  onChange={(event) =>
                    setDraft({ ...draft, priority: event.target.value })
                  }
                >
                  {["Critical", "High", "Medium", "Low"].map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Story points">
                <Input
                  type="number"
                  min="0"
                  max="21"
                  value={draft.storyPoints}
                  onChange={(event) =>
                    setDraft({ ...draft, storyPoints: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="User Story" required>
              <Textarea
                className="min-h-28"
                value={draft.description}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
              />
            </Field>
            <Field label="Acceptance Criteria · mỗi dòng một tiêu chí" required>
              <Textarea
                className="min-h-40"
                value={draft.acceptanceCriteria}
                onChange={(event) =>
                  setDraft({ ...draft, acceptanceCriteria: event.target.value })
                }
              />
            </Field>
            <div className="flex flex-wrap justify-between gap-2 border-t pt-4 dark:border-slate-800">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Hủy
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={
                    invalid || updateStory.isPending || submitStory.isPending
                  }
                  onClick={() =>
                    updateStory.mutate({ id: item._id, body: body() })
                  }
                >
                  Lưu nháp
                </Button>
                {item.businessApprovalStatus === "BusinessConfirmed" ? <><Button variant="outline" disabled={invalid || qaReviewStory?.isPending} onClick={() => { const reviewNote = window.prompt("Nội dung QA cần PO/BA làm rõ:"); if (reviewNote?.trim()) qaReviewStory?.mutate({ id: item._id, decision: "NeedsClarification", reviewNote }) }}>QA yêu cầu làm rõ</Button><Button disabled={invalid || qaReviewStory?.isPending} onClick={() => qaReviewStory?.mutate({ id: item._id, decision: "Testable", reviewNote: "QA đã rà soát mô tả và Acceptance Criteria; User Story đủ điều kiện thiết kế kiểm thử." })}><Check className="h-4 w-4" />QA xác nhận có thể test</Button></> : <Button disabled={invalid || updateStory.isPending || submitStory.isPending || item.businessApprovalStatus === "PendingBusinessConfirmation"} onClick={() => submitStory.mutate({ id: item._id, body: body() })}><Check className="h-4 w-4" />{item.businessApprovalStatus === "PendingBusinessConfirmation" ? "Đang chờ PO/BA" : "Gửi PO/BA xác nhận"}</Button>}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              {item.description}
            </p>
            <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              {(item.acceptanceCriteria || []).map((criterion, index) => (
                <p key={index}>
                  AC {index + 1}: {criterion.criteria}
                </p>
              ))}
            </div>
            {item.approvalStatus === "PendingApproval" && (
              <p className="mt-4 text-xs text-amber-600">
                Đã gửi QA Manager; nội dung được khóa trong thời gian chờ duyệt.
              </p>
            )}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              download(
                () => e2eApi.exportArtifact("user-story", item._id, "docx"),
                `user-story-${item._id}.docx`,
              )
            }
          >
            <Download className="h-3.5 w-3.5" />
            Xuất Word
          </Button>
        </div>
      </Dialog>
    </>
  );
}
function TestCaseStep({
  currentProfile,
  useCases,
  currentStories,
  suites,
  caseTarget,
  setCaseTarget,
  createSuite,
  generateCases,
  currentCases,
  reviewers,
  user,
  editCase,
  submitCase,
  download,
  setActiveStep,
}) {
  if (!currentProfile) return <ProfileRequired />;
  const approvedUseCases = (useCases.data || []).filter(
    (item) => item.status === "Approved",
  );
  const approvedStories = currentStories.filter(
    (item) => item.approvalStatus === "Approved" &&
      (!caseTarget.useCaseId || String(item.e2e?.useCase?._id || item.e2e?.useCase || "") === String(caseTarget.useCaseId)),
  );
  const suiteItems = suites.data || [];
  const validSelection =
    approvedStories.some((item) => item._id === caseTarget.storyId) &&
    suiteItems.some((item) => item._id === caseTarget.suiteId) &&
    (!caseTarget.useCaseId || approvedUseCases.some((item) => item._id === caseTarget.useCaseId));
  const projectId = currentProfile.project?._id || currentProfile.project;
  return (
    <Card className="p-5">
      <SectionTitle
        title="Bộ kiểm thử E2E"
        description="User Story đã được PO/BA và QA xác nhận là đầu vào bắt buộc. Use Case chỉ là ngữ cảnh tùy chọn khi Story thuộc một hành trình."
      />
      <div className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 md:grid-cols-3 dark:bg-slate-900">
        <div>
          <Field label="1. Use Case (tùy chọn)">
            <Select
              value={caseTarget.useCaseId}
              disabled={!approvedUseCases.length}
              onChange={(event) =>
                setCaseTarget({
                  ...caseTarget,
                  useCaseId: event.target.value,
                  storyId: "",
                })
              }
            >
              <option value="">Không gắn Use Case · kiểm thử trực tiếp theo User Story</option>
              {approvedUseCases.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <p className="mt-1 text-xs text-slate-500">
            Chỉ chọn khi User Story thực sự thuộc một hành trình đã duyệt.
          </p>
          {!approvedUseCases.length && <p className="mt-1 text-xs text-slate-500">Không có Use Case vẫn có thể thiết kế Test Case trực tiếp từ User Story.</p>}
        </div>
        <div>
          <Field label="2. User Story">
            <Select
              value={caseTarget.storyId}
              disabled={!approvedStories.length}
              onChange={(event) =>
                setCaseTarget({ ...caseTarget, storyId: event.target.value })
              }
            >
              <option value="">Chọn yêu cầu đã duyệt</option>
              {approvedStories.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.title}
                </option>
              ))}
            </Select>
          </Field>
          <p className="mt-1 text-xs text-slate-500">
            Chỉ hiển thị Story đã được PO/BA xác nhận nghiệp vụ và QA xác nhận khả năng kiểm thử.
          </p>
          {!approvedStories.length && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Chưa có yêu cầu phù hợp trong Test Plan đã duyệt.{" "}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => setActiveStep("story")}
              >
                Mở User Story
              </button>{" "}
              hoặc{" "}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => setActiveStep("plan")}
              >
                Test Plan
              </button>
              .
            </p>
          )}
        </div>
        <div>
          <Field label="3. Test Suite">
            <Select
              value={caseTarget.suiteId}
              disabled={!suiteItems.length}
              onChange={(event) =>
                setCaseTarget({ ...caseTarget, suiteId: event.target.value })
              }
            >
              <option value="">Chọn nhóm kiểm thử</option>
              {suiteItems.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <p className="mt-1 text-xs text-slate-500">
            Nhóm dùng để lưu các Test Case cùng phạm vi.
          </p>
          {!suiteItems.length && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Chưa có Test Suite. Tạo một nhóm bằng nút bên dưới.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-3">
          <Button
            disabled={!validSelection || generateCases.isPending}
            onClick={() => generateCases.mutate()}
          >
            <Sparkles className="h-4 w-4" />
            {generateCases.isPending ? "Đang sinh…" : "Sinh Test Case"}
          </Button>
          <Button
            variant="outline"
            disabled={createSuite.isPending}
            onClick={() => createSuite.mutate()}
          >
            <Plus className="h-4 w-4" />
            {createSuite.isPending ? "Đang tạo…" : "Tạo Test Suite E2E"}
          </Button>
        </div>
      </div>
      {!reviewers.length &&
        currentCases.some((item) =>
          ["Draft", "Rejected"].includes(item.status),
        ) && (
          <p className="mt-4 text-xs leading-5 text-amber-700 dark:text-amber-300">
            Cần một người duyệt khác có quyền duyệt Test Case trong project.{" "}
            <Link
              className="font-semibold underline"
              to={`/projects/${projectId}`}
            >
              Mở project để kiểm tra thành viên
            </Link>
            .
          </p>
        )}
      {currentCases.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900 dark:bg-violet-950/20">
          <div>
            <p className="text-sm font-semibold">Xuất bộ Test Case</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Một file Excel gồm {currentCases.length} Test Case và các sheet
              Steps, Test Data, Traceability.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              download(
                () => testCaseApi.exportMany(currentCases.map((item) => item._id)),
                `test-cases-${currentProfile.name || "e2e"}.xlsx`,
              )
            }
          >
            <Download className="h-4 w-4" />
            Tải tất cả (.xlsx)
          </Button>
        </div>
      )}
      <div className="mt-5 space-y-4">
        {currentCases.map((item) => (
          <div key={item._id} className="rounded-xl border p-3">
            <div className="mb-2 flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  download(
                    () => e2eApi.exportArtifact("test-case", item._id, "xlsx"),
                    `test-case-${item.testCaseId || item._id}.xlsx`,
                  )
                }
              >
                <Download className="h-3.5 w-3.5" />
                Tải riêng (.xlsx)
              </Button>
            </div>
            <TestCaseCard
              testCase={item}
              canApprove={false}
              canSubmitReview={Boolean(
                user?.role?.permissions?.includes("testcase:create"),
              )}
              pendingReview={null}
              reviewers={reviewers}
              busy={editCase.isPending || submitCase.isPending}
              onEdit={(id, body) => editCase.mutateAsync({ id, body })}
              onSubmitReview={(id, body) =>
                submitCase.mutateAsync({ id, body })
              }
              onDecision={() => {}}
            />
          </div>
        ))}
        {!currentCases.length && (
          <p className="py-8 text-center text-sm text-slate-400">
            Chưa có Test Case. Chọn đủ ba mục bên trên rồi nhấn “Sinh Test
            Case”.
          </p>
        )}
      </div>
    </Card>
  );
}
function PlanStep({ currentCases, plans, suggestPlan, approvePlan, download }) {
  const items = plans.data || [];
  return (
    <Card className="p-5">
      <SectionTitle
        title="Kế hoạch chạy E2E"
        description="Tổng hợp các Test Case đã duyệt thành kế hoạch có thể theo dõi."
        action={
          <Button
            size="sm"
            disabled={
              !currentCases.some((item) => item.status === "Approved") ||
              suggestPlan.isPending
            }
            onClick={() => suggestPlan.mutate()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Tạo kế hoạch
          </Button>
        }
      />
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <article
            key={item._id}
            className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <Badge tone={statusTone[item.approvalStatus] || "slate"}>
                {item.approvalStatus || item.status}
              </Badge>
              <p className="mt-2 text-sm font-semibold">
                {item.planId ? `${item.planId} · ` : ""}
                {item.name}
              </p>
              <p className="mt-1 text-xs text-slate-500">{item.scope}</p>
            </div>
            <div className="flex gap-2">
              {item.approvalStatus !== "Approved" && (
                <Button
                  size="sm"
                  onClick={() => approvePlan.mutate(item._id)}
                  disabled={approvePlan.isPending}
                >
                  <Check className="h-3.5 w-3.5" />
                  Duyệt
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  download(
                    () => executionApi.exportPlan(item._id, "docx"),
                    `test-plan-${item.planId || item._id}.docx`,
                  )
                }
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          </article>
        ))}
        {!items.length && (
          <EmptyState
            title="Chưa có kế hoạch"
            description="Khi Test Case được duyệt, bạn có thể tạo Test Plan tại đây."
          />
        )}
      </div>
    </Card>
  );
}
function RunStep({ activeProject, plans, runs, requestedRun }) {
  const ready = plans.some((item) => item.approvalStatus === "Approved");
  const selectedRun = runs.find((item) => String(item._id) === String(requestedRun)) || runs[0];
  return (
    <Card className="p-5">
      {selectedRun && (
        <section className="mb-6 rounded-xl border border-violet-200 bg-violet-50/50 p-5 dark:border-violet-900 dark:bg-violet-950/20">
          <p className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
            Test Run vừa tạo
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{selectedRun.name}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {selectedRun.totalCases || 0} Test Case · {selectedRun.environment || "Chưa khai báo môi trường"}
              </p>
            </div>
            <Badge tone={selectedRun.status === "Completed" ? "green" : "amber"}>
              {selectedRun.status || "NotStarted"}
            </Badge>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Tiếp theo: mở Automation Lab để chọn môi trường, sinh script và chạy Test Run này.
          </p>
        </section>
      )}
      <div className="mx-auto max-w-xl py-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300">
          <PlayCircle className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Sẵn sàng chạy hành trình</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Sau khi Test Plan được duyệt, chuyển sang Automation Lab để sinh
          script, chạy E2E và lưu evidence.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button disabled={!ready} asChild>
            <Link to={`/automation?project=${activeProject}`}>
              Mở Automation Lab <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/reports?project=${activeProject}`}>Xem báo cáo</Link>
          </Button>
        </div>
        {!ready && (
          <p className="mt-4 text-xs text-amber-600">
            Cần ít nhất một Test Plan được duyệt để bắt đầu.
          </p>
        )}
      </div>
    </Card>
  );
}
export function GitHubForm({
  github,
  integrations,
  git,
  setGit,
  analyzeGithub,
  activeProject,
  profile,
}) {
  const [consentFingerprint, setConsentFingerprint] = useState("");
  const connected = github.find(
    (item) => String(item._id) === String(git.integrationId),
  );
  const [owner, repo] = git.repository.split("/");
  const canReadRepository = Boolean(connected && owner && repo);
  const repositories = useInfiniteQuery({
    queryKey: ["e2e-github-repositories", connected?._id],
    queryFn: ({ pageParam }) =>
      automationLabApi.githubRepos(connected._id, {
        page: pageParam,
        perPage: 48,
      }),
    enabled: Boolean(connected),
    initialPageParam: 1,
    getNextPageParam: (page) => (page.hasMore ? page.page + 1 : undefined),
  });
  const branches = useQuery({
    queryKey: ["e2e-github-branches", connected?._id, git.repository],
    queryFn: () => automationLabApi.githubBranches(connected._id, owner, repo),
    enabled: canReadRepository,
  });
  const selectedBranch = (branches.data || []).some(
    (item) => item.name === git.ref,
  );
  const commits = useQuery({
    queryKey: ["e2e-github-commits", connected?._id, git.repository, git.ref],
    queryFn: () =>
      automationLabApi.githubCommits(connected._id, owner, repo, git.ref),
    enabled: Boolean(canReadRepository && selectedBranch),
  });
  const pulls = useQuery({
    queryKey: ["e2e-github-pulls", connected?._id, git.repository],
    queryFn: () => automationLabApi.githubPulls(connected._id, owner, repo),
    enabled: canReadRepository,
  });
  const repositoryItems =
    repositories.data?.pages.flatMap((page) => page.items || []) || [];
  const chosenRepositoryKnown = Boolean(
    git.repository &&
      (repositoryItems.some((item) => item.fullName === git.repository) ||
        branches.isSuccess),
  );
  const chosenPull = (pulls.data || []).find(
    (item) => String(item.number) === String(git.pullRequestNumber),
  );
  const branchReady =
    selectedBranch ||
    Boolean(
      chosenPull &&
        chosenPull.headRef === git.ref &&
        chosenPull.headSha === git.commitSha,
    );
  const sourceRef = git.commitSha || git.ref;
  const sourceReady = Boolean(canReadRepository && branchReady && sourceRef);
  const sourceFiles = useQuery({
    queryKey: [
      "e2e-github-source-files",
      connected?._id,
      git.repository,
      sourceRef,
    ],
    queryFn: () =>
      automationLabApi.githubSourceFiles(
        connected._id,
        owner,
        repo,
        sourceRef,
        { purpose: "system" },
      ),
    enabled: sourceReady,
  });
  const selectedPaths = lines(git.paths);
  const availablePaths = new Set(
    Array.isArray(sourceFiles.data?.items)
      ? sourceFiles.data.items.map((item) => item.path)
      : [],
  );
  const selectionValid =
    sourceReady &&
    sourceFiles.isSuccess &&
    Array.isArray(sourceFiles.data?.items) &&
    !sourceFiles.data.truncated &&
    selectedPaths.length > 0 &&
    selectedPaths.length <= 40 &&
    selectedPaths.every((path) => availablePaths.has(path));
  const fingerprint = JSON.stringify([
    connected?._id,
    git.repository,
    sourceRef,
    selectedPaths,
  ]);
  const confirmed = Boolean(
    consentFingerprint && consentFingerprint === fingerprint,
  );
  const settingsParams = new URLSearchParams({
    setup: "github",
    from: "e2e",
    project: activeProject,
    repository: git.repository,
    ref: git.ref,
    paths: git.paths,
    profileName: profile.name,
  });
  const chooseRepository = (repository) => {
    const selected = repositoryItems.find(
      (item) => item.fullName === repository,
    );
    setGit({
      ...git,
      repository,
      ref: selected?.defaultBranch || "",
      commitSha: "",
      pullRequestNumber: "",
      paths: "",
    });
  };
  const choosePullRequest = (number) => {
    const selected = (pulls.data || []).find(
      (item) => String(item.number) === number,
    );
    setGit({
      ...git,
      pullRequestNumber: number,
      ref: selected?.headRef || git.ref,
      commitSha: selected?.headSha || "",
      paths: "",
    });
  };
  const error =
    repositories.isError ||
    branches.isError ||
    commits.isError ||
    pulls.isError;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900 dark:bg-violet-950/20">
        <p className="text-sm font-semibold">
          Kết nối GitHub để đọc nguồn hệ thống
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
          Kết nối cho phép chọn repository và tệp làm cơ sở đề xuất Use Case,
          User Story và Test Case. Sau khi thêm kết nối, cần kiểm tra thành công
          trước khi sử dụng.
        </p>
      </div>
      {integrations?.isPending ? (
        <p className="text-sm text-slate-500">Đang tải kết nối GitHub…</p>
      ) : integrations?.isError ? (
        <div className="rounded-lg border border-rose-300 p-3 text-sm">
          <p>Không tải được danh sách kết nối của project.</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => integrations.refetch()}
          >
            Thử tải lại
          </Button>
        </div>
      ) : (
        <>
          {!github.length && (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
              <p className="text-sm font-semibold">
                Workspace chưa có kết nối GitHub đã kiểm tra
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                GitHub chỉ cần kết nối một lần cho Workspace. Nếu đã có kết nối,
                hãy tải lại trang hoặc bấm “Kiểm tra” lại trong Settings.
              </p>
              <Button variant="outline" size="sm" className="mt-3" asChild>
                <Link to={`/settings?${settingsParams}`}>
                  Thêm hoặc kiểm tra kết nối GitHub{" "}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          )}
          {github.length > 0 && (
            <div>
              <Field label="1. Kết nối GitHub">
                <Select
                  value={connected?._id || ""}
                  onChange={(event) =>
                    setGit({
                      ...git,
                      integrationId: event.target.value,
                      repository: "",
                      ref: "",
                      commitSha: "",
                      pullRequestNumber: "",
                      paths: "",
                    })
                  }
                >
                  <option value="">Chọn kết nối đã kiểm tra</option>
                  {github.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="mt-1 text-xs text-slate-500">
                Chọn tài khoản có quyền đọc repository.{" "}
                <Link
                  className="font-semibold text-violet-600 underline"
                  to={`/settings?${settingsParams}`}
                >
                  Quản lý kết nối
                </Link>
              </p>
            </div>
          )}
          {git.integrationId && !connected && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Kết nối được chọn trước đó chưa tải được hoặc không thuộc
              Workspace này. Hãy tải lại trang; bạn không cần tạo connection
              mới nếu GitHub đã Connected trong cùng Workspace.
            </p>
          )}
        </>
      )}
      {connected && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <Field label="2. Repository">
                <Select
                  value={chosenRepositoryKnown ? git.repository : ""}
                  disabled={repositories.isPending}
                  onChange={(event) => chooseRepository(event.target.value)}
                >
                  <option value="">
                    {repositories.isPending
                      ? "Đang tải repository…"
                      : "Chọn repository"}
                  </option>
                  {chosenRepositoryKnown &&
                    !repositoryItems.some(
                      (item) => item.fullName === git.repository,
                    ) && (
                      <option value={git.repository}>{git.repository}</option>
                    )}
                  {repositoryItems.map((item) => (
                    <option key={item.id} value={item.fullName}>
                      {item.fullName}
                      {item.private ? " · private" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="mt-1 text-xs text-slate-500">
                Dự án chứa mã nguồn hoặc tài liệu cần phân tích.
              </p>
              {repositories.isSuccess &&
                !repositoryItems.length &&
                !chosenRepositoryKnown && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    Không tìm thấy repository. Kiểm tra quyền truy cập của token
                    trong Settings.
                  </p>
                )}
              {repositories.hasNextPage && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={repositories.isFetchingNextPage}
                  onClick={() => repositories.fetchNextPage()}
                >
                  {repositories.isFetchingNextPage
                    ? "Đang tải…"
                    : "Tải thêm repository"}
                </Button>
              )}
            </div>
            <div>
              <Field label="3. Branch">
                <Select
                  value={branchReady ? git.ref : ""}
                  disabled={!chosenRepositoryKnown || branches.isPending}
                  onChange={(event) =>
                    setGit({
                      ...git,
                      ref: event.target.value,
                      commitSha: "",
                      pullRequestNumber: "",
                      paths: "",
                    })
                  }
                >
                  <option value="">
                    {!canReadRepository
                      ? "Chọn repository trước"
                      : branches.isLoading
                        ? "Đang tải branch…"
                        : "Chọn branch"}
                  </option>
                  {chosenPull && !selectedBranch && (
                    <option value={chosenPull.headRef}>
                      {chosenPull.headRef} · Pull Request
                    </option>
                  )}
                  {(branches.data || []).map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="mt-1 text-xs text-slate-500">
                Phiên bản mã nguồn sẽ được phân tích.
              </p>
              {branches.isSuccess && !branches.data?.length && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  Repository chưa có branch để chọn.
                </p>
              )}
            </div>
            <div>
              <Field label="Commit (không bắt buộc)">
                <Select
                  value={git.commitSha}
                  disabled={!branchReady || commits.isPending}
                  onChange={(event) =>
                    setGit({
                      ...git,
                      commitSha: event.target.value,
                      pullRequestNumber: "",
                      paths: "",
                    })
                  }
                >
                  <option value="">Dùng commit mới nhất của branch</option>
                  {chosenPull && (
                    <option value={chosenPull.headSha}>
                      {chosenPull.headSha.slice(0, 8)} · Pull Request #
                      {chosenPull.number}
                    </option>
                  )}
                  {(commits.data || [])
                    .filter((item) => item.sha !== chosenPull?.headSha)
                    .map((item) => (
                      <option key={item.sha} value={item.sha}>
                        {item.sha.slice(0, 8)} · {item.message.split("\n")[0]}
                      </option>
                    ))}
                </Select>
              </Field>
              <p className="mt-1 text-xs text-slate-500">
                Để mặc định nếu không cần kiểm thử một commit cụ thể.
              </p>
            </div>
            <div>
              <Field label="Pull Request (không bắt buộc)">
                <Select
                  value={String(git.pullRequestNumber || "")}
                  disabled={!chosenRepositoryKnown || pulls.isPending}
                  onChange={(event) => choosePullRequest(event.target.value)}
                >
                  <option value="">Không chọn Pull Request</option>
                  {(pulls.data || []).map((item) => (
                    <option key={item.number} value={item.number}>
                      #{item.number} · {item.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="mt-1 text-xs text-slate-500">
                {pulls.isSuccess && !pulls.data?.length
                  ? "Không có Pull Request đang mở; có thể bỏ qua."
                  : "Chỉ chọn nếu muốn phân tích thay đổi trong Pull Request."}
              </p>
            </div>
          </div>
          <GitHubSourceSelector
            key={`${connected._id}:${git.repository}:${sourceRef}`}
            query={sourceFiles}
            ready={sourceReady}
            selectedPaths={selectedPaths}
            onChange={(paths) => {
              setConsentFingerprint("");
              setGit((current) => ({ ...current, paths: paths.join("\n") }));
            }}
          />
          {selectedPaths.length > 0 && (
            <label className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              <input
                type="checkbox"
                className="mt-1 accent-violet-700"
                checked={confirmed}
                disabled={!selectionValid}
                onChange={(event) =>
                  setConsentFingerprint(event.target.checked ? fingerprint : "")
                }
              />
              <span>
                Tôi cho phép gửi nội dung hoặc trích đoạn của các tệp đã chọn
                tới nhà cung cấp AI. Tôi đã kiểm tra quyền chia sẻ và thông tin
                bí mật. Tối đa 10.000 ký tự mỗi tệp và 100.000 ký tự tổng; tệp
                sau có thể không được đọc khi hết giới hạn.
              </span>
            </label>
          )}
          {error && (
            <div className="rounded-lg border border-rose-300 p-3 text-xs text-rose-700 dark:text-rose-200">
              <p>
                Không tải được một phần dữ liệu GitHub. Kiểm tra quyền
                repository hoặc thử lại.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  if (repositories.isError) repositories.refetch();
                  if (branches.isError) branches.refetch();
                  if (commits.isError) commits.refetch();
                  if (pulls.isError) pulls.refetch();
                }}
              >
                Thử tải lại
              </Button>
            </div>
          )}
        </>
      )}
      <Button
        disabled={
          !activeProject ||
          !profile.name ||
          !connected ||
          !chosenRepositoryKnown ||
          !branchReady ||
          branches.isError ||
          !selectionValid ||
          !confirmed ||
          analyzeGithub.isPending
        }
        onClick={() => analyzeGithub.mutate()}
      >
        <FileCode2 className="h-4 w-4" />
        {analyzeGithub.isPending
          ? "Đang phân tích…"
          : "Phân tích nguồn và tạo Profile"}
      </Button>
      <p className="text-xs text-slate-500">
        Sau khi phân tích, Profile và System Specification được lưu để dùng cho
        các bước tiếp theo.
      </p>
    </div>
  );
}
function ProfileRequired({ profiles, selectProfile }) {
  return (
    <EmptyState
      title="Chọn một System Profile trước"
      description="Profile giữ ngữ cảnh, môi trường và quyền truy cập cho toàn bộ luồng E2E."
      action={
        profiles?.data?.length ? (
          <Select
            value=""
            onChange={(event) => selectProfile?.(event.target.value)}
          >
            <option value="">Chọn System Profile</option>
            {profiles.data.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </Select>
        ) : null
      }
    />
  );
}
function ContextCard({ profile, label, items }) {
  return (
    <Card className="h-fit p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold">{profile.name}</p>
      <p className="mt-1 text-xs text-slate-500">
        {profile.baseUrl || "Chưa đặt Base URL"}
      </p>
      <dl className="mt-5 divide-y">
        {items.map(([name, value]) => (
          <div
            key={name}
            className="flex items-center justify-between py-3 text-sm"
          >
            <dt className="text-slate-500">{name}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
function ModeOption({
  active,
  disabled,
  icon: Icon,
  title,
  description,
  onClick,
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition ${active ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500 dark:bg-violet-950/30" : "hover:border-slate-300"} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <Icon className="h-4 w-4 text-violet-600" />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </button>
  );
}
function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <b className="text-danger"> *</b>}
      </span>
      {children}
    </label>
  );
}
