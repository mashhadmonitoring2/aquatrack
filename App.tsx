
import React, { useState, useMemo } from 'react';
import { TimePoint, AnalysisResult, WaterSample } from './types';
import TrajectoryChart from './components/TrajectoryChart';
import { analyzeWaterData } from './services/geminiService';
import { 
  calculateMannKendall, 
  findPettittChangePoint, 
  calculateControlLimits,
  calculateEWMA
} from './services/statsService';
import { 
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell as RechartsCell,
  Legend,
  AreaChart,
  Area,
  LineChart,
  Line,
  ReferenceLine
} from 'recharts';
import { 
  BeakerIcon, 
  ArrowUpTrayIcon, 
  ArrowPathIcon, 
  LightBulbIcon,
  ExclamationTriangleIcon,
  AdjustmentsVerticalIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  ChartBarIcon,
  DocumentArrowDownIcon,
  PuzzlePieceIcon,
  ArrowTrendingUpIcon,
  InformationCircleIcon,
  ArrowsUpDownIcon,
  FireIcon,
  MapPinIcon,
  CheckBadgeIcon,
  PresentationChartLineIcon
} from '@heroicons/react/24/outline';

declare const XLSX: any;

export type AxisField = 'conductivity' | 'nitrate';

const COLORS = ['#2563eb', '#d97706', '#059669', '#7c3aed', '#db2777', '#0891b2', '#dc2626', '#475569'];
const DEFAULT_CLUSTER_LABELS = ['عالی', 'خوب', 'متوسط', 'ضعیف', 'بحرانی'];
const CLUSTER_COLORS_MAP: Record<string, string> = {
  'عالی': '#059669',
  'خوب': '#10b981',
  'متوسط': '#f59e0b',
  'ضعیف': '#ea580c',
  'بحرانی': '#dc2626'
};

