import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Ticket } from "../lib/tickets";

const COLORS: Record<string, string> = { urgent: "#e11d48", high: "#f97316", medium: "#eab308", low: "#0284c7" };

export default function OsmMap({ tickets }: { tickets: Ticket[] }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!element.current) return;
    map.current = L.map(element.current, { zoomControl: true }).setView([19.076, 72.8777], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19 }).addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    const layer = L.layerGroup().addTo(map.current);
    tickets.forEach((ticket) => {
      const marker = L.circleMarker([ticket.lat, ticket.lng], { radius: ticket.priority === "urgent" ? 11 : 8, color: "#fff", weight: 2, fillColor: COLORS[ticket.priority], fillOpacity: 0.9 });
      marker.bindPopup(`<strong>#CL-${1000 + ticket.id} · ${ticket.category}</strong><br>${ticket.location || `Ward ${ticket.ward}`}<br><small>${ticket.priority} · ${ticket.status.replace("_", " ")}</small>`).addTo(layer);
    });
    return () => { layer.remove(); };
  }, [tickets]);

  return <div ref={element} className="h-[440px] w-full rounded-xl" aria-label="OpenStreetMap complaint map" />;
}