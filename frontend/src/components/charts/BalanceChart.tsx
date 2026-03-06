'use client';
// src/components/charts/BalanceChart.tsx
import { useEffect, useRef } from 'react';
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale,
  CategoryScale, Filler, Tooltip, ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip);

interface ChartPoint { date: string; balance: number; }

interface Props { data: ChartPoint[]; }

export default function BalanceChart({ data }: Props) {
  const labels   = data.map(d => d.date.slice(5)); // MM-DD
  const balances = data.map(d => d.balance);

  const chartData = {
    labels,
    datasets: [{
      data:               balances,
      borderColor:        '#5090ff',
      borderWidth:        2,
      pointBackgroundColor: '#5090ff',
      pointRadius:        (ctx: any) => (ctx.dataIndex % Math.max(1, Math.floor(data.length / 5)) === 0 ? 4 : 0),
      pointBorderColor:   '#fff',
      pointBorderWidth:   1.5,
      fill:               true,
      backgroundColor:    (ctx: any) => {
        const chart = ctx.chart;
        const { ctx: c, chartArea } = chart;
        if (!chartArea) return 'transparent';
        const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        gradient.addColorStop(0,   'rgba(58,111,255,0.35)');
        gradient.addColorStop(1,   'rgba(58,111,255,0.0)');
        return gradient;
      },
      tension: 0.4,
    }],
  };

  const options: ChartOptions<'line'> = {
    responsive:          true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        callbacks: {
         label: (ctx) => `€ ${ctx.parsed.y?.toLocaleString('de-DE') ?? '0'}`
        },
        backgroundColor: '#0e1529',
        borderColor:     'rgba(255,255,255,0.1)',
        borderWidth:     1,
        titleColor:      '#8c9ab5',
        bodyColor:       '#e8eaf6',
        padding:         10,
      },
      legend: { display: false },
    },
    scales: {
      x: {
        grid:   { color: 'rgba(255,255,255,0.04)' },
        ticks:  { color: '#596480', font: { size: 10 }, maxTicksLimit: 6 },
        border: { display: false },
      },
      y: {
        grid:   { color: 'rgba(255,255,255,0.04)' },
        ticks:  {
          color: '#596480', font: { size: 10 },
          callback: (v: any) => `€${(v/1000).toFixed(0)}k`,
        },
        border: { display: false },
      },
    },
    interaction: { mode: 'index', intersect: false },
    elements:    { line: { capBezierPoints: false } },
  };

  return <Line data={chartData} options={options} />;
}
