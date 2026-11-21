export type ReportType = "bug" | "message";
/** Structured enough for Project agents to pick up + auto-fix. */
export type Report = {
  id: string;
  type: ReportType;
  body: string;
  title?: string;
  path?: string;
  href?: string;
  userAgent?: string;
  name?: string;
  shopId?: string;
  createdAt: string;
};
