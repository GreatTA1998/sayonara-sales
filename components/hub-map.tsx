"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Pin } from "@/lib/shop";
import { MEGURO } from "@/lib/shop";

type Props = {
  pins: Pin[];
  focus?: { lat: number; lng: number } | null;
  onPin: (id: string) => void;
};

/** Leaflet map — load via next/dynamic ssr:false from hub. */
export default function HubMap({ pins, focus, onPin }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onPinRef = useRef(onPin);
  const [ready, setReady] = useState(false);
  onPinRef.current = onPin;

  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const map = L.map(el.current, { zoomControl: false, attributionControl: true })
      .setView([MEGURO.lat, MEGURO.lng], 14);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setReady(true);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!ready || !layer) return;
    layer.clearLayers();
    for (const p of pins) {
      const html = `<span class="hub-pin${p.mine ? " mine" : ""}">${esc(p.name)}</span>`;
      const marker = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: "hub-pin-wrap", html, iconSize: [0, 0], iconAnchor: [0, 0] }),
      });
      marker.on("click", () => onPinRef.current(p.id));
      marker.addTo(layer);
    }
  }, [pins, ready]);

  useEffect(() => {
    if (!ready || !focus || !mapRef.current) return;
    mapRef.current.setView([focus.lat, focus.lng], 15, { animate: true });
  }, [focus, ready]);

  return <div ref={el} className="hub-map" role="presentation" />;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
