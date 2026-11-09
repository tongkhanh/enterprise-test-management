import { Badge } from "@/components/ui";

const qualityMeta = {
  Ready: { label: "Sẵn sàng duyệt", tone: "green" },
  ReadyWithWarnings: { label: "Sẵn sàng · còn khuyến nghị", tone: "amber" },
  NeedsClarification: { label: "Cần bổ sung", tone: "red" },
};

export function DocumentQualityBadge({ quality }) {
  if (!quality) return null;
  const meta = qualityMeta[quality.status] || { label: quality.status, tone: "slate" };
  const missing = [...(quality.requiredMissing || []), ...(quality.recommendedMissing || [])].map((item) => item.label).join(", ");
  return <Badge tone={meta.tone} className="whitespace-nowrap" title={missing || "Đã đủ các nhóm thông tin"}>{meta.label} · {quality.score}%</Badge>;
}

export function DocumentQualityNotice({ quality, action = "duyệt" }) {
  if (!quality?.requiredMissing?.length) return null;
  return <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-100"><strong>Chưa thể {action}.</strong> Cần bổ sung: {quality.requiredMissing.map((item) => item.label).join(", ")}.</div>;
}
