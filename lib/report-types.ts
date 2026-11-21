/** Structured enough for Project agents to pick up + auto-fix. */
export type Report = {
  id: string;
  body: string;
  title?: string;
  path?: string;
  href?: string;
  userAgent?: string;
  name?: string;
  shopId?: string;
  createdAt: string;
  /** Legacy; new reports omit. */
  type?: "bug" | "message";
  /** Webhook kick outcome (cost guards). */
  autofix?: "kicked" | "capped" | "off" | "error";
  autofixAt?: string;
  autofixAgent?: string;
};
