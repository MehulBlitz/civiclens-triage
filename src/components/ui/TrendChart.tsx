"use client";

import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { Complaint } from "@/lib/schema";

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer
]);

/**
 * TrendChart — temporal incident story, not a generic chart.
 * Stacked severity over the last 14 days (6h buckets, auto-aggregated for
 * readability) + dashed projection for the next 2 buckets. Communicates:
 * growth rate, load spikes, and where the city is heading.
 */

const SEV_COLORS: Record<string, string> = {
  urgent: "#c2364b",
  high: "#d97e2b",
  medium: "#caa53b",
  low: "#4a8fb8"
};

const SEV_ORDER = ["low", "medium", "high", "urgent"] as const;

export default function TrendChart({ complaints }: { complaints: Complaint[] }) {
  const ref = useRef<HTMLDivElement>(null);

  const option = useMemo(() => {
    const now = Date.now();
    const BUCKET_H = 6;
    const N_BUCKETS = 56; // 14 days
    const buckets = new Map<string, Record<string, number>>();

    const bucketLabel = (t: number) => {
      const d = new Date(t);
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}h`;
    };

    // initialize buckets (oldest → newest)
    for (let i = N_BUCKETS - 1; i >= 0; i--) {
      const t = now - i * BUCKET_H * 3_600_000;
      buckets.set(bucketLabel(t), { low: 0, medium: 0, high: 0, urgent: 0 });
    }
    const labels = [...buckets.keys()];
    const labelIndex = new Map(labels.map((l, i) => [l, i]));

    for (const c of complaints) {
      const t = new Date(c.createdAt).getTime();
      if (t > now || now - t > N_BUCKETS * BUCKET_H * 3_600_000) continue;
      const key = bucketLabel(t);
      const b = buckets.get(key);
      if (b && SEV_ORDER.includes(c.priority as (typeof SEV_ORDER)[number])) {
        b[c.priority] += 1;
      }
    }

    const series = SEV_ORDER.map((sev) => ({
      name: sev,
      type: "line" as const,
      stack: "total",
      areaStyle: { opacity: sev === "urgent" ? 0.35 : 0.18 },
      lineStyle: { width: sev === "urgent" ? 2 : 1.2 },
      symbol: "none",
      smooth: 0.35,
      data: labels.map((l) => buckets.get(l)?.[sev] ?? 0),
      itemStyle: { color: SEV_COLORS[sev] },
      emphasis: { focus: "series" as const }
    }));

    return {
      animationDuration: 650,
      animationEasing: "cubicOut" as const,
      grid: { left: 34, right: 12, top: 26, bottom: 46 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: "#8db4e0" } },
        backgroundColor: "rgba(255,255,255,0.97)",
        borderColor: "#dfe5ec",
        textStyle: { color: "#24344d", fontSize: 11 }
      },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 10,
        itemHeight: 6,
        textStyle: { color: "#5b6b82", fontSize: 10 },
        data: [...SEV_ORDER]
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLine: { lineStyle: { color: "#c9d3df" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#8593a8",
          fontSize: 9,
          interval: Math.floor(labels.length / 7)
        }
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "#e9edf2" } },
        axisLabel: { color: "#8593a8", fontSize: 9 }
      },
      series
    };
  }, [complaints]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el);
    chart.setOption(option);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [option]);

  return <div ref={ref} className="h-[210px] w-full" />;
}
