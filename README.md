# Sayonara Sales

Phone-first move-out sale. Hub `/`: **買う** = Elton listings + ward map/sales list; **売る** = real admin UI + 「ログインして保存」(LINE名). Independent shops: `/s/{5-digit}` + `/s/{id}/admin` (own Blob key). Elton: `/s/elton`, `/admin` (legacy Blob).

## Env (Vercel)

| Variable | Required | Purpose |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | prod | Vercel Blob persistence (auto when Blob linked) |
| `LINE_CHANNEL_ID` | optional | LINE Login channel ID (real OAuth) |
| `LINE_CHANNEL_SECRET` | optional | LINE Login channel secret |
| `LINE_CALLBACK_URL` | optional | Callback URI; default `{origin}/api/auth/line/callback` |
| `NEXT_PUBLIC_SITE_URL` | optional | Canonical origin (default `https://sayonara.tokyo`) |

Soft LINE名 login always works. Real LINE Login is optional; console steps live in the project store doc `docs/line-login-setup.md`.

## Dev

```bash
npm i && npm run build
```

Pickup days: Nov 1–8 (Asia/Tokyo) in `lib/sale.ts`. Blob keys: `sayonara-store.json` (Elton), `sayonara-store-{id}.json` (others).
