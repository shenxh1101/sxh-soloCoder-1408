import { useState } from 'react';
import { Filter, Regex, Columns, Table, X } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { replaceValues, regexExtract, splitColumn, mergeColumns, pivotTable } from '@/utils/api';
import type { ConditionOp, AggFunc } from '@/types';

type Tab = 'replace' | 'regex' | 'column' | 'pivot';

export default function AdvancedPanel() {
  const { sessionId, columns, setResponse, setLoading, setError } = useDataStore();
  const [tab, setTab] = useState<Tab>('replace');

  if (!sessionId) return null;

  const run = async (fn: () => Promise<any>) => {
    setLoading(true);
    setError('');
    try {
      const res = await fn();
      setResponse(res);
    } catch (e: any) {
      setError(e.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'replace', label: '替换', icon: Filter },
    { id: 'regex', label: '正则提取', icon: Regex },
    { id: 'column', label: '列操作', icon: Columns },
    { id: 'pivot', label: '透视表', icon: Table },
  ];

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/30 overflow-hidden">
      <div className="flex border-b border-slate-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition ${
              tab === t.id
                ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-3">
        {tab === 'replace' && <ReplaceTab run={run} />}
        {tab === 'regex' && <RegexTab run={run} />}
        {tab === 'column' && <ColumnTab run={run} />}
        {tab === 'pivot' && <PivotTab run={run} />}
      </div>
    </div>
  );
}

function Select({ value, onChange, placeholder, options }: any) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full p-2 text-xs bg-slate-900 border border-slate-600 rounded-md text-slate-200 focus:border-blue-500 outline-none"
    >
      <option value="">{placeholder}</option>
      {options.map((o: string) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function Input({ value, onChange, placeholder, type = 'text' }: any) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full p-2 text-xs bg-slate-900 border border-slate-600 rounded-md text-slate-200 focus:border-blue-500 outline-none"
    />
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-slate-400 mb-1">{children}</div>;
}

function Btn({ onClick, disabled, children }: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-2 text-xs rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition"
    >
      {children}
    </button>
  );
}

