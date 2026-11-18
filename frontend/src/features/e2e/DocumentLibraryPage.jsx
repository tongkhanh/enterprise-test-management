import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BookOpenCheck, ChevronLeft, ChevronRight, Download, ExternalLink, FileStack, FileUp, RotateCcw, Search, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { catalogApi, e2eApi, executionApi, requirementApi, testCaseApi, workspaceApi } from "@/api/client";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { PageHeader } from "@/components/common/PageKit";
import { DocumentQualityBadge } from "@/components/common/DocumentQuality";
import RequirementLibraryPage from "./RequirementLibraryPage";
import { UseCaseDiagram } from "./QAWorkflow";

const documentTypes = ["Requirement", "Change Request", "User Story", "Use Case", "Test Plan", "Test Case"];
const stepByType = { Requirement: "requirement", "Change Request": "requirement", "Use Case": "usecase", "User Story": "story", "Test Plan": "plan", "Test Case": "testcase" };
const toneByStatus = { Draft: "slate", PendingApproval: "amber", Approved: "green", Rejected: "red", Baselined: "green", NeedsReview: "amber", Changed: "amber", Active: "blue", Ready: "blue", Deprecated: "red" };

const idOf = (value) => String(value?._id || value || "");
const dateKey = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};
const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  return !date || Number.isNaN(date.getTime()) ? "Chưa có dữ liệu" : date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
};
const dateHeading = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Không rõ ngày";
  return date.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
};
const list = (value) => Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
const approvalExceptionOf = (item) => item?.approvalException || item?.qaApprovalException || item?.businessApprovalException;
const ApprovalExceptionBadge = ({ item }) => {
  const exception = approvalExceptionOf(item);
  if (exception?.mode === "SelfApproval") return <Badge tone="amber">Tự duyệt · ngoại lệ dự án nhỏ</Badge>;
  if (exception?.mode === "OwnerFallback") return <Badge tone="blue">Workspace Owner duyệt thay</Badge>;
  return null;
};

function originFor(type, item) {
  if (["Requirement", "Change Request"].includes(type)) return item.source?.type === "ImportedCustomerDocument" ? ["Tài liệu khách hàng", "blue"] : [item.source?.title || "Nguồn yêu cầu", "slate"];
  if (type === "Use Case") return item.origin === "AIProfile" ? ["Dẫn xuất AI từ Requirement", "purple"] : item.origin === "ImportedDocument" ? ["Tài liệu Use Case nguồn", "blue"] : item.origin === "Manual" ? ["Use Case nhập tay", "slate"] : ["Chưa xác định", "amber"];
  if (type === "User Story") return item.source === "AI" ? ["AI", "purple"] : item.source === "GitHub" ? ["GitHub", "blue"] : item.source === "ImportedDocument" ? ["Tài liệu User Story", "blue"] : ["Thủ công", "slate"];
  if (type === "Test Plan") return item.origin === "AI" ? ["AI", "purple"] : item.origin === "Rule" ? ["Quy tắc hệ thống", "blue"] : item.origin === "Board" ? ["Test Board", "blue"] : [item.origin === "Manual" ? "Thủ công" : "Chưa ghi nhận", item.origin === "Manual" ? "slate" : "amber"];
  if (type === "Test Suite") return item.origin === "SystemE2E" ? ["Tự tạo E2E", "blue"] : item.origin === "Imported" ? ["Nhập dữ liệu", "blue"] : ["Thủ công", "slate"];
  const labels = { SystemE2E: "AI E2E từ Profile", UserStory: "AI từ User Story", UserStoryAndWeb: "AI từ User Story & Web", Manual: "Thủ công" };
  return [labels[item.generatedFrom] || "Chưa ghi nhận", item.generatedFrom === "Manual" ? "slate" : item.generatedFrom ? "purple" : "amber"];
}

function makeRecord(type, item) {
  const titles = {
    Requirement: `${item.requirementId || "Requirement"} · ${item.title || "Chưa đặt tên"}`,
    "Change Request": `${item.requirementId || "Change Request"} · ${item.title || "Chưa đặt tên"}`,
    "Use Case": `${item.code || "Use Case"} · ${item.name || "Chưa đặt tên"}`,
    "User Story": `${item.externalReference?.externalId || "User Story"} · ${item.title || "Chưa đặt tên"}`,
    "Test Plan": `${item.planId || "Test Plan"} · ${item.name || "Chưa đặt tên"}`,
    "Test Suite": item.name || "Test Suite chưa đặt tên",
    "Test Case": `${item.testCaseId || "Test Case"} · ${item.title || "Chưa đặt tên"}`,
  };
  const descriptions = { Requirement: item.description || item.objective, "Change Request": item.description || item.objective, "Use Case": item.summary, "User Story": item.description || item.businessValue, "Test Plan": item.description || item.scope, "Test Case": item.objective || item.description };
  const statuses = { Requirement: item.status, "Change Request": item.status, "Use Case": item.status, "User Story": item.approvalStatus || item.status, "Test Plan": item.approvalStatus || item.status, "Test Case": item.status };
  const [origin, originTone] = originFor(type, item);
  return { id: item._id, type, title: titles[type], description: descriptions[type] || "Chưa có mô tả", status: statuses[type] || "Draft", origin, originTone, item };
}

