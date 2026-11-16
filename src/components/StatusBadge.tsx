const TONE_BY_STATUS: Record<string, string> = {
  active: "badge-success",
  processed: "badge-success",
  pending: "badge-warning",
  received: "badge-neutral",
  suspended: "badge-error",
  failed: "badge-error",
};

export default function StatusBadge({ status }: { status: string }) {
  const tone = TONE_BY_STATUS[status] ?? "badge-neutral";
  return <span className={`badge ${tone}`}>{status}</span>;
}