# Sayonara Sales

Phone-first move-out sale: buyer claims at `/`, admin at `/admin`.

## Env

- `BLOB_READ_WRITE_TOKEN` — set automatically when a Vercel Blob store is linked (production persistence)
- `LINE_INVITE_URL` — optional LINE invite override for checkout

## Dev

```bash
npm i && npm run dev
```

Pickup days: Nov 1–8 (Asia/Tokyo). Claims are serialized server-side; booked items cannot be double-claimed.
