export type QueueStatus = "pending" | "changes_requested" | "approved" | "returned" | "auto_approved";

export const STATUS_OPTIONS: { id: QueueStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "changes_requested", label: "Changes" },
  { id: "approved", label: "Approved" },
  { id: "returned", label: "Returned" },
  { id: "auto_approved", label: "Auto" },
];

export function parseStatusParam(raw: string | null): QueueStatus | "all" {
  if (raw && STATUS_OPTIONS.some((o) => o.id === raw)) {
    return raw as QueueStatus | "all";
  }
  return "pending";
}
