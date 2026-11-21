# Sayonara Sales

Phone-first move-out sale. Hub `/`; shops `/s/{5-digit}` + `/s/{id}/admin`; Elton `/s/elton`, `/admin`.

**Production:** https://sayonara.tokyo

## Env (Vercel)

| Variable | Required | Purpose |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | prod | Vercel Blob |
| `LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET` | optional | LINE Login |
| `LINE_CALLBACK_URL` | optional | default `{origin}/api/auth/line/callback` |
| `NEXT_PUBLIC_SITE_URL` | optional | default `https://sayonara.tokyo` |

Soft LINE名 always works. Pickup lead default 2 days (`leadDays`, 0 ok). Blob: `sayonara-store.json` / `sayonara-store-{id}.json`.

```bash
npm i && npm run build
```
