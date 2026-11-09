import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpenCheck } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { e2eApi, workspaceApi } from "@/api/client";
import { Button, Card, Select } from "@/components/ui";
import { PageHeader } from "@/components/common/PageKit";
import { RequirementLibrary } from "./QAWorkflow";

export default function RequirementLibraryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const projects = useQuery({ queryKey: ["projects"], queryFn: workspaceApi.projects });
  const activeProject = search.get("project") || projects.data?.[0]?._id || "";
  const profiles = useQuery({
    queryKey: ["system-profiles", activeProject],
    queryFn: () => e2eApi.profiles(activeProject),
    enabled: Boolean(activeProject),
  });
  const requestedProfile = search.get("profile") || "";
  const activeProfile = (profiles.data || []).find((item) => item._id === requestedProfile) || (profiles.data || [])[0];
  const requirements = useQuery({
    queryKey: ["e2e-requirements", activeProject, activeProfile?._id],
    queryFn: () => e2eApi.requirements(activeProfile?._id),
    enabled: Boolean(activeProject && activeProfile?._id),
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }) => e2eApi.decideRequirement(id, { decision }),
    onSuccess: (_, variables) => {
      toast.success(variables.decision === "Baselined" ? "Đã Baseline Requirement." : "Đã từ chối Requirement.");
      requirements.refetch();
      profiles.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const items = requirements.data || [];
  const baselined = items.filter((item) => item.status === "Baselined");
  const workflowUrl = `/ai-generator?${new URLSearchParams({ project: String(activeProject || ""), profile: String(activeProfile?._id || ""), step: "requirement" }).toString()}`;
  const updateContext = (changes) => {
    const next = new URLSearchParams(search);
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    setSearch(next);
  };

  return <div className="space-y-5 pb-8">
    <PageHeader
      eyebrow="Requirement governance"
      title="Thư viện Requirement"
      description="Tra cứu, rà soát và chốt Requirement theo Project và đợt tạo tài liệu. Baseline/Từ chối chỉ thực hiện sau khi mở chi tiết."
      actions={<Button variant="outline" asChild><Link to={workflowUrl}><ArrowLeft className="h-4 w-4" />Quay lại Nguồn yêu cầu</Link></Button>}
    />
    <Card className="border-violet-200 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-5 dark:border-violet-900 dark:from-violet-950/30 dark:via-slate-900 dark:to-sky-950/20">
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200"><BookOpenCheck className="h-5 w-5" /></span><div><h2 className="font-bold">Phạm vi thư viện</h2><p className="mt-1 text-xs text-slate-500">Mỗi đợt có thư viện riêng; chuyển đợt không làm trộn tài liệu.</p></div></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label><span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Project</span><Select value={activeProject} onChange={(event) => updateContext({ project: event.target.value, profile: "", requirement: "" })}><option value="">Chọn Project</option>{(projects.data || []).map((item) => <option key={item._id} value={item._id}>{item.key} · {item.name}</option>)}</Select></label>
        <label><span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Đợt tạo tài liệu</span><Select value={activeProfile?._id || ""} onChange={(event) => updateContext({ profile: event.target.value, requirement: "" })} disabled={!activeProject}><option value="">Chọn đợt</option>{(profiles.data || []).map((item, index) => <option key={item._id} value={item._id}>{`#${item.workflow?.runNumber || profiles.data.length - index} · ${item.name}`}</option>)}</Select></label>
      </div>
    </Card>
    {!activeProfile ? <Card className="p-8 text-center text-sm text-slate-500">Chọn Project và đợt tạo tài liệu để mở thư viện.</Card> : <Card className="p-5 sm:p-6">
      <RequirementLibrary items={items} baselined={baselined} decide={decide} initialRequirementId={search.get("requirement") || ""} onNext={() => navigate(`/ai-generator?${new URLSearchParams({ project: String(activeProject), profile: String(activeProfile._id), step: "usecase" }).toString()}`)} />
    </Card>}
  </div>;
}