const App: React.FC = () => {
  const [timePoints, setTimePoints] = useState<TimePoint[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [colorByCluster, setColorByCluster] = useState(false);
  
  // تنظیمات نمودار نقطه منتخب
  const [showShewhart, setShowShewhart] = useState(true);
  const [showEWMA, setShowEWMA] = useState(false);
  
  const [clusterCount, setClusterCount] = useState(5);
  const [clusteringAlgo, setClusteringAlgo] = useState<'simple' | 'kmeans'>('simple');
  
  const [xAxisKey, setXAxisKey] = useState<AxisField>('conductivity');
  const [yAxisKey, setYAxisKey] = useState<AxisField>('nitrate');

  const currentClusterLabels = useMemo(() => {
    if (clusterCount === 5) return DEFAULT_CLUSTER_LABELS;
    return Array.from({ length: clusterCount }, (_, i) => `دسته ${i + 1}`);
  }, [clusterCount]);

  const clusterDataPerPeriod = (samples: WaterSample[], count: number, algo: 'simple' | 'kmeans'): WaterSample[] => {
    if (samples.length < count) return samples.map(s => ({ ...s, cluster: currentClusterLabels[0] }));
    const maxEC = Math.max(...samples.map(s => s.conductivity));
    const maxNO3 = Math.max(...samples.map(s => s.nitrate));
    let centroids: { ec: number, no3: number }[] = [];
    if (algo === 'simple') {
      centroids = Array.from({ length: count }, (_, i) => ({
        ec: (i / (count - 1)) * maxEC,
        no3: (i / (count - 1)) * maxNO3
      }));
    } else {
      centroids = samples.slice(0, count).map(s => ({ ec: s.conductivity, no3: s.nitrate }));
      for (let iter = 0; iter < 10; iter++) {
        const groups: WaterSample[][] = Array.from({ length: count }, () => []);
        samples.forEach(s => {
          let minDist = Infinity;
          let clusterIdx = 0;
          centroids.forEach((c, idx) => {
            const d = Math.sqrt(Math.pow(s.conductivity - c.ec, 2) + Math.pow(s.nitrate - c.no3, 2));
            if (d < minDist) { minDist = d; clusterIdx = idx; }
          });
          groups[clusterIdx].push(s);
        });
        centroids = groups.map((group, idx) => {
          if (group.length === 0) return centroids[idx];
          return {
            ec: group.reduce((a, b) => a + b.conductivity, 0) / group.length,
            no3: group.reduce((a, b) => a + b.nitrate, 0) / group.length
          };
        });
      }
    }
    centroids.sort((a, b) => (a.ec + a.no3) - (b.ec + b.no3));
    return samples.map(s => {
      let minDist = Infinity;
      let clusterIdx = 0;
      centroids.forEach((c, idx) => {
        const d = Math.sqrt(Math.pow(s.conductivity - c.ec, 2) + Math.pow(s.nitrate - c.no3, 2));
        if (d < minDist) { minDist = d; clusterIdx = idx; }
      });
      return { ...s, cluster: currentClusterLabels[clusterIdx] };
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    const newTimePoints: TimePoint[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        const rawSamples: WaterSample[] = rows.map((row: any) => {
          const id = row.Code || row.ID || row['نام ایستگاه'] || row['نام نقطه'] || 'نامشخص';
          const ec = parseFloat(row['EC '] || row.EC || row.Conductivity || row['هدایت الکتریکی']);
          const no3 = parseFloat(row.NO3 || row.Nitrate || row['نیترات']);
          if (isNaN(ec) || isNaN(no3)) return null;
          return { id: id.toString().trim(), conductivity: ec, nitrate: no3, timestamp: file.name };
        }).filter((s): s is WaterSample => s !== null);
        if (rawSamples.length > 0) {
          newTimePoints.push({ date: file.name.replace(/\.[^/.]+$/, ""), samples: rawSamples });
        }
      }
      if (newTimePoints.length > 0) {
        newTimePoints.sort((a, b) => a.date.localeCompare(b.date));
        setTimePoints(prev => [...prev, ...newTimePoints]);
      }
    } catch (err) { console.error(err); } finally { setIsUploading(false); }
  };

  const processedTimePoints = useMemo(() => {
    return timePoints.map(tp => ({
      ...tp,
      samples: clusterDataPerPeriod(tp.samples, clusterCount, clusteringAlgo)
    }));
  }, [timePoints, clusterCount, clusteringAlgo, currentClusterLabels]);

  const runAnalysis = async () => {
    if (processedTimePoints.length === 0) return;
    setIsAnalyzing(true);
    const result = await analyzeWaterData(processedTimePoints);
    setAnalysis(result);
    setIsAnalyzing(false);
  };

  const volatilityRanking = useMemo(() => {
    if (processedTimePoints.length < 2) return [];
    const pointHistories: Record<string, { ec: number, no3: number, cluster: string }[]> = {};
    const allEC: number[] = [];
    const allNO3: number[] = [];
    processedTimePoints.forEach(tp => {
      tp.samples.forEach(s => {
        if (!pointHistories[s.id]) pointHistories[s.id] = [];
        pointHistories[s.id].push({ ec: s.conductivity, no3: s.nitrate, cluster: s.cluster || '' });
        allEC.push(s.conductivity);
        allNO3.push(s.nitrate);
      });
    });
    const meanEC = allEC.reduce((a, b) => a + b, 0) / allEC.length;
    const meanNO3 = allNO3.reduce((a, b) => a + b, 0) / allNO3.length;
    const rankings = Object.entries(pointHistories).map(([id, history]) => {
      let totalChange = 0;
      let clusterJumps = 0;
      for (let i = 1; i < history.length; i++) {
        const dEC = Math.abs(history[i].ec - history[i - 1].ec) / (meanEC || 1);
        const dNO3 = Math.abs(history[i].no3 - history[i - 1].no3) / (meanNO3 || 1);
        totalChange += Math.sqrt(dEC * dEC + dNO3 * dNO3);
        if (history[i].cluster !== history[i-1].cluster) clusterJumps += 1;
      }
      const avgChange = history.length > 1 ? totalChange / (history.length - 1) : 0;
      const finalScore = avgChange + (clusterJumps * 0.2); 
      return { id, score: finalScore, jumps: clusterJumps };
    });
    return rankings.sort((a, b) => b.score - a.score);
  }, [processedTimePoints]);

  const selectedPointStats = useMemo(() => {
    if (!selectedPointId || processedTimePoints.length === 0) return null;
    const history = processedTimePoints.map(tp => {
      const sample = tp.samples.find(s => s.id === selectedPointId);
      return { 
        date: tp.date, 
        ec: sample?.conductivity || 0, 
        nitrate: sample?.nitrate || 0,
        cluster: sample?.cluster || 'نامشخص'
      };
    }).filter(h => h.ec > 0);
    if (history.length === 0) return null;
    const ecVals = history.map(h => h.ec);
    const no3Vals = history.map(h => h.nitrate);
    const dates = history.map(h => h.date);
    const ecLimits = calculateControlLimits(ecVals);
    const no3Limits = calculateControlLimits(no3Vals);
    const ecEWMA = calculateEWMA(ecVals);
    const no3EWMA = calculateEWMA(no3Vals);
    return {
      history: history.map((h, i) => ({ ...h, ecEWMA: ecEWMA[i], no3EWMA: no3EWMA[i] })),
      ecStats: {
        trend: calculateMannKendall(ecVals),
        changePoint: findPettittChangePoint(ecVals, dates),
        ...ecLimits
      },
      no3Stats: {
        trend: calculateMannKendall(no3Vals),
        changePoint: findPettittChangePoint(no3Vals, dates),
        ...no3Limits
      }
    };
  }, [selectedPointId, processedTimePoints]);

  const clusterStats = useMemo(() => {
    return processedTimePoints.map(tp => {
      const counts: Record<string, number> = {};
      currentClusterLabels.forEach(l => counts[l] = 0);
      tp.samples.forEach(s => { if (s.cluster) counts[s.cluster]++; });
      return { date: tp.date, ...counts };
    });
  }, [processedTimePoints, currentClusterLabels]);

  const periodStats = useMemo(() => {
    return processedTimePoints.map(tp => ({
      date: tp.date,
      avgEC: Math.round(tp.samples.reduce((sum, s) => sum + s.conductivity, 0) / tp.samples.length),
      avgNO3: parseFloat((tp.samples.reduce((sum, s) => sum + s.nitrate, 0) / tp.samples.length).toFixed(2))
    }));
  }, [processedTimePoints]);

  const filteredRankings = useMemo(() => 
    volatilityRanking.filter(item => item.id.toLowerCase().includes(searchTerm.toLowerCase()))
  , [volatilityRanking, searchTerm]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" dir="rtl">
      <header className="glass-panel border-b border-slate-100 sticky top-0 z-50 no-print h-20">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center space-x-4 space-x-reverse">
            <div className="bg-blue-600 p-2.5 rounded-2xl shadow-lg shadow-blue-200">
              <BeakerIcon className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">آکواترک</h1>
              <p className="text-[10px] text-blue-500 font-black uppercase tracking-widest">پایش پدافندی شبکه توزیع</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 space-x-reverse">
            <button onClick={() => window.print()} disabled={processedTimePoints.length === 0} className="flex items-center space-x-2 space-x-reverse px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all text-sm font-bold shadow-sm">
              <DocumentArrowDownIcon className="h-5 w-5 text-red-500" />
              <span>خروجی PDF</span>
            </button>
            <button onClick={runAnalysis} disabled={isAnalyzing || processedTimePoints.length === 0} className="flex items-center space-x-2 space-x-reverse px-5 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-all text-sm font-bold shadow-sm">
              {isAnalyzing ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <SparklesIcon className="h-5 w-5 text-blue-400" />}
              <span>تحلیل هوشمند</span>
            </button>
            <label className="cursor-pointer flex items-center space-x-2 space-x-reverse px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-all text-sm font-bold shadow-md">
              <ArrowUpTrayIcon className="h-5 w-5" />
              <span>{isUploading ? 'درحال پردازش...' : 'بارگذاری اکسل'}</span>
              <input type="file" multiple accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </div>
      </header>

      <main id="main-content" className="flex-1 max-w-7xl mx-auto px-6 py-10 w-full grid grid-cols-1 lg:grid-cols-12 gap-10">
        <aside className="lg:col-span-3 space-y-8 no-print">
          <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 flex flex-col h-[600px] overflow-hidden">
            <div className="p-5 border-b border-slate-50 bg-slate-50/50">
              <h3 className="text-xs font-black text-slate-800 flex items-center mb-4">
                <ArrowsUpDownIcon className="h-4 w-4 ml-2 text-blue-600" /> رتبه‌بندی تلاطم شبکه
              </h3>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute right-3 top-2.5 h-4 w-4 text-slate-300" />
                <input 
                  type="text" 
                  placeholder="جستجوی شناسه نقطه..." 
                  className="w-full pr-10 pl-4 py-2 text-xs rounded-xl bg-white border border-slate-100 font-bold outline-none focus:ring-2 focus:ring-blue-500/20" 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
              {filteredRankings.length > 0 ? filteredRankings.map((item, index) => (
                <button 
                  key={item.id} 
                  onClick={() => setSelectedPointId(selectedPointId === item.id ? null : item.id)} 
                  className={`w-full p-3 rounded-2xl transition-all mb-2 border text-right relative ${selectedPointId === item.id ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white border-slate-50 hover:border-slate-200'}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                       <span className={`text-[9px] font-black uppercase mb-1 block ${selectedPointId === item.id ? 'text-blue-200' : 'text-slate-400'}`}>رتبه {index + 1}</span>
                       <span className="text-sm font-black tracking-tight">{item.id}</span>
                    </div>
                    {item.jumps > 0 && <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${selectedPointId === item.id ? 'bg-white/20' : 'bg-orange-100 text-orange-600'}`}>{item.jumps} جابجایی</span>}
                  </div>
                  <div className="mt-3">
                     <div className="flex justify-between mb-1">
                        <span className={`text-[8px] ${selectedPointId === item.id ? 'text-blue-100' : 'text-slate-500'}`}>شاخص نوسان</span>
                        <span className="text-[8px] font-black">{item.score.toFixed(3)}</span>
                     </div>
                     <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${selectedPointId === item.id ? 'bg-white' : 'bg-blue-600'}`} style={{ width: `${Math.min(item.score * 100, 100)}%` }}></div>
                     </div>
                  </div>
                </button>
              )) : <p className="text-[10px] text-slate-400 font-bold p-10 text-center">داده‌ای بارگذاری نشده است.</p>}
            </div>
          </div>
        </aside>

        <section className="lg:col-span-9 space-y-10">
          {processedTimePoints.length > 0 ? (
            <>
              <div className="glass-panel p-6 rounded-[2.5rem] border border-white shadow-2xl no-print space-y-6">
                <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                  <div className="flex items-center space-x-3 space-x-reverse">
                    <AdjustmentsVerticalIcon className="h-6 w-6 text-blue-600" />
                    <h3 className="text-sm font-black text-slate-800 tracking-tight">تنظیمات پایش و خوشه‌بندی</h3>
                  </div>
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                    <button onClick={() => setColorByCluster(false)} className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${!colorByCluster ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>گروه‌بندی: زمان</button>
                    <button onClick={() => setColorByCluster(true)} className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${colorByCluster ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>گروه‌بندی: خوشه‌ها</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500">تعداد خوشه‌ها ({clusterCount}):</label>
                    <input type="range" min="3" max="8" step="1" value={clusterCount} onChange={(e) => setClusterCount(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500">الگوریتم:</label>
                    <div className="flex bg-slate-50 border p-1 rounded-xl">
                      <button onClick={() => setClusteringAlgo('simple')} className={`flex-1 py-1.5 rounded-lg text-[9px] font-black ${clusteringAlgo === 'simple' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>Simple</button>
                      <button onClick={() => setClusteringAlgo('kmeans')} className={`flex-1 py-1.5 rounded-lg text-[9px] font-black ${clusteringAlgo === 'kmeans' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>K-Means</button>
                    </div>
                  </div>
                  <div className="flex space-x-3 space-x-reverse self-end">
                    <select value={xAxisKey} onChange={(e) => setXAxisKey(e.target.value as AxisField)} className="flex-1 bg-white border border-slate-100 rounded-xl px-3 py-2 text-[10px] font-black shadow-sm outline-none">
                      <option value="conductivity">X: EC (هدایت)</option>
                      <option value="nitrate">X: نیترات</option>
                    </select>
                    <select value={yAxisKey} onChange={(e) => setYAxisKey(e.target.value as AxisField)} className="flex-1 bg-white border border-slate-100 rounded-xl px-3 py-2 text-[10px] font-black shadow-sm outline-none">
                      <option value="nitrate">Y: نیترات</option>
                      <option value="conductivity">Y: EC (هدایت)</option>
                    </select>
                  </div>
                </div>
              </div>

              <TrajectoryChart data={processedTimePoints} selectedPointId={selectedPointId} onPointSelect={setSelectedPointId} xAxisKey={xAxisKey} yAxisKey={yAxisKey} colorByCluster={colorByCluster} customLabels={currentClusterLabels} />

              {selectedPointStats && (
                <div className="bg-white rounded-[3rem] p-10 shadow-xl border border-slate-100 space-y-10 print:shadow-none print:mt-10 page-break-inside-avoid animate-in fade-in slide-in-from-bottom-5">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-8">
                    <div className="flex items-center space-x-5 space-x-reverse">
                      <div className="bg-blue-600 p-4 rounded-[1.5rem] text-white shadow-xl"><MapPinIcon className="h-7 w-7" /></div>
                      <div>
                        <h3 className="text-xl font-black text-slate-800 tracking-tight">تحلیل نقطه: {selectedPointId}</h3>
                        <p className="text-[10px] text-slate-400 font-bold mt-2 tracking-widest uppercase">Statistical Control Charts (QC)</p>
                      </div>
                    </div>
                    {/* تنظیمات نمودار نقطه */}
                    <div className="flex items-center space-x-3 space-x-reverse no-print">
                        <button onClick={() => setShowShewhart(!showShewhart)} className={`flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl text-[10px] font-black transition-all ${showShewhart ? 'bg-blue-100 text-blue-700' : 'bg-slate-50 text-slate-400'}`}>
                          <CheckBadgeIcon className="h-4 w-4" />
                          <span>Shewhart Limits</span>
                        </button>
                        <button onClick={() => setShowEWMA(!showEWMA)} className={`flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl text-[10px] font-black transition-all ${showEWMA ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-50 text-slate-400'}`}>
                          <PresentationChartLineIcon className="h-4 w-4" />
                          <span>EWMA Trend</span>
                        </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <div className="space-y-8">
                      <div className="bg-slate-50 p-5 rounded-2xl border flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400">روند EC: {selectedPointStats.ecStats.trend}</span>
                        <span className="text-[10px] font-black text-slate-800">نقطه شکست: {selectedPointStats.ecStats.changePoint || '---'}</span>
                      </div>
                      <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={selectedPointStats.history}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="date" fontSize={9} fontWeight={700} />
                            <YAxis fontSize={9} fontWeight={700} />
                            <RechartsTooltip />
                            {showShewhart && (
                              <>
                                <ReferenceLine y={selectedPointStats.ecStats.ucl} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'UCL', fill: '#ef4444', fontSize: 9 }} />
                                <ReferenceLine y={selectedPointStats.ecStats.mean} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: 'Mean', fill: '#94a3b8', fontSize: 9 }} />
                              </>
                            )}
                            <Line type="monotone" dataKey="ec" name="EC" stroke="#2563eb" strokeWidth={3} dot={{ r: 5, fill: '#2563eb' }} />
                            {showEWMA && <Line type="monotone" dataKey="ecEWMA" name="EWMA" stroke="#475569" strokeWidth={1} strokeDasharray="4 4" dot={false} />}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="bg-slate-50 p-5 rounded-2xl border flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400">روند نیترات: {selectedPointStats.no3Stats.trend}</span>
                        <span className="text-[10px] font-black text-slate-800">میانگین: {selectedPointStats.no3Stats.mean.toFixed(2)}</span>
                      </div>
                      <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={selectedPointStats.history}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="date" fontSize={9} fontWeight={700} />
                            <YAxis fontSize={9} fontWeight={700} />
                            <RechartsTooltip />
                            {showShewhart && (
                              <>
                                <ReferenceLine y={selectedPointStats.no3Stats.ucl} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'UCL', fill: '#ef4444', fontSize: 9 }} />
                                <ReferenceLine y={selectedPointStats.no3Stats.mean} stroke="#94a3b8" strokeDasharray="3 3" />
                              </>
                            )}
                            <Line type="monotone" dataKey="nitrate" name="نیترات" stroke="#059669" strokeWidth={3} dot={{ r: 5, fill: '#059669' }} />
                            {showEWMA && <Line type="monotone" dataKey="no3EWMA" name="EWMA" stroke="#475569" strokeWidth={1} strokeDasharray="4 4" dot={false} />}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="bg-white rounded-[3rem] p-10 shadow-xl border border-slate-100 page-break-inside-avoid print:shadow-none">
                  <h3 className="text-sm font-black text-slate-800 mb-10 flex items-center">
                    <PuzzlePieceIcon className="h-6 w-6 ml-3 text-indigo-600" /> توزیع طبقات کیفی
                  </h3>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={clusterStats}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" fontSize={10} fontWeight={700} />
                        <YAxis hide />
                        <RechartsTooltip />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 900 }} />
                        {currentClusterLabels.map((label, idx) => (
                          <Area key={label} type="monotone" dataKey={label} stackId="1" stroke={CLUSTER_COLORS_MAP[label] || COLORS[idx % COLORS.length]} fill={CLUSTER_COLORS_MAP[label] || COLORS[idx % COLORS.length]} fillOpacity={0.6} />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-100 page-break-inside-avoid print:shadow-none">
                    <h3 className="text-sm font-black text-slate-800 mb-6 flex items-center">
                      <ChartBarIcon className="h-5 w-5 ml-2 text-blue-600" /> میانگین EC شبکه
                    </h3>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={periodStats}>
                          <XAxis dataKey="date" fontSize={9} fontWeight={700} />
                          <YAxis fontSize={9} fontWeight={700} hide />
                          <Bar dataKey="avgEC" radius={[6, 6, 0, 0]}>
                            {periodStats.map((_, index) => <RechartsCell key={`cell-ec-${index}`} fill={COLORS[index % COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  
                  {/* نمودار میانگین نیترات که کاربر درخواست کرده بود */}
                  <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-100 page-break-inside-avoid print:shadow-none">
                    <h3 className="text-sm font-black text-slate-800 mb-6 flex items-center">
                      <ChartBarIcon className="h-5 w-5 ml-2 text-emerald-600" /> روند میانگین نیترات کل شبکه (mg/L)
                    </h3>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={periodStats}>
                          <XAxis dataKey="date" fontSize={9} fontWeight={700} />
                          <YAxis fontSize={9} fontWeight={700} />
                          <RechartsTooltip />
                          <Bar dataKey="avgNO3" radius={[6, 6, 0, 0]} fill="#10b981">
                            {periodStats.map((_, index) => (
                              <RechartsCell key={`cell-no3-${index}`} fill="#10b981" fillOpacity={0.4 + (index / periodStats.length) * 0.6} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
             <div className="bg-white rounded-[3rem] p-24 text-center border shadow-sm flex flex-col items-center col-span-12">
                <div className="bg-blue-50 p-8 rounded-full mb-8"><MapPinIcon className="h-20 w-20 text-blue-300" /></div>
                <h2 className="text-2xl font-black text-slate-800 mb-4">داشبورد هوشمند شبکه توزیع آب</h2>
                <p className="text-slate-400 text-sm max-w-lg leading-loose font-medium">فایل‌های اکسل حاوی EC و نیترات را بارگذاری کنید تا تحلیل‌های خوشه‌بندی و نمودارهای کنترلی برای شما فعال شود.</p>
             </div>
          )}

          {analysis && (
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden print:shadow-none print:mt-12 page-break-before-always">
              <div className="bg-slate-900 p-10 flex items-center justify-between">
                <div className="flex items-center space-x-6 space-x-reverse">
                  <div className="bg-blue-500 p-4 rounded-3xl shadow-lg ring-4 ring-blue-500/10"><LightBulbIcon className="h-8 w-8 text-white" /></div>
                  <div>
                    <h2 className="text-white font-black text-xl tracking-tight">گزارش راهبردی و تحلیل هوشمند</h2>
                    <p className="text-blue-400 text-[10px] font-bold uppercase tracking-widest mt-2">تحلیل آماری جابجایی برداری و خوشه‌های کیفی</p>
                  </div>
                </div>
              </div>
              <div className="p-12 grid grid-cols-1 md:grid-cols-2 gap-16">
                <div className="space-y-8">
                  <h3 className="text-blue-600 text-xs font-black uppercase tracking-widest pr-4 border-r-4 border-blue-600">تفسیر روندهای شبکه</h3>
                  <p className="text-slate-600 leading-9 text-sm text-justify font-medium">{analysis.summary}</p>
                </div>
                <div className="space-y-10">
                  <div className="bg-amber-50 p-8 rounded-[2rem] border border-amber-100">
                    <h3 className="text-amber-800 text-xs font-black flex items-center mb-6 uppercase tracking-wider">
                      <ExclamationTriangleIcon className="h-5 w-5 ml-3 text-amber-600" /> نقاط بحرانی و هشدار شبکه
                    </h3>
                    <ul className="space-y-4">
                      {analysis.anomalies.map((a, i) => <li key={i} className="flex items-start text-slate-800 text-xs font-bold leading-relaxed"><span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 ml-3 shrink-0"></span>{a}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
      
      <footer className="py-10 text-center no-print border-t border-slate-100 bg-white">
        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">AquaTrack Analytics © 2024 | سیستم جامع پایش هوشمند کیفیت منابع آب</p>
      </footer>
    </div>
  );
};

export default App;
