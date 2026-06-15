import { useState } from 'react';
import {
  Download, FileText, X, CheckCircle, AlertTriangle, TrendingUp, Database,
  FolderKanban, LayoutList, ArrowRight,
} from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { getCsvUrl, getExcelUrl, getReport } from '@/utils/api';
import type { QualityReport, StepChangeDetail } from '@/types';

export default function ExportPanel() {
  const { sessionId, setLoading, setError, report, setReport, reportOpen, setReportOpen } = useDataStore();
  const [loadingReport, setLoadingReport] = useState(false);

  if (!sessionId) return null;

  const handleDownload = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
  };

  const handleGenerateReport = async () => {
    setLoadingReport(true);
    setError('');
    try {
      const r = await getReport(sessionId!);
      setReport(r);
      setReportOpen(true);
    } catch (e: any) {
      setError(e.message || '生成报告失败');
    } finally {
      setLoadingReport(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Download className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-medium text-slate-200">导出数据</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => handleDownload(getCsvUrl(sessionId!))}
          className="flex flex-col items-center gap-1 p-3 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700 transition"
        >
          <FileText className="w-6 h-6 text-emerald-400" />
          <span className="text-xs text-slate-200 font-medium">CSV</span>
          <span className="text-[10px] text-slate-500">通用格式</span>
        </button>
        <button
          onClick={() => handleDownload(getExcelUrl(sessionId!))}
          className="flex flex-col items-center gap-1 p-3 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700 transition"
        >
          <Database className="w-6 h-6 text-blue-400" />
          <span className="text-xs text-slate-200 font-medium">Excel</span>
          <span className="text-[10px] text-slate-500">xlsx 格式</span>
        </button>
      </div>

      <button
        onClick={handleGenerateReport}
        disabled={loadingReport}
        className="w-full flex items-center justify-center gap-2 p-3 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-60 text-white text-sm font-medium transition shadow-lg shadow-violet-900/30"
      >
        <TrendingUp className="w-4 h-4" />
        {loadingReport ? '生成中...' : '生成数据质量报告'}
      </button>

      {reportOpen && report && <ReportModal report={report} onClose={() => setReportOpen(false)} />}
    </div>
  );
}

function ReportModal({ report, onClose }: { report: QualityReport; onClose: () => void }) {
  const scoreColor =
    report.summary.qualityScore >= 90
      ? 'text-emerald-400'
      : report.summary.qualityScore >= 70
      ? 'text-amber-400'
      : 'text-red-400';

  const scoreBg =
    report.summary.qualityScore >= 90
      ? 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30'
      : report.summary.qualityScore >= 70
      ? 'from-amber-500/20 to-amber-500/5 border-amber-500/30'
      : 'from-red-500/20 to-red-500/5 border-red-500/30';

  const rowDelta = (b: number, a: number) => {
    const d = a - b;
    if (d === 0) return <span className="text-slate-400">0</span>;
    return d > 0
      ? <span className="text-emerald-400">+{d}</span>
      : <span className="text-rose-400">{d}</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-3xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-violet-400" />
            <h2 className="text-base font-semibold text-slate-100">数据质量报告</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {report.usedRecipe && (
            <div className="p-3 rounded-lg bg-violet-900/20 border border-violet-700/40 flex items-start gap-2.5">
              <FolderKanban className="w-4.5 h-4.5 text-violet-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs text-violet-300 font-medium">使用了清洗配方</div>
                <div className="text-sm text-slate-100 font-medium mt-0.5">{report.usedRecipe.name}</div>
                {report.usedRecipe.description && (
                  <div className="text-[11px] text-slate-400 mt-0.5">{report.usedRecipe.description}</div>
                )}
              </div>
            </div>
          )}

          <div className={`p-5 rounded-xl bg-gradient-to-br ${scoreBg} border text-center`}>
            <div className="text-xs text-slate-400 mb-1">数据质量评分</div>
            <div className={`text-5xl font-bold ${scoreColor} font-mono`}>
              {report.summary.qualityScore}
              <span className="text-2xl text-slate-500">/100</span>
            </div>
            <div className="mt-2 text-sm text-slate-300">{report.filename}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              title="清洗前"
              rows={report.initialStats.rowCount}
              cols={report.initialStats.columnCount}
              nulls={report.initialStats.totalNullCount}
              dups={report.initialStats.duplicateCount}
              icon={AlertTriangle}
              iconColor="text-orange-400"
            />
            <StatCard
              title="清洗后"
              rows={report.finalStats.rowCount}
              cols={report.finalStats.columnCount}
              nulls={report.finalStats.totalNullCount}
              dups={report.finalStats.duplicateCount}
              icon={CheckCircle}
              iconColor="text-emerald-400"
            />
          </div>

          <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700">
            <div className="text-sm font-medium text-slate-200 mb-3">关键指标变化</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <SummaryItem
                label="总行数变化"
                value={
                  <span className={report.summary.rowsRemoved >= 0 ? 'text-rose-300' : 'text-emerald-300'}>
                    {report.summary.rowsRemoved >= 0 ? '-' : '+'}{Math.abs(report.summary.rowsRemoved)} 行
                  </span>
                }
              />
              <SummaryItem label="缺失值修复" value={`${report.summary.nullsFixed} 个`} />
              <SummaryItem label="重复行删除" value={`${report.summary.duplicatesRemoved} 行`} />
              <SummaryItem
                label="列数变化"
                value={
                  <span className={report.summary.columnsChanged >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                    {report.summary.columnsChanged >= 0 ? '+' : ''}{report.summary.columnsChanged} 列
                  </span>
                }
              />
              <SummaryItem label="总操作次数" value={`${report.summary.totalOperations} 次`} />
            </div>
          </div>

          {report.stepDetails && report.stepDetails.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-200 mb-3">
                <LayoutList className="w-4 h-4 text-blue-400" />
                每步变更详情
              </div>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[11px] min-w-full">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700">
                      <th className="p-2 text-left font-medium w-10">#</th>
                      <th className="p-2 text-left font-medium">操作</th>
                      <th className="p-2 text-right font-medium">行数</th>
                      <th className="p-2 text-right font-medium">缺失</th>
                      <th className="p-2 text-right font-medium">重复</th>
                      <th className="p-2 text-left font-medium">影响列</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.stepDetails.map((s: StepChangeDetail) => (
                      <tr key={s.step} className="border-b border-slate-700/50 hover:bg-slate-800/40">
                        <td className="p-2 text-slate-500 font-mono">{s.step}</td>
                        <td className="p-2 text-slate-200 max-w-[220px]">
                          <div className="truncate" title={s.description}>{s.description}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{s.operation}</div>
                        </td>
                        <td className="p-2 text-right font-mono">
                          {typeof s.before.rowCount === 'number' && typeof s.after.rowCount === 'number' ? (
                            <span>
                              {s.before.rowCount} <ArrowRight className="inline w-3 h-3 text-slate-500 mx-0.5" /> {s.after.rowCount}
                              {' '}{rowDelta(s.before.rowCount, s.after.rowCount)}
                            </span>
                          ) : <span className="text-slate-500">-</span>}
                        </td>
                        <td className="p-2 text-right font-mono">
                          {typeof s.before.totalNullCount === 'number' && typeof s.after.totalNullCount === 'number' ? (
                            <span>
                              {s.before.totalNullCount} <ArrowRight className="inline w-3 h-3 text-slate-500 mx-0.5" /> {s.after.totalNullCount}
                              {' '}{rowDelta(s.before.totalNullCount, s.after.totalNullCount)}
                            </span>
                          ) : <span className="text-slate-500">-</span>}
                        </td>
                        <td className="p-2 text-right font-mono">
                          {typeof s.before.duplicateCount === 'number' && typeof s.after.duplicateCount === 'number' ? (
                            <span>
                              {s.before.duplicateCount} <ArrowRight className="inline w-3 h-3 text-slate-500 mx-0.5" /> {s.after.duplicateCount}
                              {' '}{rowDelta(s.before.duplicateCount, s.after.duplicateCount)}
                            </span>
                          ) : <span className="text-slate-500">-</span>}
                        </td>
                        <td className="p-2 text-left">
                          {s.affectedColumns && s.affectedColumns.length > 0 ? (
                            <div className="flex flex-wrap gap-0.5 max-w-[200px]">
                              {s.affectedColumns.slice(0, 3).map((c: string) => (
                                <span key={c} className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 text-[10px] font-mono">
                                  {c}
                                </span>
                              ))}
                              {s.affectedColumns.length > 3 && (
                                <span className="px-1.5 py-0.5 text-slate-500 text-[10px]">
                                  +{s.affectedColumns.length - 3}
                                </span>
                              )}
                            </div>
                          ) : <span className="text-slate-500">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {report.operations.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700">
              <div className="text-sm font-medium text-slate-200 mb-3">操作记录</div>
              <div className="space-y-1.5 max-h-48 overflow-auto">
                {report.operations.map((op, i) => (
                  <div key={op.id} className="flex items-center gap-2 text-xs p-2 rounded bg-slate-900/40">
                    <span className="text-slate-500 font-mono w-5 text-right shrink-0">{i + 1}.</span>
                    <span className="text-slate-300 flex-1">{op.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title, rows, cols, nulls, dups, icon: Icon, iconColor,
}: any) {
  return (
    <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <span className="text-sm font-medium text-slate-200">{title}</span>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">行数</span>
          <span className="text-slate-200 font-mono">{(rows ?? 0).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">列数</span>
          <span className="text-slate-200 font-mono">{cols ?? 0}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">缺失值</span>
          <span className="text-orange-300 font-mono">{(nulls ?? 0).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">重复行</span>
          <span className="text-red-300 font-mono">{(dups ?? 0).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1.5 px-2 rounded bg-slate-900/30">
      <span className="text-slate-400 text-xs">{label}</span>
      <span className="text-slate-200 font-mono text-xs">{value}</span>
    </div>
  );
}
