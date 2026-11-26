import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import sharp from "sharp";
import { cropSquare } from "./prospect-convert.mjs";
import {
  PACE_MAX, PACE_MIN, SHOT, SLOT_EVENING, SOURCE,
  assertGrabUrls, assertLocalCdp, assignVariants, buildBlocked, bundleLines, canonicalFacebookUrl,
  convertGrab, datePhrases, englishOk, extractNodes, isGraphqlUrl, itemFieldsFromListing,
  nameFromTitle, otherAgent, outputWarning, paceMs, pageBlock, pool,
  redact, resolveBase, runGrab, runGrabSaved, savedPageHtml, sendRow, shotPaintReady,
  slotConstraint, verifyShop, wardStored, yenMarked,
} from "./prospect.mjs";

const SELLER = "100000000100";
const CHAIR = "100000000111";
const BUNDLE = "100000000222";
const OTHER = "100000000333";
const RELATED = "100000000444";
const SOLD = "100000000777";
const profileUrl = `https://www.facebook.com/marketplace/profile/${SELLER}`;
const fb = (id, path) => `https://scontent.xx.fbcdn.net/v/${path}`;

function listingNode(o) {
  return {
    id: o.id,
    marketplace_listing_title: o.title,
    listing_price: { formatted_amount: o.price, currency: o.currency || "JPY" },
    ...(o.description ? { redacted_description: { text: o.description } } : {}),
    ...(o.city ? { location_text: { text: o.city } } : {}),
    ...(o.photo ? { primary_listing_photo: { image: { uri: o.photo, width: o.w, height: o.h } } } : {}),
    marketplace_listing_seller: { id: o.seller || SELLER, name: o.sellerName || "Ada" },
    ...(o.sold ? { is_sold: true } : {}),
  };
}

const profileBlob = {
  data: {
    listings: {
      edges: [
        { node: listingNode({ id: CHAIR, title: "椅子", price: "¥1,500", description: "木製。3月20日まで", city: "目黒区", photo: fb(CHAIR, "chair.jpg"), w: 1200, h: 1200 }) },
        { node: listingNode({ id: BUNDLE, title: "まとめ", price: "¥6,000", city: "川口市", photo: fb(BUNDLE, "bundle-thumb.jpg"), w: 200, h: 200 }) },
        { node: listingNode({ id: OTHER, title: "他人の出品", price: "¥9,000", seller: "100000000999" }) },
        { node: listingNode({ id: SOLD, title: "売れた棚", price: "¥500", sold: true }) },
      ],
    },
  },
};
const detailBlob = {
  data: {
    listing: listingNode({
      id: BUNDLE, title: "まとめ", price: "¥6,000", city: "川口市", sellerName: "Ada",
      description: "Washing machine - 4000 yen\nDryer - 2000 yen\npickup after 5pm",
      photo: fb(BUNDLE, "bundle-full.jpg"), w: 1600, h: 1200,
    }),
    also: listingNode({ id: RELATED, title: "関連", price: "¥1", seller: "100000000888" }),
  },
};

function sessionFor(calls) {
  return {
    async open(url) {
      calls.push(["open", url]);
      if (url.includes("/profile/")) return { url, html: "", graphql: [profileBlob] };
      if (url.endsWith(BUNDLE)) return { url, html: "", graphql: [detailBlob] };
      return { url, html: "", graphql: [] };
    },
    async scroll() {
      calls.push(["scroll"]);
      return { url: profileUrl, html: "", graphql: [] };
    },
  };
}

test("profile grab reads graphql once per thin listing and drops other sellers", async () => {
  const calls = [];
  const grab = await runGrab({
    session: sessionFor(calls),
    urls: [profileUrl],
    now: () => "2026-11-26T00:00:00.000Z",
    sleep: async () => {},
  });
  assert.deepEqual(calls.map((c) => c[0] === "open" ? c[1] : "scroll"), [
    profileUrl, "scroll", "scroll", `https://www.facebook.com/marketplace/item/${BUNDLE}`,
  ]);
  assert.deepEqual(grab.listings.map((l) => l.id), [CHAIR, BUNDLE, SOLD]);
  const bundle = grab.listings.find((l) => l.id === BUNDLE);
  assert.equal(bundle.bundleHint, true);
  assert.deepEqual(bundle.photos.map((p) => p.url), [fb(BUNDLE, "bundle-full.jpg")]);
  assert.equal(bundle.description.includes("Washing machine - 4000 yen"), true);
  assert.equal(grab.sellerId, SELLER);
  assert.equal(grab.listings.some((l) => l.id === OTHER || l.id === RELATED), false);
});

