import React from 'react';
import { motion } from 'framer-motion';

export default function HeatmapChart({ data }) {
    if (!data || data.length === 0) return null;

    // Filter valid data to prevent crashes
    const validData = data.filter(d => d.saat && d.kanal && d.occupancyPercentage !== undefined);
    if (validData.length === 0) return null;

    // Get unique channels and hours
    const channels = [...new Set(validData.map(d => d.kanal))].sort();
    const hours = [...new Set(validData.map(d => d.saat))].sort((a, b) => String(a).localeCompare(String(b)));

    // Map data for easy lookup: { 'Channel_Hour': occupancy }
    const dataMap = validData.reduce((acc, curr) => {
        acc[`${curr.kanal}_${curr.saat}`] = curr.occupancyPercentage;
        return acc;
    }, {});

    const getColor = (val) => {
        if (val === undefined || val === null) return 'bg-slate-900/20';
        if (val >= 95) return 'bg-rose-500';
        if (val >= 80) return 'bg-amber-500';
        if (val >= 40) return 'bg-premium-500';
        if (val >= 1) return 'bg-emerald-500';
        return 'bg-emerald-500/20';
    };

    return (
        <div className="w-full overflow-x-auto custom-scrollbar pb-4">
            <div className="min-w-[800px]">
                {/* Header (Hours) */}
                <div className="flex mb-2">
                    <div className="w-32 shrink-0"></div>
                    <div className="flex-1 flex justify-around">
                        {hours.map(h => (
                            <span key={h} className="text-[9px] font-black text-slate-600 uppercase tracking-tighter w-full text-center">{h.split(':')[0]}h</span>
                        ))}
                    </div>
                </div>

                {/* Rows (Channels) */}
                <div className="space-y-1">
                    {channels.map((ch, i) => (
                        <motion.div
                            key={ch}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.02 }}
                            className="flex items-center group"
                        >
                            <span className="w-32 shrink-0 text-[10px] font-bold text-slate-400 group-hover:text-white truncate pr-4 transition-colors">{ch}</span>
                            <div className="flex-1 flex gap-1 h-6">
                                {hours.map(h => {
                                    const val = dataMap[`${ch}_${h}`];
                                    return (
                                        <div
                                            key={h}
                                            title={`${ch} @ ${h}: %${val || 0}`}
                                            className={`flex-1 rounded-sm transition-all duration-300 hover:scale-110 hover:z-20 border border-black/20 ${getColor(val)}`}
                                        />
                                    );
                                })}
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Legend */}
                <div className="mt-8 flex items-center gap-6 justify-center">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500/30"></div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Boş</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-premium-500"></div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Normal</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Yoğun</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Kritik</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
