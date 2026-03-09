import React, { useState, useEffect } from 'react';
import { Activity, Upload, Database, BarChart3, Trash2, Download, FileSpreadsheet, FileText, Filter, ChevronRight, Share2, Info, LayoutDashboard, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { StorageService } from './services/StorageService';
import { FileProcessor } from './services/FileProcessor';
import { InsightService } from './services/InsightService';
import ResultsTable from './components/ResultsTable';
import OccupancyChart from './components/OccupancyChart';
import HeatmapChart from './components/HeatmapChart';

export default function App() {
  const [ratingData, setRatingData] = useState([]);
  const [occupancyData, setOccupancyData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ channels: 0, dates: 0, avg: 0 });
  const [filters, setFilters] = useState({ date: '', ptOpt: 'ALL' });
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [smartInsights, setSmartInsights] = useState([]);
  const [viewMode, setViewMode] = useState('chart'); // 'chart' or 'heatmap'

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    const rData = await StorageService.loadRatingData();
    const oData = await StorageService.loadOccupancyData();
    setRatingData(rData || []);
    setOccupancyData(oData || []);
    calculateStats(oData || []);
    setSmartInsights(InsightService.getInsights(oData || []));

    if (oData && oData.length > 0) {
      const dates = [...new Set(oData.map(d => d.tarih))].sort().reverse();
      setFilters(prev => ({ ...prev, date: dates[0] }));
    }
  };

  const calculateStats = (data) => {
    if (!data.length) return setStats({ channels: 0, dates: 0, avg: 0 });
    const channels = new Set(data.map(d => d.kanal)).size;
    const dates = new Set(data.map(d => d.tarih)).size;
    const avg = data.reduce((acc, d) => acc + d.occupancyPercentage, 0) / data.length;
    setStats({ channels, dates, avg: Math.round(avg) });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      const { ratingData: newR, occupancyData: newO } = await FileProcessor.processExcel(file);
      await StorageService.saveRatingData(newR);
      await StorageService.saveOccupancyData(newO);
      setRatingData(newR);
      setOccupancyData(newO);
      calculateStats(newO);
      setSmartInsights(InsightService.getInsights(newO));

      const dates = [...new Set(newO.map(d => d.tarih))].sort().reverse();
      setFilters(prev => ({ ...prev, date: dates[0] }));
    } catch (err) {
      alert("Hata: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (confirm("Tüm yerel veriler silinecek. Emin misiniz?")) {
      await StorageService.clearAll();
      setRatingData([]);
      setOccupancyData([]);
      setStats({ channels: 0, dates: 0, avg: 0 });
      setFilters({ date: '', ptOpt: 'ALL' });
      setSelectedChannel(null);
    }
  };

  const filteredData = occupancyData.filter(d => {
    const dateMatch = !filters.date || d.tarih === filters.date;
    const ptOptMatch = filters.ptOpt === 'ALL' || d.ptOpt === filters.ptOpt;
    return dateMatch && ptOptMatch;
  });

  const uniqueDates = [...new Set(occupancyData.map(d => d.tarih))].sort().reverse();
  const detailData = filteredData.filter(d => !selectedChannel || d.kanal === selectedChannel);

  return (
    <div className="min-h-screen w-full bg-[#020617] text-slate-100 font-sans selection:bg-premium-500/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-30">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-premium-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 p-4 md:p-8 lg:p-12">
        {/* Navigation / Header */}
        <nav className="max-w-[1600px] mx-auto mb-16 flex flex-col md:flex-row items-center justify-between gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            <div className="w-14 h-14 premium-gradient rounded-2xl flex items-center justify-center shadow-2xl shadow-premium-500/40 rotate-3 overflow-hidden border border-white/10 p-2">
              <img src="./favicon.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter uppercase leading-none">
                Kanal <span className="bg-clip-text text-transparent bg-gradient-to-r from-premium-400 to-indigo-400">Doluluk</span>
              </h1>
              <p className="text-slate-500 text-sm font-bold tracking-widest mt-1 uppercase">Media Insight Engine v2.0</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            <button
              onClick={handleClear}
              className="px-6 py-3 rounded-2xl border border-slate-800 hover:border-red-500/50 hover:bg-red-500/5 transition-all flex items-center gap-2 group text-slate-400 hover:text-red-400 font-bold text-sm"
            >
              <Trash2 size={18} className="group-hover:rotate-12 transition-transform" />
              Verileri Sıfırla
            </button>
            <button className="px-6 py-3 rounded-2xl premium-gradient text-white font-bold text-sm shadow-xl shadow-premium-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
              <Share2 size={18} />
              Raporu Paylaş
            </button>
          </motion.div>
        </nav>

        <main className="max-w-[1600px] mx-auto">
          {/* Dashboard Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {[
              { label: 'Aktif Kanallar', value: stats.channels, icon: Monitor, color: 'from-blue-500 to-sky-400' },
              { label: 'Analiz Edilen Gün', value: stats.dates, icon: LayoutDashboard, color: 'from-indigo-500 to-purple-400' },
              { label: 'Ortalama Doluluk', value: `%${stats.avg}`, icon: Activity, color: 'from-emerald-500 to-teal-400' },
            ].map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-8 rounded-[2rem] relative group hover:border-premium-500/30 transition-all cursor-default"
              >
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <p className="text-slate-500 text-xs font-black uppercase tracking-[0.2em]">{stat.label}</p>
                    <p className="text-4xl font-black mt-2 tracking-tighter">{stat.value}</p>
                  </div>
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg shadow-black/20 group-hover:scale-110 transition-transform`}>
                    <stat.icon size={32} className="text-white" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-premium-500/20 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Left Column: Input & Filters */}
            <div className="lg:col-span-4 space-y-10">
              {/* Uploader Card */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-slate-900/40 backdrop-blur-xl border-2 border-dashed border-slate-800 rounded-[2.5rem] p-10 hover:border-premium-500 transition-all group relative cursor-pointer"
              >
                <input
                  type="file"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  onChange={handleFileUpload}
                  accept=".xlsx,.xls,.csv"
                />
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="w-24 h-24 rounded-3xl bg-premium-500/10 flex items-center justify-center group-hover:bg-premium-500/20 transition-all border border-premium-500/20">
                    <Upload className="text-premium-400 w-12 h-12 group-hover:-translate-y-2 transition-transform duration-300" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black">Veri Yükleme</h3>
                    <p className="text-slate-500 font-medium">Excel veya CSV dosyalarınızı buraya bırakın</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-black border border-emerald-500/20">XLSX / CSV</span>
                    <span className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-[10px] font-black border border-rose-500/20">PDF RAPOR</span>
                  </div>
                </div>
                {loading && (
                  <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md rounded-[2.5rem] z-30 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-14 h-14 border-4 border-premium-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-premium-400 font-black tracking-widest uppercase text-sm">İşleniyor...</p>
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Control Center Card */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[2.5rem] p-10"
              >
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-premium-500/10 flex items-center justify-center border border-premium-500/20">
                    <Filter className="text-premium-400" size={20} />
                  </div>
                  <h3 className="text-xl font-black uppercase tracking-tighter">Kontrol Merkezi</h3>
                </div>

                <div className="space-y-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] block ml-1">Analiz Tarihi</label>
                    <div className="relative">
                      <select
                        value={filters.date}
                        onChange={(e) => setFilters(p => ({ ...p, date: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 focus:ring-2 focus:ring-premium-500/50 outline-none transition-all appearance-none cursor-pointer font-bold text-slate-300"
                        disabled={!uniqueDates.length}
                      >
                        <option value="" className="bg-slate-950 underline text-slate-500 text-sm">Tarih seçin</option>
                        {uniqueDates.map(d => <option key={d} value={d} className="bg-slate-950 py-4">{d}</option>)}
                      </select>
                      <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-600 rotate-90 pointer-events-none" size={18} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] block ml-1">Zaman Dilimi</label>
                    <div className="p-1 bg-slate-950 rounded-[1.25rem] border border-slate-800 flex gap-1">
                      {['ALL', 'OPT', 'PT'].map(mode => (
                        <button
                          key={mode}
                          onClick={() => setFilters(p => ({ ...p, ptOpt: mode }))}
                          className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${filters.ptOpt === mode ? 'bg-premium-500 text-white shadow-xl shadow-premium-500/40' : 'text-slate-500 hover:text-slate-200'}`}
                        >
                          {mode === 'ALL' ? 'TÜMÜ' : mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4">
                    <div className="flex items-start gap-4 p-5 rounded-2xl bg-premium-500/5 border border-premium-500/10 border-dashed">
                      <Info className="text-premium-400 shrink-0 mt-0.5" size={18} />
                      <p className="text-[11px] font-medium text-slate-400 leading-relaxed italic">
                        Analiz yapılacak tarihi ve zaman dilimini seçin. Kanal listesinde bir kanalın üzerine tıklayarak saatlik detayları görebilirsiniz.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Right Column: Visualization */}
            <div className="lg:col-span-8 space-y-10">
              <AnimatePresence mode="wait">
                {occupancyData.length > 0 ? (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="space-y-10"
                  >
                    {/* Insights Slider */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {smartInsights.slice(0, 4).map((insight, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className={`p-5 rounded-3xl border backdrop-blur-md flex gap-4 items-start ${insight.impact === 'critical' ? 'bg-rose-500/5 border-rose-500/20' :
                            insight.impact === 'high' ? 'bg-amber-500/5 border-amber-500/20' :
                              'bg-premium-500/5 border-premium-500/20'
                            }`}
                        >
                          <div className={`mt-1 p-2 rounded-xl ${insight.impact === 'critical' ? 'bg-rose-500 text-white' :
                            insight.impact === 'high' ? 'bg-amber-500 text-white' :
                              'bg-premium-500 text-white'
                            }`}>
                            <Activity size={16} />
                          </div>
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-300 mb-1">{insight.title}</h4>
                            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">{insight.description}</p>
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    {/* Hero Chart Section */}
                    <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[3rem] p-10 lg:p-12 relative overflow-hidden group">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 relative z-10">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Canlı Genel Görünüm</span>
                          </div>
                          <h3 className="text-4xl font-black tracking-tight tracking-tighter">
                            {selectedChannel || 'Tüm Kanallar'}
                          </h3>
                          <p className="text-slate-500 font-bold mt-1"><span className="text-premium-400">{filters.date || 'Tarih Aralığı'}</span> için saatlik doluluk dağılımı</p>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex p-1 bg-black/40 rounded-full border border-white/5 backdrop-blur-md">
                            <button
                              onClick={() => setViewMode('chart')}
                              className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'chart' ? 'bg-premium-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                              Grafik
                            </button>
                            <button
                              onClick={() => setViewMode('heatmap')}
                              className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'heatmap' ? 'bg-premium-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                              Isı Haritası
                            </button>
                          </div>

                          {selectedChannel && (
                            <motion.button
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              onClick={() => setSelectedChannel(null)}
                              className="px-6 py-2.5 rounded-full border border-premium-500/30 text-premium-400 text-xs font-black uppercase tracking-widest hover:bg-premium-500/10 transition-all flex items-center gap-2"
                            >
                              Görünümü Sıfırla <Activity size={14} />
                            </motion.button>
                          )}
                        </div>
                      </div>

                      <div className="relative z-10 w-full text-center">
                        {detailData.length > 0 ? (
                          viewMode === 'chart' ? (
                            <div className="h-[450px]">
                              <OccupancyChart data={detailData} />
                            </div>
                          ) : (
                            <div className="py-2">
                              <HeatmapChart data={filteredData} />
                            </div>
                          )
                        ) : (
                          <div className="h-[450px] flex flex-col items-center justify-center text-slate-600 space-y-4 border border-dashed border-slate-800 rounded-3xl bg-black/20">
                            <BarChart3 size={64} className="opacity-10" />
                            <p className="font-bold tracking-tight italic opacity-40">Veri bekleniyor...</p>
                          </div>
                        )}
                      </div>

                      {/* Deco element */}
                      <div className="absolute top-0 right-0 w-64 h-64 bg-premium-500/5 blur-[80px] -mr-32 -mt-32 pointer-events-none" />
                    </div>

                    {/* Table Section */}
                    <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[3rem] overflow-hidden">
                      <div className="p-8 lg:p-10 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-premium-500/10 border border-premium-500/20 flex items-center justify-center text-premium-400">
                            <FileSpreadsheet size={20} />
                          </div>
                          <h3 className="text-xl font-black uppercase tracking-tighter">Kanal Performansı</h3>
                        </div>
                        <div className="hidden md:flex gap-3">
                          <button className="p-2.5 rounded-xl border border-slate-800 text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all">
                            <Download size={20} />
                          </button>
                          <button className="p-2.5 rounded-xl border border-slate-800 text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all">
                            <Share2 size={20} />
                          </button>
                        </div>
                      </div>
                      <div className="px-2">
                        <ResultsTable
                          data={filteredData}
                          onRowClick={(channel) => setSelectedChannel(channel)}
                        />
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="h-full min-h-[600px] flex items-center justify-center"
                  >
                    <div className="text-center max-w-sm">
                      <div className="w-32 h-32 premium-gradient rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-2xl shadow-premium-500/20 rotate-6 group hover:rotate-0 transition-transform duration-500">
                        <Activity size={64} className="text-white opacity-40" />
                      </div>
                      <h2 className="text-3xl font-black tracking-tighter mb-4 italic">Veri Bekleniyor...</h2>
                      <p className="text-slate-500 font-medium leading-relaxed">
                        Analiz motoru boşta. Başlamak için lütfen Kontrol Merkezi üzerinden bir Excel veya CSV dosyası yükleyin.
                      </p>
                      <div className="mt-10 flex flex-col items-center gap-4">
                        <div className="flex gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-premium-500 animate-bounce" style={{ animationDelay: '0s' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-premium-500 animate-bounce" style={{ animationDelay: '0.1s' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-premium-500 animate-bounce" style={{ animationDelay: '0.2s' }} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </main>

        <footer className="max-w-[1600px] mx-auto mt-32 pb-20 border-t border-slate-800 pt-16 flex flex-col md:flex-row items-center justify-between gap-8 opacity-90">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 premium-gradient rounded-xl flex items-center justify-center border border-white/10 p-1.5 shadow-lg shadow-black/20">
                <img src="./favicon.png" alt="Logo" className="w-full h-full object-contain" />
              </div>
              <div className="flex flex-col">
                <h4 className="text-2xl font-black tracking-tighter text-white leading-none">
                  Kanal <span className="text-[#ed217c]">Doluluk</span> <span className="text-[#7d3291]">Analizi</span>
                </h4>
                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.3em] font-bold mt-1">
                  by Growity AI Studio
                </p>
              </div>
            </div>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
            © 2026 Güvenli Yerel Analiz Sistemi.
          </p>
        </footer>
      </div>
    </div>
  );
}
