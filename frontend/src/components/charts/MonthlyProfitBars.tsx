'use client';
// src/components/charts/MonthlyProfitBars.tsx
//
// Profit credited to a member, month by month for the last 12 months, stacked
// by where it came from: monthly fix, annual insurance and one-time profit.
// Empty months are kept so the bars stay evenly spaced. Colours are the shared
// categorical slots (lib/viz.ts) and the legend is real text, not colour alone.
import {
  Chart as ChartJS, BarElement, LinearScale, CategoryScale, Tooltip, Legend, ChartOptions,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { formatEur } from '@/lib/api';
import { formatDate } from '@/i18n/format';
import { SERIES, GRID, INK_MUTED, compactEur } from '@/lib/viz';

ChartJS.register(BarElement, LinearScale, CategoryScale, Tooltip, Legend);

export interface MonthPoint { month: string; monthly: number; insurance: number; oneTime: number; total: number }

const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  return formatDate(new Date(Number(y), Number(m) - 1, 1), { month: 'short', year: '2-digit' });
};

export default function MonthlyProfitBars({
  series, labels,
}: {
  series: MonthPoint[];
  labels: { monthly: string; insurance: string; oneTime: string };
}) {
  const data = {
    labels: series.map((p) => monthLabel(p.month)),
    datasets: [
      { label: labels.monthly,   data: series.map((p) => p.monthly),   backgroundColor: SERIES[2], borderRadius: 3, stack: 'p' },
      { label: labels.insurance, data: series.map((p) => p.insurance), backgroundColor: SERIES[3], borderRadius: 3, stack: 'p' },
      { label: labels.oneTime,   data: series.map((p) => p.oneTime),   backgroundColor: SERIES[5], borderRadius: 3, stack: 'p' },
    ],
  };
  const options: ChartOptions<'bar'> = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', align: 'end', labels: { color: INK_MUTED, boxWidth: 10, boxHeight: 10, font: { size: 11 }, usePointStyle: true } },
      tooltip: {
        backgroundColor: '#070e24', borderColor: 'rgba(98,128,225,0.34)', borderWidth: 1, padding: 10,
        callbacks: { label: (c) => ` ${c.dataset.label}: ${formatEur(c.parsed.y ?? 0)}` },
      },
    },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { color: INK_MUTED, font: { size: 10 } }, border: { display: false } },
      y: { stacked: true, grid: { color: GRID }, ticks: { color: INK_MUTED, font: { size: 10 }, callback: (v) => compactEur(Number(v)) }, border: { display: false } },
    },
  };
  return <Bar data={data} options={options} />;
}
