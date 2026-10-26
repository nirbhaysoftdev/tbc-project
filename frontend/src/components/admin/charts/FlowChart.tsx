'use client';
// src/components/admin/charts/FlowChart.tsx
//
// Capital in and profit out over the chosen period.
//
// ONE AXIS, deliberately. Both series are euros, so they share a scale and can
// be compared by eye. The transaction COUNT - a different unit entirely - is a
// separate chart below rather than a second y-axis on this one: a dual-axis
// chart lets the author decide which line looks higher, which is the single
// most common way a dashboard misleads.
//
// Two series, so there is a legend; it is drawn in HTML by the caller, beside
// the title, because identity must not be carried by colour alone.
import { useMemo } from 'react';
import {
  Chart as ChartJS, LineController, LineElement, PointElement,
  LinearScale, CategoryScale, Filler, Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { CAPITAL, PROFIT, GRID, INK_MUTED, SURFACE, TOOLTIP, bucketLabel, compactEur } from '@/lib/viz';

ChartJS.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip);

export interface FlowPoint { bucket: string; investment: number; profit: number }

export default function FlowChart({
  points, granularity, labels,
}: {
  points: FlowPoint[];
  granularity: string;
  labels: { investment: string; profit: string };
}) {
  const data = useMemo(() => {
    const axis = points.map((p) => bucketLabel(p.bucket, granularity));
    const series = (values: number[], color: string, fillTo: string) => ({
      data: values,
      borderColor: color,
      borderWidth: 2,
      // >= 8px markers, but only where a reader would aim at one: a point on
      // every bucket of a 40-bucket series is noise.
      pointRadius: (ctx: any) => (points.length <= 14 ? 4 : 0),
      pointHoverRadius: 5,
      pointBackgroundColor: color,
      // The 2px surface ring that keeps overlapping marks separable.
      pointBorderColor: SURFACE,
      pointBorderWidth: 2,
      pointHitRadius: 18,
      fill: true,
      backgroundColor: (ctx: any) => {
        const { ctx: c, chartArea } = ctx.chart;
        if (!chartArea) return 'transparent';
        const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, fillTo);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        return g;
      },
      tension: 0.35,
    });

    return {
      labels: axis,
      datasets: [
        { ...series(points.map((p) => p.investment), CAPITAL, 'rgba(57,135,229,0.26)'), label: labels.investment },
        { ...series(points.map((p) => p.profit), PROFIT, 'rgba(25,158,112,0.24)'), label: labels.profit },
      ],
    };
  }, [points, granularity, labels]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    // The crosshair: hovering anywhere in a column reports both series for
    // that bucket, which is the comparison the chart exists to support.
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...TOOLTIP,
        callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${compactEur(ctx.parsed.y || 0)}` },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: GRID },
        ticks: {
          color: INK_MUTED, font: { size: 10 },
          maxRotation: 0, autoSkip: true, maxTicksLimit: 8,
        },
      },
      y: {
        beginAtZero: true,
        // Hairline, solid, recessive. Never dashed.
        grid: { color: GRID, drawTicks: false },
        border: { display: false },
        ticks: {
          color: INK_MUTED, font: { size: 10 }, padding: 8, maxTicksLimit: 5,
          callback: (v: any) => compactEur(Number(v)),
        },
      },
    },
  }), []);

  return (
    <div className="an-chart-canvas">
      {points.length === 0
        ? <p className="an-empty">Nothing moved in this period.</p>
        : <Line data={data} options={options as any} />}
    </div>
  );
}
