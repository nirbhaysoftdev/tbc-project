'use client';
// src/components/admin/MemberCharts.tsx
//
// Charts for the admin member detail page. Registration is done once here
// rather than per chart so the three charts can be mounted in any combination.
import {
  Chart as ChartJS, LineElement, PointElement, BarElement, ArcElement,
  LinearScale, CategoryScale, Filler, Tooltip, Legend, ChartOptions,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  LineElement, PointElement, BarElement, ArcElement,
  LinearScale, CategoryScale, Filler, Tooltip, Legend,
);

export interface SeriesPoint {
  month: string;
  capital: number;
  profit: number;
  profitEarned: number;
  invested: number;
  withdrawn: number;
  balance: number;
}

const eur = (n: number) => `€ ${Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
};

const tooltip = {
  backgroundColor: '#0e1529',
  borderColor: 'rgba(255,255,255,0.1)',
  borderWidth: 1,
  titleColor: '#8c9ab5',
  bodyColor: '#e8eaf6',
  padding: 10,
};

const axes = {
  x: {
    grid: { color: 'rgba(255,255,255,0.04)' },
    ticks: { color: '#596480', font: { size: 10 }, maxTicksLimit: 8 },
    border: { display: false },
  },
  y: {
    grid: { color: 'rgba(255,255,255,0.04)' },
    ticks: {
      color: '#596480',
      font: { size: 10 },
      callback: (v: any) => (Math.abs(v) >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v}`),
    },
    border: { display: false },
  },
} as const;

const legend = {
  display: true,
  position: 'top' as const,
  align: 'end' as const,
  labels: { color: '#8c9ab5', boxWidth: 10, boxHeight: 10, font: { size: 11 }, usePointStyle: true },
};

/** Capital, available profit and total balance month by month. */
export function PortfolioChart({ series }: { series: SeriesPoint[] }) {
  const labels = series.map((p) => monthLabel(p.month));

  const gradient = (color: string, alpha: number) => (ctx: any) => {
    const { ctx: c, chartArea } = ctx.chart;
    if (!chartArea) return 'transparent';
    const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, `rgba(${color},${alpha})`);
    g.addColorStop(1, `rgba(${color},0)`);
    return g;
  };

  const data = {
    labels,
    datasets: [
      {
        label: 'Invested capital',
        data: series.map((p) => p.capital),
        borderColor: '#5090ff',
        backgroundColor: gradient('58,111,255', 0.3),
        borderWidth: 2, pointRadius: 0, fill: true, tension: 0.35,
      },
      {
        label: 'Available profit',
        data: series.map((p) => p.profit),
        borderColor: '#4cd98a',
        backgroundColor: gradient('76,217,138', 0.22),
        borderWidth: 2, pointRadius: 0, fill: true, tension: 0.35,
      },
      {
        label: 'Total balance',
        data: series.map((p) => p.balance),
        borderColor: '#c8a84b',
        borderWidth: 2, pointRadius: 0, borderDash: [5, 4], fill: false, tension: 0.35,
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend,
      tooltip: { ...tooltip, callbacks: { label: (c) => `${c.dataset.label}: ${eur(c.parsed.y ?? 0)}` } },
    },
    scales: axes as any,
    interaction: { mode: 'index', intersect: false },
  };

  return <Line data={data} options={options} />;
}

/** Profit credited and capital added per month — the activity behind the curve above. */
export function MonthlyActivityChart({ series }: { series: SeriesPoint[] }) {
  const data = {
    labels: series.map((p) => monthLabel(p.month)),
    datasets: [
      {
        label: 'Profit credited',
        data: series.map((p) => p.profitEarned),
        backgroundColor: 'rgba(76,217,138,0.75)',
        borderRadius: 4, borderSkipped: false,
      },
      {
        label: 'Capital added',
        data: series.map((p) => p.invested),
        backgroundColor: 'rgba(58,111,255,0.6)',
        borderRadius: 4, borderSkipped: false,
      },
      {
        label: 'Withdrawn',
        data: series.map((p) => p.withdrawn),
        backgroundColor: 'rgba(224,82,82,0.6)',
        borderRadius: 4, borderSkipped: false,
      },
    ],
  };

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend,
      tooltip: { ...tooltip, callbacks: { label: (c) => `${c.dataset.label}: ${eur(c.parsed.y ?? 0)}` } },
    },
    scales: axes as any,
    interaction: { mode: 'index', intersect: false },
  };

  return <Bar data={data} options={options} />;
}

/** Where the capital sits. Project-less capital is a real row, not a gap. */
export function ProjectSplitChart({
  rows,
}: {
  rows: { projectTitle: string; capital: number; profit: number }[];
}) {
  const palette = ['#5090ff', '#c8a84b', '#4cd98a', '#a07cff', '#ff8a5c', '#48c6d8', '#e05252', '#8c9ab5'];
  const present = rows.filter((r) => r.capital > 0);

  const data = {
    labels: present.map((r) => r.projectTitle),
    datasets: [{
      data: present.map((r) => r.capital),
      backgroundColor: present.map((_, i) => palette[i % palette.length]),
      borderColor: 'rgba(11,16,34,0.9)',
      borderWidth: 2,
      hoverOffset: 6,
    }],
  };

  const total = present.reduce((s, r) => s + r.capital, 0);

  const options: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: { ...legend, position: 'bottom', align: 'center' },
      tooltip: {
        ...tooltip,
        callbacks: {
          label: (c) => {
            const value = c.parsed as number;
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
            return `${c.label}: ${eur(value)} (${pct}%)`;
          },
        },
      },
    },
  };

  return <Doughnut data={data} options={options} />;
}
