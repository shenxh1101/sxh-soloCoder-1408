import { useState } from 'react';
import { History, Undo2, Redo2, Check, ChevronDown, ChevronRight, ArrowRight, LayoutGrid, Settings } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { undo, redo, getStepDiff } from '@/utils/api';
import type { StepChangeDetail, ColumnDiffDetail } from '@/types';

export default function HistoryPanel() {
  const { sessionId, history, currentStep, setResponse, setLoading, setError } = useDataStore();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [diffCache, setDiffCache] = useState<Record<number, any>>({});
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);

  if (!sessionId) {
    return (
      <div className="p-4 text-slate-500 text-sm text-center">
        上传数据后显示操作历史
      </div>
    );
  }

  const run = async (fn: () => Promise<any>) => {
    setLoading(true);
    setError('');
    try {
      const res = await fn();
      setResponse(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  const toggleExpand = async (idx: number) => {
    if (expandedIdx === idx) {
      setExpandedIdx(null);
      return;
    }
    setExpandedIdx(idx);
    // step diff 索引是 1-based（0 是初始），history[idx] 对应第 idx+1 步快照
    const stepIdx = idx + 1;
    if (diffCache[stepIdx]) return;
    setLoadingIdx(idx);
    try {
      const d = await getStepDiff(sessionId, stepIdx);
      setDiffCache((c) => ({ ...c, [stepIdx]: d }));
    } catch (e: any) {
      setError(e.message || '加载步骤详情失败');
    } finally {
      setLoadingIdx(null);
    }
  };

  const fmt = (n: number | undefined) => {
    if (n === undefined) return <span className="text-slate-600">-</span>;
    if (n === 0) return <span className="text-slate-500">0</span>;
    if (n > 0) return <span className="text-amber-400">+{n}</span>;
    return <span className="text-emerald-400">{n}</span>;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-medium text-slate-200">操作历史</span>
        <span className="text-xs text-slate-500 ml-auto">{history.length} 步操作</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => run(() => undo(sessionId!))}
          disabled={currentStep <= 0}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 transition"
        >
          <Undo2 className="w-3.5 h-3.5" />
          撤销
        </button>
        <button
          onClick={() => run(() => redo(sessionId!))}
          disabled={currentStep >= history.length}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 transition"
        >
          <Redo2 className="w-3.5 h-3.5" />
          重做
        </button>
      </div>

      <div className="text-[10px] text-slate-500 flex items-center gap-1 -mt-2">
        💡 点击步骤项可展开查看：影响列、变更数量、前后样例
      </div>

      <div className="relative">
        <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-700" />
        <div className="space-y-1.5 max-h-[60vh] overflow-auto pr-1">
          {history.length === 0 && (
            <div className="text-xs text-slate-500 text-center py-4 pl-5">
              暂无操作记录
            </div>
          )}
          {history.map((h, idx) => {
            const done = idx < currentStep;
            const isOpen = expandedIdx === idx;
            const stepIdx = idx + 1;
            const d = diffCache[stepIdx];
            return (
              <div key={h.id} className="relative pl-8">
                <div
                  className={`absolute left-2 top-2.5 w-3 h-3 rounded-full flex items-center justify-center ${
                    done ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                >
                  {done && <Check className="w-2 h-2 text-slate-900" />}
                </div>
                <button
                  onClick={() => toggleExpand(idx)}
                  className={`w-full text-left p-2 rounded-md border transition ${
                    isOpen
                      ? done ? 'bg-slate-800 border-blue-500/40' : 'bg-slate-800/60 border-blue-500/30'
                      : done ? 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800' : 'bg-slate-800/20 border-slate-700/30 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {isOpen
                      ? <ChevronDown className="w-3 h-3 text-blue-400 shrink-0" />
                      : <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                    }
                    <div className="min-w-0 flex-1">
                      <div className={`text-xs font-medium truncate ${done ? 'text-slate-200' : 'text-slate-400'}`}>
                        {h.description}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center justify-between mt-0.5">
                        <span className="font-mono">{h.operation}</span>
                        <span className="font-mono">{formatTime(h.timestamp)}</span>
                      </div>
                    </div>
                    {/* 卡片上直接显示关键 delta */}
                    {d && (
                      <div className="shrink-0 flex items-center gap-2 text-[10px] ml-1">
                        {d.rows?.diff !== 0 && <span className="px-1 py-0.5 rounded bg-slate-900/70">行{fmt(d.rows?.diff)}</span>}
                        {d.nulls?.diff !== 0 && <span className="px-1 py-0.5 rounded bg-slate-900/70">空{fmt(d.nulls?.diff)}</span>}
                        {d.duplicates?.diff !== 0 && <span className="px-1 py-0.5 rounded bg-slate-900/70">重{fmt(d.duplicates?.diff)}</span>}
                        {d.affectedColumns && d.affectedColumns.length > 0 && (
                          <span className="px-1 py-0.5 rounded bg-blue-500/15 text-blue-300 font-medium">
                            {d.affectedColumns.length}列
                          </span>
                        )}
                      </div>
                    )}
                    {loadingIdx === idx && (
                      <span className="shrink-0 text-[10px] text-slate-500 ml-1 animate-pulse">加载中…</span>
                    )}
                  </div>

                  {/* 展开区域 */}
                  {isOpen && d && (
                    <div className="mt-2 pt-2 border-t border-slate-700/60 space-y-2 text-[11px]">
                      {/* 指标 */}
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { l: '行数', b: d.rows?.before, a: d.rows?.after, diff: d.rows?.diff },
                          { l: '列数', b: d.columns?.before, a: d.columns?.after, diff: d.columns?.diff },
                          { l: '缺失', b: d.nulls?.before, a: d.nulls?.after, diff: d.nulls?.diff },
                          { l: '重复', b: d.duplicates?.before, a: d.duplicates?.after, diff: d.duplicates?.diff },
                        ].map((it) => (
                          <div key={it.l} className="p-1.5 rounded bg-slate-900/50 border border-slate-700/50">
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider">{it.l}</div>
                            <div className="font-mono text-slate-200 text-[10px] mt-0.5 flex items-center justify-between">
                              <span className="text-slate-500">{it.b ?? '-'}</span>
                              <ArrowRight className="w-2.5 h-2.5 text-slate-600" />
                              <span>{it.a ?? '-'}</span>
                            </div>
                            <div className="text-[10px] font-semibold">{fmt(it.diff)}</div>
                          </div>
                        ))}
                      </div>

                      {/* 影响列 */}
                      {d.columnDiffs && d.columnDiffs.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <LayoutGrid className="w-3 h-3 text-blue-400" />
                            <span className="text-slate-300 font-medium">影响列</span>
                          </div>
                          <div className="space-y-1 max-h-44 overflow-y-auto pr-0.5">
                            {(d.columnDiffs as ColumnDiffDetail[]).map((cd) => (
                              <div key={cd.column} className="p-1.5 rounded bg-slate-900/50 border border-slate-700/50">
                                <div className="flex items-center justify-between">
                                  <span className="text-blue-300 font-mono text-[11px]">{cd.column}</span>
                                  {cd.dtypeBefore !== cd.dtypeAfter && (
                                    <span className="text-[10px] font-mono text-slate-500">
                                      {cd.dtypeBefore} <ArrowRight className="inline w-2 h-2" /> {cd.dtypeAfter}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  缺失: {cd.nullsBefore} → {cd.nullsAfter} {cd.nullsDiff !== 0 && fmt(cd.nullsDiff)}
                                </div>
                                <div className="grid grid-cols-2 gap-1 mt-1">
                                  <div>
                                    <div className="text-[9px] text-slate-500 uppercase mb-0.5">前</div>
                                    <div className="flex flex-wrap gap-0.5">
                                      {(cd.sampleBefore || []).map((v, i) => (
                                        <span key={i} className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px] font-mono max-w-[100px] truncate" title={String(v ?? '')}>
                                          {v === null || v === undefined ? '∅' : String(v)}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[9px] text-emerald-500 uppercase mb-0.5">后</div>
                                    <div className="flex flex-wrap gap-0.5">
                                      {(cd.sampleAfter || []).map((v, i) => (
                                        <span key={i} className="px-1 py-0.5 rounded bg-emerald-900/40 text-emerald-200 text-[9px] font-mono max-w-[100px] truncate" title={String(v ?? '')}>
                                          {v === null || v === undefined ? '∅' : String(v)}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 规则参数 */}
                      {h.params && Object.keys(h.params).length > 0 && (
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <Settings className="w-3 h-3 text-amber-400" />
                            <span className="text-slate-300 font-medium">参数</span>
                          </div>
                          <pre className="p-1.5 rounded bg-slate-900/70 border border-slate-700/50 font-mono text-[10px] text-slate-300 whitespace-pre-wrap break-all max-h-28 overflow-auto">
{JSON.stringify(h.params, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
