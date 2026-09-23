"use client";

import dynamic from "next/dynamic";
import type { Complaint } from "@/lib/schema";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] w-full items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">
      Loading map…
    </div>
  )
});

type Props = {
  complaints: Complaint[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export default function MapWrapper(props: Props) {
  return <MapView {...props} />;
}
