import { useState } from 'react';
import { Download, FileText, X, CheckCircle, AlertTriangle, TrendingUp, Database } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { getCsvUrl, getExcelUrl, getReport } from '@/utils/api';
import type { QualityReport } from '@/types';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
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

        <div className="p-5 overflow-y-auto space-y-5">
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
            <div className="text-sm font-medium text-slate-200 mb-3">变更摘要</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <SummaryItem label="总行数变化" value={`${report.summary.rowsRemoved >= 0 ? '-' : '+'}${Math.abs(report.summary.rowsRemoved)} 行`} />
              <SummaryItem label="缺失值修复" value={`${report.summary.nullsFixed} 个`} />
              <SummaryItem label="重复行删除" value={`${report.summary.duplicatesRemoved} 行`} />
              <SummaryItem label="列数变化" value={`${report.summary.columnsChanged >= 0 ? '+' : ''}${report.summary.columnsChanged} 列`} />
              <SummaryItem label="总操作次数" value={`${report.summary.totalOperations} 次`} />
            </div>
          </div>

          {report.operations.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700">
              <div className="text-sm font-medium text-slate-200 mb-3">操作记录</div>
              <div className="space-y-1.5 max-h-48 overflow-auto">
                {report.operations.map((op, i) => (
                  <div key={op.id} className="flex items-center gap-2 text-xs p-2 rounded bg-slate-900/40">
                    <span className="text-slate-500 font-mono w-5 text-right">{i + 1}.</span>
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
          <span className="text-slate-200 font-mono">{rows.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">列数</span>
          <span className="text-slate-200 font-mono">{cols}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">缺失值</span>
          <span className="text-orange-300 font-mono">{nulls.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">重复行</span>
          <span className="text-red-300 font-mono">{dups.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 px-2 rounded bg-slate-900/30">
      <span className="text-slate-400 text-xs">{label}</span>
      <span className="text-slate-200 font-mono text-xs">{value}</span>
    </div>
  );
}
