import { AlertTriangle, Database, Layers, AlertCircle, Hash, FileWarning } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';

export default function DetectionPanel() {
  const { detection, sessionId } = useDataStore();

  if (!sessionId || !detection) {
    return (
      <div className="p-4 text-slate-500 text-sm text-center">
        上传数据后显示检测结果
      </div>
    );
  }

  const nullCols = detection.columns.filter((c) => c.nullCount > 0);
  const outlierCols = detection.columns.filter((c) => c.outliers.length > 0);

  const stats = [
    {
      label: '总行数',
      value: detection.rowCount,
      icon: Database,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
    },
    {
      label: '总列数',
      value: detection.columnCount,
      icon: Hash,
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10 border-cyan-500/20',
    },
    {
      label: '缺失值',
      value: detection.totalNullCount,
      icon: AlertCircle,
      color: detection.totalNullCount > 0 ? 'text-orange-400' : 'text-emerald-400',
      bg: detection.totalNullCount > 0 ? 'bg-orange-500/10 border-orange-500/20' : 'bg-emerald-500/10 border-emerald-500/20',
    },
    {
      label: '重复行',
      value: detection.duplicateCount,
      icon: Layers,
      color: detection.duplicateCount > 0 ? 'text-red-400' : 'text-emerald-400',
      bg: detection.duplicateCount > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div key={s.label} className={`p-3 rounded-lg border ${s.bg}`}>
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-xs text-slate-400">{s.label}</span>
            </div>
            <div className={`text-xl font-bold font-mono ${s.color}`}>{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {nullCols.length > 0 && (
        <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-orange-400" />
            <span className="text-sm font-medium text-orange-300">缺失值分布</span>
          </div>
          <div className="space-y-1.5 max-h-40 overflow-auto pr-1">
            {nullCols.map((c) => (
              <div key={c.name}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-slate-300 truncate max-w-[120px]" title={c.name}>{c.name}</span>
                  <span className="text-orange-300 font-mono">{c.nullCount} ({c.nullPercentage}%)</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-400 rounded-full transition-all"
                    style={{ width: `${Math.min(100, c.nullPercentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {outlierCols.length > 0 && (
        <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium text-red-300">异常值检测</span>
          </div>
          <div className="space-y-1.5 max-h-32 overflow-auto pr-1">
            {outlierCols.slice(0, 5).map((c) => (
              <div key={c.name} className="flex items-center justify-between text-xs">
                <span className="text-slate-300 truncate max-w-[120px]" title={c.name}>{c.name}</span>
                <span className="text-red-300 font-mono text-[10px]">
                  {c.outliers.slice(0, 3).join(', ')}
                  {c.outliers.length > 3 ? '...' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700">
        <div className="flex items-center gap-2 mb-2">
          <FileWarning className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-400">内存占用</span>
        </div>
        <div className="text-sm text-slate-200 font-mono">{detection.memoryUsage}</div>
      </div>
    </div>
  );
}
