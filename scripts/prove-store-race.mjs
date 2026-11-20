#!/usr/bin/env node
/**
 * Proves rapid sequential / concurrent edits are not lost under the CAS write protocol.
 *
 * Simulates the production failure mode: two "serverless instances" read a snapshot,
 * mutate, and write. Without ifMatch, the slower writer silently clobbers newer data.
 * With ifMatch + retry (as in lib/store.ts), both edits land.
 *
 * Run: node scripts/prove-store-race.mjs
 * Exit 0 = pass.
 */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Naive store: blind overwrite (pre-fix). */
function makeNaiveBlob(initial) {
  let body = structuredClone(initial);
  let etag = 1;
  return {
    async read() {
      return { store: structuredClone(body), etag };
    },
    async write(_etag, next) {
      body = structuredClone(next);
      etag += 1;
      return etag;
    },
    snapshot: () => structuredClone(body),
  };
}

/** CAS store: write fails if etag mismatch (post-fix). */
function makeCasBlob(initial) {
  let body = structuredClone(initial);
  let etag = 1;
  return {
    async read() {
      return { store: structuredClone(body), etag };
    },
    async write(expected, next) {
      if (expected != null && expected !== etag) {
        const err = new Error("precondition");
        err.name = "BlobPreconditionFailedError";
        throw err;
      }
      body = structuredClone(next);
      etag += 1;
      return etag;
    },
    snapshot: () => structuredClone(body),
  };
}

async function withStore(blob, fn, { tries = 8, readDelay = 0 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    const { store, etag } = await blob.read();
    if (readDelay) await sleep(readDelay);
    const result = await fn(store);
    try {
      await blob.write(etag, store);
      return result;
    } catch (e) {
      if (e && e.name === "BlobPreconditionFailedError") {
        last = e;
        continue;
      }
      throw e;
    }
  }
  throw last || new Error("conflict");
}

async function race(label, blob, useCas) {
  const seed = {
    items: [{ id: "i1", name: "Chair", price: 1000 }],
    claims: [],
  };
  // reset
  await blob.write(undefined, seed);

  const editPrice = withStore(
    blob,
    (s) => {
      const it = s.items.find((i) => i.id === "i1");
      it.price = 2500;
      return it.price;
    },
    { readDelay: useCas ? 30 : 30, tries: useCas ? 8 : 1 },
  );

  await sleep(5);

  const editName = withStore(
    blob,
    (s) => {
      const it = s.items.find((i) => i.id === "i1");
      it.name = "Office chair";
      return it.name;
    },
    { readDelay: 0, tries: useCas ? 8 : 1 },
  );

  if (useCas) {
    await Promise.all([editPrice, editName]);
  } else {
    // Blind overwrite: both "succeed" even when the second clobbers the first.
    await Promise.allSettled([editPrice, editName]);
  }

  const final = blob.snapshot().items.find((i) => i.id === "i1");
  const ok = final.name === "Office chair" && final.price === 2500;
  console.log(`${label}: name=${final.name} price=${final.price} → ${ok ? "KEEP BOTH" : "LOST WRITE"}`);
  return ok;
}

async function sequentialLocal() {
  // Mirrors lib/store local path: chained writes must keep every edit.
  const blob = makeCasBlob({ items: [{ id: "i1", name: "A", price: 0 }], claims: [] });
  let chain = Promise.resolve();
  const enqueue = (fn) => {
    const run = chain.then(() => withStore(blob, fn));
    chain = run.then(() => undefined, () => undefined);
    return run;
  };
  const ops = [];
  for (let i = 1; i <= 20; i++) {
    const n = i;
    ops.push(enqueue((s) => {
      const it = s.items.find((x) => x.id === "i1");
      it.price = n * 100;
      it.name = `Item-${n}`;
    }));
  }
  await Promise.all(ops);
  const final = blob.snapshot().items[0];
  const ok = final.price === 2000 && final.name === "Item-20";
  console.log(`sequential×20: name=${final.name} price=${final.price} → ${ok ? "OK" : "FAIL"}`);
  return ok;
}

const naiveOk = await race("naive (no ifMatch)", makeNaiveBlob({ items: [], claims: [] }), false);
const casOk = await race("cas (ifMatch+retry)", makeCasBlob({ items: [], claims: [] }), true);
const seqOk = await sequentialLocal();

// Expect: naive LOSES (false), cas KEEPS (true), sequential OK (true)
if (naiveOk) {
  console.error("FAIL: naive race unexpectedly kept both edits (test invalid)");
  process.exit(1);
}
if (!casOk || !seqOk) {
  console.error("FAIL: CAS / sequential edits lost data");
  process.exit(1);
}
console.log("PASS: stale overwrite reproduced; CAS+retry and sequential chain preserve edits");
