# Sayonara Sales

Phone-first move-out sale: buyer claims at `/`, admin at `/admin`.

## Env

- `ADMIN_PASSWORD` — server-checked admin password (default local/preview: `admin`)
- `BLOB_READ_WRITE_TOKEN` — set automatically when a Vercel Blob store is linked (production persistence)

## Dev

```bash
npm i && npm run dev
```

Pickup days: Nov 1–8 (Asia/Tokyo). Claims are serialized server-side; booked items cannot be double-claimed.
