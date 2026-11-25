/** Caps for one shop-builder request. The OpenAPI `info.x-limits` block must match. */
export const LIMITS = {
  itemsPerRequest: 40,
  photosPerItem: 12,
  leaseSeconds: 900,
  listLimit: 50,
  photoBytes: 12 * 1024 * 1024,
} as const;
