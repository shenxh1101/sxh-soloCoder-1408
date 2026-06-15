import { useState } from 'react';
import { Sparkles, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import DataTable from '@/components/DataTable';
import DetectionPanel from '@/components/DetectionPanel';
import CleaningPanel from '@/components/CleaningPanel';
import AdvancedPanel from '@/components/AdvancedPanel';
import HistoryPanel from '@/components/HistoryPanel';
import ExportPanel from '@/components/ExportPanel';
import { useDataStore } from '@/store/useDataStore';

export default function Home() {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftTab, setLeftTab] = useState<'clean' | 'advanced'>('clean');
  const [rightTab, setRightTab] = useState<'detect' | 'history' | 'export'>('detect');
  const { sessionId, error, loading } = useDataStore();

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100">CSV Data Cleaner</h1>
            <p className="text-[11px] text-slate-500">专业数据清洗工具 · FastAPI + Pandas + React</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-blue-400">
              <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              处理中...
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/30 text-xs text-red-300">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {sessionId && (
          <aside
            className={`flex flex-col border-r border-slate-800 bg-slate-900/50 transition-all duration-300 ${
              leftOpen ? 'w-80' : 'w-0'
            } overflow-hidden`}
          >
            <div className="flex border-b border-slate-800">
              <button
                onClick={() => setLeftTab('clean')}
                className={`flex-1 py-2.5 text-xs font-medium transition ${
                  leftTab === 'clean'
                    ? 'text-blue-400 border-b-2 border-blue-500 bg-slate-800/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                基础清洗
              </button>
              <button
                onClick={() => setLeftTab('advanced')}
                className={`flex-1 py-2.5 text-xs font-medium transition ${
                  leftTab === 'advanced'
                    ? 'text-blue-400 border-b-2 border-blue-500 bg-slate-800/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                高级操作
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {leftTab === 'clean' ? <CleaningPanel /> : <AdvancedPanel />}
            </div>
          </aside>
        )}

        {sessionId && (
          <button
            onClick={() => setLeftOpen((v) => !v)}
            className="flex items-center justify-center w-5 bg-slate-900 border-r border-slate-800 hover:bg-slate-800 transition text-slate-500 hover:text-slate-300"
            title={leftOpen ? '收起' : '展开'}
          >
            {leftOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        )}

        <main className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
          {!sessionId && (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-full max-w-xl">
                <FileUpload />
              </div>
            </div>
          )}
          {sessionId && (
            <>
              <FileUpload />
              <div className="flex-1 min-h-0">
                <DataTable />
              </div>
            </>
          )}
        </main>

        {sessionId && (
          <button
            onClick={() => setRightOpen((v) => !v)}
            className="flex items-center justify-center w-5 bg-slate-900 border-l border-slate-800 hover:bg-slate-800 transition text-slate-500 hover:text-slate-300"
            title={rightOpen ? '收起' : '展开'}
          >
            {rightOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}

        {sessionId && (
          <aside
            className={`flex flex-col border-l border-slate-800 bg-slate-900/50 transition-all duration-300 ${
              rightOpen ? 'w-80' : 'w-0'
            } overflow-hidden`}
          >
            <div className="flex border-b border-slate-800">
              {(['detect', 'history', 'export'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setRightTab(t)}
                  className={`flex-1 py-2.5 text-xs font-medium transition ${
                    rightTab === t
                      ? 'text-blue-400 border-b-2 border-blue-500 bg-slate-800/50'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t === 'detect' ? '数据检测' : t === 'history' ? '历史' : '导出'}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {rightTab === 'detect' && <DetectionPanel />}
              {rightTab === 'history' && <HistoryPanel />}
              {rightTab === 'export' && <ExportPanel />}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
