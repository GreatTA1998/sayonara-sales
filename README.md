# Sayonara Sales

Phone-first move-out sale. Hub `/`: **買う** = Elton listings + ward map/sales list; **売る** = real admin UI + 「ログインして保存」(LINE名). Independent shops: `/s/{5-digit}` + `/s/{id}/admin`. Elton: `/s/elton`, `/admin`.

**Production:** https://sayonara.tokyo (apex; `www` 308→apex)

Shop state lives in **Supabase/Postgres** (project `sayonara-sales`). Photos stay on Vercel Blob.

## Env (Vercel)

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | prod | `https://nqxfrzjkvsnxsmqhfdag.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | Service role key (server-only; never expose to client) |
| `BLOB_READ_WRITE_TOKEN` | prod | Photo uploads (auto when Blob linked) |
| `LINE_CHANNEL_ID` | optional | LINE Login channel ID |
| `LINE_CHANNEL_SECRET` | optional | LINE Login channel secret |
| `LINE_CALLBACK_URL` | optional | Callback URI; default `{origin}/api/auth/line/callback` |
| `NEXT_PUBLIC_SITE_URL` | optional | Canonical origin (default `https://sayonara.tokyo`) |

Soft LINE名 login always works. Real LINE Login is optional.

## Migrate Blob → Supabase

Idempotent upsert (does not wipe extra rows):

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/migrate-blob-to-supabase.mjs --shop=elton
# or: --from=./store.json   /   --from=https://...
```

Schema: `supabase/migrations/20261121_shops_items_claims.sql` (tables `shops`, `items`, `claims`; RLS on, no anon policies — service role only).

## Dev

```bash
npm i && npm run test:store-race && npm run build
```

Pickup days: Nov 1–8 (Asia/Tokyo) in `lib/sale.ts` (shops may override).
