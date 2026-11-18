# Sayonara Sales

Phone-first move-out sale. Hub `/`: **買う** = Elton listings + ward map/sales list; **売る** = real admin UI + 「ログインして保存」(LINE名). Independent shops: `/s/{5-digit}` + `/s/{id}/admin` (own Blob key). Elton: `/s/elton`, `/admin` (legacy Blob).

## Env (Vercel)

| Variable | Required | Purpose |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | prod | Vercel Blob persistence (auto when Blob linked) |
| `LINE_INVITE_URL` | no | Checkout LINE invite link override |

## Dev

```bash
npm i && npm run build
```

Pickup days: Nov 1–8 (Asia/Tokyo) in `lib/sale.ts`. Blob keys: `sayonara-store.json` (Elton), `sayonara-store-{id}.json` (others).
