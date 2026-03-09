export const InsightService = {
    getInsights: (data) => {
        if (!data || data.length === 0) return [];

        const insights = [];

        // 1. Peak Occupancy Times
        const validData = data.filter(d => d.saat && d.kanal && !isNaN(d.occupancyPercentage));

        const hourlyAvg = validData.reduce((acc, curr) => {
            acc[curr.saat] = acc[curr.saat] || { total: 0, count: 0 };
            acc[curr.saat].total += curr.occupancyPercentage;
            acc[curr.saat].count += 1;
            return acc;
        }, {});

        const entries = Object.entries(hourlyAvg);
        const peakHour = entries.length > 0 ? entries.sort((a, b) => (b[1].total / b[1].count) - (a[1].total / a[1].count))[0] : null;
        if (peakHour) {
            insights.push({
                type: 'trend',
                title: 'Zirve Doluluk Noktası',
                description: `Grup genelinde en yoğun doluluk saat ${peakHour[0]} civarında gerçekleşiyor (Ortalama %${Math.round(peakHour[1].total / peakHour[1].count)}).`,
                impact: 'high'
            });
        }

        // 2. High Occupancy Risk (Bottlenecks)
        const highOccupancyChannels = data.filter(d => d.occupancyPercentage >= 95);
        if (highOccupancyChannels.length > 0) {
            const uniqueChannels = [...new Set(highOccupancyChannels.map(d => d.kanal))];
            insights.push({
                type: 'risk',
                title: 'Envanter Darboğazı',
                description: `${uniqueChannels.slice(0, 3).join(', ')}${uniqueChannels.length > 3 ? ' ve diğer' : ''} kanallarında bazı saatlerde %95 üzeri doluluk görüldü. Yeni reklam alanı fırsatları kısıtlı.`,
                impact: 'critical'
            });
        }

        // 3. Efficiency Gems (Low occupancy but high potential)
        const lowOccupancyAvg = data.reduce((acc, curr) => {
            acc[curr.kanal] = acc[curr.kanal] || { total: 0, count: 0 };
            acc[curr.kanal].total += curr.occupancyPercentage;
            acc[curr.kanal].count += 1;
            return acc;
        }, {});

        const efficientChannel = Object.entries(lowOccupancyAvg)
            .filter(([_, stats]) => (stats.total / stats.count) < 30)
            .sort((a, b) => (a[1].total / a[1].count) - (b[1].total / b[1].count))[0];

        if (efficientChannel) {
            insights.push({
                type: 'opportunity',
                title: 'Genişleme Fırsatı',
                description: `${efficientChannel[0]} kanalı ortalama %${Math.round(efficientChannel[1].total / efficientChannel[1].count)} doluluk ile en yüksek boş envanter kapasitesine sahip.`,
                impact: 'medium'
            });
        }

        // 4. Timezone Insights (PT vs OPT)
        const ptData = data.filter(d => d.ptOpt === 'PT');
        const optData = data.filter(d => d.ptOpt === 'OPT');
        if (ptData.length && optData.length) {
            const ptAvg = ptData.reduce((acc, d) => acc + d.occupancyPercentage, 0) / ptData.length;
            const optAvg = optData.reduce((acc, d) => acc + d.occupancyPercentage, 0) / optData.length;
            const diff = Math.abs(ptAvg - optAvg);

            if (diff > 15) {
                insights.push({
                    type: 'strategy',
                    title: 'Prime Time Dinamiği',
                    description: `PT ve OPT kuşakları arasında %${Math.round(diff)} verimlilik farkı var. Kampanya dağılımını optimize etmek maliyet avantajı sağlayabilir.`,
                    impact: 'medium'
                });
            }
        }

        return insights;
    }
};
