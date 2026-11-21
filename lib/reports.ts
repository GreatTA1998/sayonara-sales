import { promises as fs } from "fs";
import path from "path";
import { put, get } from "@vercel/blob";
import type { Report } from "./report-types";
export type { Report } from "./report-types";

type Bag = { reports: Report[] };
/** UTC-day kick ledger — caps cloud-agent spend. */
type KickDay = { day: string; ids: string[] };

const KEY = "sayonara-reports.json";
const KICK_KEY = "sayonara-autofix-day.json";
const localFile = () => path.join(process.cwd(), "data", "reports.json");
const kickFile = () => path.join(process.cwd(), "data", "autofix-day.json");
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const utcDay = () => new Date().toISOString().slice(0, 10);
const dailyCap = () => {
  const n = Number(process.env.AUTOFIX_DAILY_CAP || "5");
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 5;
};

let mem: Bag | null = null;
let chain: Promise<unknown> = Promise.resolve();

async function readJson<T>(blobKey: string, file: string, empty: T): Promise<T> {
  if (useBlob()) {
    const res = await get(blobKey, { access: "public" });
    if (!res) return empty;
    return (await new Response(res.stream).json()) as T;
  }
  try { return JSON.parse(await fs.readFile(file, "utf8")) as T; }
  catch { return empty; }
}

async function writeJson(blobKey: string, file: string, data: unknown) {
  if (useBlob()) {
    await put(blobKey, JSON.stringify(data), {
      access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
    });
    return;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function readRaw(): Promise<Bag> {
  return readJson(KEY, localFile(), { reports: [] });
}

async function writeRaw(bag: Bag) {
  mem = bag;
  await writeJson(KEY, localFile(), bag);
}

function withBag<T>(fn: (b: Bag) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const bag = mem || await readRaw();
    mem = bag;
    const result = await fn(bag);
    await writeRaw(bag);
    return result;
  });
  chain = run.then(() => undefined, () => undefined);
  return run;
}

export async function listReports(): Promise<Report[]> {
  const bag = mem || await readRaw();
  mem = bag;
  return structuredClone(bag.reports).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function kickContext(r: Report): string {
  return [
    `Help report ${r.id} (${r.createdAt})`,
    r.title ? `Title: ${r.title}` : "",
    r.path ? `Path: ${r.path}` : "",
    r.href ? `URL: ${r.href}` : "",
    r.name ? `Name: ${r.name}` : "",
    r.shopId ? `Shop: ${r.shopId}` : "",
    "",
    r.body,
  ].filter(Boolean).join("\n");
}

/** Event-driven kick: idempotent per report id, UTC daily cap. No always-on loop. */
async function kickAutofix(report: Report): Promise<Pick<Report, "autofix" | "autofixAt" | "autofixAgent">> {
  const hook = (process.env.REPORT_WEBHOOK_URL || "").trim();
  const at = new Date().toISOString();
  if (!hook) return { autofix: "off", autofixAt: at };

  const day = utcDay();
  const cap = dailyCap();
  let ledger = await readJson<KickDay>(KICK_KEY, kickFile(), { day, ids: [] });
  if (ledger.day !== day) ledger = { day, ids: [] };
  if (ledger.ids.includes(report.id)) return { autofix: "kicked", autofixAt: at };
  if (ledger.ids.length >= cap) return { autofix: "capped", autofixAt: at };

  const auth = (process.env.REPORT_WEBHOOK_AUTH || "").trim();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "Idempotency-Key": report.id,
  };
  if (auth) headers.authorization = auth.startsWith("Bearer ") ? auth : `Bearer ${auth}`;

  try {
    const res = await fetch(hook, {
      method: "POST",
      headers,
      body: JSON.stringify({
        context: kickContext(report),
        id: report.id,
        title: report.title,
        body: report.body,
        path: report.path,
        href: report.href,
        name: report.name,
        shopId: report.shopId,
        createdAt: report.createdAt,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { autofix: "error", autofixAt: at };
    let agent: string | undefined;
    try {
      const j = await res.json() as { backgroundComposerId?: string };
      if (j.backgroundComposerId) agent = j.backgroundComposerId;
    } catch { /* non-JSON ok */ }
    ledger.ids.push(report.id);
    await writeJson(KICK_KEY, kickFile(), ledger);
    return { autofix: "kicked", autofixAt: at, ...(agent ? { autofixAgent: agent } : {}) };
  } catch {
    return { autofix: "error", autofixAt: at };
  }
}

export async function addReport(raw: Partial<Report> & { body: string }): Promise<Report> {
  const body = String(raw.body || "").trim();
  if (!body) throw new Error("内容を入力してください");
  const report: Report = {
    id: `r${Math.random().toString(36).slice(2, 10)}`,
    body,
    createdAt: new Date().toISOString(),
  };
  const title = String(raw.title || "").trim() || body.slice(0, 80);
  if (title) report.title = title;
  for (const k of ["path", "href", "userAgent", "name", "shopId"] as const) {
    const v = String(raw[k] || "").trim();
    if (v) report[k] = v;
  }
  await withBag((b) => { b.reports.push(report); });
  const kick = await kickAutofix(report);
  Object.assign(report, kick);
  await withBag((b) => {
    const i = b.reports.findIndex((r) => r.id === report.id);
    if (i >= 0) b.reports[i] = { ...b.reports[i], ...kick };
  });
  return report;
}
