import { History, Undo2, Redo2, Check } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { undo, redo } from '@/utils/api';

export default function HistoryPanel() {
  const { sessionId, history, currentStep, setResponse, setLoading, setError } = useDataStore();

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

      <div className="relative">
        <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-700" />
        <div className="space-y-2 max-h-80 overflow-auto pr-1">
          {history.length === 0 && (
            <div className="text-xs text-slate-500 text-center py-4 pl-5">
              暂无操作记录
            </div>
          )}
          {history.map((h, idx) => {
            const done = idx < currentStep;
            return (
              <div key={h.id} className="relative pl-8">
                <div
                  className={`absolute left-2 top-1 w-3 h-3 rounded-full flex items-center justify-center ${
                    done ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                >
                  {done && <Check className="w-2 h-2 text-slate-900" />}
                </div>
                <div className={`p-2 rounded-md ${done ? 'bg-slate-800/60' : 'bg-slate-800/20'}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${done ? 'text-slate-200' : 'text-slate-400'}`}>
                      {h.description}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{formatTime(h.timestamp)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
