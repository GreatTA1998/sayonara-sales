/** LINE login: signed state (cookie-independent) + server-side owned-shop lookup. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLogin, lookupOwnedShop, readState, signState } from "../lib/line";

process.env.LINE_CHANNEL_SECRET = "test-secret";
process.env.LINE_CHANNEL_ID = "123";

test("signed state round-trips without any cookie", () => {
  const s = signState({ n: "abc", ret: "/s/elton/admin", shop: "elton", exp: Date.now() + 60_000 });
  const r = readState(s);
  assert.equal(r?.ret, "/s/elton/admin");
  assert.equal(r?.shop, "elton");
});

test("tampered, expired and legacy hex states are rejected", () => {
  const s = signState({ n: "abc", ret: "/", exp: Date.now() + 60_000 });
  const [body, sig] = s.split(".");
  const evil = Buffer.from(JSON.stringify({ n: "abc", ret: "//evil.example", exp: Date.now() + 60_000 })).toString("base64url");
  assert.equal(readState(`${evil}.${sig}`), null);
  assert.equal(readState(`${body}.x${sig}`), null);
  assert.equal(readState(signState({ n: "abc", ret: "/", exp: Date.now() - 1 })), null);
  assert.equal(readState("0123456789abcdef"), null);
  assert.equal(readState(null), null);
});

test("lookupOwnedShop: empty uid is an error, unknown uid is none (live read-only Firestore)", async (t) => {
  assert.equal((await lookupOwnedShop("")).status, "error");
  const r = await lookupOwnedShop("U" + "0".repeat(32));
  if (r.status === "error") return t.skip("Firestore REST unreachable");
  assert.equal(r.status, "none");
});

/** Client binding: fresh iPhone (no local state) must land on the owned shop, never mint one. */
test("bindLineUser: owned shop wins; failed lookup never mints a shop", async () => {
  const store = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  g.window = { dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} };
  g.Event = class { constructor(public type: string) {} };
  const { bindLineUser } = await import("../lib/shop");
  // fresh phone, stale guest pointer, server says elton owns this LINE uid
  store.set("ss-shop-id", "12345");
  assert.equal(bindLineUser("U1", "Someone", "12345", "elton", true), "elton");
  assert.equal(store.get("ss-shop-id"), "elton");
  // fresh phone, lookup failed, no hint → no new shop minted
  store.clear();
  assert.equal(bindLineUser("U2", "Someone", "", "", false), "");
  assert.equal(store.get("ss-shop-id"), undefined);
  assert.equal(store.get("ss-line-uid"), "U2");
  // lookup definitively none → first-time user gets a guest shop
  assert.match(bindLineUser("U3", "Someone", "", "", true), /^\d{5}$/);
});

test("pre-signed login URL goes straight to LINE with auto login left enabled", () => {
  const req = new Request("https://beta.sayonara.tokyo/api/auth/line/url", { headers: { host: "beta.sayonara.tokyo" } });
  const { nonce, url } = buildLogin(req, "/s/elton/admin", "elton");
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://access.line.me/oauth2/v2.1/authorize");
  assert.equal(u.searchParams.get("redirect_uri"), "https://beta.sayonara.tokyo/api/auth/line/callback");
  for (const k of ["disable_auto_login", "disable_ios_auto_login", "prompt", "switch_amr"]) {
    assert.equal(u.searchParams.has(k), false, k);
  }
  const st = readState(u.searchParams.get("state"));
  assert.equal(st?.n, nonce);
  assert.equal(st?.ret, "/s/elton/admin");
});
