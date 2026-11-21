# Sayonara Sales

Phone-first move-out sale. Hub `/`: **買う** = Elton listings + ward map/sales list; **売る** = real admin UI + 「ログインして保存」(LINE名). Independent shops: `/s/{5-digit}` + `/s/{id}/admin`. Elton: `/s/elton`, `/admin`.

**Production:** https://sayonara.tokyo (apex; `www` 308→apex)

Shop state lives in **Firebase Firestore** (project `sayonara-sales`, Standard, `asia-northeast1`). Photos stay on Vercel Blob.

## Data model

```
shops/{shopId}                    # address, bio, contact, slots, dates, published
shops/{shopId}/items/{itemId}     # name, price, note, photos, paused, claimId, pos
shops/{shopId}/claims/{claimId}   # code, day, slot, itemIds, contact, status, createdAt
```

API routes use a thin Firestore REST helper + service account (rules deny all client access; no `firebase-admin`). Path to optimistic UI: open published-shop reads + client `onSnapshot` later without opening writes.

## Env (Vercel)

| Variable | Required | Purpose |
|---|---|---|
| `FIREBASE_PROJECT_ID` | prod | `sayonara-sales` (already set) |
| `FIREBASE_CLIENT_EMAIL` | prod | Service account email (server-only) |
| `FIREBASE_PRIVATE_KEY` | prod | Service account private key (server-only; escape newlines as `\n`) |
| `BLOB_READ_WRITE_TOKEN` | prod | Photo uploads (auto when Blob linked) |
| `LINE_CHANNEL_ID` | optional | LINE Login channel ID |
| `LINE_CHANNEL_SECRET` | optional | LINE Login channel secret |
| `LINE_CALLBACK_URL` | optional | Callback URI; default `{origin}/api/auth/line/callback` |
| `NEXT_PUBLIC_SITE_URL` | optional | Canonical origin (default `https://sayonara.tokyo`) |

Soft LINE名 login always works. Real LINE Login is optional.

### Service account key

Org policy may block automated key creation. In [Google Cloud IAM → Service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=sayonara-sales):

1. Use `sayonara-vercel@sayonara-sales.iam.gserviceaccount.com` (already has `roles/datastore.user`) or `firebase-adminsdk-…`
2. If **Keys → Add key** is blocked, allow key creation for this project (org policy `iam.disableServiceAccountKeyCreation`), then create a JSON key
3. Set `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` on Vercel (and Cursor secrets if prompted)

## Migrate (idempotent)

```bash
# One-shot with Firebase CLI login (no SA key):
node scripts/migrate-via-rest.mjs --shop=elton

# Or with Admin SDK creds:
FIREBASE_PROJECT_ID=sayonara-sales FIREBASE_CLIENT_EMAIL=... FIREBASE_PRIVATE_KEY=... \
  npm run migrate:firestore -- --shop=elton
# or: --from=./store.json / --from=https://...
```

## Dev

```bash
npm i && npm run test:store-race && npm run build
```

Pickup days default in `lib/sale.ts` (shops may override).
