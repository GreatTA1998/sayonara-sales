/** Client fire-and-forget OA push (server no-ops without token). */
export type NotifyKind = "confirm" | "decline" | "reschedule" | "waitlist" | "wait_open";

export function notifyLine(
  to: string,
  kind: NotifyKind,
  p: { day?: string; slot?: string; code?: string; reason?: string } = {},
) {
  const uid = (to || "").trim();
  if (!uid || typeof window === "undefined") return;
  void fetch("/api/line/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: uid, kind, ...p }),
  }).catch(() => { /* soft */ });
}
