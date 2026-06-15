import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Database } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';

const PAGE_SIZE = 20;

const DTYPE_COLORS: Record<string, string> = {
  int64: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  Int64: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  float64: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  Float64: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  object: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  string: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  bool: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  datetime64: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
};

export default function DataTable() {
  const { data, columns, detection, sessionId } = useDataStore();
  const [page, setPage] = useState(0);

  const colMap = useMemo(() => {
    const m: Record<string, { dtype: string; nullPct: number }> = {};
    detection?.columns.forEach((c) => {
      m[c.name] = { dtype: c.dtype, nullPct: c.nullPercentage };
    });
    return m;
  }, [detection]);

  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages - 1);
  const pagedData = data.slice(curPage * PAGE_SIZE, curPage * PAGE_SIZE + PAGE_SIZE);

  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-slate-500">
        <Database className="w-16 h-16 mb-4 opacity-40" />
        <div className="text-lg">上传 CSV 文件后预览数据</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="text-sm text-slate-300">
          <span className="text-slate-400">共</span>{' '}
          <span className="text-blue-400 font-medium">{detection?.rowCount ?? 0}</span>{' '}
          <span className="text-slate-400">行</span>
          <span className="mx-2 text-slate-600">|</span>
          <span className="text-slate-400">共</span>{' '}
          <span className="text-blue-400 font-medium">{detection?.columnCount ?? 0}</span>{' '}
          <span className="text-slate-400">列</span>
          <span className="mx-2 text-slate-600">|</span>
          <span className="text-slate-400">显示</span>{' '}
          <span className="text-blue-400 font-medium">{pagedData.length}</span>{' '}
          <span className="text-slate-400">行</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={curPage === 0}
            className="p-1.5 rounded-md bg-slate-700/50 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft className="w-4 h-4 text-slate-300" />
          </button>
          <span className="text-sm text-slate-400 min-w-[70px] text-center">
            {curPage + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={curPage >= totalPages - 1}
            className="p-1.5 rounded-md bg-slate-700/50 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border border-slate-700 bg-slate-900/40">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-800 border-b border-slate-700">
              <th className="px-3 py-2.5 text-left text-slate-500 font-medium w-12">#</th>
              {columns.map((c) => {
                const info = colMap[c];
                const dtypeClass = DTYPE_COLORS[info?.dtype ?? 'object'] || DTYPE_COLORS.object;
                const hasNull = info && info.nullPct > 0;
                return (
                  <th key={c} className="px-3 py-2.5 text-left font-medium text-slate-200 whitespace-nowrap min-w-[140px]">
                    <div className="flex items-center gap-2">
                      <span className="truncate max-w-[140px]" title={c}>{c}</span>
                      <span className={`px-1.5 py-0.5 text-[10px] rounded border ${dtypeClass}`}>
                        {info?.dtype || '?'}
                      </span>
                      {hasNull && (
                        <span className="text-[10px] text-orange-400" title={`${info?.nullPct}% 缺失`}>
                          {info?.nullPct}%
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pagedData.map((row, idx) => (
              <tr
                key={idx}
                className={`border-b border-slate-800/70 ${idx % 2 === 0 ? 'bg-slate-900/30' : 'bg-slate-900/60'} hover:bg-slate-800/50 transition`}
              >
                <td className="px-3 py-2 text-slate-600 font-mono">{curPage * PAGE_SIZE + idx + 1}</td>
                {columns.map((c) => {
                  const val = row[c];
                  const isNull = val === null || val === undefined || val === '';
                  return (
                    <td
                      key={c}
                      className={`px-3 py-2 whitespace-nowrap font-mono ${
                        isNull ? 'text-orange-400/70 italic' : 'text-slate-300'
                      }`}
                      title={String(val ?? '')}
                    >
                      {isNull ? 'NULL' : typeof val === 'string' && val.length > 40 ? val.slice(0, 40) + '…' : String(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
