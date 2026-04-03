import React, { useState, useEffect } from 'react';
import { Activity, Database, BarChart3, Trash2, Download, FileSpreadsheet, FileText, Filter, ChevronRight, Share2, Info, LayoutDashboard, Monitor, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { StorageService } from './services/StorageService';
import { FileProcessor } from './services/FileProcessor';
import { SupabaseService } from './services/SupabaseService';
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
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [historyFiles, setHistoryFiles] = useState([]);
  const [error, setError] = useState(null);

  const REMOTE_DATA_URL = `${import.meta.env.BASE_URL}data/kanal-doluluk.xlsx`;

  // Debug: Environment variables kontrolü
  useEffect(() => {
    console.log('🔍 Environment Check:');
    console.log('VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
    console.log('VITE_SUPABASE_ANON_KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Set' : 'Not set');
    console.log('SupabaseService.isEnabled:', SupabaseService.isEnabled);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadSupabaseData = async () => {
    if (!SupabaseService.isEnabled) {
      console.warn('⚠️ Supabase not enabled - falling back to local data');
      return false;
    }

    try {
      console.log('📡 Loading from Supabase...');
      const files = await SupabaseService.listFiles();
      console.log('📁 Files found:', files.length);
      setHistoryFiles(files);

      if (!files.length) {
        console.warn('⚠️ No files in Supabase bucket');
        return false;
      }

      const latest = files[0];
      console.log('📄 Downloading latest file:', latest.name);
      const blob = await SupabaseService.downloadFile(latest.name);
      const file = new File([blob], latest.name, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      console.log('🔄 Processing Excel file...');
      const { ratingData: newR, occupancyData: newO } = await FileProcessor.processExcel(file);
      console.log('✅ Data processed:', { rating: newR.length, occupancy: newO.length });

      await StorageService.saveRatingData(newR);
      await StorageService.saveOccupancyData(newO);
      setRatingData(newR);
      setOccupancyData(newO);
      calculateStats(newO);
      setSmartInsights(InsightService.getInsights(newO));

      const dates = [...new Set(newO.map((d) => d.tarih))].sort().reverse();
      setFilters((prev) => ({ ...prev, date: dates[0] }));

      console.log('🎉 Supabase data loaded successfully');
      return true;
    } catch (err) {
      console.error('❌ Supabase load error:', err);
      setError(`Supabase yükleme hatası: ${err.message}`);
      return false;
    }
  };

  const loadInitialData = async () => {
    console.log('🚀 Loading initial data...');
    try {
      // Önce local veriyi yükle
      const rData = await StorageService.loadRatingData();
      const oData = await StorageService.loadOccupancyData();
      console.log('💾 Local data loaded:', { rating: rData?.length || 0, occupancy: oData?.length || 0 });

      setRatingData(rData || []);
      setOccupancyData(oData || []);
      calculateStats(oData || []);
      setSmartInsights(InsightService.getInsights(oData || []));

      if (oData && oData.length > 0) {
        const dates = [...new Set(oData.map(d => d.tarih))].sort().reverse();
        setFilters((prev) => ({ ...prev, date: dates[0] }));
      }

      // Supabase'den veri çekmeyi dene
      const supabaseLoaded = await loadSupabaseData();
      if (!supabaseLoaded) {
        console.log('🔄 Attempting fallback: loading from remote static file...');
        try {
          await refreshFromRemote();
        } catch (remoteErr) {
          console.warn('Both Supabase and remote file failed');
          // If cache has data, use it. Otherwise show error.
          if (!oData || oData.length === 0) {
            const errorMsg = 'Veri kaynaklari kapali. Supabase ayarlarini dogrulayin veya yoneticiye bildirin.';
            setError(errorMsg);
          }
        }
      }
    } catch (err) {
      console.error('Initial data load error:', err);
      setError('Veri yukleme hatasi: ' + err.message);
    }
  };

  const calculateStats = (data) => {
    if (!data.length) return setStats({ channels: 0, dates: 0, avg: 0 });
    const channels = new Set(data.map(d => d.kanal)).size;
    const dates = new Set(data.map(d => d.tarih)).size;
    const avg = data.reduce((acc, d) => acc + d.occupancyPercentage, 0) / data.length;
    setStats({ channels, dates, avg: Math.round(avg) });
  };

  const loadRemoteData = async () => {
    console.log('🔗 Attempting to load remote data from:', REMOTE_DATA_URL);
    try {
      const response = await fetch(REMOTE_DATA_URL, { cache: 'no-cache' });
      if (!response.ok) {
        if (response.status === 404) {
          console.warn('Remote file not found (404). Fallback Excel file not deployed.');
          console.info('To fix: Upload kanal-doluluk.xlsx to public/data/ or use Supabase instead.');
          throw new Error('Fallback Excel dosyasi bulunamadi. Supabase kullaniniz veya yonetici ile iletisime geciniz.');
        }
        throw new Error('Uzak veri alinamadi: ' + response.status + ' ' + response.statusText);
      }

      const blob = await response.blob();
      const file = new File([blob], 'kanal-doluluk.xlsx', {
        type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      console.log('✅ Remote file fetched successfully, processing...');
      return FileProcessor.processExcel(file);
    } catch (err) {
      console.error('❌ Remote data load failed:', err.message);
      throw err;
    }
  };

  const refreshFromRemote = async () => {
    setLoading(true);
    try {
      const { ratingData: newR, occupancyData: newO } = await loadRemoteData();

      const existingHash = JSON.stringify(occupancyData);
      const remoteHash = JSON.stringify(newO);

      if (existingHash !== remoteHash) {
        await StorageService.saveRatingData(newR);
        await StorageService.saveOccupancyData(newO);
        setRatingData(newR);
        setOccupancyData(newO);
        calculateStats(newO);
        setSmartInsights(InsightService.getInsights(newO));

        const dates = [...new Set(newO.map(d => d.tarih))].sort().reverse();
        setFilters((prev) => ({ ...prev, date: dates[0] }));
      }
    } catch (err) {
      console.error('Uzak veri yüklenirken hatası:', err);
      alert('Uzak veri yüklenirken hata oluştu: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (SupabaseService.isEnabled) {
      await loadSupabaseData();
      return;
    }
    await refreshFromRemote();
  };

  const handleLoadHistoryFile = async (fileName) => {
    if (!SupabaseService.isEnabled || !fileName) return;

    setLoading(true);
    try {
      const blob = await SupabaseService.downloadFile(fileName);
      const file = new File([blob], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const { ratingData: newR, occupancyData: newO } = await FileProcessor.processExcel(file);
      await StorageService.saveRatingData(newR);
      await StorageService.saveOccupancyData(newO);
      setRatingData(newR);
      setOccupancyData(newO);
      calculateStats(newO);
      setSmartInsights(InsightService.getInsights(newO));

      const dates = [...new Set(newO.map((d) => d.tarih))].sort().reverse();
      setFilters((prev) => ({ ...prev, date: dates[0] }));
    } catch (err) {
      console.error('Geçmiş dosya yüklenirken hata:', err);
      alert('Geçmiş dosya yüklenirken hata oluştu: ' + err.message);
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
    <div className={`min-h-screen w-full transition-colors duration-300 ${theme === 'dark' ? 'bg-[#020617] text-slate-100' : 'bg-slate-50 text-slate-900'} font-sans selection:bg-premium-500/30`}>
      {/* Dynamic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-30">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-premium-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 p-4 md:p-8 lg:p-12">
        {error && (
          <div className="max-w-[1600px] mx-auto mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Veri Yükleme Hatası
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  {error}
                </div>
                <div className="mt-4">
                  <div className="-mx-2 -my-1.5 flex">
                    <button
                      onClick={() => window.location.reload()}
                      className="bg-red-50 px-2 py-1.5 rounded-md text-sm font-medium text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-red-50 focus:ring-red-600"
                    >
                      Sayfayı Yenile
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation / Header */}
        <nav className="max-w-[1600px] mx-auto mb-16 flex flex-col md:flex-row items-center justify-between gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center"
          >
            <div className="h-20 flex items-center overflow-hidden">
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Kanal Doluluk Analizi Logo" className="h-full object-contain" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={`p-3 rounded-2xl border transition-all flex items-center justify-center group ${theme === 'dark' ? 'border-slate-800 hover:bg-white/5 text-slate-400' : 'border-slate-200 hover:bg-black/5 text-slate-600'}`}
              title={theme === 'dark' ? 'Aydınlık Mod' : 'Karanlık Mod'}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              onClick={handleClear}
              className={`px-6 py-3 rounded-2xl border transition-all flex items-center gap-2 group font-bold text-sm ${theme === 'dark' ? 'border-slate-800 hover:border-red-500/50 hover:bg-red-500/5 text-slate-400 hover:text-red-400' : 'border-slate-200 hover:border-red-500/50 hover:bg-red-500/5 text-slate-600 hover:text-red-500'}`}
            >
              <Trash2 size={18} className="group-hover:rotate-12 transition-transform" />
              Sıfırla
            </button>
            <button className="px-6 py-3 rounded-2xl premium-gradient text-white font-bold text-sm shadow-xl shadow-premium-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
              <Share2 size={18} />
              Paylaş
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
                className={`${theme === 'dark' ? 'bg-slate-900/40 border-white/5' : 'bg-white border-slate-200 shadow-sm'} backdrop-blur-xl border p-8 rounded-[2rem] relative group hover:border-premium-500/30 transition-all cursor-default`}
              >
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>{stat.label}</p>
                    <h3 className={`text-4xl font-black tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{stat.value}</h3>
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
              {/* Central data source card */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-slate-900/40 backdrop-blur-xl border-2 border-dashed border-slate-800 rounded-[2.5rem] p-10 hover:border-premium-500 transition-all group relative"
              >
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="w-24 h-24 rounded-3xl bg-premium-500/10 flex items-center justify-center group-hover:bg-premium-500/20 transition-all border border-premium-500/20">
                    <Database className="text-premium-400 w-12 h-12" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black">Merkezi Veri Kaynağı</h3>
                    <p className="text-slate-500 font-medium">
                      {SupabaseService.isEnabled
                        ? 'Supabase Storage bucketı "kanal-doluluk" kullanılıyor. En yeni dosya seçilir.'
                        : 'Veri dosyası: /data/kanal-doluluk.xlsx (statik fallback)'}
                    </p>
                    <p className="text-slate-400 text-sm">Yönetici bu dosyayı güncellediğinde "Yenile" butonuyla herkeste senkron olacaktır.</p>
                  </div>
                  <button
                    onClick={handleRefresh}
                    className="px-6 py-3 rounded-xl bg-premium-500 text-white font-bold uppercase tracking-wider shadow-lg shadow-premium-500/30 hover:scale-105 transition-transform"
                  >
                    Veriyi Yenile
                  </button>

                  {SupabaseService.isEnabled && historyFiles.length > 0 && (
                    <div className="mt-6 text-left w-full">
                      <h4 className="text-sm font-bold text-premium-200 mb-2">Geçmiş Dosyalar</h4>
                      <ul className="max-h-40 overflow-y-auto text-left rounded-xl border border-premium-500/20 bg-slate-950/20 p-3">
                        {historyFiles.map((file) => (
                          <li key={file.name} className="flex items-center justify-between mb-1">
                            <span className="text-xs text-slate-300">{file.name}</span>
                            <button
                              onClick={() => handleLoadHistoryFile(file.name)}
                              className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md bg-premium-500/90 hover:bg-premium-400"
                            >
                              Yükle
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                </div>
                {loading && (
                  <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md rounded-[2.5rem] z-30 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-14 h-14 border-4 border-premium-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-premium-400 font-black tracking-widest uppercase text-sm">Veri çekiliyor...</p>
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Ham Veri (Raw Data) Card */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className={`${theme === 'dark' ? 'bg-slate-900/40 border-white/5' : 'bg-white border-slate-200 shadow-sm'} backdrop-blur-xl border rounded-[2.5rem] p-10 relative overflow-hidden flex flex-col`}
              >
                <div className="flex items-center gap-5 mb-10">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                    <Database size={28} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className={`text-3xl font-black tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Ham Veri</h2>
                    <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mt-1 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>Saniye Bazlı Kayıtlar</p>
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <ResultsTable data={filteredData} onRowClick={setSelectedChannel} theme={theme} />
                </div>
                <div className="space-y-8 mt-10">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] block ml-1">Analiz Tarihi</label>
                    <div className="relative">
                      <select
                        value={filters.date}
                        onChange={(e) => setFilters(p => ({ ...p, date: e.target.value }))}
                        className={`w-full ${theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-700'} border rounded-2xl px-5 py-4 focus:ring-2 focus:ring-premium-500/50 outline-none transition-all appearance-none cursor-pointer font-bold`}
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
                    <div className={`p-1 rounded-[1.25rem] border flex gap-1 ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-300'}`}>
                      {['ALL', 'OPT', 'PT'].map(mode => (
                        <button
                          key={mode}
                          onClick={() => setFilters(p => ({ ...p, ptOpt: mode }))}
                          className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${filters.ptOpt === mode ? 'bg-premium-500 text-white shadow-xl shadow-premium-500/40' : `${theme === 'dark' ? 'text-slate-500 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'}`}`}
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
                          <div className="h-[450px] relative z-10">
                            {viewMode === 'chart' ? (
                              <OccupancyChart data={detailData} theme={theme} />
                            ) : (
                              <HeatmapChart data={filteredData} theme={theme} />
                            )}
                          </div>
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

                    {/* Haftalık Verimlilik (Weekly Productivity) Section */}
                    <div className={`${theme === 'dark' ? 'bg-slate-900/40 border-white/5' : 'bg-white border-slate-200 shadow-sm'} backdrop-blur-xl border rounded-[2.5rem] p-10 relative overflow-hidden group`}
                    >
                      <div className="flex items-center justify-between mb-12 relative z-10">
                        <div className="flex items-center gap-5">
                          <div className="w-14 h-14 rounded-2xl bg-premium-500/10 flex items-center justify-center text-premium-500 border border-premium-500/20 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                            <BarChart3 size={28} strokeWidth={2.5} />
                          </div>
                          <div>
                            <h2 className={`text-3xl font-black tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Haftalık Verimlilik</h2>
                            <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mt-1 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>Segment Bazlı Analiz</p>
                          </div>
                        </div>
                        <div className={`p-1 w-fit rounded-xl border flex gap-1 ${theme === 'dark' ? 'bg-black/20 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
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
                          theme={theme}
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
            <div className="h-16 flex items-center">
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Logo" className="h-full opacity-80 hover:opacity-100 transition-opacity" />
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
