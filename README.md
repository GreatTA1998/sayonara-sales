# Sayonara Sales

Phone-first move-out sale. Hub `/`; seller UI `/s/{id}/admin` (Elton `/s/elton/admin`). Navbar **HELP** → bug/message. `/admin` = report inbox (not shop admin).

**Production:** https://sayonara.tokyo

## Env (Vercel)

| Variable | Required | Purpose |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | prod | Vercel Blob |
| `LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET` | optional | LINE Login |
| `LINE_CALLBACK_URL` | optional | default `{origin}/api/auth/line/callback` |
| `NEXT_PUBLIC_SITE_URL` | optional | default `https://sayonara.tokyo` |
| `REPORT_WEBHOOK_URL` | optional | POST JSON on each bug report (auto-fix) |

Soft identity via `getName()` (Jimoty-first once SS-171 lands). Pickup lead default 2 days (`leadDays`, 0 ok). Blob: `sayonara-store.json` / `sayonara-store-{id}.json` / `sayonara-reports.json`.

```bash
npm i && npm run build
```
