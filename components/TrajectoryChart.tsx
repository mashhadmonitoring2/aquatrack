
import React, { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { TimePoint } from '../types';
import { AxisField } from '../App';

interface Props {
  data: TimePoint[];
  selectedPointId: string | null;
  onPointSelect: (id: string) => void;
  xAxisKey: AxisField;
  yAxisKey: AxisField;
  colorByCluster?: boolean;
  customLabels?: string[];
}

const PERIOD_COLORS = [
  '#2563eb', '#d97706', '#059669', '#7c3aed', '#db2777', '#0891b2', '#dc2626', '#475569'
];

const CLUSTER_COLORS_STATIC: Record<string, string> = {
  'عالی': '#059669',
  'خوب': '#10b981',
  'متوسط': '#f59e0b',
  'ضعیف': '#ea580c',
  'بحرانی': '#dc2626'
};

const TrajectoryChart: React.FC<Props> = ({ data, selectedPointId, onPointSelect, xAxisKey, yAxisKey, colorByCluster, customLabels = [] }) => {
  const processedTrajectories = useMemo(() => {
    const trajectories: Record<string, any[]> = {};
    data.forEach((tp, timeIdx) => {
      tp.samples.forEach(sample => {
        if (!trajectories[sample.id]) trajectories[sample.id] = [];
        trajectories[sample.id].push({
          ...sample,
          period: tp.date,
          periodIdx: timeIdx
        });
      });
    });
    return trajectories;
  }, [data]);

  const getClusterColor = (label: string, idx: number) => {
    return CLUSTER_COLORS_STATIC[label] || PERIOD_COLORS[idx % PERIOD_COLORS.length];
  };

  const getLabel = (key: AxisField) => {
    switch (key) {
      case 'conductivity': return 'هدایت الکتریکی (μS/cm)';
      case 'nitrate': return 'میزان نیترات (mg/L)';
      default: return '';
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white/95 backdrop-blur-xl p-5 rounded-3xl shadow-2xl border border-slate-100 min-w-[220px]" dir="rtl">
          <div className="flex justify-between items-center mb-4 border-b border-slate-50 pb-2">
            <span className="font-black text-slate-900 text-base">{d.id}</span>
            <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">{d.period}</span>
          </div>
          <div className="space-y-3">
            <div className="flex flex-col">
              <span className="text-slate-400 text-[9px] font-bold">وضعیت نقطه</span>
              <span className="font-bold text-sm" style={{ color: CLUSTER_COLORS_STATIC[d.cluster || ''] || '#2563eb' }}>
                {d.cluster || 'نامشخص'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-400 text-[9px] font-bold">هدایت الکتریکی</span>
              <span className="font-mono text-slate-800 font-black text-sm">{d.conductivity.toLocaleString()}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-400 text-[9px] font-bold">نیترات</span>
              <span className="font-mono text-slate-800 font-black text-sm">{d.nitrate.toFixed(2)}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const maxValX = Math.max(...data.flatMap(tp => tp.samples.map(s => s[xAxisKey])), 10) * 1.1;
  const maxValY = Math.max(...data.flatMap(tp => tp.samples.map(s => s[yAxisKey])), 10) * 1.1;

  return (
    <div id="main-chart-container" className="w-full h-[650px] bg-white rounded-[3rem] shadow-xl shadow-slate-100/50 border border-slate-100 p-10 flex flex-col relative overflow-hidden print:h-[500px] print:shadow-none" dir="rtl">
      <div className="flex justify-between items-start mb-10 z-10">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">نقشه پایش نقاط شبکه توزیع</h2>
          <p className="text-xs text-slate-400 font-bold mt-2">تحلیل برداری جابجایی کیفیت در شبکه</p>
        </div>
        <div className="flex flex-wrap justify-end gap-3 max-w-[50%] no-print">
          {!colorByCluster ? data.map((tp, i) => (
            <div key={tp.date} className="flex items-center space-x-2 space-x-reverse bg-slate-50/50 px-4 py-2 rounded-2xl border border-slate-100">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PERIOD_COLORS[i % PERIOD_COLORS.length] }}></div>
              <span className="text-[10px] font-black text-slate-600">{tp.date}</span>
            </div>
          )) : customLabels.map((name, i) => (
            <div key={name} className="flex items-center space-x-2 space-x-reverse bg-slate-50/50 px-4 py-2 rounded-2xl border border-slate-100">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getClusterColor(name, i) }}></div>
              <span className="text-[10px] font-black text-slate-600">{name}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex-1 z-10">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 30 }}>
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#1e293b" />
              </marker>
            </defs>
            <CartesianGrid strokeDasharray="10 10" vertical={false} stroke="#f1f5f9" />
            <XAxis 
              type="number" 
              dataKey={xAxisKey} 
              domain={[0, maxValX]} 
              stroke="#1e293b" 
              fontSize={11} 
              fontWeight={700}
              label={{ value: getLabel(xAxisKey), position: 'bottom', offset: 20, fontSize: 13, fontWeight: 900 }}
            />
            <YAxis 
              type="number" 
              dataKey={yAxisKey} 
              domain={[0, maxValY]} 
              stroke="#1e293b" 
              fontSize={11} 
              fontWeight={700}
              label={{ value: getLabel(yAxisKey), angle: -90, position: 'insideRight', offset: -10, fontSize: 13, fontWeight: 900 }}
            />
            <ZAxis type="number" range={[45, 45]} />
            <Tooltip content={<CustomTooltip />} />
            
            {data.map((tp, idx) => (
              <Scatter
                key={tp.date} data={tp.samples} 
                onClick={(d) => onPointSelect(d.id)}
                opacity={selectedPointId ? (tp.samples.some(s => s.id === selectedPointId) ? 1 : 0.05) : 0.85}
              >
                {tp.samples.map((entry, index) => {
                  const clusterIdx = customLabels.indexOf(entry.cluster || '');
                  return (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={colorByCluster ? getClusterColor(entry.cluster || '', clusterIdx) : PERIOD_COLORS[idx % PERIOD_COLORS.length]} 
                    />
                  );
                })}
              </Scatter>
            ))}

            {selectedPointId && processedTrajectories[selectedPointId] && (
              <Scatter
                data={processedTrajectories[selectedPointId]}
                fill="#1e293b"
                line={{ stroke: '#1e293b', strokeWidth: 1.5, markerEnd: 'url(#arrowhead)' }}
                shape="circle" opacity={1}
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TrajectoryChart;