test("convert fills only deterministic fields and holds bundles", async () => {
  const grab = await runGrab({
    session: sessionFor([]),
    urls: [`${profileUrl}?ref=1`],
    sleep: async () => {},
  });
  const shop = convertGrab(grab);
  assert.equal(shop.externalSource.source, SOURCE);
  assert.equal(shop.externalSource.sellerId, `https://www.facebook.com/marketplace/profile/${SELLER}`);
  assert.deepEqual(Object.keys(shop.settings).sort(), ["facebookUrl", "slots"]);
  assert.equal(shop.settings.facebookUrl, `https://www.facebook.com/marketplace/item/${BUNDLE}/`);
  assert.equal(shop.review.facebookUrl.from, "bundle");
  assert.equal(shop.review.facebookUrl.listingId, BUNDLE);
  assert.equal(shop.settings.address, undefined);
  assert.deepEqual(shop.settings.slots, ["17:30", "19:00", "20:30"]);
  assert.equal(shop.settings.pickupTo, undefined);
  const chair = shop.items.find((it) => it.externalKey === CHAIR);
  const bundle = shop.items.find((it) => it.externalKey === BUNDLE);
  assert.equal(chair.name, "椅子");
  assert.equal(chair.price, 1500);
  assert.equal(chair.note, "木製。3月20日まで");
  assert.equal(bundle.price, 6000);
  assert.deepEqual(bundleLines(bundle.note), ["Washing machine - 4000 yen", "Dryer - 2000 yen"]);
  assert.deepEqual(shop.review.slots.slots, ["17:30", "19:00", "20:30"]);
  assert.ok(shop.review.address.storedAs.includes("川口市"));
  assert.ok(shop.review.address.storedAs.includes("目黒区"));
  assert.equal(shop.review.address.storedAs.includes("川口市区"), false);
  assert.deepEqual(shop.review.pickupTo.raw, ["3月20日"]);
  assert.deepEqual(shop.review.skipped, [{ id: SOLD, status: "sold" }]);
  assert.deepEqual(buildBlocked(shop), ["bundles"]);
  shop.review.bundlesDone = true;
  assert.deepEqual(buildBlocked(shop), []);
});

test("a clean listing builds with facebookUrl only", () => {
  const shop = convertGrab({
    entryUrl: `https://www.facebook.com/marketplace/item/${CHAIR}`,
    sellerId: SELLER,
    listings: [{
      id: CHAIR, url: `https://www.facebook.com/marketplace/item/${CHAIR}`,
      title: "椅子", price: 1500, priceText: "¥1,500", description: "木製",
      locationText: "目黒区", status: "active",
      photos: [{ url: fb(CHAIR, "chair.jpg") }],
    }],
  });
  assert.equal(shop.settings.facebookUrl, `https://www.facebook.com/marketplace/item/${CHAIR}/`);
  assert.equal(shop.review.facebookUrl.from, "entry");
  assert.equal(shop.review.slots, undefined);
  assert.equal(shop.review.bundles, undefined);
  assert.deepEqual(buildBlocked(shop), []);
  assert.equal("published" in shop, false);
});

test("a profile prefers a move-out post over the first listing", () => {
  const shop = convertGrab({
    entryUrl: `https://www.facebook.com/marketplace/profile/${SELLER}`,
    sellerId: SELLER,
    listings: [
      { id: CHAIR, title: "椅子", price: 100, description: "木製", status: "active" },
      { id: BUNDLE, title: "退去セール", price: 100, description: "引っ越しのため", status: "active" },
    ],
  });
  assert.equal(shop.review.facebookUrl.from, "move-out");
  assert.equal(shop.settings.facebookUrl, `https://www.facebook.com/marketplace/item/${BUNDLE}/`);
  assert.equal(shop.settings.facebookUrl.includes("/profile/"), false);
});

test("price conflict is left blank", () => {
  const fields = itemFieldsFromListing({ title: "椅子 ¥1,000", price: 1500, priceText: "¥1,500" });
  assert.equal(fields.name, "椅子");
  assert.equal(fields.price, null);
  assert.match(fields.warning, /conflict/);
});

