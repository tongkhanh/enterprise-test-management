/* eslint-disable no-unreachable */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  Library,
  Link2,
  GitBranch,
  Layers3,
  PlayCircle,
  Plus,
  Route,
  Settings2,
  Sparkles,
  TestTube2,
  UploadCloud,
} from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { DocumentQualityBadge, DocumentQualityNotice } from "@/components/common/DocumentQuality";
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
  secondaryActors: "",
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
const executionStepIds = new Set(["agile", "runtime", "automation", "execution", "result"]);

export default function E2EStudioPage({ defaultStep = "requirement" }) {
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const [project, setProject] = useState("");
  const ensuredScopeProject = useRef("");
  const [activeStep, setActiveStep] = useState(() => {
    const requestedStep = search.get("step");
    if (search.get("run") && !executionStepIds.has(requestedStep)) return "execution";
    if (workflowStepIds.has(requestedStep)) return requestedStep;
    return search.get("mode") === "github" ? "evidence" : defaultStep;
  });
  const [profile, setProfile] = useState(emptyProfile);
  const [profileEditor, setProfileEditor] = useState("create");
  const [profileMode, setProfileMode] = useState("SystemProfile");
  const [selectedProfile, setSelectedProfile] = useState(
    () => search.get("profile") || null,
  );
  const [useCase, setUseCase] = useState(blankUseCase);
  const [caseTarget, setCaseTarget] = useState({
    requirementId: "",
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
  const startWorkflowRun = useMutation({
    mutationFn: () => e2eApi.startWorkflowRun(activeProject),
    onSuccess: (result) => {
      qc.setQueryData(["system-profiles", activeProject], (current = []) => [result, ...current.filter((item) => item._id !== result._id)]);
      setSelectedProfile(result._id);
      setActiveStep("requirement");
      setCaseTarget({ requirementId: "", useCaseId: "", storyId: "", suiteId: "" });
      setUseCase(blankUseCase);
      toast.success(`Đã bắt đầu đợt ${result.workflow?.runNumber || "mới"}. Tài liệu cũ vẫn được giữ nguyên.`);
      qc.invalidateQueries({ queryKey: ["system-profiles", activeProject] });
    },
    onError: (error) => toast.error(error.message),
  });
  const updateWorkflowProgress = useMutation({
    mutationFn: (body) => {
      if (!currentProfile?._id) throw new Error("Phạm vi đang tải. Vui lòng thử lưu lại sau.");
      return e2eApi.updateWorkflowProgress(currentProfile._id, body);
    },
    onSuccess: (_, variables) => {
      if (!variables?.draft) qc.invalidateQueries({ queryKey: ["system-profiles", activeProject] });
    },
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
      String(item.e2e?.systemProfile?._id || item.e2e?.systemProfile || "") ===
        String(currentProfile?._id || ""),
  );
  const currentStories = (stories.data || []).filter(
    (item) =>
      String(item.e2e?.systemProfile?._id || item.e2e?.systemProfile || "") ===
      String(currentProfile?._id || ""),
  );
  const currentSuites = (suites.data || []).filter(
    (item) =>
      String(item.systemProfile?._id || item.systemProfile || "") ===
      String(currentProfile?._id || ""),
  );
  const scopedSuites = { ...suites, data: currentSuites };
  // Show every Project member so the Workspace Owner can be selected as the
  // documented fallback. The backend still enforces the approval policy.
  const reviewers = members.data || [];
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
          ? `Gemini đang quá tải: đã tạo ${result.length} Use Case nháp từ Requirement đã Baseline`
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
        secondaryActors: lines(useCase.secondaryActors),
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
    mutationFn: ({ id, reviewNote }) =>
      e2eApi.decideUseCase(id, {
        decision: "Approved",
        reviewNote,
      }),
    onSuccess: () => {
      toast.success("Đã duyệt Use Case");
      qc.invalidateQueries({ queryKey: ["use-cases"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const approveUseCases = useMutation({
    mutationFn: ({ ids, reviewNote }) => e2eApi.decideUseCasesBulk({ ids, decision: "Approved", reviewNote }),
    onSuccess: (result) => {
      const summary = result.summary || {};
      toast.success(`Đã duyệt ${summary.succeeded || 0}/${summary.requested || 0} Use Case.`);
      qc.invalidateQueries({ queryKey: ["use-cases"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const generateStory = useMutation({
    mutationFn: e2eApi.generateStory,
    onSuccess: (result) => {
      toast.success(
        result._e2eFallback
          ? "Gemini đang quá tải: đã tạo User Story nháp từ Use Case đã duyệt"
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
      toast.success("Đã gửi User Story để Business Owner xác nhận nghiệp vụ");
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
        systemProfile: currentProfile?._id || null,
      }),
    onSuccess: (result) => {
      setCaseTarget((item) => ({ ...item, suiteId: result._id }));
      toast.success("Đã tạo Test Suite E2E");
      qc.invalidateQueries({ queryKey: ["e2e-suites"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const generateCases = useMutation({
    mutationFn: async (request) => {
      const requestedTargets = Array.isArray(request) ? request : request?.targets;
      const fallbackTarget = caseTarget.requirementId ? { kind: "requirement", id: caseTarget.requirementId } : caseTarget.storyId ? { kind: "story", id: caseTarget.storyId } : { kind: "usecase", id: caseTarget.useCaseId };
      const targets = Array.isArray(requestedTargets) && requestedTargets.length ? requestedTargets : [fallbackTarget];
      const generated = [];
      const failures = [];
      for (const target of targets) {
        try {
          const plan = (plans.data || []).find((item) => {
            if (item.kind !== "TestPlan" || item.approvalStatus !== "Approved") return false;
            if (String(item.systemProfile?._id || item.systemProfile) !== String(currentProfile?._id)) return false;
            const ids = target.kind === "requirement" ? item.requirements : target.kind === "story" ? item.userStories : item.useCases;
            return (ids || []).some((id) => String(id?._id || id) === String(target.id));
          });
          if (!plan?._id) throw new Error("Không tìm thấy Test Plan đã duyệt chứa nguồn này.");
          const body = { testSuiteId: caseTarget.suiteId || undefined, testPlanId: plan._id, generationConfig: request?.generationConfig, references: request?.references, environmentContext: request?.environmentContext };
          const result = target.kind === "requirement" ? await e2eApi.generateCasesFromRequirement(target.id, body) : target.kind === "usecase" ? await e2eApi.generateCases(target.id, body) : await e2eApi.generateCasesFromStory(target.id, body);
          generated.push(...result);
        } catch (error) {
          failures.push({ ...target, message: error.message || "Không thể sinh Test Case." });
        }
      }
      return { generated, failures, requested: targets.length, succeeded: targets.length - failures.length };
    },
    onSuccess: (result) => {
      if (result.generated.length) toast.success(`Đã tạo ${result.generated.length} Test Case Draft từ ${result.succeeded}/${result.requested} nguồn.`);
      if (result.failures.length) toast.error(`${result.failures.length} nguồn chưa sinh được`, { description: result.failures.slice(0, 3).map((item) => item.message).join(" · ") });
      if (!result.generated.length && !result.failures.length) toast.info("Không còn nguồn nào cần sinh Test Case.");
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
    onSuccess: (_, variables) => {
      if (!variables?.silent) toast.success("Đã gửi Test Case cho QA review");
      qc.invalidateQueries({ queryKey: ["e2e-cases"] });
    },
    onError: (error, variables) => {
      if (!variables?.silent) toast.error(error.message);
    },
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
    setCaseTarget({ requirementId: "", useCaseId: "", storyId: "", suiteId: "" });
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
    setActiveStep(item.workflow?.lastStep || "requirement");
    setCaseTarget({ requirementId: "", useCaseId: "", storyId: "", suiteId: "" });
    setUseCase(blankUseCase);
  };
  useEffect(() => {
    if (currentProfile?._id) {
      setProfile(profileToForm(currentProfile));
      setProfileMode(currentProfile.mode || "SystemProfile");
      setProfileEditor("edit");
      if (!search.get("step")) setActiveStep(currentProfile.workflow?.lastStep || "requirement");
    }
  }, [currentProfile?._id]);
  useLayoutEffect(() => {
    const routeStep = search.get("step");
    if (workflowStepIds.has(routeStep) && routeStep !== activeStep) setActiveStep(routeStep);
  }, [location.search]);
  useEffect(() => {
    if (
      currentProfile?._id &&
      currentProfile.workflow?.status === "Active" &&
      activeStep !== "documents" &&
      workflowStepIds.has(activeStep) &&
      currentProfile.workflow?.lastStep !== activeStep &&
      !updateWorkflowProgress.isPending
    ) updateWorkflowProgress.mutate({ lastStep: activeStep });
  }, [activeStep, currentProfile?._id, currentProfile?.workflow?.status]);
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
    const targetPath = executionStepIds.has(activeStep) ? "/test-execution" : "/ai-generator";
    const nextSearch = `?${query.toString()}`;
    if (changed || location.pathname !== targetPath || location.search !== nextSearch)
      navigate({ pathname: targetPath, search: nextSearch, hash: location.hash }, { replace: true });
  }, [activeStep, activeProject, currentProfile?._id, location.pathname, location.search, location.hash, navigate]);
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
        startWorkflowRun,
        updateWorkflowProgress,
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
        approveUseCases,
        generateStory,
        currentStories,
        user,
        updateStory,
        submitStory,
        qaReviewStory,
        suites: scopedSuites,
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
  /* Legacy six-step workspace retained temporarily for migration reference.
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
  */
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
  approveUseCases,
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
        approveUseCases,
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
                      onClick={() => { const reviewNote = window.prompt("Ghi chú duyệt; nếu tự duyệt hãy nêu lý do Project không có Business Owner khác (tối thiểu 10 ký tự):"); if (reviewNote?.trim()) approveUseCase.mutate({ id: item._id, reviewNote: reviewNote.trim() }); }}
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
  approveUseCases,
  generateStory,
  download,
}) {
  const [selectedUseCaseIds, setSelectedUseCaseIds] = useState([]);
  const listedUseCases = useCases.data || [];
  const selectableUseCases = listedUseCases.filter((item) => item.status !== "Approved");
  const allUseCasesSelected = selectableUseCases.length > 0 && selectableUseCases.every((item) => selectedUseCaseIds.includes(item._id));
  const toggleUseCase = (id) => setSelectedUseCaseIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleAllUseCases = () => setSelectedUseCaseIds((current) => allUseCasesSelected ? current.filter((id) => !selectableUseCases.some((item) => item._id === id)) : [...new Set([...current, ...selectableUseCases.map((item) => item._id)])]);
  const approveSelectedUseCases = () => {
    if (!selectedUseCaseIds.length) return;
    if (!window.confirm(`Duyệt ${selectedUseCaseIds.length} Use Case đã chọn? Các mục không đạt Quality Gate sẽ được báo lỗi riêng.`)) return;
    const reviewNote = window.prompt("Ghi chú duyệt hàng loạt; nếu có mục tự duyệt hãy nêu lý do Project không có Business Owner khác (tối thiểu 10 ký tự):");
    if (reviewNote?.trim()) approveUseCases?.mutate({ ids: selectedUseCaseIds, reviewNote: reviewNote.trim() }, { onSuccess: () => setSelectedUseCaseIds([]) });
  };
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
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-2 dark:border-violet-900 dark:bg-violet-950/20"><label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200"><input type="checkbox" checked={allUseCasesSelected} onChange={toggleAllUseCases} disabled={!selectableUseCases.length} className="h-4 w-4 accent-violet-600" />Chọn các Use Case chưa duyệt</label>{selectedUseCaseIds.length > 0 && <div className="flex items-center gap-2"><span className="text-xs font-semibold text-violet-700 dark:text-violet-300">Đã chọn {selectedUseCaseIds.length}</span><Button size="sm" onClick={approveSelectedUseCases} disabled={approveUseCases?.isPending}><Check className="h-3.5 w-3.5" />{approveUseCases?.isPending ? "Đang duyệt…" : `Duyệt ${selectedUseCaseIds.length} mục`}</Button><button type="button" className="text-xs font-semibold text-slate-500 hover:text-violet-700" onClick={() => setSelectedUseCaseIds([])}>Bỏ chọn</button></div>}</div>
          {(useCases.data || []).map((item) => (
            <article key={item._id} className="rounded-xl border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <input type="checkbox" aria-label={`Chọn ${item.code || item.name}`} checked={selectedUseCaseIds.includes(item._id)} disabled={item.status === "Approved"} onChange={() => toggleUseCase(item._id)} className="mt-1 h-4 w-4 shrink-0 accent-violet-600" />
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
                </div>
                <div className="flex shrink-0 gap-2">
                  {item.status !== "Approved" ? (
                    <Button
                      size="sm"
                      onClick={() => { const reviewNote = window.prompt("Ghi chú duyệt; nếu tự duyệt hãy nêu lý do Project không có Business Owner khác (tối thiểu 10 ký tự):"); if (reviewNote?.trim()) approveUseCase.mutate({ id: item._id, reviewNote: reviewNote.trim() }); }}
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
  updateStory,
  submitStory,
  qaReviewStory,
  download,
}) {
  const [open, setOpen] = useState(false);
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
            <Badge tone={item.businessApprovalStatus === "BusinessConfirmed" ? "green" : item.businessApprovalStatus === "BusinessRejected" ? "red" : item.businessApprovalStatus === "PendingBusinessConfirmation" ? "amber" : "slate"}>Nghiệp vụ: {item.businessApprovalStatus === "BusinessConfirmed" ? "đã xác nhận" : item.businessApprovalStatus === "PendingBusinessConfirmation" ? "chờ Business Owner" : item.businessApprovalStatus === "BusinessRejected" ? "từ chối" : "chưa xác nhận"}</Badge>
            <Badge tone={item.qaTestabilityStatus === "Testable" ? "green" : item.qaTestabilityStatus === "NeedsClarification" ? "amber" : "slate"}>QA: {item.qaTestabilityStatus === "Testable" ? "có thể test" : item.qaTestabilityStatus === "NeedsClarification" ? "cần làm rõ" : "chưa rà soát"}</Badge>
            <DocumentQualityBadge quality={item.quality} />
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
            <DocumentQualityNotice quality={item.quality} action="gửi duyệt User Story" />
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
                {item.businessApprovalStatus === "BusinessConfirmed" ? <><Button variant="outline" disabled={invalid || qaReviewStory?.isPending} onClick={() => { const reviewNote = window.prompt("Nội dung QA cần Business Owner làm rõ:"); if (reviewNote?.trim()) qaReviewStory?.mutate({ id: item._id, decision: "NeedsClarification", reviewNote }) }}>QA yêu cầu làm rõ</Button><Button disabled={invalid || qaReviewStory?.isPending} onClick={() => { const reviewNote = window.prompt("Ghi chú xác nhận; nếu tự duyệt hãy nêu lý do Project không có QA khác (tối thiểu 10 ký tự):"); if (reviewNote?.trim()) qaReviewStory?.mutate({ id: item._id, decision: "Testable", reviewNote: reviewNote.trim() }); }}><Check className="h-4 w-4" />QA xác nhận có thể test</Button></> : <Button disabled={invalid || updateStory.isPending || submitStory.isPending || item.businessApprovalStatus === "PendingBusinessConfirmation"} onClick={() => submitStory.mutate({ id: item._id, body: body() })}><Check className="h-4 w-4" />{item.businessApprovalStatus === "PendingBusinessConfirmation" ? "Đang chờ Business Owner" : "Gửi Business Owner xác nhận"}</Button>}
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
  requirements,
  currentStories,
  designPlan,
  caseTarget,
  setCaseTarget,
  generateCases,
  currentCases,
  reviewers,
  user,
  editCase,
  submitCase,
  download,
  setActiveStep,
}) {
  const [generationMode, setGenerationMode] = useState(() => (caseTarget?.requirementId || caseTarget?.storyId || caseTarget?.useCaseId) ? "single" : "uncovered");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [generationConfig, setGenerationConfig] = useState({ generationMode: "logic", polarity: "both", detailLevel: "Standard", techniques: ["Equivalence Partitioning", "Boundary Value Analysis"], includeSecurity: false, includeAccessibility: false });
  const [reference, setReference] = useState({ type: "", title: "", url: "", version: "", notes: "" });
  const [references, setReferences] = useState([]);
  const [referenceMode, setReferenceMode] = useState("upload");
  const [selectedLibraryReferenceId, setSelectedLibraryReferenceId] = useState("");
  const technicalReferenceInputRef = useRef(null);
  const sourceSelectionRef = useRef(null);
  const [environmentContext, setEnvironmentContext] = useState({ applicationType: "", browsers: "", operatingSystems: "", devices: "", technicalConstraints: "" });
  const [planDetailTab, setPlanDetailTab] = useState("scope");
  const projectId = currentProfile?.project?._id || currentProfile?.project || "";
  const technicalReferencesQuery = useQuery({ queryKey: ["technical-references", projectId, currentProfile?._id], queryFn: () => e2eApi.technicalReferences(projectId, currentProfile?._id), enabled: Boolean(projectId && currentProfile?._id) });
  const attachReference = (item) => setReferences((current) => current.some((entry) => String(entry._id || "") === String(item._id || "") || (entry.type === item.type && entry.url && entry.url === item.url)) ? current : [...current, item]);
  const resetReferenceDraft = () => setReference({ type: "", title: "", url: "", version: "", notes: "" });
  const uploadTechnicalReference = useMutation({
    mutationFn: (file) => e2eApi.uploadTechnicalReference(projectId, currentProfile?._id, reference, file),
    onSuccess: (item) => { attachReference(item); resetReferenceDraft(); technicalReferencesQuery.refetch(); toast.success("Đã tải và gắn tài liệu kỹ thuật cho lần sinh này."); },
    onError: (error) => toast.error("Không thể tải tài liệu kỹ thuật", { description: error.message }),
  });
  const createTechnicalReferenceLink = useMutation({
    mutationFn: () => e2eApi.createTechnicalReferenceLink({ project: projectId, systemProfile: currentProfile?._id, type: reference.type, title: reference.title, version: reference.version, url: reference.url }),
    onSuccess: (item) => { attachReference(item); resetReferenceDraft(); technicalReferencesQuery.refetch(); toast.success("Đã kiểm tra và gắn liên kết tài liệu."); },
    onError: (error) => toast.error("Không thể thêm liên kết", { description: error.message }),
  });
  if (!currentProfile) return <ProfileRequired />;
  const approvedUseCases = (useCases.data || []).filter(
    (item) => item.status === "Approved",
  );
  const approvedRequirements = (requirements?.data || []).filter((item) => item.status === "Baselined");
  const approvedStories = currentStories.filter((item) => item.approvalStatus === "Approved" && item.businessApprovalStatus === "BusinessConfirmed" && item.qaTestabilityStatus === "Testable");
  const selectedBasis = caseTarget.requirementId ? `requirement:${caseTarget.requirementId}` : caseTarget.storyId ? `story:${caseTarget.storyId}` : caseTarget.useCaseId ? `usecase:${caseTarget.useCaseId}` : "";
  const planHas = (field, id) => (designPlan?.[field] || []).some((value) => String(value?._id || value) === String(id));
  const plannedRequirements = approvedRequirements.filter((item) => planHas("requirements", item._id));
  const plannedStories = approvedStories.filter((item) => planHas("userStories", item._id));
  const plannedUseCases = approvedUseCases.filter((item) => planHas("useCases", item._id));
  const featureFor = (kind, item) => {
    if (kind === "requirement") return item.scope?.name || item.title || "Chưa phân nhóm";
    if (kind === "usecase") return item.scope || item.name || "Chưa phân nhóm";
    const linkedUseCaseId = item.e2e?.useCase || item.e2e?.useCases?.[0];
    const linkedUseCase = plannedUseCases.find((entry) => String(entry._id) === String(linkedUseCaseId));
    const linkedRequirementId = item.parentRequirements?.[0]?._id || item.parentRequirements?.[0] || item.e2e?.requirements?.[0]?._id || item.e2e?.requirements?.[0];
    const linkedRequirement = plannedRequirements.find((entry) => String(entry._id) === String(linkedRequirementId));
    return linkedUseCase?.scope || linkedUseCase?.name || linkedRequirement?.scope?.name || item.labels?.[0] || item.title || "Chưa phân nhóm";
  };
  const basisEntries = [
    ...plannedRequirements.map((item) => ({ kind: "requirement", id: item._id, item, label: `Requirement · ${item.requirementId} · ${item.title}`, group: featureFor("requirement", item) })),
    ...plannedStories.map((item) => ({ kind: "story", id: item._id, item, label: `User Story · ${item.externalReference?.externalId ? `${item.externalReference.externalId} · ` : ""}${item.title}`, group: featureFor("story", item) })),
    ...plannedUseCases.map((item) => ({ kind: "usecase", id: item._id, item, label: `Use Case · ${item.code} · ${item.name}`, group: featureFor("usecase", item) })),
  ];
  const compactTargets = (entries) => {
    const selected = []; const represented = new Set();
    entries.filter((entry) => entry.kind === "usecase").forEach((entry) => { selected.push(entry); represented.add(String(entry.id)); (entry.item.requirements || []).forEach((value) => represented.add(String(value?._id || value))); (entry.item.userStories || []).forEach((value) => represented.add(String(value?._id || value))); });
    entries.filter((entry) => entry.kind === "story" && !represented.has(String(entry.id))).forEach((entry) => { selected.push(entry); represented.add(String(entry.id)); [...(entry.item.parentRequirements || []), ...(entry.item.e2e?.requirements || [])].forEach((value) => represented.add(String(value?._id || value))); });
    entries.filter((entry) => entry.kind === "requirement" && !represented.has(String(entry.id))).forEach((entry) => selected.push(entry));
    return selected.map(({ kind, id }) => ({ kind, id }));
  };
  const groups = [...new Set(basisEntries.map((entry) => entry.group))].sort((left, right) => left.localeCompare(right, "vi"));
  const coverageKey = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase("vi").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const basisCriteria = (entry) => entry.kind === "requirement"
    ? (entry.item.acceptanceCriteria || []).map((item) => String(item?.criteria || item || "").trim()).filter(Boolean)
    : entry.kind === "story"
      ? (entry.item.acceptanceCriteria || []).map((item) => String(item?.criteria || item || "").trim()).filter(Boolean)
      : ((entry.item.postconditions || []).length ? entry.item.postconditions : entry.item.mainFlow || []).map((item) => String(item || "").trim()).filter(Boolean);
  const caseBasisIds = (item) => [item.primaryTestBasis?.basisId, ...(item.linkedRequirements || []), ...(item.e2e?.requirements || []), ...(item.linkedUserStories || []), item.userStory, ...(item.linkedUseCases || []), item.e2e?.useCase].map((value) => String(value?._id || value || "")).filter(Boolean);
  const caseCoverageText = (item) => coverageKey([...(item.coverageItems || item.storyCoverage || []), item.title, item.objective, item.description, ...(item.testSteps || []).flatMap((step) => [step.action, step.expectedResult])].filter(Boolean).join(" "));
  const covered = new Set(basisEntries.filter((entry) => {
    const relatedCases = currentCases.filter((item) => caseBasisIds(item).includes(String(entry.id)));
    if (!relatedCases.length) return false;
    const criteria = basisCriteria(entry);
    if (!criteria.length) return true;
    return criteria.every((criterion) => relatedCases.some((item) => caseCoverageText(item).includes(coverageKey(criterion))));
  }).map((entry) => String(entry.id)));
  const singleTargets = selectedBasis ? [{ kind: selectedBasis.split(":")[0], id: selectedBasis.split(":")[1] }] : [];
  const generationTargets = generationMode === "single" ? singleTargets : generationMode === "feature" ? compactTargets(basisEntries.filter((entry) => entry.group === selectedGroup)) : compactTargets(basisEntries.filter((entry) => !covered.has(String(entry.id))));
  const validSelection = Boolean(
    (caseTarget.requirementId && approvedRequirements.some((item) => item._id === caseTarget.requirementId) && planHas("requirements", caseTarget.requirementId)) ||
    (caseTarget.storyId && approvedStories.some((item) => item._id === caseTarget.storyId) && planHas("userStories", caseTarget.storyId)) ||
    (caseTarget.useCaseId && approvedUseCases.some((item) => item._id === caseTarget.useCaseId) && planHas("useCases", caseTarget.useCaseId)),
  );
  const generationSelectionReady = generationMode === "single" ? validSelection : generationTargets.length > 0;
  const generationBlockedReason = generationMode === "single"
    ? (!selectedBasis ? "Bạn chưa chọn nguồn chính trong Test Plan." : !validSelection ? "Nguồn đã chọn không còn hợp lệ hoặc chưa được xác nhận trong Test Plan." : "")
    : generationMode === "feature"
      ? (!selectedGroup ? "Bạn chưa chọn nhóm chức năng cần sinh Test Case." : !generationTargets.length ? "Nhóm chức năng này không có Test Basis hợp lệ trong Test Plan." : "")
      : (!generationTargets.length ? "Tất cả Test Basis trong Test Plan đã có Test Case truy vết." : "");
  const requestCaseGeneration = () => {
    if (!generationSelectionReady) {
      sourceSelectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      toast.error("Chưa thể sinh Test Case", { description: generationBlockedReason });
      return;
    }
    generateCases.mutate({ targets: generationTargets, generationConfig: { ...generationConfig, scopeMode: generationMode }, references, environmentContext: { applicationType: environmentContext.applicationType, browsers: lines(environmentContext.browsers), operatingSystems: lines(environmentContext.operatingSystems), devices: lines(environmentContext.devices), technicalConstraints: environmentContext.technicalConstraints } });
  };
  const planTestTypes = designPlan?.testTypes || [];
  const planTypeText = planTestTypes.join(" ").toLocaleLowerCase("vi");
  const requiredReferenceGroups = [
    { active: /(^|\W)ui(\W|$)|user interface|giao diện/.test(planTypeText), type: "UI", accepted: ["Figma/Wireframe", "UI Image"], label: "Figma/wireframe hoặc ảnh giao diện" },
    { active: /(^|\W)api(\W|$)|web service|rest|graphql/.test(planTypeText), type: "API", accepted: ["OpenAPI/Postman"], label: "OpenAPI hoặc Postman" },
    { active: /database|(^|\W)db(\W|$)|data integrity|cơ sở dữ liệu/.test(planTypeText), type: "Database", accepted: ["Database Schema"], label: "Database schema" },
    { active: /integration|interface|tích hợp/.test(planTypeText), type: "Integration", accepted: ["Architecture", "BPMN/Flowchart", "OpenAPI/Postman"], label: "đặc tả interface hoặc architecture" },
    { active: generationConfig.includeSecurity, type: "Security", accepted: ["Regulation/Standard", "Architecture"], label: "tiêu chuẩn bảo mật hoặc architecture" },
    { active: generationConfig.includeAccessibility, type: "Accessibility", accepted: ["Regulation/Standard", "Figma/Wireframe"], label: "tiêu chuẩn accessibility hoặc thiết kế UI" },
  ].filter((item) => item.active);
  const referenceTypes = new Set(references.map((item) => item.type));
  const missingReferenceGroups = requiredReferenceGroups.filter((group) => !group.accepted.some((type) => referenceTypes.has(type)));
  const withTechnicalContext = generationConfig.generationMode === "technicalContext";
  const technicalContextProvided = Object.values(environmentContext).some((value) => String(value || "").trim());
  const readinessBlocked = false;
  const readinessHasAssumptions = missingReferenceGroups.length > 0 || (withTechnicalContext && !technicalContextProvided);
  const readiness = readinessBlocked
    ? { title: "Thiếu dữ liệu quan trọng", tone: "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-100" }
    : readinessHasAssumptions
      ? { title: "Có thể sinh nhưng còn giả định", tone: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100" }
      : { title: "Đủ dữ liệu", tone: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100" };
  const inheritedPlanStats = [
    { label: "Test level", value: (designPlan?.testLevels || []).length },
    { label: "Test type", value: planTestTypes.length },
    { label: "Coverage", value: (designPlan?.coverageTargets || []).length },
    { label: "Product risk", value: (designPlan?.risks || []).length + (designPlan?.riskMatrix || []).length },
  ];
  const planRisks = [
    ...(designPlan?.risks || []).map((item) => ({ ...item, source: "Risk" })),
    ...(designPlan?.riskMatrix || []).map((item) => ({ ...item, source: "Risk matrix" })),
  ];
  const planDetailTabs = [
    { id: "scope", label: "Phạm vi" },
    { id: "levels", label: `Test level (${(designPlan?.testLevels || []).length})` },
    { id: "types", label: `Test type (${planTestTypes.length})` },
    { id: "coverage", label: `Coverage (${(designPlan?.coverageTargets || []).length})` },
    { id: "risks", label: `Rủi ro (${planRisks.length})` },
  ];
  const recentCases = [...currentCases].sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0)).slice(0, 5);
  const exportGroups = [...currentCases.reduce((groupsMap, item) => {
    const group = String(item.module || item.feature || item.primaryTestBasis?.title || item.e2e?.useCase?.scope || item.e2e?.useCase?.name || item.e2e?.requirements?.[0]?.scope?.name || item.e2e?.requirements?.[0]?.title || item.userStory?.labels?.[0] || item.userStory?.title || "Chưa phân nhóm").trim();
    groupsMap.set(group, (groupsMap.get(group) || 0) + 1);
    return groupsMap;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right, "vi"));
  const caseLibraryUrl = `/documents?${new URLSearchParams({ project: String(projectId || ""), profile: String(currentProfile._id || ""), type: "Test Case" }).toString()}`;
  return (
    <Card className="p-5">
      <SectionTitle
        title="Thiết kế Test Case"
        description="Chọn một nguồn chính, một nhóm chức năng của Project hoặc toàn bộ phần chưa có coverage. Hệ thống tự bổ sung các Requirement, User Story và Use Case đã liên kết."
      />
      <div ref={sourceSelectionRef} className="mt-5 scroll-mt-24 rounded-xl bg-slate-50 p-4 dark:bg-slate-900">
        <div className="grid gap-2 sm:grid-cols-3">
          {[["uncovered", "Toàn bộ nguồn chưa bao phủ", "Một lần sinh cho tất cả Test Basis chưa có Test Case"], ["feature", "Một nhóm chức năng", "Sinh hàng loạt theo module/feature thực tế"], ["single", "Một nguồn cụ thể", "Thiết kế hoặc bổ sung riêng một nguồn chính"]].map(([value, title, description]) => <button key={value} type="button" onClick={() => setGenerationMode(value)} className={`rounded-xl border p-3 text-left transition ${generationMode === value ? "border-violet-500 bg-violet-50 ring-1 ring-violet-200 dark:bg-violet-950/30" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"}`}><span className="flex items-center justify-between gap-2 text-sm font-semibold">{title}{value === "uncovered" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Khuyến nghị</span>}</span><span className="mt-1 block text-xs text-slate-500">{description}</span></button>)}
        </div>
        {generationMode === "single" && <div className={`mt-4 rounded-xl border p-3 ${!selectedBasis ? "border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20" : "border-transparent"}`}><Field label="Nguồn chính trong Test Plan *">
          <Select value={selectedBasis} onChange={(event) => { const [kind, id = ""] = event.target.value.split(":"); setCaseTarget({ requirementId: kind === "requirement" ? id : "", storyId: kind === "story" ? id : "", useCaseId: kind === "usecase" ? id : "", suiteId: "" }); }}>
            <option value="">Chọn Requirement, User Story hoặc Use Case</option>
            {basisEntries.map((entry) => <option key={`${entry.kind}-${entry.id}`} value={`${entry.kind}:${entry.id}`}>{entry.label}</option>)}
          </Select>
        </Field>{!selectedBasis && <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">Chọn một Requirement, User Story hoặc Use Case đã được xác nhận để làm phạm vi chính.</p>}</div>}
        {generationMode === "feature" && <div className="mt-4"><Field label="Nhóm chức năng được suy ra từ tài liệu Project"><Select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)}><option value="">Chọn nhóm chức năng</option>{groups.map((group) => <option key={group} value={group}>{group} · {basisEntries.filter((entry) => entry.group === group).length} test basis</option>)}</Select></Field></div>}
        {generationMode === "uncovered" && <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-100"><p><strong>{generationTargets.length}</strong>/{basisEntries.length} Test Basis trong Test Plan chưa có Test Case truy vết.</p><p className="mt-1 text-xs leading-5">Chỉ cần bấm một lần. Hệ thống lần lượt xử lý toàn bộ nguồn, vẫn giữ nguồn chính và traceability riêng cho từng bộ Test Case; một nguồn lỗi không làm dừng các nguồn còn lại.</p></div>}
        <p className="mt-2 text-xs text-slate-500">Mỗi lần xử lý vẫn có một nguồn chính. Requirement, User Story và Use Case liên quan được tự động đưa vào làm ngữ cảnh bổ sung và lưu traceability nhiều-nhiều.</p>
        <details className="group mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="font-semibold text-emerald-900 dark:text-emerald-100">Đã kế thừa Test Plan được duyệt</p><p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">AI tự áp dụng phạm vi, loại kiểm thử, coverage và rủi ro.</p></div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">{inheritedPlanStats.map((item) => <span key={item.label} className="rounded-full border border-emerald-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{item.label}: {item.value}</span>)}<span className="ml-1 text-xs font-semibold text-emerald-700 group-open:hidden dark:text-emerald-300">Xem chi tiết ▾</span><span className="ml-1 hidden text-xs font-semibold text-emerald-700 group-open:inline dark:text-emerald-300">Thu gọn ▴</span></div>
          </summary>
          <div className="border-t border-emerald-200 p-4 dark:border-emerald-900">
            <div className="flex gap-2 overflow-x-auto pb-2">{planDetailTabs.map((tab) => <button key={tab.id} type="button" onClick={(event) => { event.preventDefault(); setPlanDetailTab(tab.id); }} className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold transition ${planDetailTab === tab.id ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-200 bg-white text-emerald-800 hover:border-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>{tab.label}</button>)}</div>
            <div className="mt-3 rounded-xl border border-emerald-100 bg-white/80 p-4 text-sm text-slate-800 dark:border-emerald-900 dark:bg-slate-950/30 dark:text-slate-100">
              {planDetailTab === "scope" && <div className="space-y-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phạm vi kiểm thử</p><p className="mt-1 whitespace-pre-wrap leading-6">{designPlan?.scope || "Chưa khai báo"}</p></div>{(designPlan?.outOfScope || []).length > 0 && <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ngoài phạm vi</p><div className="mt-2 space-y-2">{designPlan.outOfScope.map((item, index) => <div key={`${item}-${index}`} className="rounded-lg border border-slate-200 px-3 py-2 leading-5 dark:border-slate-700"><span className="mr-2 font-semibold text-emerald-700 dark:text-emerald-300">{index + 1}.</span>{item}</div>)}</div></div>}</div>}
              {planDetailTab === "levels" && <div><p className="mb-3 text-xs text-slate-500">Các cấp kiểm thử được Test Plan phê duyệt.</p><div className="flex flex-wrap gap-2">{(designPlan?.testLevels || []).length ? designPlan.testLevels.map((item, index) => <span key={`${item}-${index}`} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">{item}</span>) : <span>Chưa khai báo</span>}</div></div>}
              {planDetailTab === "types" && <div><p className="mb-3 text-xs text-slate-500">Toàn bộ loại kiểm thử AI phải tuân theo khi thiết kế Test Case.</p><div className="flex flex-wrap gap-2">{planTestTypes.length ? planTestTypes.map((item, index) => <span key={`${item}-${index}`} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100">{item}</span>) : <span>Chưa khai báo</span>}</div></div>}
              {planDetailTab === "coverage" && <div><p className="mb-3 text-xs text-slate-500">Mỗi mục tiêu được giữ nguyên nội dung từ Test Plan đã duyệt.</p><div className="space-y-2">{(designPlan?.coverageTargets || []).length ? designPlan.coverageTargets.map((item, index) => <div key={`${item}-${index}`} className="grid grid-cols-[2rem_1fr] gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 leading-6 dark:border-amber-900 dark:bg-amber-950/20"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800 dark:bg-amber-900 dark:text-amber-100">{index + 1}</span><p className="whitespace-pre-wrap">{item}</p></div>) : <span>Chưa khai báo</span>}</div></div>}
              {planDetailTab === "risks" && <div><p className="mb-3 text-xs text-slate-500">Rủi ro, tác động, phương án giảm thiểu và người phụ trách được hiển thị đầy đủ nếu Test Plan có khai báo.</p><div className="space-y-3">{planRisks.length ? planRisks.map((item, index) => <article key={`${item.risk}-${index}`} className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-900 dark:bg-rose-950/20"><div className="flex items-start gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-800 dark:bg-rose-900 dark:text-rose-100">{index + 1}</span><div className="min-w-0"><p className="font-semibold leading-6">{item.risk || "Chưa ghi tên rủi ro"}</p><div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">{item.impact && <p><strong>Tác động:</strong> {item.impact}</p>}{item.mitigation && <p><strong>Giảm thiểu:</strong> {item.mitigation}</p>}{item.owner && <p><strong>Phụ trách:</strong> {item.owner}</p>}</div></div></div></article>) : <span>Chưa khai báo</span>}</div></div>}
            </div>
          </div>
        </details>
        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Cấu hình sinh, môi trường và tài liệu tham chiếu</summary>
          <div className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-700">
            <section className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900 dark:bg-violet-950/20">
              <p className="text-sm font-semibold text-violet-950 dark:text-violet-100">1. Chọn loại Test Case cần tạo</p>
              <p className="mt-1 text-xs text-violet-700 dark:text-violet-300">Hai lựa chọn tạo cùng cấu trúc Test Case manual; điểm khác nhau là mức bằng chứng thực tế được gắn vào tài liệu.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <button type="button" onClick={() => setGenerationConfig((current) => ({ ...current, generationMode: "logic" }))} className={`rounded-xl border p-4 text-left transition ${!withTechnicalContext ? "border-violet-600 bg-white shadow-sm ring-2 ring-violet-200 dark:bg-violet-950/40" : "border-violet-200 bg-white/60 hover:border-violet-400 dark:border-violet-900 dark:bg-slate-950/30"}`}><div className="flex items-start gap-3"><span className={`rounded-lg p-2 ${!withTechnicalContext ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"}`}><FileCheck2 className="h-5 w-5" /></span><div><p className="font-semibold">Chỉ dùng Test Basis và Test Plan</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Tạo Test Case nghiệp vụ để rà soát. Yêu cầu môi trường được kế thừa từ Test Plan; chưa cấu hình môi trường thực thi.</p><p className="mt-2 text-xs font-medium text-violet-700 dark:text-violet-300">Phù hợp cho thiết kế chức năng và nghiệp vụ.</p></div></div></button>
                <button type="button" onClick={() => setGenerationConfig((current) => ({ ...current, generationMode: "technicalContext" }))} className={`rounded-xl border p-4 text-left transition ${withTechnicalContext ? "border-emerald-600 bg-white shadow-sm ring-2 ring-emerald-200 dark:bg-emerald-950/40" : "border-emerald-200 bg-white/60 hover:border-emerald-400 dark:border-emerald-900 dark:bg-slate-950/30"}`}><div className="flex items-start gap-3"><span className={`rounded-lg p-2 ${withTechnicalContext ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}><Settings2 className="h-5 w-5" /></span><div><p className="font-semibold">Bổ sung bối cảnh kỹ thuật</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Khai báo loại ứng dụng, trình duyệt, hệ điều hành, thiết bị và ràng buộc để AI thiết kế sát nền tảng hơn. Không gắn Environment Profile.</p><p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">Environment Profile chỉ được chọn ở bước thực thi.</p></div></div></button>
              </div>
            </section>
            <section className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900 dark:bg-sky-950/20">
              <p className="text-sm font-semibold text-sky-950 dark:text-sky-100">2. Cách AI thiết kế Test Case</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2"><Field label="Positive / Negative"><Select value={generationConfig.polarity} onChange={(event) => setGenerationConfig((current) => ({ ...current, polarity: event.target.value }))}><option value="both">Cả positive và negative</option><option value="positive">Chỉ positive</option><option value="negative">Chỉ negative</option></Select></Field><Field label="Mức chi tiết"><Select value={generationConfig.detailLevel} onChange={(event) => setGenerationConfig((current) => ({ ...current, detailLevel: event.target.value }))}><option>Scenario</option><option>Standard</option><option>Detailed</option></Select></Field></div>
              <div className="mt-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Kỹ thuật kiểm thử</p><span className="text-xs text-sky-700 dark:text-sky-300">Đã chọn {generationConfig.techniques.length}/6 · có thể chọn nhiều</span></div><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{["Equivalence Partitioning", "Boundary Value Analysis", "Decision Table", "State Transition", "Use Case testing", "Error Guessing"].map((item) => { const selected = generationConfig.techniques.includes(item); return <button key={item} type="button" aria-pressed={selected} onClick={() => setGenerationConfig((current) => ({ ...current, techniques: selected ? current.techniques.filter((value) => value !== item) : [...current.techniques, item] }))} className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${selected ? "border-sky-600 bg-sky-600 font-semibold text-white shadow-sm" : "border-sky-200 bg-white/70 text-slate-700 hover:border-sky-400 dark:border-sky-900 dark:bg-slate-950/30 dark:text-slate-200"}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded border text-xs ${selected ? "border-white/60 bg-white/20" : "border-slate-300"}`}>{selected ? "✓" : ""}</span>{item}</button>; })}</div></div>
            </section>
            <div className="space-y-4">
              <section className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900 dark:bg-rose-950/20"><p className="text-sm font-semibold text-rose-950 dark:text-rose-100">3. Phạm vi chuyên biệt</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${generationConfig.includeSecurity ? "border-rose-500 bg-white shadow-sm dark:bg-rose-950/30" : "border-rose-200 bg-white/60 dark:border-rose-900 dark:bg-slate-950/20"}`}><input className="mt-0.5" type="checkbox" checked={generationConfig.includeSecurity} onChange={(event) => setGenerationConfig((current) => ({ ...current, includeSecurity: event.target.checked }))} /><span><strong>Security</strong><span className="mt-1 block text-xs leading-5 text-slate-500">Bổ sung kiểm thử bảo mật khi Test Plan có phạm vi và tài liệu cung cấp bằng chứng phù hợp.</span></span></label><label className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${generationConfig.includeAccessibility ? "border-rose-500 bg-white shadow-sm dark:bg-rose-950/30" : "border-rose-200 bg-white/60 dark:border-rose-900 dark:bg-slate-950/20"}`}><input className="mt-0.5" type="checkbox" checked={generationConfig.includeAccessibility} onChange={(event) => setGenerationConfig((current) => ({ ...current, includeAccessibility: event.target.checked }))} /><span><strong>Accessibility</strong><span className="mt-1 block text-xs leading-5 text-slate-500">Bổ sung kiểm thử khả năng tiếp cận khi Test Plan có phạm vi và tiêu chuẩn liên quan.</span></span></label></div></section>
              <section className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
                <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">4. Yêu cầu và bối cảnh kỹ thuật</p>
                <p className="mt-1 text-xs leading-5 text-emerald-700 dark:text-emerald-300">Không chọn Environment Profile tại bước thiết kế. Test Plan đã cung cấp yêu cầu chung; các trường dưới đây chỉ bổ sung đặc điểm cần dùng để thiết kế Test Case.</p>
                {withTechnicalContext ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl border border-emerald-200 bg-white/80 p-3 dark:border-emerald-900 dark:bg-slate-950/30">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Nền tảng cần kiểm thử</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Chọn một loại nếu đã xác định; có thể bỏ chọn để AI chỉ dựa trên Test Basis và Test Plan.</p>
                        </div>
                        {environmentContext.applicationType && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Đã chọn 1 nền tảng</span>}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                        {["Web", "Mobile Web", "Mobile App", "API / Service", "Desktop", "Hybrid", "Khác"].map((applicationType) => {
                          const isSelected = environmentContext.applicationType === applicationType;
                          return (
                            <button
                              key={applicationType}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => setEnvironmentContext((current) => ({ ...current, applicationType: isSelected ? "" : applicationType }))}
                              className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition ${isSelected ? "border-emerald-600 bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-200 dark:ring-emerald-900" : "border-slate-200 bg-white text-slate-700 hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-700"}`}
                            >
                              <span className="flex items-center justify-center gap-1.5">{isSelected && <CheckCircle2 className="h-4 w-4" />}{applicationType}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ma trận tương thích</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Mỗi dòng là một giá trị. Chỉ khai báo những cấu hình có căn cứ.</p>
                        </div>
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">3 nhóm độc lập</span>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-950/30">
                          <Field label="Trình duyệt">
                            <Textarea className="min-h-28 resize-y" rows={4} value={environmentContext.browsers} onChange={(event) => setEnvironmentContext((current) => ({ ...current, browsers: event.target.value }))} placeholder="Chrome 130&#10;Firefox 132&#10;Safari 18" />
                          </Field>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-950/30">
                          <Field label="Hệ điều hành">
                            <Textarea className="min-h-28 resize-y" rows={4} value={environmentContext.operatingSystems} onChange={(event) => setEnvironmentContext((current) => ({ ...current, operatingSystems: event.target.value }))} placeholder="Windows 11&#10;Android 15&#10;iOS 18" />
                          </Field>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-950/30">
                          <Field label="Thiết bị / viewport">
                            <Textarea className="min-h-28 resize-y" rows={4} value={environmentContext.devices} onChange={(event) => setEnvironmentContext((current) => ({ ...current, devices: event.target.value }))} placeholder="Desktop 1440×900&#10;iPhone 15&#10;Pixel 8" />
                          </Field>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-emerald-200 bg-white/80 p-3 dark:border-emerald-900 dark:bg-slate-950/30">
                      <Field label="Ràng buộc kỹ thuật cần xét">
                        <Textarea className="min-h-24 resize-y" rows={3} value={environmentContext.technicalConstraints} onChange={(event) => setEnvironmentContext((current) => ({ ...current, technicalConstraints: event.target.value }))} placeholder="Ví dụ: giới hạn mạng, dependency, dữ liệu, cấu hình hoặc điều kiện tích hợp có bằng chứng" />
                      </Field>
                      <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Không nhập giả định. Chi tiết chưa có bằng chứng sẽ được AI đánh dấu “Cần xác nhận”.</p>
                    </div>
                  </div>
                ) : <div className="mt-3 rounded-lg border border-emerald-200 bg-white/70 p-3 text-xs leading-5 text-slate-600 dark:border-emerald-900 dark:bg-slate-950/30 dark:text-slate-300">Đang dùng yêu cầu môi trường từ Test Plan. Chọn “Bổ sung bối cảnh kỹ thuật” nếu cần khai báo chi tiết nền tảng tại lần sinh này.</div>}
              </section>
            </div>
            <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20">
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">5. Tài liệu kỹ thuật dùng cho lần sinh này</p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Tải tệp là lựa chọn mặc định. Liên kết và tài liệu trong thư viện chỉ được dùng khi hệ thống truy cập được; tất cả đều là bằng chứng bổ sung, không thay thế Test Basis.</p>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  ["upload", "Tải tệp lên", "Đọc trực tiếp nội dung", UploadCloud],
                  ["link", "Dán liên kết", "Figma, Swagger, wiki…", Link2],
                  ["library", "Chọn từ thư viện", "Dùng lại đúng phiên bản", Library],
                ].map(([mode, label, description, Icon]) => (
                  <button key={mode} type="button" onClick={() => setReferenceMode(mode)} className={`rounded-xl border p-3 text-left transition ${referenceMode === mode ? "border-amber-500 bg-white shadow-sm ring-2 ring-amber-200 dark:bg-amber-950/40" : "border-amber-200 bg-white/60 hover:border-amber-400 dark:border-amber-900 dark:bg-slate-950/20"}`}>
                    <span className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-amber-700" />{label}</span>
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{description}</span>
                  </button>
                ))}
              </div>

              {referenceMode !== "library" && <div className="mt-4 rounded-xl border border-amber-200 bg-white/75 p-3 dark:border-amber-900 dark:bg-slate-950/30">
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Loại tài liệu *"><Select value={reference.type} onChange={(event) => setReference((current) => ({ ...current, type: event.target.value }))}><option value="">Chọn loại tài liệu</option>{["Figma/Wireframe", "UI Image", "BPMN/Flowchart", "OpenAPI/Postman", "Database Schema", "Architecture", "User Manual", "Regulation/Standard", "Repository Snapshot"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
                  <Field label="Tên tài liệu"><Input value={reference.title} onChange={(event) => setReference((current) => ({ ...current, title: event.target.value }))} placeholder="Ví dụ: OpenAPI Checkout" /></Field>
                  <Field label="Phiên bản"><Input value={reference.version} onChange={(event) => setReference((current) => ({ ...current, version: event.target.value }))} placeholder="Ví dụ: v2.1" /></Field>
                </div>
                {referenceMode === "upload" ? <div className="mt-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-4 text-center dark:border-amber-800 dark:bg-amber-950/20">
                  <input ref={technicalReferenceInputRef} className="hidden" type="file" accept=".pdf,.doc,.docx,.xlsx,.json,.yaml,.yml,.txt,.md,.sql,.csv,.png,.jpg,.jpeg,.webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadTechnicalReference.mutate(file); event.target.value = ""; }} />
                  <UploadCloud className="mx-auto h-6 w-6 text-amber-700" />
                  <p className="mt-2 text-sm font-semibold">Chọn tài liệu từ máy</p>
                  <p className="mt-1 text-xs text-slate-500">Tối đa 10 MB · tài liệu, đặc tả, schema hoặc ảnh giao diện.</p>
                  <Button className="mt-3" size="sm" variant="outline" disabled={!reference.type || uploadTechnicalReference.isPending} onClick={() => technicalReferenceInputRef.current?.click()}>{uploadTechnicalReference.isPending ? "Đang tải và phân tích…" : "Chọn tệp"}</Button>
                </div> : <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input value={reference.url} onChange={(event) => setReference((current) => ({ ...current, url: event.target.value }))} placeholder="https://figma.com/… hoặc https://api.example.com/openapi.json" /><Button size="sm" variant="outline" disabled={!reference.type || !reference.url.trim() || createTechnicalReferenceLink.isPending} onClick={() => createTechnicalReferenceLink.mutate()}>{createTechnicalReferenceLink.isPending ? "Đang kiểm tra…" : "Kiểm tra và thêm"}</Button></div>}
              </div>}

              {referenceMode === "library" && <div className="mt-4 rounded-xl border border-amber-200 bg-white/75 p-3 dark:border-amber-900 dark:bg-slate-950/30">
                <Field label="Tài liệu kỹ thuật đã lưu trong Project">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Select value={selectedLibraryReferenceId} onChange={(event) => setSelectedLibraryReferenceId(event.target.value)} disabled={technicalReferencesQuery.isLoading}>
                      <option value="">{technicalReferencesQuery.isLoading ? "Đang tải thư viện…" : "Chọn tài liệu và phiên bản"}</option>
                      {(technicalReferencesQuery.data || []).map((item) => <option key={item._id} value={item._id}>{item.type} · {item.title}{item.version ? ` · ${item.version}` : ""}</option>)}
                    </Select>
                    <Button size="sm" variant="outline" disabled={!selectedLibraryReferenceId} onClick={() => { const item = (technicalReferencesQuery.data || []).find((entry) => String(entry._id) === selectedLibraryReferenceId); if (item) { attachReference(item); setSelectedLibraryReferenceId(""); } }}>Gắn vào lần sinh</Button>
                  </div>
                </Field>
                {!technicalReferencesQuery.isLoading && !(technicalReferencesQuery.data || []).length && <p className="mt-2 text-xs text-slate-500">Thư viện chưa có tài liệu kỹ thuật. Hãy tải tệp hoặc thêm liên kết trước.</p>}
              </div>}

              {references.length > 0 && <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Đang dùng cho lần sinh này · {references.length}</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{references.map((item, index) => <div key={`${item._id || item.type}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-xs dark:border-amber-900 dark:bg-slate-950/30"><span className="min-w-0"><strong>{item.type}</strong><span className="block truncate text-slate-500">{item.title || item.url}{item.version ? ` · ${item.version}` : ""} · {item.sourceMode === "File" ? "Tệp đã tải" : item.sourceMode === "URL" ? "Liên kết" : "Thư viện"}</span></span><button type="button" className="shrink-0 font-semibold text-rose-600" onClick={() => setReferences((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Bỏ gắn</button></div>)}</div></div>}
            </section>
          </div>
        </details>
        <div className={`mt-4 rounded-xl border p-3 text-sm ${readiness.tone}`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{readiness.title}</span><span className="rounded-full border border-current/20 bg-white/60 px-2 py-0.5 text-xs">{withTechnicalContext ? "Có bối cảnh kỹ thuật" : "Test Basis + Test Plan"}</span>{missingReferenceGroups.map((item) => <span key={item.type} className="rounded-full border border-current/20 bg-white/60 px-2 py-0.5 text-xs">Thiếu {item.type}</span>)}</div>{readinessHasAssumptions && <details className="group w-full"><summary className="mt-1 cursor-pointer list-none text-right text-xs font-semibold underline underline-offset-2"><span className="group-open:hidden">Xem chi tiết</span><span className="hidden group-open:inline">Thu gọn</span></summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{withTechnicalContext && !technicalContextProvided && <div className="rounded-lg border border-current/15 bg-white/60 p-3 text-xs leading-5 dark:bg-slate-950/20"><p className="font-semibold">Bối cảnh kỹ thuật</p><p className="mt-1">Chưa khai báo thành phần kỹ thuật. AI vẫn có thể thiết kế từ Test Basis và Test Plan nhưng phải đánh dấu những chi tiết chưa có bằng chứng là “Cần xác nhận”.</p></div>}{missingReferenceGroups.map((item) => <div key={item.type} className="rounded-lg border border-current/15 bg-white/60 p-3 text-xs leading-5 dark:bg-slate-950/20"><p className="font-semibold">{item.type} Test Case</p><p className="mt-1">Cần bổ sung {item.label}. Nếu chưa có tài liệu này, AI không được suy đoán chi tiết kỹ thuật và kết quả sinh phải được đánh dấu “Cần xác nhận”.</p></div>)}</div></details>}</div>
          {!readinessHasAssumptions && <p className="mt-1 text-xs opacity-80">Đủ dữ liệu cho mục tiêu đầu ra đã chọn.</p>}
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-950/30">
          {!generationSelectionReady && <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><span className="font-bold">Còn thiếu:</span><span>{generationBlockedReason}</span></div>}
          <div className="flex flex-wrap gap-2">
          <Button
            disabled={generateCases.isPending || readinessBlocked}
            onClick={requestCaseGeneration}
          >
            <Sparkles className="h-4 w-4" />
            {generateCases.isPending ? "Đang sinh…" : !generationSelectionReady ? (generationMode === "single" ? "Chọn nguồn chính để sinh" : "Hoàn tất lựa chọn để sinh") : `Sinh Test Case${generationMode === "single" ? "" : ` cho ${generationTargets.length} nguồn`}`}
          </Button>
          <Button variant="outline" onClick={() => setActiveStep("plan")}>Kiểm tra phạm vi Test Plan</Button>
          </div>
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
        <div className="mt-7 border-t border-slate-200 pt-5 dark:border-slate-700"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">Test Case đã lưu</p><p className="mt-1 text-xs text-slate-500">Hiển thị 5 mục cập nhật gần nhất; quản lý toàn bộ trong Thư viện tài liệu.</p></div><Button asChild><Link to={caseLibraryUrl}>Mở Thư viện Test Case <ArrowRight className="h-4 w-4" /></Link></Button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-2xl font-bold">{currentCases.length}</p><p className="mt-1 text-xs text-slate-500">Tổng Test Case</p></div><div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20"><p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{currentCases.filter((item) => ["Draft", "NeedsReview", "Rejected"].includes(item.status)).length}</p><p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Cần rà soát</p></div><div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"><p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{currentCases.filter((item) => item.status === "Approved").length}</p><p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Đã duyệt</p></div></div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900 dark:bg-violet-950/20">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Xuất một workbook Excel theo nhóm chức năng</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Không phụ thuộc Test Case được sinh riêng lẻ hay hàng loạt. Hệ thống sẽ gom {currentCases.length} Test Case thành một file, gồm {exportGroups.length} sheet chức năng và các sheet tổng hợp/truy vết.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">{exportGroups.map(([group, count]) => <span key={group} className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-medium text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200">{group} · {count} TC</span>)}</div>
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
            Tải 1 Excel theo nhóm
          </Button>
        </div></div>
      )}
      <div className="mt-5 space-y-4">
        {recentCases.map((item) => (
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
                  onClick={() => { const reviewNote = window.prompt("Ghi chú duyệt; nếu tự duyệt hãy nêu lý do Project không có QA khác (tối thiểu 10 ký tự):"); if (reviewNote?.trim()) approvePlan.mutate({ id: item._id, reviewNote: reviewNote.trim() }); }}
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
