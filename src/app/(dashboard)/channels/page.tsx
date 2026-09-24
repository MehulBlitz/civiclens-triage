"use client";

import { useCivic } from "@/components/CivicProvider";
import ChannelsPanel from "@/components/ChannelsPanel";

export default function ChannelsPage() {
  const { onTriaged } = useCivic();

  return (
    <div className="space-y-5">
      <ChannelsPanel onTriaged={onTriaged} />
    </div>
  );
}
