import { createSign } from "crypto";

/** Server-only Firestore REST (service account). No firebase-admin. */

type Sa = { project_id: string; client_email: string; private_key: string };

function sa(): Sa {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) as Sa;
  }
  const project_id = process.env.FIREBASE_PROJECT_ID || "";
  const client_email = process.env.FIREBASE_CLIENT_EMAIL || "";
  const private_key = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!project_id || !client_email || !private_key) {
    throw new Error("FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY required");
  }
  return { project_id, client_email, private_key };
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<{ token: string; projectId: string }> {
  const cred = sa();
  if (cached && cached.exp > Date.now() + 60_000) return { token: cached.token, projectId: cred.project_id };
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: cred.client_email,
    sub: cred.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore",
  }));
  const unsigned = `${header}.${claim}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(cred.private_key);
  const jwt = `${unsigned}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const body = await res.json() as { access_token: string; expires_in: number };
  cached = { token: body.access_token, exp: Date.now() + body.expires_in * 1000 };
  return { token: cached.token, projectId: cred.project_id };
}

const base = (projectId: string) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

/** Decode Firestore value → JS */
export function fromValue(v: Record<string, unknown> | undefined): unknown {
  if (!v || v.nullValue !== undefined) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("arrayValue" in v) {
    const arr = (v.arrayValue as { values?: Record<string, unknown>[] })?.values || [];
    return arr.map(fromValue);
  }
  if ("mapValue" in v) {
    const fields = (v.mapValue as { fields?: Record<string, Record<string, unknown>> })?.fields || {};
    return fromFields(fields);
  }
  return null;
}

export function fromFields(fields: Record<string, Record<string, unknown>> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromValue(v);
  return out;
}

/** Encode JS → Firestore value */
export function toValue(v: unknown): Record<string, unknown> {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "object") {
    const fields: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) fields[k] = toValue(x);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

export function toFields(data: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const fields: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(data)) fields[k] = toValue(v);
  return fields;
}

export async function fsGet(path: string): Promise<{ id: string; data: Record<string, unknown> } | null> {
  const { token, projectId } = await accessToken();
  const res = await fetch(`${base(projectId)}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  const doc = await res.json() as { name: string; fields?: Record<string, Record<string, unknown>> };
  const id = doc.name.split("/").pop()!;
  return { id, data: fromFields(doc.fields) };
}

export async function fsList(path: string): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const { token, projectId } = await accessToken();
  const out: { id: string; data: Record<string, unknown> }[] = [];
  let pageToken = "";
  do {
    const url = new URL(`${base(projectId)}/${path}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    const body = await res.json() as {
      documents?: { name: string; fields?: Record<string, Record<string, unknown>> }[];
      nextPageToken?: string;
    };
    for (const d of body.documents || []) {
      out.push({ id: d.name.split("/").pop()!, data: fromFields(d.fields) });
    }
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return out;
}

export type FsWrite =
  | { set: { path: string; data: Record<string, unknown>; merge?: boolean } }
  | { delete: string };

/** Commit writes (max ~500). Paths are relative to documents/, e.g. shops/elton/items/i1 */
export async function fsCommit(writes: FsWrite[]): Promise<void> {
  if (!writes.length) return;
  const { token, projectId } = await accessToken();
  const root = `projects/${projectId}/databases/(default)/documents`;
  const payload = writes.map((w) => {
    if ("delete" in w) return { delete: `${root}/${w.delete}` };
    const update: Record<string, unknown> = {
      name: `${root}/${w.set.path}`,
      fields: toFields(w.set.data),
    };
    const write: Record<string, unknown> = { update };
    if (w.set.merge) {
      write.updateMask = { fieldPaths: Object.keys(w.set.data) };
    }
    return write;
  });
  for (let i = 0; i < payload.length; i += 400) {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ writes: payload.slice(i, i + 400) }),
        cache: "no-store",
      },
    );
    if (!res.ok) throw new Error(await res.text());
  }
}
