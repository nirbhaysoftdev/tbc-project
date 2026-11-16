'use client';
// src/components/charts/AllocationDonut.tsx
//
// Where a member's capital sits: one slice per project, plus the opening
// balance, with the total in the middle and a legend table beside it.
//
// Colours come from lib/viz.ts (assigned in order, never cycled; anything past
// the sixth slice folds into a neutral "Other"), and identity never rests on
// colour alone - every slice is also a row in the table with its amount and
// share.
import { Chart as ChartJS, ArcElement, Tooltip, ChartOptions } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { formatEur } from '@/lib/api';
import { formatNumber } from '@/i18n/format';
import { topSlices, SURFACE } from '@/lib/viz';

ChartJS.register(ArcElement, Tooltip);

export interface AllocationRow { label: string; capital: number }

export default function AllocationDonut({ rows, totalLabel }: { rows: AllocationRow[]; totalLabel: string }) {
  const present = rows.filter((r) => r.capital > 0);
  const slices = topSlices(present.map((r) => ({ ...r, total: r.capital })), (r) => r.label);
  const total = slices.reduce((s, x) => s + x.value, 0);

  const data = {
    labels: slices.map((s) => s.label),
    datasets: [{
      data: slices.map((s) => s.value),
      backgroundColor: slices.map((s) => s.color),
      borderColor: SURFACE, borderWidth: 2, hoverOffset: 6,
    }],
  };
  const options: ChartOptions<'doughnut'> = {
    responsive: true, maintainAspectRatio: false, cutout: '68%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#070e24', borderColor: 'rgba(98,128,225,0.34)', borderWidth: 1, padding: 10,
        callbacks: {
          label: (c) => {
            const v = c.parsed as number;
            return ` ${formatEur(v)} · ${formatNumber(total > 0 ? (v / total) * 100 : 0, { maximumFractionDigits: 1 })}%`;
          },
        },
      },
    },
  };

  return (
    <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: 220, height: 220, flexShrink: 0 }}>
        <Doughnut data={data} options={options} />
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{totalLabel}</span>
          <span className="ltr-embed" style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{formatEur(total)}</span>
        </div>
      </div>

      <table className="tx-table" style={{ flex: '1 1 240px', width: 'auto', minWidth: 240 }}>
        <tbody>
          {slices.map((s) => (
            <tr key={s.label}>
              <td style={{ width: 22 }}>
                <span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 3, background: s.color }} />
              </td>
              <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.label}</td>
              <td className="ltr-embed" style={{ textAlign: 'right' }}>{formatEur(s.value)}</td>
              <td className="ltr-embed" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                {formatNumber(total > 0 ? (s.value / total) * 100 : 0, { maximumFractionDigits: 1 })}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
