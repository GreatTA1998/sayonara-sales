# Sayonara Sales

Phone-first move-out sale. Hub `/`; seller UI `/s/{id}/admin` (Elton `/s/elton/admin`). Navbar **ヘルプ** → report. `/admin` = Elton inbox: help master-detail + unclaimed dig5s (delete only after typing **OK**).

**Production:** https://sayonara.tokyo (Promote only)  
**Beta:** https://beta.sayonara.tokyo (merges land here first — see store `docs/beta-sayonara-tokyo.md`)

Shop state: **Firebase Firestore** via the **client SDK** + security rules + `onSnapshot` sole SOT (no client optimistic listing ids). Photos stay on Vercel Blob. Soft identity = Jimoty and/or LINE and/or Facebook name (one account); hard login = LINE OAuth (needs channel env). Anonymous Firebase Auth for writes. Soft-auth era: `/s/elton` admin writes need signed-in only (not `ownerUid` match). An unclaimed shop (no `ownerUid`) can be edited by any signed-in user, including anonymous auth, and stays unpublished. `ownerUid` is set only by Claim; after that only the owner edits.

## Data model

```
shops/{shopId}                    # ownerUid (claim only), ownerLineUid, address, bio, contact, slots, dates, published
shops/{shopId}/items/{itemId}     # name, price, note, photos, paused, claimId, pos
shops/{shopId}/claims/{claimId}   # code, day, slot, itemIds, contact, buyerUid, status, waiters, createdAt
uids/{firebaseUid}                # shopId — one shop per account (claim transaction + rules)
```

## Env (Vercel)

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | prod | Web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | prod | `sayonara-sales.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | prod | `sayonara-sales` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | prod | Web app id |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | prod | Sender id |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | prod | Storage bucket |
| `BLOB_READ_WRITE_TOKEN` | prod | Photo uploads only |
| `SHOP_BUILDER_API_TOKEN` | optional | Bearer for `/api/shop-builder` (404 if unset). See `docs/api/README.md` |
| `LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET` | optional | Hard LINE OAuth (see store `docs/line-login-setup.md`) |
| `LINE_CHANNEL_ACCESS_TOKEN` | optional | Messaging API push (`/v2/bot/message/push`); no-op if unset |
| `NEXT_PUBLIC_SITE_URL` | optional | prod default `https://sayonara.tokyo`; Preview/`beta` → `https://beta.sayonara.tokyo` |
| `REPORT_WEBHOOK_URL` | optional | Cursor Automation webhook — POST on each Help report |
| `REPORT_WEBHOOK_AUTH` | optional | Bearer for that webhook (`Generate auth header`) |
| `AUTOFIX_DAILY_CAP` | optional | Max kicks / UTC day (default `5`; `0` = off) |

**Do not set** `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` — no server SA path.

Soft identity = ジモティー名 and/or LINE名 and/or Facebook名. Pickup lead default 2 days (`leadDays`, 0 ok). Reports Blob: `sayonara-reports.json`.

## Firebase setup (once)

1. Console → Authentication → Sign-in method → **Anonymous** → Enable
2. Deploy rules: `firebase deploy --only firestore:rules --project sayonara-sales`
3. Existing Elton data stays. Soft Jimoty/LINE name is enough for `/s/elton` admin; hard LINE OAuth is optional until channel secrets exist.

## Dev

```bash
npm i && npm run build
```
