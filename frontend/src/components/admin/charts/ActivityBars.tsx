'use client';
// src/components/admin/charts/ActivityBars.tsx
//
// How many transactions were booked in each bucket.
//
// Its own chart rather than a second axis on FlowChart: a count and a euro
// amount do not share a scale, and putting them on one plot would let the
// vertical position of one series be set by the author rather than the data.
//
// One series, so there is no legend - the title names it. Bars are thin with a
// 4px rounded top anchored to the baseline; the rounding is on the data end
// only, because a rounded bottom would lift the bar off its own zero line.
import { useMemo } from 'react';
import {
  Chart as ChartJS, BarController, BarElement, LinearScale, CategoryScale, Tooltip,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { SERIES, GRID, INK_MUTED, TOOLTIP, bucketLabel, compactEur } from '@/lib/viz';

ChartJS.register(BarController, BarElement, LinearScale, CategoryScale, Tooltip);

export interface ActivityPoint { bucket: string; transactions: number; volume: number }

export default function ActivityBars({
  points, granularity, label,
}: {
  points: ActivityPoint[];
  granularity: string;
  label: string;
}) {
  const data = useMemo(() => ({
    labels: points.map((p) => bucketLabel(p.bucket, granularity)),
    datasets: [{
      label,
      data: points.map((p) => p.transactions),
      // Slot 6. Not slot 1 - that is capital, and colour follows the entity.
      backgroundColor: SERIES[5],
      hoverBackgroundColor: SERIES[5],
      borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
      borderSkipped: false,
      maxBarThickness: 18,
      // The 2px surface gap between adjacent bars.
      categoryPercentage: 0.82,
      barPercentage: 0.9,
    }],
  }), [points, granularity, label]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...TOOLTIP,
        callbacks: {
          label: (ctx: any) => {
            const point = points[ctx.dataIndex];
            return [` ${ctx.parsed.y} transaction${ctx.parsed.y === 1 ? '' : 's'}`,
                    ` ${compactEur(point?.volume || 0)} moved`];
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: GRID },
        ticks: { color: INK_MUTED, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
      },
      y: {
        beginAtZero: true,
        grid: { color: GRID, drawTicks: false },
        border: { display: false },
        ticks: {
          color: INK_MUTED, font: { size: 10 }, padding: 8, maxTicksLimit: 4,
          // Counts are integers; a tick reading "2.5 transactions" is nonsense.
          precision: 0,
        },
      },
    },
  }), [points]);

  return (
    <div className="an-chart-canvas an-chart-canvas-short">
      {points.length === 0
        ? <p className="an-empty">No transactions in this period.</p>
        : <Bar data={data} options={options as any} />}
    </div>
  );
}
