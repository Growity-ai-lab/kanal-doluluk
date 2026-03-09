import React from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

export default function OccupancyChart({ data }) {
    // Sort by hour
    const sortedData = [...data].sort((a, b) => a.hour - b.hour);

    const chartData = {
        labels: sortedData.map(d => `${String(d.hour).padStart(2, '0')}:00`),
        datasets: [
            {
                label: 'Occupancy',
                data: sortedData.map(d => d.occupancyPercentage),
                backgroundColor: sortedData.map(d => {
                    if (d.occupancyPercentage >= 100) return 'rgba(244, 63, 94, 0.4)'; // Rose
                    if (d.occupancyPercentage >= 80) return 'rgba(245, 158, 11, 0.4)'; // Amber
                    return 'rgba(14, 165, 233, 0.4)'; // Sky
                }),
                borderColor: sortedData.map(d => {
                    if (d.occupancyPercentage >= 100) return '#f43f5e';
                    if (d.occupancyPercentage >= 80) return '#f59e0b';
                    return '#0ea5e9';
                }),
                borderWidth: 2,
                borderRadius: { topLeft: 12, topRight: 12, bottomLeft: 0, bottomRight: 0 },
                hoverBackgroundColor: sortedData.map(d => {
                    if (d.occupancyPercentage >= 100) return 'rgba(244, 63, 94, 0.8)';
                    if (d.occupancyPercentage >= 80) return 'rgba(245, 158, 11, 0.8)';
                    return 'rgba(14, 165, 233, 0.8)';
                }),
                barPercentage: 0.7,
            },
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 1000,
            easing: 'easeOutQuart'
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleFont: { size: 12, weight: '900', family: 'Inter' },
                bodyFont: { size: 14, family: 'JetBrains Mono', weight: 'bold' },
                padding: 16,
                cornerRadius: 16,
                displayColors: true,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
                callbacks: {
                    label: (context) => ` EFFICIENCY Score: ${context.parsed.y.toFixed(2)}%`
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                max: 120,
                grid: {
                    color: 'rgba(255, 255, 255, 0.03)',
                    drawBorder: false
                },
                ticks: {
                    color: '#64748b',
                    font: { weight: 'bold', size: 10 },
                    padding: 10,
                    callback: (value) => `${value}%`
                }
            },
            x: {
                grid: { display: false },
                ticks: {
                    color: '#64748b',
                    font: { weight: 'black', size: 9 },
                    padding: 10
                }
            }
        },
    };

    return (
        <div className="h-full w-full">
            <Bar data={chartData} options={options} />
        </div>
    );
}
