"use client";

import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { Complaint } from "@/lib/schema";

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

/**
 * DeptLoadChart — department workload as horizontal instrument bars.
 * Total open load (blue) with urgent overlay (red) — reads like a control
 * room queue board rather than a generic bar chart.
 */
export default function DeptLoadChart({ complaints }: { complaints: Complaint[] }) {
  const ref = useRef<HTMLDivElement>(null);

  const option = useMemo(() => {
    const byDept = new Map<string, { total: number; urgent: number }>();
    for (const c of complaints) {
      if (c.status === "resolved") continue;
      const d = byDept.get(c.routeTo) ?? { total: 0, urgent: 0 };
      d.total += c.reportCount ?? 1;
      if (c.priority === "urgent") d.urgent += 1;
      byDept.set(c.routeTo, d);
    }
    const rows = [...byDept.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    return {
      animationDuration: 650,
      animationEasing: "cubicOut" as const,
      grid: { left: 8, right: 30, top: 6, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "rgba(255,255,255,0.97)",
        borderColor: "#dfe5ec",
        textStyle: { color: "#24344d", fontSize: 11 }
      },
      xAxis: {
        type: "value",
        minInterval: 1,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "#e9edf2" } },
        axisLabel: { color: "#8593a8", fontSize: 9 }
      },
      yAxis: {
        type: "category",
        data: rows.map((r) => r.name),
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#24344d", fontSize: 10, width: 150, overflow: "truncate" }
      },
      series: [
        {
          name: "Open load",
          type: "bar",
          barWidth: 10,
          itemStyle: { color: "#3a75b8", borderRadius: [0, 5, 5, 0] },
          data: rows.map((r) => r.total)
        },
        {
          name: "Urgent",
          type: "bar",
          barWidth: 4,
          barGap: "-80%",
          itemStyle: { color: "#c2364b", borderRadius: [0, 2, 2, 0] },
          data: rows.map((r) => r.urgent)
        }
      ]
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

  return <div ref={ref} className="h-[200px] w-full" />;
}
