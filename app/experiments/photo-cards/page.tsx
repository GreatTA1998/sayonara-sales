"use client";
/**
 * EXPERIMENT SCAFFOLD — disposable. Not production.
 * Path: /experiments/photo-cards
 * Same A/B/C/D + radius as buyer/admin footers (sessionStorage shared).
 */
import { useEffect, useMemo, useState } from "react";
import {
  PhotoGrid, PhotoLayoutFooter, usePhotoLayout, type PhotoItem,
} from "@/components/photo-listing";

const FIXTURES: PhotoItem[] = [
  { id: "fx1", name: "IKEA desk", price: 3000, note: "sturdy, some scratches", photos: ["https://picsum.photos/seed/ss-desk/600/600"] },
  { id: "fx2", name: "Bookshelf", price: 1000, note: "white, 5 shelves", photos: ["https://picsum.photos/seed/ss-shelf/600/600"] },
  { id: "fx3", name: "Small fridge", price: 5000, note: "needs cleaning", photos: ["https://picsum.photos/seed/ss-fridge/600/600"] },
  { id: "fx4", name: "Floor lamp", price: 800, note: "warm LED", photos: ["https://picsum.photos/seed/ss-lamp/600/600"] },
  { id: "fx5", name: "Office chair", price: 2000, note: "slight wear", photos: ["https://picsum.photos/seed/ss-chair/600/600"] },
  { id: "fx6", name: "Microwave", price: 1500, photos: ["https://picsum.photos/seed/ss-micro/600/600"] },
  { id: "fx7", name: "Rice cooker", price: null, photos: ["https://picsum.photos/seed/ss-rice/600/600"] },
  { id: "fx8", name: "Hangers", price: null, photos: ["https://picsum.photos/seed/ss-hang/600/600"] },
];

const HINT = {
  A: "A — full-width price|name bar",
  B: "B — photo + name/desc (liked @ 20px)",
  C: "C — square + price chip",
  D: "D — dense photo only",
} as const;

export default function PhotoCardsExperiment() {
  const layout = usePhotoLayout();
  const [live, setLive] = useState<PhotoItem[] | null>(null);

  useEffect(() => {
    fetch("/api/state", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { items?: PhotoItem[] }) => {
        const withPh = (data.items || []).filter((i) => (i.photos || []).length > 0);
        setLive(withPh.length ? withPh : null);
      })
      .catch(() => setLive(null));
  }, []);

  const items = useMemo(() => live ?? FIXTURES, [live]);

  return (
    <main className="buy xpad" style={{ background: "#f3f3f3", minHeight: "100vh" }}>
      <header style={{ padding: "10px 12px", background: "#111", color: "#ffcc66", fontSize: 12 }}>
        <strong>EXPERIMENT</strong> — playground · same controls as buyer/admin · delete later
      </header>
      <p style={{ margin: "8px 12px", fontSize: 12, color: "#666" }}>
        {HINT[layout.mode]} · {live ? "live listings" : "fixtures"}
      </p>
      <PhotoGrid items={items} mode={layout.mode} radius={layout.radius} cols={layout.cols} />
      <PhotoLayoutFooter {...layout} />
    </main>
  );
}