function ReplaceTab({ run }: { run: (fn: () => Promise<any>) => void }) {
  const { sessionId, columns } = useDataStore();
  const [col, setCol] = useState('');
  const [useCond, setUseCond] = useState(false);
  const [op, setOp] = useState<ConditionOp>('==');
  const [condVal, setCondVal] = useState('');
  const [oldVal, setOldVal] = useState('');
  const [newVal, setNewVal] = useState('');
  const [isRegex, setIsRegex] = useState(false);

  const ops: ConditionOp[] = ['==', '!=', '>', '<', '>=', '<=', 'contains', 'not_contains'];

  return (
    <div className="space-y-2.5">
      <div>
        <Label>目标列</Label>
        <Select value={col} onChange={setCol} placeholder="选择列..." options={columns} />
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
        <input
          type="checkbox"
          checked={useCond}
          onChange={(e) => setUseCond(e.target.checked)}
          className="rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
        />
        使用条件筛选
      </label>
      {useCond && (
        <div className="grid grid-cols-2 gap-2 p-2 bg-slate-900/40 rounded-md">
          <div>
            <Label>操作符</Label>
            <select
              value={op}
              onChange={(e) => setOp(e.target.value as ConditionOp)}
              className="w-full p-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-slate-200 outline-none"
            >
              {ops.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>条件值</Label>
            <Input value={condVal} onChange={setCondVal} placeholder="值" />
          </div>
        </div>
      )}
      {!isRegex && (
        <div>
          <Label>查找值（留空则不匹配原值）</Label>
          <Input value={oldVal} onChange={setOldVal} placeholder="原值" />
        </div>
      )}
      <div>
        <Label>替换为</Label>
        <Input value={newVal} onChange={setNewVal} placeholder="新值" />
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
        <input
          type="checkbox"
          checked={isRegex}
          onChange={(e) => setIsRegex(e.target.checked)}
          className="rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
        />
        使用正则表达式替换
      </label>
      <Btn
        disabled={!col}
        onClick={() =>
          run(() =>
            replaceValues(sessionId!, {
              column: col,
              condition: useCond ? { op, value: condVal } : undefined,
              oldValue: oldVal || undefined,
              newValue: newVal,
              regex: isRegex,
            })
          )
        }
      >
        执行替换
      </Btn>
    </div>
  );
}

function RegexTab({ run }: { run: (fn: () => Promise<any>) => void }) {
  const { sessionId, columns } = useDataStore();
  const [col, setCol] = useState('');
  const [pattern, setPattern] = useState('');
  const [newCol, setNewCol] = useState('');

  return (
    <div className="space-y-2.5">
      <div>
        <Label>源列</Label>
        <Select value={col} onChange={setCol} placeholder="选择列..." options={columns} />
      </div>
      <div>
        <Label>正则表达式（使用捕获组）</Label>
        <Input value={pattern} onChange={setPattern} placeholder="例: (\\d+)" />
      </div>
      <div>
        <Label>新列名</Label>
        <Input value={newCol} onChange={setNewCol} placeholder="新列名称" />
      </div>
      <Btn
        disabled={!col || !pattern || !newCol}
        onClick={() =>
          run(() => regexExtract(sessionId!, { column: col, pattern, newColumn: newCol }))
        }
      >
        提取到新列
      </Btn>
    </div>
  );
}

function ColumnTab({ run }: { run: (fn: () => Promise<any>) => void }) {
  const { sessionId, columns } = useDataStore();
  const [mode, setMode] = useState<'split' | 'merge'>('split');
  const [splitCol, setSplitCol] = useState('');
  const [sep, setSep] = useState(',');
  const [newCols, setNewCols] = useState('');
  const [mergeCols, setMergeCols] = useState<string[]>([]);
  const [mergeSep, setMergeSep] = useState('_');
  const [mergeName, setMergeName] = useState('');

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode('split')}
          className={`text-xs py-2 rounded-md transition ${
            mode === 'split' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          拆分列
        </button>
        <button
          onClick={() => setMode('merge')}
          className={`text-xs py-2 rounded-md transition ${
            mode === 'merge' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          合并列
        </button>
      </div>

      {mode === 'split' && (
        <>
          <div>
            <Label>待拆分列</Label>
            <Select value={splitCol} onChange={setSplitCol} placeholder="选择列..." options={columns} />
          </div>
          <div>
            <Label>分隔符</Label>
            <Input value={sep} onChange={setSep} placeholder="分隔符，如 ," />
          </div>
          <div>
            <Label>新列名（逗号分隔）</Label>
            <Input value={newCols} onChange={setNewCols} placeholder="例: col1,col2,col3" />
          </div>
          <Btn
            disabled={!splitCol || !newCols}
            onClick={() =>
              run(() =>
                splitColumn(sessionId!, {
                  column: splitCol,
                  separator: sep,
                  newColumns: newCols.split(',').map((s) => s.trim()),
                })
              )
            }
          >
            执行拆分
          </Btn>
        </>
      )}

      {mode === 'merge' && (
        <>
          <div>
            <Label>选择要合并的列（点击选择）</Label>
            <div className="flex flex-wrap gap-1.5 p-2 bg-slate-900/40 rounded-md min-h-[36px]">
              {columns.map((c) => {
                const selected = mergeCols.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() =>
                      setMergeCols((prev) =>
                        selected ? prev.filter((x) => x !== c) : [...prev, c]
                      )
                    }
                    className={`text-[11px] px-2 py-1 rounded border transition ${
                      selected
                        ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                        : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {selected && <X className="w-2.5 h-2.5 inline mr-0.5" />}
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>连接符</Label>
            <Input value={mergeSep} onChange={setMergeSep} placeholder="_" />
          </div>
          <div>
            <Label>新列名</Label>
            <Input value={mergeName} onChange={setMergeName} placeholder="新列名称" />
          </div>
          <Btn
            disabled={mergeCols.length < 2 || !mergeName}
            onClick={() =>
              run(() =>
                mergeColumns(sessionId!, {
                  columns: mergeCols,
                  separator: mergeSep,
                  newColumn: mergeName,
                })
              )
            }
          >
            执行合并
          </Btn>
        </>
      )}
    </div>
  );
}

function PivotTab({ run }: { run: (fn: () => Promise<any>) => void }) {
  const { sessionId, columns } = useDataStore();
  const [index, setIndex] = useState('');
  const [col, setCol] = useState('');
  const [val, setVal] = useState('');
  const [agg, setAgg] = useState<AggFunc>('mean');
  const aggFuncs: AggFunc[] = ['sum', 'mean', 'count', 'min', 'max'];

  return (
    <div className="space-y-2.5">
      <div>
        <Label>行索引 (index)</Label>
        <Select value={index} onChange={setIndex} placeholder="选择列..." options={columns} />
      </div>
      <div>
        <Label>列 (columns)</Label>
        <Select value={col} onChange={setCol} placeholder="选择列..." options={columns} />
      </div>
      <div>
        <Label>值 (values)</Label>
        <Select value={val} onChange={setVal} placeholder="选择列..." options={columns} />
      </div>
      <div>
        <Label>聚合函数</Label>
        <div className="grid grid-cols-5 gap-1">
          {aggFuncs.map((a) => (
            <button
              key={a}
              onClick={() => setAgg(a)}
              className={`text-xs py-1.5 rounded-md transition ${
                agg === a ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
      <Btn
        disabled={!index || !col || !val}
        onClick={() =>
          run(() =>
            pivotTable(sessionId!, { index, columns: col, values: val, aggFunc: agg })
          )
        }
      >
        生成透视表
      </Btn>
    </div>
  );
}