function DetailList({ title, value, ordered = false, showEmpty = false }) {
  const values = list(value).map((entry) => typeof entry === "object" ? entry.criteria || entry.action || entry.risk || JSON.stringify(entry) : String(entry));
  if (!values.length) return showEmpty ? <section><h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h4><p className="mt-2 rounded-lg border border-dashed border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">Chưa có dữ liệu · cần bổ sung trước khi duyệt.</p></section> : null;
  const Tag = ordered ? "ol" : "ul";
  return <section><h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h4><Tag className={`${ordered ? "list-decimal" : "list-disc"} mt-2 space-y-1.5 pl-5 text-sm leading-6 text-slate-700 dark:text-slate-200`}>{values.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</Tag></section>;
}

function UseCaseLibraryDetail({ item }) {
  const [activeTab, setActiveTab] = useState("specification");
  const tabs = [["specification", "Đặc tả & luồng"], ["diagram", "Sơ đồ Use Case"], ["traceability", "Truy vết & bổ sung"]];
  return <div>
    <nav className="sticky top-0 z-10 -mx-5 -mt-5 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-950/95" aria-label="Nội dung Use Case">
      {tabs.map(([key, label]) => <button key={key} type="button" onClick={() => setActiveTab(key)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${activeTab === key ? "bg-violet-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>{label}</button>)}
    </nav>
    {activeTab === "specification" && <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2"><DetailText title="Mô tả tóm tắt" value={item.summary} showEmpty /><DetailText title="Trigger / Điều kiện kích hoạt" value={item.trigger} showEmpty /></div>
      <MetaGrid values={[["ID", item.code], ["Actor chính", item.actor], ["Mức độ ưu tiên", item.risk], ["Phạm vi", item.scope]]} />
      <div className="grid gap-x-8 gap-y-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700 md:grid-cols-2"><DetailList title="Actor phụ" value={item.secondaryActors} showEmpty /><DetailList title="Pre-conditions / Tiền điều kiện" value={item.preconditions} showEmpty /><DetailList title="Post-conditions / Hậu điều kiện" value={item.postconditions} showEmpty /><DetailList title="Business Rules" value={item.businessRules} showEmpty /></div>
      <DetailList title="Basic Flow / Luồng chính" value={item.mainFlow} ordered showEmpty />
      <DetailList title="Luồng thay thế" value={item.alternateFlows} ordered showEmpty />
      <DetailList title="Mô tả luồng lỗi / ngoại lệ" value={item.exceptionFlows} ordered showEmpty />
    </div>}
    {activeTab === "diagram" && <UseCaseDiagram item={item} />}
    {activeTab === "traceability" && <div className="space-y-5"><DetailList title="Requirement nguồn" value={item.requirements?.map((entry) => entry?.requirementId ? `${entry.requirementId} · ${entry.title || ""}` : idOf(entry))} /><DetailList title="Giả định" value={item.assumptions} /><DetailList title="Phụ thuộc" value={item.dependencies} /><DetailList title="Yêu cầu đặc biệt" value={item.specialRequirements} /></div>}
  </div>;
}

function UseCaseSupplementWorkspace({ profileId, refresh }) {
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState({});
  const analyze = useMutation({
    mutationFn: (file) => e2eApi.supplementUseCasesDocument(profileId, file),
    onSuccess: (value) => { const defaults = {}; (value.proposals || []).forEach((proposal, index) => proposal.changes?.forEach((change) => { defaults[`${index}-${change.field}`] = Boolean(change.safeDefault); })); setSelected(defaults); setResult(value); toast.success(value.message || "Đã tạo đề xuất từ tài liệu."); },
    onError: (error) => toast.error(error.message || "Không thể phân tích tài liệu."),
  });
  const apply = useMutation({
    mutationFn: ({ proposal, index }) => e2eApi.applyUseCaseSupplement(proposal.targetUseCaseId, { patch: Object.fromEntries((proposal.changes || []).filter((change) => selected[`${index}-${change.field}`]).map((change) => [change.field, change.proposed])), source: result?.source }),
    onSuccess: () => { toast.success("Đã cập nhật Use Case và đánh dấu cần rà soát lại."); setResult(null); refresh?.(); },
    onError: (error) => toast.error(error.message || "Không thể áp dụng đề xuất."),
  });
  const create = useMutation({
    mutationFn: (proposal) => e2eApi.createUseCaseFromSupplement(profileId, { patch: proposal.patch, source: result?.source }),
    onSuccess: () => { toast.success("Đã tạo Use Case nháp mới."); refresh?.(); },
    onError: (error) => toast.error(error.message || "Không thể tạo Use Case mới."),
  });
  return <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/20"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Bổ sung thông tin / phát hiện Use Case mới</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Tải một tài liệu để đối chiếu với toàn bộ Use Case trong đợt này. AI có thể đề xuất cập nhật nhiều Use Case và tách các hành trình mới; chưa có dữ liệu nào bị đổi tự động.</p></div><label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700"><FileUp className="mr-2 h-4 w-4" />{analyze.isPending ? "Đang phân tích…" : "Tải tài liệu bổ sung"}<input className="hidden" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={analyze.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) analyze.mutate(file); event.target.value = ""; }} /></label></div>{result && <div className="mt-4 space-y-3 border-t border-sky-200 pt-4 dark:border-sky-800"><p className="text-xs font-semibold">{result.proposals?.length || 0} đề xuất từ {result.source?.fileName || "tài liệu"}</p>{(result.proposals || []).map((proposal, index) => <div key={`${proposal.targetUseCaseId || "new"}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">{proposal.targetCode || "Use Case mới"} · {proposal.targetName || "Cần QA xác nhận"}</p><p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{proposal.kind === "update" ? "Cập nhật Use Case hiện có" : proposal.kind === "new" ? "Use Case mới phát hiện" : "Mâu thuẫn — cần QA xác nhận"}</p></div>{proposal.kind === "new" ? <Button size="sm" disabled={create.isPending || !proposal.patch?.name || !proposal.patch?.actor} onClick={() => create.mutate(proposal)}>Tạo Use Case nháp</Button> : <Button size="sm" disabled={apply.isPending || !(proposal.changes || []).some((change) => selected[`${index}-${change.field}`])} onClick={() => apply.mutate({ proposal, index })}>Áp dụng mục đã chọn</Button>}</div>{proposal.kind !== "new" && <div className="mt-2 space-y-2">{(proposal.changes || []).map((change) => <label key={change.field} className="flex cursor-pointer gap-2 rounded border border-slate-200 p-2 text-xs dark:border-slate-700"><input type="checkbox" className="mt-0.5 accent-violet-600" checked={Boolean(selected[`${index}-${change.field}`])} onChange={(event) => setSelected((current) => ({ ...current, [`${index}-${change.field}`]: event.target.checked }))} /><span><strong className="capitalize">{change.field.replace(/([A-Z])/g, " $1")}</strong><span className="mt-1 block text-slate-500">Hiện tại: {Array.isArray(change.current) ? change.current.join(" · ") || "—" : change.current || "—"}</span><span className="block font-medium text-violet-700 dark:text-violet-300">Đề xuất: {Array.isArray(change.proposed) ? change.proposed.join(" · ") : change.proposed}</span></span></label>)}</div>}{proposal.evidence?.length > 0 && <p className="mt-2 text-xs text-slate-500">Căn cứ: {proposal.evidence.join(" · ")}</p>}</div>)}</div>}</div>;
}

function DocumentDetail({ record, profileId, refresh }) {
  const item = record.item;
  if (["Requirement", "Change Request"].includes(record.type)) return <div className="space-y-5"><DetailText title="Mô tả" value={item.description} /><DetailText title="Mục tiêu nghiệp vụ" value={item.objective} /><MetaGrid values={[["Phiên bản", item.source?.version], ["Revision", item.revision], ["Loại", item.type]]} /><DetailList title="Actor / vai trò" value={item.actors} /><DetailList title="Trong phạm vi" value={item.inScope} /><DetailList title="Acceptance Criteria" value={item.acceptanceCriteria} ordered /><DetailList title="Business Rules" value={item.businessRules} /><DetailList title="Tham chiếu" value={item.references?.map((entry) => `${entry.category} · ${entry.role}: ${entry.title || entry.value}`)} /><DetailList title="Rủi ro" value={item.risks} /></div>;
  if (record.type === "Use Case") return <><UseCaseSupplementWorkspace profileId={profileId} refresh={refresh} /><UseCaseLibraryDetail item={item} /></>;
  if (record.type === "User Story") return <div className="space-y-5"><DetailText title="Mô tả" value={item.description} /><DetailText title="Giá trị nghiệp vụ" value={item.businessValue} /><MetaGrid values={[["Ưu tiên", item.priority], ["Story point", item.storyPoints], ["QA testability", item.qaTestabilityStatus]]} /><DetailList title="Acceptance Criteria" value={item.acceptanceCriteria} ordered /><DetailList title="Definition of Done" value={item.definitionOfDone || item.e2e?.definitionOfDone} /><DetailList title="Phụ thuộc" value={item.dependencies || item.e2e?.dependencies} /></div>;
  if (record.type === "Test Plan") return <div className="space-y-5"><DetailText title="Mô tả" value={item.description} /><DetailText title="Phạm vi" value={item.scope} /><DetailText title="Chiến lược kiểm thử" value={item.testStrategy} /><MetaGrid values={[["Loại kế hoạch", item.kind], ["Cấp độ", item.planLevel], ["Môi trường", item.environment]]} /><DetailList title="Mục tiêu" value={item.objectives} /><DetailList title="Đầu vào" value={item.entryCriteria} /><DetailList title="Điều kiện hoàn tất" value={item.exitCriteria} /></div>;
  if (record.type === "Test Suite") return <div className="space-y-5"><DetailText title="Mô tả" value={item.description} /><MetaGrid values={[["Nguồn", item.origin], ["Thứ tự", item.order], ["Suite cha", item.parentSuite?.name || idOf(item.parentSuite) || "Thư mục gốc"]]} /></div>;
  return <div className="space-y-5"><DetailText title="Mục tiêu" value={item.objective} /><DetailText title="Mô tả" value={item.description} /><MetaGrid values={[["Ưu tiên", item.priority], ["Loại", item.type], ["Thời gian dự kiến", item.estimatedTime ? `${item.estimatedTime} phút` : "Chưa đặt"]]} /><DetailText title="Tiền điều kiện" value={item.preconditions} /><DetailText title="Hậu điều kiện" value={item.postconditions} /><section><h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Các bước kiểm thử</h4><div className="mt-2 space-y-2">{list(item.testSteps).map((step, index) => <div key={index} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"><p className="font-semibold">{step.stepNumber || index + 1}. {step.action}</p><p className="mt-1 text-emerald-700 dark:text-emerald-300">Mong đợi: {step.expectedResult}</p></div>)}</div></section></div>;
}

function DetailText({ title, value, showEmpty = false }) {
  if (!value && !showEmpty) return null;
  return <section><h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h4><p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${value ? "text-slate-700 dark:text-slate-200" : "rounded-lg border border-dashed border-amber-200 bg-amber-50/60 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200"}`}>{value || "Chưa có dữ liệu · cần bổ sung trước khi duyệt."}</p></section>;
}

function MetaGrid({ values }) {
  return <div className="grid gap-2 sm:grid-cols-3">{values.map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900"><p className="text-[11px] font-bold uppercase text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold">{value || "Chưa có dữ liệu"}</p></div>)}</div>;
}

export default function DocumentLibraryPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [origin, setOrigin] = useState("All");
  const [dateField, setDateField] = useState("updated");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [testCaseReviewer, setTestCaseReviewer] = useState("");
  const [testCaseReviewNote, setTestCaseReviewNote] = useState("");
  const projects = useQuery({ queryKey: ["projects"], queryFn: workspaceApi.projects });
  const projectId = params.get("project") || projects.data?.[0]?._id || "";
  const projectMembers = useQuery({ queryKey: ["document-library-members", projectId], queryFn: () => catalogApi.members(projectId), enabled: Boolean(projectId) });
  const profiles = useQuery({ queryKey: ["system-profiles", projectId], queryFn: () => e2eApi.profiles(projectId), enabled: Boolean(projectId) });
  const requestedProfile = params.get("profile") || "";
  const profile = (profiles.data || []).find((item) => item._id === requestedProfile) || (profiles.data || [])[0];
  const type = documentTypes.includes(params.get("type")) ? params.get("type") : "All";
  const requirementGovernance = ["Requirement", "Change Request"].includes(type) && params.get("mode") === "governance";
  const requirements = useQuery({ queryKey: ["e2e-requirements", projectId, profile?._id], queryFn: () => e2eApi.requirements(profile?._id), enabled: Boolean(profile?._id) });
  const useCases = useQuery({ queryKey: ["use-cases", projectId, profile?._id], queryFn: () => e2eApi.useCases(projectId, profile?._id), enabled: Boolean(profile?._id) });
  const stories = useQuery({ queryKey: ["document-library-stories", projectId], queryFn: () => catalogApi.allStories(projectId), enabled: Boolean(projectId) });
  const plans = useQuery({ queryKey: ["document-library-plans", projectId], queryFn: () => executionApi.allPlans(projectId), enabled: Boolean(projectId) });
  const cases = useQuery({ queryKey: ["document-library-cases", projectId], queryFn: () => testCaseApi.listAll(projectId), enabled: Boolean(projectId) });
  const profileId = idOf(profile);
  const batchArtifactType = type === "Use Case" ? "UseCase" : ["Requirement", "Change Request"].includes(type) ? "Requirement" : "";
  const importBatches = useQuery({ queryKey: ["document-import-batches", profileId, batchArtifactType], queryFn: () => e2eApi.importBatches(profileId, batchArtifactType), enabled: Boolean(profileId && batchArtifactType) });
  const latestImportBatch = importBatches.data?.[0];
  const rollbackImport = useMutation({
    mutationFn: (id) => e2eApi.rollbackImportBatch(id),
    onSuccess: (result) => {
      toast.success(result.mode === "Deleted" ? `Đã xóa an toàn ${result.artifactCount} bản nháp từ lần nhập sai.` : `Có tài liệu đã được tham chiếu; đã chuyển ${result.artifactCount} mục sang Retired và giữ lịch sử.`);
      importBatches.refetch(); requirements.refetch(); useCases.refetch(); setSelectedIds([]); setSelected(null);
    },
    onError: (error) => toast.error(error.message || "Không thể hoàn tác lần nhập."),
  });
  const bulkApprove = useMutation({
    mutationFn: ({ documentType, ids }) => ["Requirement", "Change Request"].includes(documentType)
      ? e2eApi.decideRequirementsBulk({ ids, decision: "Baselined", reviewNote: window.prompt("Ghi chú Baseline; nếu tự duyệt hãy nêu rõ lý do:") || "" })
      : documentType === "User Story"
        ? requirementApi.submitApprovalsBulk({ ids })
        : e2eApi.decideUseCasesBulk({ ids, decision: "Approved", reviewNote: window.prompt("Ghi chú duyệt Use Case; nếu tự duyệt hãy nêu rõ lý do:") || "" }),
    onSuccess: (result) => {
      const summary = result.summary || {};
      const succeeded = summary.succeeded || 0;
      const failed = summary.failed || 0;
      if (failed) toast.warning(`Đã xử lý ${succeeded}/${summary.requested || 0} tài liệu; ${failed} mục chưa đạt Quality Gate.`);
      else toast.success(`Đã xử lý thành công ${succeeded}/${summary.requested || 0} tài liệu.`);
      requirements.refetch(); useCases.refetch(); stories.refetch(); setSelectedIds([]);
    },
    onError: (error) => toast.error(error.message || "Không thể duyệt tài liệu."),
  });
  const bulkSubmitTestCases = useMutation({
    mutationFn: async ({ ids, reviewer, reviewNote }) => {
      const results = await Promise.allSettled(ids.map((id) => testCaseApi.submitReview(id, { reviewer, reviewNote })));
      const failedResults = results.filter((result) => result.status === "rejected");
      return {
        requested: ids.length,
        succeeded: results.length - failedResults.length,
        failed: failedResults.length,
        firstError: failedResults[0]?.reason?.message || "",
        failedIds: ids.filter((_, index) => results[index].status === "rejected"),
      };
    },
    onSuccess: (result) => {
      if (result.failed) {
        toast.error(`Đã gửi ${result.succeeded}/${result.requested} Test Case; ${result.failed} mục chưa gửi được${result.firstError ? `: ${result.firstError}` : "."}`);
        setSelectedIds(result.failedIds);
      } else {
        toast.success(`Đã gửi ${result.succeeded} Test Case cho QA duyệt.`);
        setSelectedIds([]);
        setTestCaseReviewNote("");
      }
      cases.refetch();
    },
    onError: (error) => toast.error(error.message || "Không thể gửi Test Case cho QA duyệt."),
  });
  const records = useMemo(() => [
    ...(requirements.data || []).map((item) => makeRecord(item.type === "ChangeRequest" ? "Change Request" : "Requirement", item)),
    ...(useCases.data || []).map((item) => makeRecord("Use Case", item)),
    ...(stories.data || []).filter((item) => idOf(item.e2e?.systemProfile) === profileId).map((item) => makeRecord("User Story", item)),
    ...(plans.data || []).filter((item) => idOf(item.systemProfile) === profileId).map((item) => makeRecord("Test Plan", item)),
    ...(cases.data || []).filter((item) => idOf(item.e2e?.systemProfile) === profileId).map((item) => makeRecord("Test Case", item)),
  ], [requirements.data, useCases.data, stories.data, plans.data, cases.data, profileId]);
  const counts = Object.fromEntries(documentTypes.map((name) => [name, records.filter((record) => record.type === name).length]));
  const origins = [...new Set(records.map((record) => record.origin))].sort();
  const statuses = [...new Set(records.map((record) => record.status))].sort();
  const filtered = records.filter((record) => {
    const term = query.trim().toLocaleLowerCase("vi");
    const valueDate = dateField === "created" ? record.item.createdAt : (record.item.updatedAt || record.item.createdAt);
    const key = dateKey(valueDate);
    return (type === "All" || record.type === type) && (status === "All" || record.status === status) && (origin === "All" || record.origin === origin) && (!dateFrom || key >= dateFrom) && (!dateTo || key <= dateTo) && (!term || [record.title, record.description, record.item.actor, record.item.createdBy?.fullName].some((value) => String(value || "").toLocaleLowerCase("vi").includes(term)));
  }).sort((left, right) => new Date((dateField === "created" ? right.item.createdAt : right.item.updatedAt) || 0) - new Date((dateField === "created" ? left.item.createdAt : left.item.updatedAt) || 0));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const setContext = (changes) => { const next = new URLSearchParams(params); Object.entries(changes).forEach(([key, value]) => value && value !== "All" ? next.set(key, value) : next.delete(key)); setParams(next); setPage(1); setSelected(null); setSelectedIds([]); setTestCaseReviewer(""); setTestCaseReviewNote(""); };
  const bulkType = ["Requirement", "Change Request", "Use Case", "User Story", "Test Case"].includes(type) ? type : "";
  const isSelectable = (record) => record.type === bulkType && (
    bulkType === "Test Case"
      ? record.status === "Draft"
      : bulkType === "User Story"
        ? ["Draft", "Rejected"].includes(record.status)
        : !["Approved", "Baselined"].includes(record.status)
  );
  const selectableVisible = visible.filter(isSelectable);
  const allVisibleSelected = Boolean(selectableVisible.length) && selectableVisible.every((record) => selectedIds.includes(record.id));
  const toggleSelected = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleVisible = () => setSelectedIds((current) => allVisibleSelected ? current.filter((id) => !selectableVisible.some((record) => record.id === id)) : [...new Set([...current, ...selectableVisible.map((record) => record.id)])]);
  const approveSelected = () => {
    if (!bulkType || !selectedIds.length) return;
    if (bulkType === "Test Case") {
      if (!testCaseReviewer) return toast.error("Hãy chọn QA reviewer trước khi gửi Test Case.");
      if (testCaseReviewNote.trim().length < 10) return toast.error("Ghi chú gửi duyệt cần ít nhất 10 ký tự.");
      if (window.confirm(`Gửi ${selectedIds.length} Test Case Draft đã chọn cho QA duyệt?`)) bulkSubmitTestCases.mutate({ ids: selectedIds, reviewer: testCaseReviewer, reviewNote: testCaseReviewNote.trim() });
      return;
    }
    const action = ["Requirement", "Change Request"].includes(bulkType) ? "Baseline" : bulkType === "User Story" ? "Gửi duyệt" : "Duyệt";
    if (window.confirm(`${action} ${selectedIds.length} ${bulkType} đã chọn? Các mục không đạt Quality Gate sẽ được báo lỗi riêng.`)) bulkApprove.mutate({ documentType: bulkType, ids: selectedIds });
  };
  const workflowUrl = selected ? `/ai-generator?${new URLSearchParams({ project: projectId, profile: profileId, step: stepByType[selected.type] }).toString()}` : "";
  const exportSelected = async (requestedFormat = "docx") => {
    if (!selected) return;
    try {
      let response;
      let extension = selected.type === "Test Case" ? "xlsx" : (typeof requestedFormat === "string" ? requestedFormat : "");
      if (selected.type !== "Test Case" && !extension) {
        const choice = window.prompt("Chọn định dạng tải xuống: docx hoặc pdf", "docx");
        if (!choice) return;
        extension = choice.trim().toLowerCase();
        if (!["docx", "pdf"].includes(extension)) throw new Error("Định dạng hợp lệ là docx hoặc pdf.");
      }
      if (selected.type === "Test Plan") response = await executionApi.exportPlan(selected.id, extension);
      else {
        const artifactType = { Requirement: "requirement", "Change Request": "requirement", "Use Case": "use-case", "User Story": "user-story", "Test Case": "test-case" }[selected.type];
        if (!artifactType) return;
        response = await e2eApi.exportArtifact(artifactType, selected.id, extension);
      }
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${selected.type.toLocaleLowerCase().replaceAll(" ", "-")}-${selected.id}.${extension}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error(error.message || "Không thể xuất tài liệu."); }
  };
  const canExport = selected && ["Requirement", "Change Request", "Use Case", "User Story", "Test Plan", "Test Case"].includes(selected.type);

  return <div className="space-y-5 pb-8">
    <PageHeader eyebrow="Document governance" title="Thư viện tài liệu kiểm thử" description="Tra cứu, phân loại và quản lý nhất quán toàn bộ tài liệu theo Project và đợt tạo tài liệu." actions={<Button asChild><Link to={`/ai-generator?${new URLSearchParams({ project: projectId, profile: profileId, step: "requirement" }).toString()}`}><ExternalLink className="h-4 w-4" />Mở quy trình tạo tài liệu</Link></Button>} />
    <Card className="border-violet-200 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-5 dark:border-violet-900 dark:from-violet-950/30 dark:via-slate-900 dark:to-sky-950/20"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200"><FileStack className="h-5 w-5" /></span><div><h2 className="font-bold">Phạm vi thư viện</h2><p className="mt-1 text-xs text-slate-500">Mỗi đợt giữ bộ tài liệu riêng; dữ liệu của các lần làm việc không bị trộn lẫn.</p></div></div><div className="mt-4 grid gap-3 md:grid-cols-2"><label><span className="mb-1 block text-xs font-semibold">Project</span><Select value={projectId} onChange={(event) => setContext({ project: event.target.value, profile: "" })}><option value="">Chọn Project</option>{(projects.data || []).map((item) => <option key={item._id} value={item._id}>{item.key} · {item.name}</option>)}</Select></label><label><span className="mb-1 block text-xs font-semibold">Đợt tạo tài liệu</span><Select value={profileId} onChange={(event) => setContext({ profile: event.target.value })} disabled={!projectId}><option value="">Chọn đợt</option>{(profiles.data || []).map((item, index) => <option key={item._id} value={item._id}>#{item.workflow?.runNumber || profiles.data.length - index} · {item.name}</option>)}</Select></label></div></Card>
    {!profileId ? <Card className="p-8 text-center text-sm text-slate-500">Chọn Project và đợt tạo tài liệu để mở thư viện.</Card> : <><Card className="overflow-hidden"><div className="border-b border-slate-200 p-4 dark:border-slate-800"><div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">{documentTypes.map((name) => <button key={name} type="button" onClick={() => setContext({ type: name, mode: "", requirement: "" })} className={`rounded-xl border p-3 text-left transition ${type === name ? "border-violet-500 bg-violet-50 ring-1 ring-violet-300 dark:bg-violet-950/30" : "border-slate-200 hover:border-violet-300 dark:border-slate-700"}`}><p className="text-xl font-bold">{counts[name]}</p><p className="mt-1 text-xs text-slate-500">{name}</p></button>)}</div>{["Requirement", "Change Request"].includes(type) && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-900 dark:bg-violet-950/20"><div><p className="text-sm font-semibold">Chế độ {type}</p><p className="mt-1 text-xs text-slate-500">Danh sách chuẩn dùng để tra cứu; quản trị chuyên sâu dùng cho chỉnh sửa, Quality Gate và Baseline.</p></div><div className="flex gap-2"><Button size="sm" variant={!requirementGovernance ? "default" : "outline"} onClick={() => setContext({ mode: "", requirement: "" })}>Danh sách</Button><Button size="sm" variant={requirementGovernance ? "default" : "outline"} onClick={() => setContext({ mode: "governance" })}>Quản trị & Baseline</Button></div></div>}{!requirementGovernance && <><div className="mt-4 grid gap-2 lg:grid-cols-[minmax(240px,1fr)_180px_180px_160px_160px]"><label className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" value={query} placeholder="Tìm mã, tên, nội dung hoặc người tạo…" onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label><Select value={type} onChange={(event) => setContext({ type: event.target.value, mode: "", requirement: "" })}><option value="All">Tất cả loại</option>{documentTypes.map((name) => <option key={name}>{name}</option>)}</Select><Select value={origin} onChange={(event) => { setOrigin(event.target.value); setPage(1); }}><option value="All">Tất cả nguồn</option>{origins.map((value) => <option key={value}>{value}</option>)}</Select><Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="All">Tất cả trạng thái</option>{statuses.map((value) => <option key={value}>{value}</option>)}</Select><Select value={dateField} onChange={(event) => { setDateField(event.target.value); setPage(1); }}><option value="updated">Ngày cập nhật</option><option value="created">Ngày tạo</option></Select></div><div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold text-slate-500">Khoảng ngày</span><Input className="h-8 w-36 text-xs" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /><span>đến</span><Input className="h-8 w-36 text-xs" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} />{(dateFrom || dateTo || query || status !== "All" || origin !== "All") && <Button size="sm" variant="outline" onClick={() => { setQuery(""); setStatus("All"); setOrigin("All"); setDateFrom(""); setDateTo(""); setPage(1); }}>Xóa bộ lọc</Button>}</div></>}</div>
      {requirementGovernance ? <div className="bg-slate-50/60 p-4 dark:bg-slate-900/40"><RequirementLibraryPage embedded documentType={type} /></div> : <>
      {latestImportBatch && <div className="m-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/20"><div><p className="text-sm font-bold text-amber-900 dark:text-amber-100">Cần thay file đã nhập?</p><p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200">Lần nhập gần nhất: <strong>{latestImportBatch.fileName}</strong> · {latestImportBatch.artifactCount || latestImportBatch.createdArtifactIds?.length || 0} {type}. Bản nháp chưa được tham chiếu sẽ bị xóa; mục đã liên kết sẽ chuyển sang Retired.</p></div><Button size="sm" variant="outline" disabled={rollbackImport.isPending} onClick={() => { if (window.confirm(`Hoàn tác lần nhập “${latestImportBatch.fileName}”?\n\nBản nháp chưa được tham chiếu sẽ bị xóa. Tài liệu đã được dùng sẽ chuyển sang Retired để giữ truy vết.`)) rollbackImport.mutate(latestImportBatch._id); }}><RotateCcw className="h-4 w-4" />{rollbackImport.isPending ? "Đang hoàn tác…" : `Hoàn tác lần nhập ${latestImportBatch.artifactCount || latestImportBatch.createdArtifactIds?.length || ""}`}</Button></div>}
      {bulkType && <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-3 dark:border-violet-900 dark:bg-violet-950/20"><label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} disabled={!selectableVisible.length} className="h-4 w-4 accent-violet-600" />{bulkType === "Test Case" ? "Chọn tất cả Test Case Draft trên trang" : `Chọn các mục chưa ${["Requirement", "Change Request"].includes(bulkType) ? "Baseline" : "duyệt"} trên trang`}</label>{selectedIds.length > 0 && <div className="flex flex-1 flex-wrap items-center justify-end gap-2">{bulkType === "Test Case" && <><Select className="h-9 min-w-48 text-xs" value={testCaseReviewer} onChange={(event) => setTestCaseReviewer(event.target.value)}><option value="">Chọn QA reviewer</option>{(projectMembers.data || []).map((member) => <option key={member._id} value={member._id}>{member.fullName || member.email}</option>)}</Select><Input className="h-9 min-w-64 flex-1 text-xs" value={testCaseReviewNote} onChange={(event) => setTestCaseReviewNote(event.target.value)} placeholder="Ghi chú gửi duyệt (tối thiểu 10 ký tự)" /></>}<span className="text-xs font-semibold text-violet-700 dark:text-violet-300">Đã chọn {selectedIds.length}</span><Button size="sm" onClick={approveSelected} disabled={bulkApprove.isPending || bulkSubmitTestCases.isPending}>{bulkApprove.isPending || bulkSubmitTestCases.isPending ? "Đang xử lý…" : bulkType === "Test Case" ? `Gửi ${selectedIds.length} Test Case cho QA` : `${["Requirement", "Change Request"].includes(bulkType) ? "Baseline" : bulkType === "User Story" ? "Gửi" : "Duyệt"} ${selectedIds.length} mục${bulkType === "User Story" ? " đi duyệt" : ""}`}</Button><button type="button" className="text-xs font-semibold text-slate-500 hover:text-violet-700" onClick={() => setSelectedIds([])}>Bỏ chọn</button></div>}</div>}
      <div>{visible.map((record, index) => { const valueDate = dateField === "created" ? record.item.createdAt : (record.item.updatedAt || record.item.createdAt); const key = dateKey(valueDate); const previous = index ? visible[index - 1] : null; const previousDate = previous ? dateKey(dateField === "created" ? previous.item.createdAt : (previous.item.updatedAt || previous.item.createdAt)) : ""; const canSelect = isSelectable(record); return <div key={`${record.type}-${record.id}`}>{key !== previousDate && <div className="flex items-center justify-between border-y border-slate-200 bg-slate-50 px-4 py-2 text-xs dark:border-slate-800 dark:bg-slate-950"><span className="font-bold capitalize">{dateHeading(valueDate)}</span><span className="text-slate-400">{key || "Không rõ ngày"}</span></div>}<div className="flex items-start gap-2 border-b border-slate-100 dark:border-slate-800"><input type="checkbox" aria-label={`Chọn ${record.title}`} checked={selectedIds.includes(record.id)} disabled={!canSelect} onChange={() => toggleSelected(record.id)} className="ml-4 mt-6 h-4 w-4 shrink-0 accent-violet-600" /><button type="button" onClick={() => setSelected(record)} className="grid min-w-0 flex-1 gap-3 px-1 py-3 text-left transition hover:bg-violet-50/60 dark:hover:bg-violet-950/20 md:grid-cols-[minmax(0,1fr)_130px_150px_150px_110px] md:items-center"><div className="min-w-0"><div className="flex flex-wrap gap-2"><Badge tone="blue">{record.type}</Badge><Badge tone={toneByStatus[record.status] || "slate"}>{record.status}</Badge><ApprovalExceptionBadge item={record.item} /><DocumentQualityBadge quality={record.item.quality} /></div><p className="mt-2 truncate text-sm font-semibold">{record.title}</p><p className="mt-1 truncate text-xs text-slate-500">{record.description}</p></div><Badge tone={record.originTone}>{record.origin}</Badge><div className="text-xs"><p>{record.item.createdBy?.fullName || "Không rõ người tạo"}</p><p className="mt-1 text-slate-400">{record.item.priority || record.item.risk || "—"}</p></div><div className="text-xs text-slate-500"><p>Tạo {formatDate(record.item.createdAt)}</p><p className="mt-1">Sửa {formatDate(record.item.updatedAt)}</p></div><span className="text-right text-xs font-semibold text-violet-700">Xem chi tiết</span></button></div></div>; })}{!visible.length && <div className="p-12 text-center"><BookOpenCheck className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-semibold">Không có tài liệu phù hợp</p><p className="mt-1 text-xs text-slate-500">Thử thay đổi loại tài liệu hoặc xóa bộ lọc.</p></div>}</div>
      {filtered.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-xs dark:bg-slate-900"><span>Hiển thị {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} trong {filtered.length} tài liệu</span><div className="flex items-center gap-2"><Select className="h-8 w-28 text-xs" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="10">10 / trang</option><option value="20">20 / trang</option><option value="50">50 / trang</option></Select><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" />Trước</Button><span className="font-semibold">{currentPage}/{totalPages}</span><Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Sau<ChevronRight className="h-4 w-4" /></Button></div></div>}
      </>}</Card></>}
    {selected && <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/55 backdrop-blur-[2px]" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><div className="flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl dark:bg-slate-950"><header className="shrink-0 border-b border-slate-200 p-5 dark:border-slate-800"><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap gap-2"><Badge tone="blue">{selected.type}</Badge><Badge tone={toneByStatus[selected.status] || "slate"}>{selected.status}</Badge><Badge tone={selected.originTone}>{selected.origin}</Badge><ApprovalExceptionBadge item={selected.item} /></div><h3 className="mt-3 text-xl font-bold">{selected.title}</h3><p className="mt-2 text-xs text-slate-500">Tạo {formatDate(selected.item.createdAt)} · Cập nhật {formatDate(selected.item.updatedAt)} · {selected.item.createdBy?.fullName || "Không rõ người tạo"}</p>{approvalExceptionOf(selected.item)?.reason && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Lý do ngoại lệ: {approvalExceptionOf(selected.item).reason}</p>}</div><button type="button" onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Đóng"><X className="h-5 w-5" /></button></div><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" asChild><Link to={workflowUrl}>Mở bước quản lý <ExternalLink className="h-4 w-4" /></Link></Button>{canExport && <Button size="sm" variant="outline" onClick={exportSelected}><Download className="h-4 w-4" />Xuất tài liệu</Button>}{["Requirement", "Change Request"].includes(selected.type) && <Button size="sm" variant="outline" onClick={() => { setSelected(null); setContext({ type: selected.type, mode: "governance", requirement: selected.id }); }}>Quản trị & Baseline</Button>}</div></header><div className="flex-1 overflow-y-auto p-5"><DocumentDetail record={selected} profileId={profileId} refresh={useCases.refetch} /></div></div></div>}
  </div>;
}
