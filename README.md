# Sayonara Sales

Phone-first move-out sale: buyer claims at `/`, admin at `/admin`.

## Env (Vercel)

| Variable | Required | Purpose |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | prod | Vercel Blob persistence (auto when Blob linked) |
| `LINE_INVITE_URL` | no | Checkout LINE invite link override |
| `LINE_CHANNEL_ID` | for real LINE Login | LINE Developers **Channel ID** |
| `LINE_CHANNEL_SECRET` | for real LINE Login | LINE Developers **Channel secret** |
| `LINE_CALLBACK_URL` | no | Full callback URL if it must differ from `https://<host>/api/auth/line/callback` |

LINE Login console: add callback `https://sayonara-sales-nu.vercel.app/api/auth/line/callback` (and preview hosts if needed).

Without `LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET`, **LINE** uses a demo session named **エルトン** so the UI can be tested. Guest browsing stays unlabeled until that link.

## Dev

```bash
npm i && npm run dev
```

Pickup days: Nov 1–8 (Asia/Tokyo) in `lib/sale.ts`. Items flagged **後半のみ** are only claimable on the last 4 days (Nov 5–8). Claims are serialized server-side; booked items cannot be double-claimed.
