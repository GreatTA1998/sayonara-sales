import { promises as fs } from "fs";
import path from "path";
import { put, get } from "@vercel/blob";
import type { Report, ReportType } from "./report-types";
export type { Report, ReportType } from "./report-types";

type Bag = { reports: Report[] };

const KEY = "sayonara-reports.json";
const localFile = () => path.join(process.cwd(), "data", "reports.json");
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

let mem: Bag | null = null;
let chain: Promise<unknown> = Promise.resolve();

async function readRaw(): Promise<Bag> {
  if (useBlob()) {
    const res = await get(KEY, { access: "public" });
    if (!res) return { reports: [] };
    return (await new Response(res.stream).json()) as Bag;
  }
  try { return JSON.parse(await fs.readFile(localFile(), "utf8")) as Bag; }
  catch {
    const empty: Bag = { reports: [] };
    await fs.mkdir(path.dirname(localFile()), { recursive: true });
    await fs.writeFile(localFile(), JSON.stringify(empty, null, 2));
    return empty;
  }
}

async function writeRaw(bag: Bag) {
  mem = bag;
  if (useBlob()) {
    await put(KEY, JSON.stringify(bag), {
      access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
    });
    return;
  }
  await fs.mkdir(path.dirname(localFile()), { recursive: true });
  await fs.writeFile(localFile(), JSON.stringify(bag, null, 2));
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

export async function addReport(raw: Partial<Report> & { type: ReportType; body: string }): Promise<Report> {
  const type = raw.type === "bug" ? "bug" : "message";
  const body = String(raw.body || "").trim();
  if (!body) throw new Error("内容を入力してください");
  const report: Report = {
    id: `r${Math.random().toString(36).slice(2, 10)}`,
    type,
    body,
    createdAt: new Date().toISOString(),
  };
  const title = String(raw.title || "").trim() || (type === "bug" ? body.slice(0, 80) : "");
  if (title) report.title = title;
  for (const k of ["path", "href", "userAgent", "name", "shopId"] as const) {
    const v = String(raw[k] || "").trim();
    if (v) report[k] = v;
  }
  await withBag((b) => { b.reports.push(report); });
  const hook = (process.env.REPORT_WEBHOOK_URL || "").trim();
  if (hook && type === "bug") {
    void fetch(hook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
    }).catch(() => undefined);
  }
  return report;
}
