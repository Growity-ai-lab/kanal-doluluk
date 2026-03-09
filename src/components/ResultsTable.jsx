import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ChevronRight, Monitor } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ResultsTable({ data, onRowClick, theme = 'dark' }) {
    // Group by channel
    const aggregated = data.reduce((acc, curr) => {
        const key = `${curr.kanal}_${curr.ptOpt}`;
        if (!acc[key]) {
            acc[key] = {
                kanal: curr.kanal,
                ptOpt: curr.ptOpt,
                list: []
            };
        }
        acc[key].list.push(curr.occupancyPercentage);
        return acc;
    }, {});

    const rows = Object.values(aggregated).map(item => ({
        kanal: item.kanal,
        ptOpt: item.ptOpt,
        avg: item.list.reduce((a, b) => a + b, 0) / item.list.length,
        max: Math.max(...item.list),
        min: Math.min(...item.list)
    })).sort((a, b) => a.kanal.localeCompare(b.kanal));

    const getStatusBadge = (occ) => {
        if (occ >= 100) return {
            label: 'TAM DOLU',
            class: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
            icon: <XCircle size={10} />,
            dot: 'bg-rose-500'
        };
        if (occ >= 80) return {
            label: 'YÜKSEK',
            class: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
            icon: <AlertTriangle size={10} />,
            dot: 'bg-amber-500'
        };
        return {
            label: 'UYGUN',
            class: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
            icon: <CheckCircle2 size={10} />,
            dot: 'bg-emerald-500'
        };
    };

    return (
        <div className="w-full">
            <div className={`grid grid-cols-12 px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] border-b transition-colors ${theme === 'dark' ? 'text-slate-500 border-white/5' : 'text-slate-400 border-slate-200'}`}>
                <div className="col-span-5">İstasyon / Kanal</div>
                <div className="col-span-3 text-center">Verimlilik</div>
                <div className="col-span-4 text-right">Durum</div>
            </div>
            <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                {rows.map((row, i) => {
                    const status = getStatusBadge(row.avg);
                    return (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            key={i}
                            onClick={() => onRowClick(row.kanal)}
                            className={`grid grid-cols-12 px-8 py-6 items-center transition-all cursor-pointer group border-b ${theme === 'dark' ? 'hover:bg-premium-500/5 border-white/[0.02]' : 'hover:bg-premium-500/5 border-slate-100'}`}
                        >
                            <div className="col-span-5 flex items-center gap-4">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${row.ptOpt === 'PT' ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white' : 'bg-sky-500/10 border-sky-500/20 text-sky-400 group-hover:bg-sky-500 group-hover:text-white'}`}>
                                    <Monitor size={14} />
                                </div>
                                <div>
                                    <h4 className={`font-black transition-colors tracking-tight ${theme === 'dark' ? 'text-slate-200 group-hover:text-white' : 'text-slate-700 group-hover:text-premium-600'}`}>{row.kanal}</h4>
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{row.ptOpt === 'ALL' ? 'GENEL' : row.ptOpt} segmenti</span>
                                </div>
                            </div>

                            <div className="col-span-3 text-center">
                                <div className={`font-mono text-sm font-black transition-colors ${theme === 'dark' ? 'text-slate-300 group-hover:text-premium-400' : 'text-slate-600 group-hover:text-premium-600'}`}>
                                    %{row.avg.toFixed(1)}
                                </div>
                                <div className={`w-12 h-1 rounded-full mx-auto mt-1 overflow-hidden ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-200'}`}>
                                    <div className={`h-full ${status.dot} opacity-50`} style={{ width: `${Math.min(row.avg, 100)}%` }} />
                                </div>
                            </div>

                            <div className="col-span-4 flex justify-end items-center gap-3">
                                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[9px] font-black tracking-widest ${status.class}`}>
                                    {status.label}
                                </div>
                                <ChevronRight size={14} className="text-slate-700 group-hover:text-premium-400 group-hover:translate-x-1 transition-all" />
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
