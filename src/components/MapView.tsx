"use client";

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import type { Complaint } from "@/lib/schema";
import { PRIORITY_STYLE, STATUS_STYLE } from "@/lib/civic";

function pinIcon(hex: string, selected: boolean) {
  return L.divIcon({
    className: "",
    html: `<span class="civic-pin${selected ? " is-selected" : ""}" style="background:${hex}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

type Props = {
  complaints: Complaint[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

const DEFAULT_CENTER: [number, number] = [12.9716, 77.5946];

export default function MapView({ complaints, selectedId, onSelect }: Props) {
  const located = complaints.filter(
    (c): c is Complaint & { lat: number; lng: number } =>
      typeof c.lat === "number" && typeof c.lng === "number"
  );

  const center: [number, number] =
    located.length > 0
      ? [
          located.reduce((s, c) => s + c.lat, 0) / located.length,
          located.reduce((s, c) => s + c.lng, 0) / located.length
        ]
      : DEFAULT_CENTER;

  return (
    <MapContainer
      center={center}
      zoom={located.length > 0 ? 12 : 11}
      scrollWheelZoom
      className="h-[320px] w-full rounded-xl bg-slate-100 sm:h-[420px]"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {located.map((c) => {
        const style = PRIORITY_STYLE[c.priority] ?? PRIORITY_STYLE.medium;
        return (
          <Marker
            key={c.id}
            position={[c.lat, c.lng]}
            icon={pinIcon(style.hex, c.id === selectedId)}
            eventHandlers={{ click: () => onSelect(c.id) }}
          >
            <Popup>
              <div className="min-w-[200px] space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: style.hex }}
                  />
                  <span className="font-semibold text-slate-800">
                    {style.label} · {c.category}
                  </span>
                </div>
                <p className="text-slate-700">{c.summary}</p>
                <p className="text-xs text-slate-500">
                  {c.routeTo} · {STATUS_STYLE[c.status]?.label ?? c.status}
                </p>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="mt-1 rounded-md bg-civic-700 px-2 py-1 text-xs font-semibold text-white hover:bg-civic-800"
                >
                  Open details
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