test("time phrases", () => {
  assert.deepEqual(slotConstraint("pickup after 5pm").slots, ["17:30", "19:00", "20:30"]);
  assert.deepEqual(slotConstraint("17時以降").slots, ["17:30", "19:00", "20:30"]);
  assert.equal(slotConstraint("5時以降"), null);
  assert.equal(slotConstraint("午後にお越しください"), null);
  const mixed = slotConstraint("午前のみ、夜のみ");
  assert.equal(mixed.slots, null);
  assert.equal(mixed.raw.length >= 2, true);
  const quiet = convertGrab({
    entryUrl: `https://www.facebook.com/marketplace/item/${CHAIR}`,
    sellerId: SELLER,
    listings: [{ id: CHAIR, title: "椅子", price: 100, description: "木製", status: "active" }],
  });
  assert.equal(quiet.settings.slots, undefined);
  assert.deepEqual(datePhrases("月末か2026-12-01"), ["月末", "2026-12-01"]);
});

test("yen, names, bundles", () => {
  assert.equal(yenMarked("¥4,000"), 4000);
  assert.equal(yenMarked("４０００円"), 4000);
  assert.equal(yenMarked("4000 yen"), 4000);
  assert.equal(yenMarked("無料"), 0);
  assert.equal(yenMarked("$20"), null);
  assert.equal(yenMarked("椅子"), null);
  assert.equal(nameFromTitle("洗濯機 4000円"), "洗濯機");
  assert.deepEqual(bundleLines("Washing machine - 4000 yen, Dryer - 2000 yen"), [
    "Washing machine - 4000 yen", "Dryer - 2000 yen",
  ]);
  assert.deepEqual(bundleLines("Bought for 20000 yen\nSelling for 4000 yen"), []);
  assert.equal(wardStored("川口市"), "川口市");
  assert.equal(wardStored("川口町"), "川口町");
  assert.equal(wardStored("田村"), "田村");
  assert.equal(wardStored("目黒"), "目黒区");
  assert.equal(wardStored("目黒区"), "目黒区");
});

test("wardAddress and pickup slots still match the helpers", () => {
  const store = readFileSync(new URL("../lib/store.ts", import.meta.url), "utf8");
  const sale = readFileSync(new URL("../lib/sale.ts", import.meta.url), "utf8");
  assert.ok(store.includes("if (/[市町村]$/.test(raw)) return raw;"));
  assert.match(sale, /PICKUP_SLOTS = \["10:00", "14:00", "20:00"\]/);
  assert.equal(SLOT_EVENING, "20:00");
});

test("saved html/mhtml extracts photos and Japanese description", () => {
  const photo = fb(CHAIR, "chair-full.jpg");
  const node = listingNode({
    id: CHAIR, title: "椅子", price: "¥1,500",
    description: "木製の椅子です。目黒区で受け取れます。",
    city: "目黒区", photo, w: 1200, h: 1200,
  });
  const html = `<html><head><meta property="og:url" content="https://www.facebook.com/marketplace/item/${CHAIR}/"></head><body><script type="application/json">${JSON.stringify({ data: { listing: node } })}</script></body></html>`;
  const grab = runGrabSaved([{ html, url: `https://www.facebook.com/marketplace/item/${CHAIR}` }]);
  assert.equal(grab.listings.length, 1);
  assert.equal(grab.listings[0].description.includes("木製の椅子"), true);
  assert.deepEqual(grab.listings[0].photos.map((p) => p.url), [photo]);
  assert.equal(grab.sellerId, SELLER);

  const bundleJson = JSON.stringify({
    data: {
      listing: listingNode({
        id: BUNDLE, title: "まとめ", price: "¥6,000",
        description: "洗濯機 - 4000 yen\n乾燥機 - 2000 yen",
        photo: fb(BUNDLE, "b.jpg"), w: 1600, h: 1200,
      }),
    },
  });
  const mhtml = [
    "From: <Saved by Blink>",
    'Content-Type: multipart/related; boundary="----=_NextPart"',
    "",
    "------=_NextPart",
    "Content-Type: text/html; charset=utf-8",
    `Content-Location: https://www.facebook.com/marketplace/item/${BUNDLE}/`,
    "Content-Transfer-Encoding: quoted-printable",
    "",
    `<script>${bundleJson}</script>`,
    "------=_NextPart--",
  ].join("\r\n");
  const parsed = savedPageHtml(mhtml, "item.mhtml");
  assert.match(parsed.url, new RegExp(BUNDLE));
  const fromMhtml = runGrabSaved([parsed]);
  assert.equal(fromMhtml.listings[0].id, BUNDLE);
  assert.equal(fromMhtml.listings[0].bundleHint, true);
  assert.equal(typeof shotPaintReady, "function");
  assert.equal(SHOT.settleMs > 0, true);
});

