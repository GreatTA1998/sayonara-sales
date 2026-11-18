"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Pin } from "@/lib/shop";
import { MEGURO } from "@/lib/shop";

type Props = {
  pins: Pin[];
  focus?: { lat: number; lng: number } | null;
  selectedWard?: string | null;
  onWard?: (ward: string) => void;
};

/** Ward-level map — low zoom, no street clutter. */
export default function HubMap({ pins, focus, selectedWard, onWard }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onWardRef = useRef(onWard);
  const [ready, setReady] = useState(false);
  onWardRef.current = onWard;

  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const map = L.map(el.current, {
      zoomControl: false, attributionControl: true,
      minZoom: 10, maxZoom: 12,
    }).setView([MEGURO.lat, MEGURO.lng], 11);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    // Quiet basemap at ward zoom (max 12). ESRI light gray — no API key.
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri",
      maxZoom: 12,
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
      const on = selectedWard === p.ward;
      const html = `<span class="hub-pin ward${on ? " on" : ""}">${esc(p.name)}</span>`;
      const marker = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: "hub-pin-wrap", html, iconSize: [0, 0], iconAnchor: [0, 0] }),
        zIndexOffset: on ? 500 : 0,
      });
      marker.on("click", () => onWardRef.current?.(p.ward));
      marker.addTo(layer);
      if (on) {
        L.circle([p.lat, p.lng], {
          radius: 1200, color: "#111", weight: 2, fillColor: "#ff9900", fillOpacity: 0.18,
        }).addTo(layer);
      }
    }
  }, [pins, selectedWard, ready]);

  useEffect(() => {
    if (!ready || !focus || !mapRef.current) return;
    mapRef.current.setView([focus.lat, focus.lng], 12, { animate: true });
  }, [focus, ready]);

  return <div ref={el} className="hub-map" role="presentation" />;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
