'use client';
// src/components/admin/charts/AssetsDonut.tsx
//
// Where the portal's value sits, by industry.
//
// A donut is the right form here only because the job is part-to-whole at a
// glance with few segments - which is why it is capped at six plus "Other" and
// why the exact figures live in the list beside it rather than on the ring.
// Past about six slices adjacent colours blur and a ring stops being readable;
// the long tail belongs in the table, not in more hues.
//
// The 2px gap between segments is the surface showing through, not a border:
// a stroke in a lighter colour would read as an eighth category.
import { useMemo } from 'react';
import {
  Chart as ChartJS, ArcElement, Tooltip, DoughnutController,
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { SURFACE, TOOLTIP, compactEur } from '@/lib/viz';

ChartJS.register(ArcElement, Tooltip, DoughnutController);

export interface Slice { label: string; value: number; color: string }

export default function AssetsDonut({
  slices, total, caption,
}: {
  slices: Slice[];
  total: number;
  /** The line under the hero figure - what the total actually covers. */
  caption: string;
}) {
  const data = useMemo(() => ({
    labels: slices.map((s) => s.label),
    datasets: [{
      data: slices.map((s) => s.value),
      backgroundColor: slices.map((s) => s.color),
      // The gap, and the hover ring, are both the surface colour.
      borderColor: SURFACE,
      borderWidth: 2,
      hoverBorderColor: SURFACE,
      hoverBorderWidth: 2,
      hoverOffset: 6,
    }],
  }), [slices]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    // Thin ring: the hole is where the headline number goes, which is the
    // thing a reader actually takes away.
    cutout: '72%',
    plugins: {
      legend: { display: false },   // drawn in HTML beside the chart
      tooltip: {
        ...TOOLTIP,
        callbacks: {
          label: (ctx: any) => {
            const value = ctx.parsed || 0;
            const share = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
            return ` ${ctx.label}: ${compactEur(value)} · ${share}%`;
          },
        },
      },
    },
  }), [total]);

  const empty = !slices.length || total <= 0;

  return (
    <div className="an-donut">
      <div className="an-donut-canvas">
        {empty ? (
          // An empty ring rather than a chart of nothing: a single grey circle
          // says "no valuations yet" honestly, where a chart.js canvas with one
          // zero-value slice would draw a full ring and read as 100% of
          // something.
          <div className="an-donut-empty" aria-hidden="true" />
        ) : (
          <Doughnut data={data} options={options as any} />
        )}
        <div className="an-donut-center">
          <span className="an-donut-total ltr-embed">{compactEur(total)}</span>
          <span className="an-donut-caption">{caption}</span>
        </div>
      </div>
    </div>
  );
}