test("graphql and dom fallbacks", () => {
  const id = Buffer.from("listing:100000000555").toString("base64");
  const nodes = extractNodes({
    id, marketplace_listing_title: "棚",
    listing_price: { formatted_amount: "¥500", currency: "JPY" },
  });
  assert.equal(nodes[0].id, "100000000555");
  assert.equal(nodes[0].price, 500);
  assert.equal(isGraphqlUrl("https://www.facebook.com/api/graphql/"), true);
  assert.equal(isGraphqlUrl("https://www.facebook.com/ajax/bz"), false);
  const html = [
    "<meta property=\"og:title\" content=\"椅子 - ¥1,500 | Facebook\">",
    "<meta property=\"og:description\" content=\"木製\">",
    "<meta property=\"og:image\" content=\"https://scontent.xx.fbcdn.net/v/og.jpg\">",
  ].join("");
  return runGrab({
    session: { async open(url) { return { url, html, graphql: [] }; } },
    urls: [`https://m.facebook.com/marketplace/item/${CHAIR}/?ref=share`],
    sleep: async () => {},
  }).then((grab) => {
    assert.equal(grab.listings[0].title, "椅子 - ¥1,500");
    assert.equal(grab.listings[0].price, 1500);
    assert.equal(grab.entryUrl, `https://www.facebook.com/marketplace/item/${CHAIR}`);
  });
});

test("login stops and rate keeps a partial grab", async () => {
  await assert.rejects(
    runGrab({
      session: { async open() { return { url: "https://www.facebook.com/login", html: "", graphql: [] }; } },
      urls: [profileUrl],
    }),
    /does not log in/,
  );
  const grab = await runGrab({
    session: {
      async open(url) {
        return { url, html: "You are going too fast", graphql: [profileBlob], block: "rate" };
      },
    },
    urls: [profileUrl],
    sleep: async () => {},
  });
  assert.equal(grab.stopped, "rate");
  assert.ok(grab.listings.length >= 1);
});

test("two sellers in one item list are refused", async () => {
  await assert.rejects(
    runGrab({
      session: {
        async open(url) {
          const id = url.endsWith(CHAIR) ? CHAIR : BUNDLE;
          const seller = id === CHAIR ? SELLER : "100000000999";
          return { url, html: "", graphql: [{ data: { node: listingNode({ id, title: "x", price: "¥1", seller }) } }] };
        },
      },
      urls: [
        `https://www.facebook.com/marketplace/item/${CHAIR}`,
        `https://www.facebook.com/marketplace/item/${BUNDLE}`,
      ],
      sleep: async () => {},
    }),
    /more than one seller/,
  );
});

test("guards", () => {
  assert.equal(resolveBase(""), "https://sayonara.tokyo");
  assert.equal(resolveBase("", { beta: true }), "https://beta.sayonara.tokyo");
  assert.equal(resolveBase("https://sayonara.tokyo", { beta: true }), "https://beta.sayonara.tokyo");
  assert.equal(assertLocalCdp("http://127.0.0.1:9222"), "http://127.0.0.1:9222/");
  assert.throws(() => assertLocalCdp("http://1.2.3.4:9222"), /localhost/);
  assert.throws(() => assertGrabUrls([canonicalFacebookUrl("https://www.facebook.com/marketplace/search/?query=sofa")]), /Search/);
  assert.equal(canonicalFacebookUrl(`https://m.facebook.com/marketplace/item/${CHAIR}/?ref=1`), `https://www.facebook.com/marketplace/item/${CHAIR}`);
  assert.equal(paceMs(() => 0), PACE_MIN);
  assert.equal(paceMs(() => 0.9999999), PACE_MAX);
  assert.equal(pageBlock("https://www.facebook.com/checkpoint/block", ""), "login");
  assert.equal(pageBlock(profileUrl, "please login later"), "");
  assert.equal(SHOT.width, 1280);
  assert.equal(SHOT.height, 830);
  assert.equal(SHOT.quality, 82);
  assert.equal(redact("token=abc Bearer abc", "abc"), "token=[redacted] Bearer [redacted]");
  assert.equal(outputWarning("/repo/data/prospects/a.json", "/repo"), "");
  assert.match(outputWarning("/repo/docs/a.json", "/repo"), /do not commit/);
});

