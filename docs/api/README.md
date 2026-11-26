# Shop builder API

HTTP API for an automation to create and fill an **unclaimed** shop. Each request carries its own shop id or `externalSource` and an `X-Agent-Id`. Nothing is read from a browser session, cookie, localStorage, or Firebase uid.

Production shop URL: `https://sayonara.tokyo/s/<id>` (`url` in the response). Editor: `https://sayonara.tokyo/s/<id>/admin` (`editorUrl`). On beta, both use the beta host.

Contract: [`shop-builder.openapi.yaml`](./shop-builder.openapi.yaml).

## Env

Set one secret on the Vercel project [sayonara-sales → Environment Variables](https://vercel.com/intentions/sayonara-sales/settings/environment-variables) for Production and Preview:

| Variable | Purpose |
|---|---|
| `SHOP_BUILDER_API_TOKEN` | Bearer token. If this is unset, every shop-builder route returns 404. |

Generate a value with `openssl rand -hex 32`. No Firebase service account is added. The server signs in anonymously with the existing `NEXT_PUBLIC_FIREBASE_*` web config so Firestore rules allow the write. That uid is not stored on the shop. Photos still use the existing `BLOB_READ_WRITE_TOKEN`.

Merging the rules change publishes `shopSources` (the idempotency lock) together with the unclaimed-shop rules. Until that deploy has run, writes return 503.

## One shop per seller

`externalSource` is `{ "source": "facebook_marketplace", "sellerId": "<stable profile id or URL>" }`. A transaction writes `shopSources/{sha256}` so two workers targeting the same seller cannot create two shops.

`X-Agent-Id` must be different for each worker (`grok-1`, `grok-2`). `lease: true` on the upsert holds the shop for 15 minutes (max 900 seconds). The other worker gets **423** and the holder's id. Item, batch, lease, and photo-attach calls send `If-Match: "<rev>"` from the last response (`ETag` is the same value). A stale revision is **412**. A claimed shop is **409** and is not modified. The API never sets `ownerUid` or `published: true`.

`GET /api/shop-builder/shops?source=facebook_marketplace&lease=free` lists unclaimed shops with no live lease.

Limits, also in the OpenAPI `info.x-limits`: 40 items or batch ops per request, 12 photos per item, 50 shops per list page.

## curl

```bash
export TOKEN=...   # SHOP_BUILDER_API_TOKEN
export BASE=https://sayonara.tokyo

curl -sS -D - "$BASE/api/shop-builder/shops" \
  -H "authorization: Bearer $TOKEN" \
  -H "x-agent-id: grok-1" \
  -H "content-type: application/json" \
  -d '{
    "externalSource": {"source":"facebook_marketplace","sellerId":"https://www.facebook.com/marketplace/profile/100"},
    "lease": true,
    "settings": {"address":"目黒","bio":"駅前で引き渡し","facebookUrl":"https://www.facebook.com/marketplace/profile/100"},
    "items": [{"externalKey":"listing-1","name":"椅子","price":1500,"note":"脚に小さな傷"}]
  }'
```

A later item write uses the `rev` from that JSON (or the `ETag` header):

```bash
curl -sS "$BASE/api/shop-builder/shops/48291/items/listing-1" \
  -X PUT \
  -H "authorization: Bearer $TOKEN" \
  -H "x-agent-id: grok-1" \
  -H 'if-match: "1"' \
  -H "content-type: application/json" \
  -d '{"price":1200}'
```

Photo from a local file (does not change `rev`) or from a URL:

```bash
curl -sS "$BASE/api/shop-builder/shops/48291/photos" \
  -H "authorization: Bearer $TOKEN" \
  -H "x-agent-id: grok-1" \
  -F file=@./chair.jpg

curl -sS "$BASE/api/shop-builder/shops/48291/photos" \
  -H "authorization: Bearer $TOKEN" \
  -H "x-agent-id: grok-1" \
  -H "content-type: application/json" \
  -d '{"url":"https://example.com/chair.jpg","itemKey":"listing-1"}' \
  -H 'if-match: "1"'
```

`?dryRun=true` validates and does not write. Release the lease when the build is done: `DELETE /api/shop-builder/shops/48291/lease` with `If-Match`.

`address` is the ward (`目黒` is stored as `目黒区`). `bio` is the shop memo (pickup notes, why they are selling). There is no display-name or language field. Item condition goes in `note`. `paused` is the seller hold. `sold` in the response is read-only.

## CLI

`scripts/shop-builder.mjs` has no dependencies. It upserts, uploads `photoFiles`, releases the lease, and prints the shop URL then the editor URL.

```bash
export SHOP_BUILDER_API_TOKEN=...
export SHOP_BUILDER_AGENT_ID=grok-1   # or set agentId in the file
node scripts/shop-builder.mjs seller.json
```

`seller.json`:

```json
{
  "agentId": "grok-1",
  "externalSource": {
    "source": "facebook_marketplace",
    "sellerId": "https://www.facebook.com/marketplace/profile/100"
  },
  "settings": { "address": "目黒", "bio": "駅前で引き渡し" },
  "items": [
    {
      "externalKey": "listing-1",
      "name": "椅子",
      "price": 1500,
      "note": "脚に小さな傷",
      "photos": ["https://example.com/chair.jpg"],
      "photoFiles": ["./chair.jpg"]
    }
  ]
}
```

`photoFiles` are paths relative to the JSON file. They are not part of the HTTP contract. Exit `2` if another agent holds the lease, `3` if the shop is claimed. `--dry-run` only validates.

Facebook prospects (grab a seller, convert, batch-build, English screenshots, send queue): [`docs/prospect-pipeline.md`](../prospect-pipeline.md).
