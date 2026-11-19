/** Canonical production origin (apex). Override via NEXT_PUBLIC_SITE_URL. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://sayonara.tokyo").replace(/\/$/, "");
