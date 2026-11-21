# Sayonara Sales

Phone-first move-out sale. Hub `/`; seller UI `/s/{id}/admin` (Elton `/s/elton/admin`). Navbar **ヘルプ** → report. `/admin` = Elton-only report inbox (not public; not shop admin).

**Production:** https://sayonara.tokyo

Shop state: **Firebase Firestore** via the **client SDK** + security rules + `onSnapshot` sole SOT (no client optimistic listing ids). Photos stay on Vercel Blob. Soft Jimoty identity UX; Anonymous Firebase Auth for writes. Soft-auth era: `/s/elton` admin writes need signed-in only (not `ownerUid` match); other shops still claim `ownerUid`.

## Data model

```
shops/{shopId}                    # ownerUid, address, bio, contact, slots, dates, published
shops/{shopId}/items/{itemId}     # name, price, note, photos, paused, claimId, pos
shops/{shopId}/claims/{claimId}   # code, day, slot, itemIds, contact, buyerUid, status, waiters, createdAt
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
| `LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET` | optional | LINE Login |
| `LINE_CALLBACK_URL` | optional | default `{origin}/api/auth/line/callback` |
| `NEXT_PUBLIC_SITE_URL` | optional | default `https://sayonara.tokyo` |
| `REPORT_WEBHOOK_URL` | optional | Cursor Automation webhook — POST on each Help report |
| `REPORT_WEBHOOK_AUTH` | optional | Bearer for that webhook (`Generate auth header`) |
| `AUTOFIX_DAILY_CAP` | optional | Max kicks / UTC day (default `5`; `0` = off) |

**Do not set** `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` — no server SA path.

Soft identity = Jimoty名. Pickup lead default 2 days (`leadDays`, 0 ok). Reports Blob: `sayonara-reports.json`.

## Firebase setup (once)

1. Console → Authentication → Sign-in method → **Anonymous** → Enable
2. Deploy rules: `firebase deploy --only firestore:rules --project sayonara-sales`
3. Existing Elton data stays. Soft Jimoty name is enough for `/s/elton` admin until LINE OAuth; no `ownerUid` reclaim needed.

## Dev

```bash
npm i && npm run build
```