test("verify, ownership, english, send row", () => {
  const shop = {
    externalSource: { source: SOURCE, sellerId: profileUrl },
    settings: { facebookUrl: `https://www.facebook.com/marketplace/item/${CHAIR}` },
    items: [{ externalKey: CHAIR, name: "椅子", price: 1500, photoFiles: ["./photos/a.jpg"] }],
    review: { warnings: [] },
  };
  const state = {
    id: "48291", claimed: false, published: false,
    url: "https://beta.sayonara.tokyo/s/48291",
    editorUrl: "https://beta.sayonara.tokyo/s/48291/admin",
    settings: { facebookUrl: shop.settings.facebookUrl },
    items: [{ photos: ["https://blob.example/a.webp"] }],
  };
  assert.equal(verifyShop(state, shop).ok, true);
  assert.equal(verifyShop({ ...state, claimed: true }, shop).checks.unclaimed, false);
  assert.equal(verifyShop({ ...state, published: true }, shop).checks.unpublished, false);
  assert.equal(verifyShop({ ...state, settings: { facebookUrl: "" } }, shop).checks.facebookUrl, false);
  assert.equal(verifyShop({ ...state, items: [{ photos: [] }] }, shop).checks.photoCount, false);
  assert.equal(otherAgent(null, "grok-1"), "");
  assert.equal(otherAgent({ lastAgentId: "grok-1" }, "grok-1"), "");
  assert.equal(otherAgent({ lastAgentId: "grok-2" }, "grok-1"), "agent:grok-2");
  assert.equal(otherAgent({ lease: { agentId: "grok-2" } }, "grok-1"), "lease:grok-2");
  assert.equal(otherAgent({ claimed: true }, "grok-1"), "claimed");
  const signals = { saved: "en", lang: "en", help: true, cta: true, splash: false };
  assert.equal(englishOk(signals), true);
  assert.equal(englishOk({ ...signals, lang: "ja" }), false);
  assert.equal(englishOk({ ...signals, splash: true }), false);
  const ready = sendRow(shop, state, { signals, path: "/tmp/48291.jpg" });
  assert.equal(ready.ready, true);
  assert.equal(ready.threadUrl, shop.settings.facebookUrl);
  assert.equal(ready.shopUrl, state.url);
  assert.equal("message" in ready, false);
  assert.equal(ready.screenshot, "/tmp/48291.jpg");
  assert.equal(sendRow(shop, state, { signals: { ...signals, cta: false } }).ready, false);
  const first = assignVariants([ready, { shopUrl: "https://sayonara.tokyo/s/2" }, { shopUrl: "https://sayonara.tokyo/s/3" }]);
  assert.deepEqual(first.sends.map((s) => s.variant), ["B", "A", "D"]);
  assert.equal(first.next, "C");
  const kept = assignVariants(
    [{ shopUrl: state.url }, { shopUrl: "https://sayonara.tokyo/s/9" }],
    { next: first.next, kept: new Map([[state.url, "B"]]) },
  );
  assert.deepEqual(kept.sends.map((s) => s.variant), ["B", "C"]);
});

test("pool keeps input order", async () => {
  const out = await pool(2, [1, 2, 3, 4], async (n) => {
    await new Promise((r) => setTimeout(r, n === 1 ? 20 : 1));
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8]);
});

test("square crop is edge to edge and centered", async () => {
  const raw = Buffer.alloc(60 * 30 * 3);
  for (let i = 0; i < raw.length; i += 3) { raw[i + 1] = 255; }
  for (let y = 12; y < 18; y++) {
    for (let x = 26; x < 34; x++) {
      const o = (y * 60 + x) * 3;
      raw[o] = 255; raw[o + 1] = 0; raw[o + 2] = 0;
    }
  }
  const png = await sharp(raw, { raw: { width: 60, height: 30, channels: 3 } }).png().toBuffer();
  const jpg = await cropSquare(png);
  const { data, info } = await sharp(jpg).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, info.height);
  assert.equal(info.width, 30);
  const mid = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
  assert.ok(data[mid] > 200 && data[mid + 1] < 40);
  assert.ok(data[1] > 200 && data[0] < 40);
});
