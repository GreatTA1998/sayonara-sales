# Sayonara Sales

Phone-first move-out sale: buyer claims at `/`, admin at `/admin`.

## Env (Vercel)

| Variable | Required | Purpose |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | prod | Vercel Blob persistence (auto when Blob linked) |
| `LINE_INVITE_URL` | no | Checkout LINE invite link override |

## Dev

```bash
npm i && npm run dev
```

Pickup days: Nov 1–8 (Asia/Tokyo) in `lib/sale.ts`. Items flagged **後半のみ** are only claimable on the last 4 days (Nov 5–8). Shop label is static **エルトン**. Claims are serialized server-side; booked items cannot be double-claimed.
