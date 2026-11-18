# Sayonara Sales

Phone-first move-out sale: hub at `/`, Elton buyer at `/s/elton`, Elton admin at `/admin`. Independent shops: `/s/{5-digit-id}` (+ `/admin` stub); LINE名→id in localStorage.

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
