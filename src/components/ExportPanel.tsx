import { useState, useMemo } from 'react';
import {
  Download, FileText, X, CheckCircle, AlertTriangle, TrendingUp, Database,
  FolderKanban, LayoutList, ArrowRight, Package, Eye, LayoutGrid, ListChecks,
} from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { getCsvUrl, getExcelUrl, getReport } from '@/utils/api';
import type { QualityReport, StepChangeDetail, ColumnDiffDetail } from '@/types';

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
        {loadingReport ? '生成中...' : '预览报告并准备导出'}
      </button>

      <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
        <Eye className="w-2.5 h-2.5" />
        预览确认无误后，可在报告窗口内统一打包下载 CSV / Excel / 报告
      </div>

      {reportOpen && report && (
        <ReportModal report={report} sessionId={sessionId!} onClose={() => setReportOpen(false)} />
      )}
    </div>
  );
}

function ReportModal({ report, sessionId, onClose }: { report: QualityReport; sessionId: string; onClose: () => void }) {
  const [tab, setTab] = useState<'byStep' | 'byColumn'>('byStep');
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [expandedCols, setExpandedCols] = useState<Set<string>>(new Set());

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
      ? <span className="text-rose-400">+{d}</span>
      : <span className="text-emerald-400">{d}</span>;
  };

  const delta = (n: number | undefined) => {
    if (n === undefined || n === 0) return <span className="text-slate-500">0</span>;
    return n > 0
      ? <span className="text-amber-400">+{n}</span>
      : <span className="text-emerald-400">{n}</span>;
  };

  // 聚合：按列视角，把所有 stepDetails 的 columnDiffs 按列合并
  const byColumnAgg = useMemo(() => {
    const map = new Map<string, Array<{ step: number; operation: string; diff: ColumnDiffDetail }>>();
    (report.stepDetails || []).forEach((st) => {
      (st.columnDiffs || []).forEach((cd) => {
        if (!map.has(cd.column)) map.set(cd.column, []);
        map.get(cd.column)!.push({ step: st.step, operation: st.operation, diff: cd });
      });
    });
    return Array.from(map.entries()).map(([col, arr]) => ({
      column: col,
      totalNullsFixed: arr.reduce((s, x) => s - x.diff.nullsDiff, 0), // 负数 diff 代表减少 → 正数
      dtypeChanged: arr.some((x) => x.diff.dtypeBefore !== x.diff.dtypeAfter),
      touchSteps: arr,
    }));
  }, [report.stepDetails]);

  const toggleStep = (i: number) => {
    setExpandedSteps((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  };
  const toggleCol = (c: string) => {
    setExpandedCols((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c); else n.add(c);
      return n;
    });
  };

  const buildMarkdownReport = (r: QualityReport): string => {
    const lines: string[] = [];
    lines.push(`# 数据质量报告`);
    lines.push('');
    lines.push(`- **原始文件**：${r.filename}`);
    lines.push(`- **生成时间**：${new Date().toLocaleString('zh-CN')}`);
    lines.push(`- **质量评分**：**${r.summary.qualityScore}/100**`);
    lines.push('');
    if (r.usedRecipe) {
      lines.push(`## 使用的清洗配方`);
      lines.push(`- **${r.usedRecipe.name}**`);
      if (r.usedRecipe.description) lines.push(`  ${r.usedRecipe.description}`);
      lines.push('');
    }
    lines.push(`## 关键指标变化`);
    lines.push('');
    lines.push(`| 指标 | 清洗前 | 清洗后 | 变化 |`);
    lines.push(`|------|--------|--------|------|`);
    lines.push(`| 行数 | ${r.initialStats.rowCount} | ${r.finalStats.rowCount} | ${r.summary.rowsRemoved >= 0 ? '-' : '+'}${Math.abs(r.summary.rowsRemoved)} 行 |`);
    lines.push(`| 列数 | ${r.initialStats.columnCount} | ${r.finalStats.columnCount} | ${r.summary.columnsChanged >= 0 ? '+' : ''}${r.summary.columnsChanged} 列 |`);
    lines.push(`| 缺失值 | ${r.initialStats.totalNullCount} | ${r.finalStats.totalNullCount} | 修复 ${r.summary.nullsFixed} 个 |`);
    lines.push(`| 重复行 | ${r.initialStats.duplicateCount} | ${r.finalStats.duplicateCount} | 删除 ${r.summary.duplicatesRemoved} 行 |`);
    lines.push(`| 总操作 | - | - | ${r.summary.totalOperations} 次 |`);
    lines.push('');
    lines.push(`## 每步操作详情`);
    lines.push('');
    (r.stepDetails || []).forEach((s) => {
      lines.push(`### 步骤 ${s.step}：${s.description}`);
      lines.push(`- 操作：\`${s.operation}\``);
      lines.push(`- 行数：${s.before.rowCount ?? '-'} → ${s.after.rowCount ?? '-'}（变化 ${s.after.rowCount - s.before.rowCount}）`);
      lines.push(`- 缺失值：${s.before.totalNullCount ?? '-'} → ${s.after.totalNullCount ?? '-'}（变化 ${s.after.totalNullCount - s.before.totalNullCount}）`);
      if (s.affectedColumns && s.affectedColumns.length > 0) {
        lines.push(`- 影响列（${s.affectedColumns.length}）：${s.affectedColumns.join(', ')}`);
      }
      lines.push('');
    });
    lines.push(`## 完整操作时间线`);
    lines.push('');
    r.operations.forEach((op, i) => {
      lines.push(`${i + 1}. [${new Date(op.timestamp * 1000).toLocaleTimeString('zh-CN')}] ${op.description}`);
    });
    lines.push('');
    return lines.join('\n');
  };

  const handleDownload = (url: string, filenameHint?: string) => {
    const a = document.createElement('a');
    a.href = url;
    if (filenameHint) a.download = filenameHint;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadMarkdown = () => {
    const md = buildMarkdownReport(report);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    handleDownload(url, `quality_report_${Date.now()}.md`);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleDownloadAll = () => {
    handleDownload(getCsvUrl(sessionId), `cleaned_${Date.now()}.csv`);
    setTimeout(() => handleDownload(getExcelUrl(sessionId), `cleaned_${Date.now()}.xlsx`), 150);
    setTimeout(() => handleDownloadMarkdown(), 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-violet-400" />
            <h2 className="text-base font-semibold text-slate-100">数据质量报告 - 导出前预览</h2>
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

          {/* Tab 切换 */}
          {report.stepDetails && report.stepDetails.length > 0 && (
            <div className="rounded-lg bg-slate-800/40 border border-slate-700 overflow-hidden">
              <div className="flex items-center gap-1 p-2 border-b border-slate-700 bg-slate-800/50">
                <button
                  onClick={() => setTab('byStep')}
                  className={`px-3 py-1.5 text-[11px] rounded-md transition flex items-center gap-1.5 ${
                    tab === 'byStep'
                      ? 'bg-slate-700 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ListChecks className="w-3 h-3" /> 按步骤查看
                </button>
                <button
                  onClick={() => setTab('byColumn')}
                  className={`px-3 py-1.5 text-[11px] rounded-md transition flex items-center gap-1.5 ${
                    tab === 'byColumn'
                      ? 'bg-slate-700 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LayoutGrid className="w-3 h-3" /> 按列查看
                </button>
                <span className="ml-auto text-[10px] text-slate-500">
                  {report.stepDetails.length} 步 · {byColumnAgg.length} 列受影响
                </span>
              </div>

              <div className="p-4 max-h-96 overflow-y-auto">
                {tab === 'byStep' ? (
                  <div className="space-y-2">
                    {report.stepDetails.map((s: StepChangeDetail) => {
                      const isOpen = expandedSteps.has(s.step);
                      return (
                        <div key={s.step} className="rounded-md border border-slate-700/70 bg-slate-900/40 overflow-hidden">
                          <button
                            onClick={() => toggleStep(s.step)}
                            className="w-full text-left p-2.5 flex items-center gap-2 hover:bg-slate-800/40 transition"
                          >
                            {isOpen
                              ? <ArrowRight className="w-3 h-3 text-violet-400 shrink-0 rotate-90 transition" />
                              : <ArrowRight className="w-3 h-3 text-slate-500 shrink-0 transition" />
                            }
                            <div className="shrink-0 w-5 h-5 rounded-full bg-violet-500/20 text-violet-300 text-[10px] font-semibold flex items-center justify-center">
                              {s.step}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-slate-200 truncate">{s.description}</div>
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">{s.operation}</div>
                            </div>
                            <div className="shrink-0 flex items-center gap-2 text-[10px] ml-1">
                              {typeof s.before?.rowCount === 'number' && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-800/80">
                                  行{delta(s.after.rowCount - s.before.rowCount)}
                                </span>
                              )}
                              {typeof s.before?.totalNullCount === 'number' && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-800/80">
                                  空{delta(s.after.totalNullCount - s.before.totalNullCount)}
                                </span>
                              )}
                              {s.affectedColumns && s.affectedColumns.length > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 font-medium">
                                  {s.affectedColumns.length}列
                                </span>
                              )}
                            </div>
                          </button>
                          {isOpen && s.columnDiffs && s.columnDiffs.length > 0 && (
                            <div className="border-t border-slate-700/50 p-3 space-y-2 bg-slate-900/60">
                              {s.columnDiffs.map((cd) => (
                                <div key={cd.column} className="p-2 rounded-md bg-slate-800/50 border border-slate-700/60">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[11px] font-medium text-blue-300 font-mono">{cd.column}</span>
                                    {cd.dtypeBefore !== cd.dtypeAfter && (
                                      <span className="text-[10px] text-slate-500 font-mono">
                                        {cd.dtypeBefore} → {cd.dtypeAfter}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    缺失 {cd.nullsBefore} → {cd.nullsAfter} {cd.nullsDiff !== 0 && delta(cd.nullsDiff)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {byColumnAgg.length === 0 && (
                      <div className="text-[11px] text-slate-500 text-center py-4">无列级变更记录</div>
                    )}
                    {byColumnAgg.map((it) => {
                      const isOpen = expandedCols.has(it.column);
                      return (
                        <div key={it.column} className="rounded-md border border-slate-700/70 bg-slate-900/40 overflow-hidden">
                          <button
                            onClick={() => toggleCol(it.column)}
                            className="w-full text-left p-2.5 flex items-center gap-2 hover:bg-slate-800/40 transition"
                          >
                            {isOpen
                              ? <ArrowRight className="w-3 h-3 text-violet-400 shrink-0 rotate-90 transition" />
                              : <ArrowRight className="w-3 h-3 text-slate-500 shrink-0 transition" />
                            }
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-slate-100 font-mono truncate">{it.column}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                涉及 {it.touchSteps.length} 步
                                {it.totalNullsFixed > 0 && <span className="ml-2 text-emerald-400">缺失修复 +{it.totalNullsFixed}</span>}
                                {it.dtypeChanged && <span className="ml-2 text-amber-400">类型变更</span>}
                              </div>
                            </div>
                          </button>
                          {isOpen && (
                            <div className="border-t border-slate-700/50 p-3 space-y-1.5 bg-slate-900/60">
                              {it.touchSteps.map((x) => (
                                <div key={x.step} className="p-2 rounded-md bg-slate-800/50 border border-slate-700/60 text-[11px]">
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-300">
                                      <span className="font-mono text-violet-400 mr-2">#{x.step}</span>
                                      {x.operation}
                                    </span>
                                    {x.diff.nullsDiff !== 0 && (
                                      <span className="text-slate-400">空 {delta(x.diff.nullsDiff)}</span>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                                    <div>
                                      <div className="text-[9px] uppercase text-slate-500 mb-0.5">前</div>
                                      <div className="flex flex-wrap gap-0.5">
                                        {(x.diff.sampleBefore || []).map((v, i) => (
                                          <span key={i} className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px] font-mono max-w-[90px] truncate" title={String(v ?? '')}>
                                            {v === null || v === undefined ? '∅' : String(v)}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[9px] uppercase text-emerald-500 mb-0.5">后</div>
                                      <div className="flex flex-wrap gap-0.5">
                                        {(x.diff.sampleAfter || []).map((v, i) => (
                                          <span key={i} className="px-1 py-0.5 rounded bg-emerald-900/40 text-emerald-200 text-[9px] font-mono max-w-[90px] truncate" title={String(v ?? '')}>
                                            {v === null || v === undefined ? '∅' : String(v)}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {report.operations.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700">
              <div className="text-sm font-medium text-slate-200 mb-3">操作记录时间线</div>
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

        {/* 底部：导出工具条 */}
        <div className="px-5 py-3 border-t border-slate-700 shrink-0 bg-slate-900/80">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-emerald-400" />
                报告已生成，确认无误后导出最终文件
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleDownload(getCsvUrl(sessionId), `cleaned_${Date.now()}.csv`)}
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 transition"
              >
                <FileText className="w-3 h-3 text-emerald-400" /> CSV
              </button>
              <button
                onClick={() => handleDownload(getExcelUrl(sessionId), `cleaned_${Date.now()}.xlsx`)}
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 transition"
              >
                <Database className="w-3 h-3 text-blue-400" /> Excel
              </button>
              <button
                onClick={handleDownloadMarkdown}
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 transition"
              >
                <LayoutList className="w-3 h-3 text-violet-400" /> 报告
              </button>
              <div className="w-px h-5 bg-slate-700 mx-1" />
              <button
                onClick={handleDownloadAll}
                className="flex items-center gap-1 px-4 py-1.5 text-[11px] rounded-md bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition shadow-lg shadow-emerald-900/30"
              >
                <Package className="w-3 h-3" /> 一键打包下载全部
              </button>
            </div>
          </div>
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
