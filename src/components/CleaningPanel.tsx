import { useState } from 'react';
import {
  Eraser, Trash2, Type, Calendar, AlignLeft, ChevronDown, ChevronUp, Wand2,
} from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { fillNa, dropDuplicates, fixDtypes, normalizeDates, stripSpaces } from '@/utils/api';
import type { FillMethod, DtypeOption } from '@/types';

export default function CleaningPanel() {
  const { sessionId, columns, detection, setResponse, setLoading, setError } = useDataStore();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    fillna: true, drop: false, dtype: false, dates: false, strip: false,
  });
  const [fillCol, setFillCol] = useState('');
  const [fillMethod, setFillMethod] = useState<FillMethod>('mean');
  const [fillValue, setFillValue] = useState('');
  const [dtypeCol, setDtypeCol] = useState('');
  const [dtype, setDtype] = useState<DtypeOption>('string');
  const [dateCol, setDateCol] = useState('');
  const [dateFmt, setDateFmt] = useState('%Y-%m-%d');

  if (!sessionId) return null;

  const toggle = (k: string) => setOpenSections((s) => ({ ...s, [k]: !s[k] }));

  const run = async (fn: () => Promise<any>, desc: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fn();
      setResponse(res);
    } catch (e: any) {
      setError(e.message || `${desc}失败`);
    } finally {
      setLoading(false);
    }
  };

  const handleFillNa = () => {
    if (!fillCol) return;
    run(
      () => fillNa(sessionId!, { column: fillCol, method: fillMethod, value: fillMethod === 'custom' ? fillValue : undefined }),
      '填充缺失值'
    );
  };

  const handleDropDup = () => {
    run(() => dropDuplicates(sessionId!, {}), '删除重复行');
  };

  const handleFixDtype = () => {
    if (!dtypeCol) return;
    run(() => fixDtypes(sessionId!, { column: dtypeCol, dtype }), '修正数据类型');
  };

  const handleNormalizeDates = () => {
    if (!dateCol) return;
    run(() => normalizeDates(sessionId!, { column: dateCol, format: dateFmt }), '标准化日期');
  };

  const handleStrip = () => {
    run(() => stripSpaces(sessionId!, {}), '去除空格');
  };

  const handleAutoClean = () => {
    run(async () => {
      let r = await dropDuplicates(sessionId!, {});
      setResponse(r);
      r = await stripSpaces(sessionId!, {});
      return r;
    }, '一键清洗');
  };

  const Section = ({
    id, title, icon: Icon, children,
  }: { id: string; title: string; icon: any; children: React.ReactNode }) => (
    <div className="rounded-lg border border-slate-700 bg-slate-800/30 overflow-hidden">
      <button
        onClick={() => toggle(id)}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 transition"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-slate-200">{title}</span>
        </div>
        {openSections[id] ? (
          <ChevronUp className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        )}
      </button>
      {openSections[id] && <div className="p-3 pt-0 space-y-2">{children}</div>}
    </div>
  );

  return (
    <div className="space-y-3">
      <button
        onClick={handleAutoClean}
        className="w-full flex items-center justify-center gap-2 p-3 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-medium text-sm transition shadow-lg shadow-blue-900/30"
      >
        <Wand2 className="w-4 h-4" />
        一键智能清洗
      </button>

      <Section id="fillna" title="填充缺失值" icon={Eraser}>
        <select
          value={fillCol}
          onChange={(e) => setFillCol(e.target.value)}
          className="w-full p-2 text-xs bg-slate-900 border border-slate-600 rounded-md text-slate-200 focus:border-blue-500 outline-none"
        >
          <option value="">选择列...</option>
          {detection?.columns.filter((c) => c.nullCount > 0).map((c) => (
            <option key={c.name} value={c.name}>{c.name} ({c.nullCount}个缺失)</option>
          ))}
        </select>
        <div className="grid grid-cols-4 gap-1">
          {(['mean', 'median', 'mode', 'custom'] as FillMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => setFillMethod(m)}
              className={`text-xs py-1.5 rounded-md transition ${
                fillMethod === m
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {m === 'mean' ? '均值' : m === 'median' ? '中位数' : m === 'mode' ? '众数' : '自定义'}
            </button>
          ))}
        </div>
        {fillMethod === 'custom' && (
          <input
            value={fillValue}
            onChange={(e) => setFillValue(e.target.value)}
            placeholder="输入填充值"
            className="w-full p-2 text-xs bg-slate-900 border border-slate-600 rounded-md text-slate-200 focus:border-blue-500 outline-none"
          />
        )}
        <button
          onClick={handleFillNa}
          disabled={!fillCol}
          className="w-full py-2 text-xs rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition"
        >
          应用填充
        </button>
      </Section>

      <Section id="drop" title="删除重复行" icon={Trash2}>
        <p className="text-xs text-slate-400">检测到 {detection?.duplicateCount ?? 0} 行重复数据</p>
        <button
          onClick={handleDropDup}
          disabled={!detection?.duplicateCount}
          className="w-full py-2 text-xs rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition"
        >
          删除所有重复行
        </button>
      </Section>

      <Section id="dtype" title="修正数据类型" icon={Type}>
        <select
          value={dtypeCol}
          onChange={(e) => setDtypeCol(e.target.value)}
          className="w-full p-2 text-xs bg-slate-900 border border-slate-600 rounded-md text-slate-200 focus:border-blue-500 outline-none"
        >
          <option value="">选择列...</option>
          {columns.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="grid grid-cols-5 gap-1">
          {(['int', 'float', 'string', 'datetime', 'bool'] as DtypeOption[]).map((d) => (
            <button
              key={d}
              onClick={() => setDtype(d)}
              className={`text-xs py-1.5 rounded-md transition ${
                dtype === d
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <button
          onClick={handleFixDtype}
          disabled={!dtypeCol}
          className="w-full py-2 text-xs rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition"
        >
          转换类型
        </button>
      </Section>

      <Section id="dates" title="标准化日期格式" icon={Calendar}>
        <select
          value={dateCol}
          onChange={(e) => setDateCol(e.target.value)}
          className="w-full p-2 text-xs bg-slate-900 border border-slate-600 rounded-md text-slate-200 focus:border-blue-500 outline-none"
        >
          <option value="">选择日期列...</option>
          {columns.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          value={dateFmt}
          onChange={(e) => setDateFmt(e.target.value)}
          placeholder="格式: %Y-%m-%d"
          className="w-full p-2 text-xs bg-slate-900 border border-slate-600 rounded-md text-slate-200 focus:border-blue-500 outline-none font-mono"
        />
        <button
          onClick={handleNormalizeDates}
          disabled={!dateCol}
          className="w-full py-2 text-xs rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition"
        >
          标准化日期
        </button>
      </Section>

      <Section id="strip" title="去除前后空格" icon={AlignLeft}>
        <p className="text-xs text-slate-400">对所有文本列去除前后空格</p>
        <button
          onClick={handleStrip}
          className="w-full py-2 text-xs rounded-md bg-blue-600 hover:bg-blue-500 text-white transition"
        >
          执行去空格
        </button>
      </Section>
    </div>
  );
}
