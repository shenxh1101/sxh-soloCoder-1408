import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Eraser, Trash2, Type, Calendar, AlignLeft, ChevronDown, ChevronUp, Wand2,
  Plus, Settings, FlaskConical, Save, FolderKanban, Eye, Check, X, AlertTriangle,
  Lightbulb, Trash, LayoutGrid, ClipboardCheck, Download, Upload, ListChecks,
  ArrowRight, Play, RotateCcw, GripVertical,
} from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import {
  fillNa, dropDuplicates, fixDtypes, normalizeDates, stripSpaces,
  smartClean, boolPreview, fixBool,
  listRecipes, createRecipe, deleteRecipe, applyRecipe,
  getRecipeSummary, importRecipe, getRecipeExportUrl,
  getSnapshot,
} from '@/utils/api';
import type {
  FillMethod, DtypeOption, SmartCleanConfig, BoolMapping, BoolPreviewResult,
  CleaningRecipe, ColumnInfo, RecipeSummary, ColumnCleanRule,
} from '@/types';

const DEFAULT_BOOL_MAP: BoolMapping = {
  trueValues: ['true', 'yes', '1', 't', 'y', '是', '对'],
  falseValues: ['false', 'no', '0', 'f', 'n', '否', '错'],
  caseSensitive: false,
};

const DEFAULT_SMART_CONFIG: SmartCleanConfig = {
  dropDuplicates: true,
  stripSpaces: true,
  fillNa: {
    enabled: true,
    numericMethod: 'mean',
    textMethod: 'mode',
    customValue: '',
  },
  normalizeDates: false,
  dateFormat: '%Y-%m-%d',
  autoFixDtypes: false,
  columnRules: [],
};

type NumericMethod = 'mean' | 'median';
type TextMethod = 'mode' | 'custom';

const METHOD_LABEL: Record<string, string> = {
  mean: '均值',
  median: '中位数',
  mode: '众数',
  custom: '自定义',
};

function getColumnType(col: ColumnInfo | undefined): 'numeric' | 'text' | 'date' | 'unknown' {
  if (!col) return 'unknown';
  const dt = col.dtype?.toLowerCase() || '';
  if (dt.includes('int') || dt.includes('float') || dt.includes('number') || dt.includes('numeric')) return 'numeric';
  if (dt.includes('date') || dt.includes('time') || dt.includes('datetime')) return 'date';
  if (dt.includes('str') || dt.includes('object') || dt.includes('text')) return 'text';
  const vals = col.sampleValues?.filter((v) => v !== null && v !== undefined && v !== '') || [];
  if (!vals.length) return 'unknown';
  let numeric = 0;
  vals.forEach((v) => { if (!isNaN(Number(v))) numeric += 1; });
  if (numeric / vals.length >= 0.7) return 'numeric';
  return 'text';
}

export default function CleaningPanel() {
  const {
    sessionId, columns, detection, recipeList, setResponse, setLoading, setError,
    setRecipeList,
  } = useDataStore();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    smart: true, batch: false, fillna: false, drop: false, dtype: false, dates: false, strip: false, recipe: false,
  });
  const [fillCol, setFillCol] = useState('');
  const [fillMethod, setFillMethod] = useState<FillMethod>('mean');
  const [fillValue, setFillValue] = useState('');
  const [dtypeCol, setDtypeCol] = useState('');
  const [dtype, setDtype] = useState<DtypeOption>('string');
  const [dateCol, setDateCol] = useState('');
  const [dateFmt, setDateFmt] = useState('%Y-%m-%d');

  const [smartCfg, setSmartCfg] = useState<SmartCleanConfig>({ ...DEFAULT_SMART_CONFIG });
  const [boolPreviewResult, setBoolPreviewResult] = useState<BoolPreviewResult | null>(null);
  const [boolMap, setBoolMap] = useState<BoolMapping>({ ...DEFAULT_BOOL_MAP });
  const [boolLoading, setBoolLoading] = useState(false);

  const [newRecipeName, setNewRecipeName] = useState('');
  const [newRecipeDesc, setNewRecipeDesc] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [recipeApplying, setRecipeApplying] = useState(false);
  const [recipeImporting, setRecipeImporting] = useState(false);
  const [showRecipePreview, setShowRecipePreview] = useState(false);
  const [previewRecipeSummary, setPreviewRecipeSummary] = useState<RecipeSummary | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const [columnRules, setColumnRules] = useState<ColumnCleanRule[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);

  const [smartSteps, setSmartSteps] = useState<any[]>([]);
  const [smartStartStep, setSmartStartStep] = useState(0);
  const [expandedStepIdx, setExpandedStepIdx] = useState<number | null>(null);
  const [stepDetailCache, setStepDetailCache] = useState<Record<number, any>>({});
  const [stepDetailLoading, setStepDetailLoading] = useState(false);

  const { viewingSnapshot, snapshotStepIndex, viewSnapshot, exitSnapshotView, currentStep } = useDataStore();

  useEffect(() => {
    if (sessionId && (!recipeList || recipeList.length === 0)) {
      listRecipes().then(setRecipeList).catch(() => {});
    }
  }, [sessionId, recipeList, setRecipeList]);

  if (!sessionId) return null;

  const toggle = (k: string) => setOpenSections((s) => ({ ...s, [k]: !s[k] }));

  const colInfoMap = useMemo(() => {
    const m: Record<string, ColumnInfo> = {};
    detection?.columns?.forEach((c) => { m[c.name] = c; });
    return m;
  }, [detection]);

  const selectedFillColInfo = colInfoMap[fillCol];
  const fillColType = getColumnType(selectedFillColInfo);

  const fillMethodDisabled = useMemo<Record<FillMethod, { disabled: boolean; reason: string }>>(() => {
    const result: any = {
      mean: { disabled: false, reason: '' },
      median: { disabled: false, reason: '' },
      mode: { disabled: false, reason: '' },
      custom: { disabled: false, reason: '' },
    };
    if (fillColType === 'numeric') {
      result.mode.disabled = true;
      result.mode.reason = '数值列无法使用众数，请选择均值、中位数或自定义';
    } else if (fillColType === 'text' || fillColType === 'date') {
      result.mean.disabled = true;
      result.mean.reason = '非数值列无法使用均值，请选择众数或自定义';
      result.median.disabled = true;
      result.median.reason = '非数值列无法使用中位数，请选择众数或自定义';
    }
    return result;
  }, [fillColType]);

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
    if (!fillCol || fillMethodDisabled[fillMethod].disabled) return;
    run(
      () => fillNa(sessionId!, {
        column: fillCol,
        method: fillMethod,
        value: fillMethod === 'custom' ? fillValue : undefined,
      }),
      '填充缺失值'
    );
  };

  const handleDropDup = () => run(() => dropDuplicates(sessionId!, {}), '删除重复行');

  const handleFixDtype = () => {
    if (!dtypeCol) return;
    if (dtype === 'bool') {
      run(() => fixBool(sessionId!, { column: dtypeCol, dtype, mapping: boolMap }), '布尔语义转换');
    } else {
      run(() => fixDtypes(sessionId!, { column: dtypeCol, dtype }), '修正数据类型');
    }
  };

  const handleNormalizeDates = () => {
    if (!dateCol) return;
    run(() => normalizeDates(sessionId!, { column: dateCol, format: dateFmt }), '标准化日期');
  };

  const handleStrip = () => run(() => stripSpaces(sessionId!, {}), '去除空格');

  const handleSmartClean = async () => {
    setLoading(true);
    setError('');
    const startStep = currentStep;
    try {
      const res = await smartClean(sessionId!, smartCfg);
      setResponse(res);
      if (res.smartCleanSteps) {
        setSmartSteps(res.smartCleanSteps);
        setSmartStartStep(startStep);
      }
      exitSnapshotView();
    } catch (e: any) {
      setError(e.message || '一键智能清洗失败');
    } finally {
      setLoading(false);
    }
  };

  const runBoolPreview = async () => {
    if (!dtypeCol) return;
    setBoolLoading(true);
    setError('');
    try {
      const r = await boolPreview(sessionId!, { column: dtypeCol, mapping: boolMap, limit: 20 });
      setBoolPreviewResult(r);
    } catch (e: any) {
      setError(e.message || '预览失败');
    } finally {
      setBoolLoading(false);
    }
  };

  const handleSaveRecipe = async () => {
    if (!newRecipeName.trim()) { setError('请输入配方名称'); return; }
    setRecipeSaving(true);
    setError('');
    try {
      const cfg: SmartCleanConfig = JSON.parse(JSON.stringify(smartCfg));
      cfg.columnRules = columnRules;
      const r = await createRecipe({ name: newRecipeName.trim(), description: newRecipeDesc.trim(), config: cfg });
      const list = await listRecipes();
      setRecipeList(list);
      setNewRecipeName('');
      setNewRecipeDesc('');
    } catch (e: any) {
      setError(e.message || '保存配方失败');
    } finally {
      setRecipeSaving(false);
    }
  };

  const handleDeleteRecipe = async (id: string) => {
    try {
      await deleteRecipe(id);
      const list = await listRecipes();
      setRecipeList(list);
      if (selectedRecipeId === id) setSelectedRecipeId('');
    } catch (e: any) {
      setError(e.message || '删除失败');
    }
  };

  const handleApplyRecipe = async () => {
    if (!selectedRecipeId) return;
    setRecipeApplying(true);
    setError('');
    try {
      const r = await applyRecipe(sessionId!, selectedRecipeId);
      setResponse(r);
    } catch (e: any) {
      setError(e.message || '套用配方失败');
    } finally {
      setRecipeApplying(false);
    }
  };

  const handlePreviewRecipe = async (recipeId: string) => {
    if (!recipeId) return;
    try {
      const s = await getRecipeSummary(recipeId);
      setPreviewRecipeSummary(s);
      setShowRecipePreview(true);
    } catch (e: any) {
      setError(e.message || '获取配方预览失败');
    }
  };

  const handleExportRecipe = (recipeId: string) => {
    const url = getRecipeExportUrl(recipeId);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recipe_${recipeId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleImportRecipe = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRecipeImporting(true);
    setError('');
    try {
      const r = await importRecipe(file);
      const list = await listRecipes();
      setRecipeList(list);
      setSelectedRecipeId(r.id);
    } catch (err: any) {
      setError(err.message || '导入配方失败');
    } finally {
      setRecipeImporting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const handleViewStepSnapshot = async (stepIndex: number) => {
    if (!sessionId) return;
    try {
      const snap = await getSnapshot(sessionId, stepIndex);
      viewSnapshot(stepIndex, snap.data, snap.columns, snap.detection);
    } catch (e: any) {
      setError(e.message || '获取快照失败');
    }
  };

  const updateSmartCfg = <K extends keyof SmartCleanConfig>(k: K, v: SmartCleanConfig[K]) => {
    setSmartCfg((s) => ({ ...s, [k]: v }));
  };

  const updateFillNa = <K extends keyof NonNullable<SmartCleanConfig['fillNa']>>(
    k: K,
    v: NonNullable<SmartCleanConfig['fillNa']>[K],
  ) => {
    setSmartCfg((s) => ({
      ...s,
      fillNa: s.fillNa ? { ...s.fillNa, [k]: v } : undefined,
    }));
  };

  const addColumnRule = () => {
    const firstCol = detection?.columns[0]?.name || '';
    setColumnRules((prev) => [
      ...prev,
      { type: 'fillna', column: firstCol, method: 'mean' } as ColumnCleanRule,
    ]);
  };

  const removeColumnRule = (idx: number) => {
    setColumnRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateColumnRule = (idx: number, key: string, value: any) => {
    setColumnRules((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r))
    );
  };

  const handleBatchRun = async () => {
    if (columnRules.length === 0) return;
    setBatchRunning(true);
    setError('');
    try {
      const cfg: SmartCleanConfig = {
        dropDuplicates: false,
        stripSpaces: false,
        fillNa: undefined,
        normalizeDates: false,
        dateFormat: '%Y-%m-%d',
        autoFixDtypes: false,
        columnRules: columnRules,
      };
      const res = await smartClean(sessionId!, cfg);
      setResponse(res);
      exitSnapshotView();
    } catch (e: any) {
      setError(e.message || '批量执行失败');
    } finally {
      setBatchRunning(false);
    }
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

  const smartConfigSummary = [
    smartCfg.dropDuplicates && '去重',
    smartCfg.stripSpaces && '去空格',
    smartCfg.fillNa?.enabled && '智能填充',
    smartCfg.normalizeDates && '日期标准化',
    smartCfg.autoFixDtypes && '自动修类型',
  ].filter(Boolean).join(' · ') || '未启用任何步骤';

  const statusTag = (status: string) => {
    const cfg: Record<string, { label: string; cls: string }> = {
      true: { label: '真', cls: 'bg-green-900/40 text-green-300 border-green-700' },
      false: { label: '假', cls: 'bg-rose-900/40 text-rose-300 border-rose-700' },
      unmapped: { label: '未映射', cls: 'bg-amber-900/40 text-amber-300 border-amber-700' },
      null: { label: '空值', cls: 'bg-slate-700/40 text-slate-400 border-slate-600' },
    };
    const c = cfg[status] || cfg.unmapped;
    return (
      <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border ${c.cls}`}>
        {c.label}
      </span>
    );
  };

  return (
    <div className="space-y-3">
      <Section id="recipe" title="清洗配方" icon={FolderKanban}>
        <div>
          <label className="block text-[11px] text-slate-400 mb-1">选择配方套用</label>
          <div className="flex gap-1.5">
            <select
              value={selectedRecipeId}
              onChange={(e) => setSelectedRecipeId(e.target.value)}
              className="flex-1 min-w-0 p-2 text-xs bg-slate-900 border border-slate-600 rounded-md text-slate-200 focus:border-blue-500 outline-none"
            >
              <option value="">选择配方...</option>
              {(recipeList || []).map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <button
              onClick={() => selectedRecipeId && handlePreviewRecipe(selectedRecipeId)}
              disabled={!selectedRecipeId}
              className="shrink-0 px-2 text-xs rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition"
              title="预览配方步骤"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={() => selectedRecipeId && handleExportRecipe(selectedRecipeId)}
              disabled={!selectedRecipeId}
              className="shrink-0 px-2 text-xs rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition"
              title="导出配方"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleApplyRecipe}
              disabled={!selectedRecipeId || recipeApplying}
              className="shrink-0 px-2.5 text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition"
              title="套用配方"
            >
              <ClipboardCheck className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-1.5 mt-1.5">
            <button
              onClick={() => importFileRef.current?.click()}
              disabled={recipeImporting}
              className="flex-1 py-1.5 text-[11px] rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition flex items-center justify-center gap-1 border border-slate-600"
            >
              <Upload className="w-3 h-3" /> 导入配方
            </button>
          </div>
          <input
            ref={importFileRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportRecipe}
            className="hidden"
          />
          {selectedRecipeId && (() => {
            const r = (recipeList || []).find((x) => x.id === selectedRecipeId);
            if (!r) return null;
            return (
              <div className="mt-2 p-2 rounded-md bg-slate-900/60 border border-slate-700">
                <div className="text-xs font-medium text-slate-200">{r.name}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{r.description || '无描述'}</div>
                <div className="mt-1.5 text-[10px] text-slate-500 space-x-2">
                  {r.config.dropDuplicates && <span>去重</span>}
                  {r.config.stripSpaces && <span>去空格</span>}
                  {r.config.fillNa?.enabled && <span>智能填充</span>}
                  {r.config.normalizeDates && <span>日期({r.config.dateFormat})</span>}
                  {r.config.autoFixDtypes && <span>修类型</span>}
                  {r.config.columnRules?.length > 0 && <span>列级规则×{r.config.columnRules.length}</span>}
                </div>
                {(r.id !== 'default' && r.id !== 'hr_basic') && (
                  <button
                    onClick={() => handleDeleteRecipe(r.id)}
                    className="mt-2 text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <Trash className="w-3 h-3" /> 删除此配方
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        <div className="border-t border-slate-700 my-2" />

        <div>
          <label className="block text-[11px] text-slate-400 mb-1">保存当前配置为配方</label>
          <input
            value={newRecipeName}
            onChange={(e) => setNewRecipeName(e.target.value)}
            placeholder="配方名称"
            className="w-full p-2 text-xs bg-slate-900 border border-slate-600 rounded-md text-slate-200 focus:border-blue-500 outline-none mb-1.5"
          />
          <input
            value={newRecipeDesc}
            onChange={(e) => setNewRecipeDesc(e.target.value)}
            placeholder="描述（可选）"
            className="w-full p-2 text-xs bg-slate-900 border border-slate-600 rounded-md text-slate-200 focus:border-blue-500 outline-none mb-1.5"
          />
          <div className="text-[10px] text-slate-500 mb-1.5 flex items-center gap-1">
            <Lightbulb className="w-3 h-3" />
            将保存当前「一键智能清洗」中的所有配置
          </div>
          <button
            onClick={handleSaveRecipe}
            disabled={recipeSaving || !newRecipeName.trim()}
            className="w-full py-2 text-xs rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition flex items-center justify-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" /> 保存配方
          </button>
        </div>
      </Section>

      <Section id="smart" title="一键智能清洗" icon={Wand2}>
        <div className="text-[11px] text-slate-400 mb-2 flex items-center gap-1">
          <Settings className="w-3 h-3" /> 当前配置：{smartConfigSummary}
        </div>

        <label className="flex items-center gap-2 py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={smartCfg.stripSpaces}
            onChange={(e) => updateSmartCfg('stripSpaces', e.target.checked)}
            className="accent-blue-500"
          />
          <span className="text-xs text-slate-200">去除所有文本列前后空格</span>
        </label>

        <label className="flex items-center gap-2 py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={smartCfg.dropDuplicates}
            onChange={(e) => updateSmartCfg('dropDuplicates', e.target.checked)}
            className="accent-blue-500"
          />
          <span className="text-xs text-slate-200">删除重复行</span>
        </label>

        <label className="flex items-center gap-2 py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={!!smartCfg.fillNa?.enabled}
            onChange={(e) => {
              if (e.target.checked) {
                setSmartCfg((s) => ({ ...s, fillNa: s.fillNa || { enabled: true, numericMethod: 'mean', textMethod: 'mode', customValue: '' } }));
              } else {
                setSmartCfg((s) => ({ ...s, fillNa: undefined }));
              }
            }}
            className="accent-blue-500"
          />
          <span className="text-xs text-slate-200">智能填充缺失值</span>
        </label>
        {smartCfg.fillNa?.enabled && (
          <div className="ml-6 p-2 rounded-md bg-slate-900/60 border border-slate-700 space-y-2">
            <div>
              <div className="text-[10px] text-slate-400 mb-1">数值列策略</div>
              <div className="grid grid-cols-2 gap-1">
                {(['mean', 'median'] as NumericMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => updateFillNa('numericMethod', m)}
                    className={`text-[11px] py-1 rounded transition ${
                      smartCfg.fillNa?.numericMethod === m
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-1">文本列策略</div>
              <div className="grid grid-cols-2 gap-1">
                {(['mode', 'custom'] as TextMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => updateFillNa('textMethod', m)}
                    className={`text-[11px] py-1 rounded transition ${
                      smartCfg.fillNa?.textMethod === m
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>
            {smartCfg.fillNa?.textMethod === 'custom' && (
              <input
                value={smartCfg.fillNa?.customValue ?? ''}
                onChange={(e) => updateFillNa('customValue', e.target.value)}
                placeholder="自定义填充值"
                className="w-full p-1.5 text-[11px] bg-slate-900 border border-slate-600 rounded text-slate-200 focus:border-blue-500 outline-none"
              />
            )}
          </div>
        )}

        <label className="flex items-center gap-2 py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={smartCfg.normalizeDates}
            onChange={(e) => updateSmartCfg('normalizeDates', e.target.checked)}
            className="accent-blue-500"
          />
          <span className="text-xs text-slate-200">统一日期格式</span>
        </label>
        {smartCfg.normalizeDates && (
          <input
            value={smartCfg.dateFormat}
            onChange={(e) => updateSmartCfg('dateFormat', e.target.value)}
            placeholder="%Y-%m-%d"
            className="ml-6 w-[calc(100%-1.5rem)] p-1.5 text-[11px] font-mono bg-slate-900 border border-slate-600 rounded text-slate-200 focus:border-blue-500 outline-none"
          />
        )}

        <label className="flex items-center gap-2 py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={smartCfg.autoFixDtypes}
            onChange={(e) => updateSmartCfg('autoFixDtypes', e.target.checked)}
            className="accent-blue-500"
          />
          <span className="text-xs text-slate-200">自动修正数据类型</span>
        </label>

        <button
          onClick={handleSmartClean}
          className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-medium text-sm transition shadow-lg shadow-blue-900/30 mt-2"
        >
          <FlaskConical className="w-4 h-4" />
          开始执行配置流程
        </button>

        {smartSteps.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <ListChecks className="w-3 h-3" />
                清洗流程（{smartSteps.length} 步）
              </div>
              {viewingSnapshot && (
                <button
                  onClick={exitSnapshotView}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> 返回最终结果
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {smartSteps.map((step, i) => {
                const snapIdx = smartStartStep + i + 1;
                const isActive = viewingSnapshot && snapshotStepIndex === snapIdx;
                return (
                  <button
                    key={step.id || i}
                    onClick={() => handleViewStepSnapshot(snapIdx)}
                    className={`w-full text-left flex items-center gap-2 p-2 rounded-md text-xs transition ${
                      isActive
                        ? 'bg-blue-500/20 border border-blue-500/40 text-blue-200'
                        : 'bg-slate-800/60 border border-slate-700 text-slate-300 hover:bg-slate-700/60'
                    }`}
                  >
                    <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium ${
                      isActive ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{step.description}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{step.operation}</div>
                    </div>
                    <Eye className="w-3 h-3 text-slate-500" />
                  </button>
                );
              })}
            </div>
            <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1">
              <Lightbulb className="w-3 h-3 text-amber-400" />
              点击步骤可查看该步执行后的数据快照
            </div>
          </div>
        )}
      </Section>

      <Section id="batch" title="批量列操作" icon={LayoutGrid}>
        <p className="text-[11px] text-slate-400 mb-2">
          为多列分别设置清洗规则，统一提交执行。每列独立一条规则，历史记录中可按列追溯。
        </p>
        {columnRules.length === 0 && (
          <div className="text-[11px] text-slate-500 text-center py-3 border border-dashed border-slate-600 rounded-md">
            暂无规则，点击下方按钮添加
          </div>
        )}
        {columnRules.length > 0 && (
          <div className="space-y-2 mb-2 max-h-64 overflow-y-auto pr-1">
            {columnRules.map((rule, idx) => (
              <div key={idx} className="p-2 rounded-md bg-slate-900/60 border border-slate-700 space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center text-[10px] font-medium">
                    {idx + 1}
                  </span>
                  <select
                    value={rule.column}
                    onChange={(e) => updateColumnRule(idx, 'column', e.target.value)}
                    className="flex-1 min-w-0 p-1.5 text-[11px] bg-slate-800 border border-slate-600 rounded text-slate-200 focus:border-blue-500 outline-none"
                  >
                    {detection?.columns.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeColumnRule(idx)}
                    className="shrink-0 p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition"
                    title="删除此规则"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-500 shrink-0 w-8">操作</span>
                  <select
                    value={rule.type}
                    onChange={(e) => {
                      const t = e.target.value as any;
                      let newRule: any = { type: t, column: rule.column };
                      if (t === 'fillna') newRule.method = 'mean';
                      if (t === 'normalize_dates') newRule.format = '%Y-%m-%d';
                      if (t === 'fix_dtype') newRule.dtype = 'string';
                      if (t === 'bool_semantic') newRule.mapping = { ...DEFAULT_BOOL_MAP };
                      setColumnRules((prev) => prev.map((r, i) => (i === idx ? newRule : r)));
                    }}
                    className="flex-1 min-w-0 p-1.5 text-[11px] bg-slate-800 border border-slate-600 rounded text-slate-200 focus:border-blue-500 outline-none"
                  >
                    <option value="fillna">填充缺失值</option>
                    <option value="normalize_dates">标准化日期</option>
                    <option value="fix_dtype">类型转换</option>
                    <option value="bool_semantic">语义化布尔</option>
                  </select>
                </div>
                {rule.type === 'fillna' && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 shrink-0 w-8">方式</span>
                    <select
                      value={(rule as any).method}
                      onChange={(e) => updateColumnRule(idx, 'method', e.target.value)}
                      className="flex-1 p-1.5 text-[11px] bg-slate-800 border border-slate-600 rounded text-slate-200 focus:border-blue-500 outline-none"
                    >
                      <option value="mean">均值</option>
                      <option value="median">中位数</option>
                      <option value="mode">众数</option>
                      <option value="custom">自定义值</option>
                    </select>
                    {(rule as any).method === 'custom' && (
                      <input
                        value={(rule as any).value || ''}
                        onChange={(e) => updateColumnRule(idx, 'value', e.target.value)}
                        placeholder="值"
                        className="flex-1 p-1.5 text-[11px] bg-slate-800 border border-slate-600 rounded text-slate-200 focus:border-blue-500 outline-none"
                      />
                    )}
                  </div>
                )}
                {rule.type === 'normalize_dates' && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 shrink-0 w-8">格式</span>
                    <input
                      value={(rule as any).format || '%Y-%m-%d'}
                      onChange={(e) => updateColumnRule(idx, 'format', e.target.value)}
                      className="flex-1 p-1.5 text-[11px] font-mono bg-slate-800 border border-slate-600 rounded text-slate-200 focus:border-blue-500 outline-none"
                    />
                  </div>
                )}
                {rule.type === 'fix_dtype' && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 shrink-0 w-8">目标类型</span>
                    <select
                      value={(rule as any).dtype}
                      onChange={(e) => updateColumnRule(idx, 'dtype', e.target.value)}
                      className="flex-1 p-1.5 text-[11px] bg-slate-800 border border-slate-600 rounded text-slate-200 focus:border-blue-500 outline-none"
                    >
                      <option value="int">整数 int</option>
                      <option value="float">浮点数 float</option>
                      <option value="string">文本 string</option>
                      <option value="datetime">日期 datetime</option>
                      <option value="bool">布尔 bool</option>
                    </select>
                  </div>
                )}
                {rule.type === 'bool_semantic' && (
                  <div className="text-[10px] text-slate-500">
                    按默认语义映射（true/yes/1/是/对 → True）
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <button
            onClick={addColumnRule}
            className="flex-1 py-1.5 text-[11px] rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 transition flex items-center justify-center gap-1"
          >
            <Plus className="w-3 h-3" /> 添加规则
          </button>
          <button
            onClick={handleBatchRun}
            disabled={columnRules.length === 0 || batchRunning}
            className="flex-1 py-1.5 text-[11px] rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition flex items-center justify-center gap-1"
          >
            <Play className="w-3 h-3" /> 批量执行
          </button>
        </div>
      </Section>

      <Section id="fillna" title="填充缺失值" icon={Eraser}>
        <select
          value={fillCol}
          onChange={(e) => {
            setFillCol(e.target.value);
            const col = colInfoMap[e.target.value];
            const t = getColumnType(col);
            if (t === 'numeric') setFillMethod('mean');
            else if (t === 'text' || t === 'date') setFillMethod('mode');
          }}
          className="w-full p-2 text-xs bg-slate-900 border border-slate-600 rounded-md text-slate-200 focus:border-blue-500 outline-none"
        >
          <option value="">选择列...</option>
          {detection?.columns.filter((c) => c.nullCount > 0).map((c) => (
            <option key={c.name} value={c.name}>{c.name} ({c.nullCount}个缺失 / {c.dtype})</option>
          ))}
        </select>
        {fillCol && (
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <Lightbulb className="w-3 h-3 text-amber-400" />
            检测为 {fillColType === 'numeric' ? '数值列' : fillColType === 'text' ? '文本列' : fillColType === 'date' ? '日期列' : '未知类型'}
          </div>
        )}
        <div className="grid grid-cols-4 gap-1">
          {(['mean', 'median', 'mode', 'custom'] as FillMethod[]).map((m) => {
            const info = fillMethodDisabled[m];
            const disabled = info.disabled || !fillCol;
            return (
              <button
                key={m}
                onClick={() => !info.disabled && setFillMethod(m)}
                disabled={disabled}
                title={info.reason}
                className={`relative text-xs py-1.5 rounded-md transition ${
                  fillMethod === m
                    ? 'bg-blue-600 text-white'
                    : disabled
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {METHOD_LABEL[m]}
                {info.disabled && (
                  <AlertTriangle className="absolute -top-1 -right-1 w-3 h-3 text-amber-400" />
                )}
              </button>
            );
          })}
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
          disabled={!fillCol || (fillCol && fillMethodDisabled[fillMethod].disabled)}
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
          onChange={(e) => {
            setDtypeCol(e.target.value);
            setBoolPreviewResult(null);
          }}
          className="w-full p-2 text-xs bg-slate-900 border border-slate-600 rounded-md text-slate-200 focus:border-blue-500 outline-none"
        >
          <option value="">选择列...</option>
          {columns.map((c) => (
            <option key={c} value={c}>{c}{colInfoMap[c] ? ` (${colInfoMap[c].dtype})` : ''}</option>
          ))}
        </select>
        <div className="grid grid-cols-5 gap-1">
          {(['int', 'float', 'string', 'datetime', 'bool'] as DtypeOption[]).map((d) => (
            <button
              key={d}
              onClick={() => {
                setDtype(d);
                if (d !== 'bool') setBoolPreviewResult(null);
              }}
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

        {dtype === 'bool' && (
          <div className="mt-2 p-2 rounded-md bg-slate-900/60 border border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <FlaskConical className="w-3 h-3 text-purple-400" />
                布尔语义映射
              </div>
              <button
                onClick={runBoolPreview}
                disabled={!dtypeCol || boolLoading}
                className="shrink-0 px-2 py-0.5 text-[11px] rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition flex items-center gap-1"
              >
                <Eye className="w-3 h-3" /> 预览
              </button>
            </div>
            <div>
              <div className="text-[10px] text-green-400 mb-1">真值（逗号分隔）</div>
              <input
                value={boolMap.trueValues.join(', ')}
                onChange={(e) => setBoolMap((m) => ({
                  ...m,
                  trueValues: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                }))}
                className="w-full p-1.5 text-[11px] bg-slate-900 border border-slate-600 rounded text-slate-200 focus:border-green-500 outline-none"
              />
            </div>
            <div>
              <div className="text-[10px] text-rose-400 mb-1">假值（逗号分隔）</div>
              <input
                value={boolMap.falseValues.join(', ')}
                onChange={(e) => setBoolMap((m) => ({
                  ...m,
                  falseValues: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                }))}
                className="w-full p-1.5 text-[11px] bg-slate-900 border border-slate-600 rounded text-slate-200 focus:border-rose-500 outline-none"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={boolMap.caseSensitive}
                onChange={(e) => setBoolMap((m) => ({ ...m, caseSensitive: e.target.checked }))}
                className="accent-purple-500"
              />
              <span className="text-[11px] text-slate-300">区分大小写</span>
            </label>
            {boolPreviewResult && (
              <div className="border-t border-slate-700 pt-2 space-y-1.5">
                <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
                  <div className="p-1 rounded bg-green-900/30 border border-green-800">
                    <div className="text-green-300 font-medium">{boolPreviewResult.trueCount}</div>
                    <div className="text-green-500">真</div>
                  </div>
                  <div className="p-1 rounded bg-rose-900/30 border border-rose-800">
                    <div className="text-rose-300 font-medium">{boolPreviewResult.falseCount}</div>
                    <div className="text-rose-500">假</div>
                  </div>
                  <div className="p-1 rounded bg-amber-900/30 border border-amber-800">
                    <div className="text-amber-300 font-medium">{boolPreviewResult.unmappedCount}</div>
                    <div className="text-amber-500">未映射</div>
                  </div>
                  <div className="p-1 rounded bg-slate-700/30 border border-slate-600">
                    <div className="text-slate-300 font-medium">{boolPreviewResult.nullCount}</div>
                    <div className="text-slate-500">空值</div>
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto border border-slate-700 rounded">
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-800/70 sticky top-0">
                      <tr>
                        <th className="p-1.5 text-left text-slate-400 font-medium w-1/2">原值</th>
                        <th className="p-1.5 text-left text-slate-400 font-medium w-1/3">转换后</th>
                        <th className="p-1.5 text-left text-slate-400 font-medium">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boolPreviewResult.samples.map((row, i) => (
                        <tr key={i} className="border-t border-slate-700/50">
                          <td className="p-1.5 text-slate-300 font-mono">
                            {row.original === null || row.original === undefined || row.original === '' ? (
                              <span className="text-slate-500 italic">(空)</span>
                            ) : String(row.original)}
                          </td>
                          <td className="p-1.5">
                            {row.converted === null || row.converted === undefined ? (
                              <span className="text-slate-500 italic">(空)</span>
                            ) : (
                              <span className={row.converted ? 'text-green-400' : 'text-rose-400'}>
                                {String(row.converted)}
                              </span>
                            )}
                          </td>
                          <td className="p-1.5">{statusTag(row.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {boolPreviewResult.unmappedCount > 0 && (
                  <div className="text-[10px] text-amber-400 flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    有 {boolPreviewResult.unmappedCount} 个值无法匹配，转换后将变为空值。建议在「真值/假值」中补充对应写法。
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleFixDtype}
          disabled={!dtypeCol}
          className="w-full py-2 text-xs rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition"
        >
          {dtype === 'bool' ? '应用语义化布尔转换' : '转换类型'}
        </button>
        {dtype === 'bool' && (
          <button
            onClick={() => {
              if (!dtypeCol) return;
              const newRule: ColumnCleanRule = {
                type: 'fix_dtype',
                column: dtypeCol,
                dtype: 'bool',
                mapping: { ...boolMap },
              };
              setColumnRules((prev) => [...prev, newRule]);
              setError(`已添加列 [${dtypeCol}] 的语义化布尔规则到批量操作`);
            }}
            disabled={!dtypeCol}
            className="w-full mt-1.5 py-1.5 text-[11px] rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 transition flex items-center justify-center gap-1"
          >
            <Plus className="w-3 h-3" /> 添加到批量列规则（可保存进配方）
          </button>
        )}
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

      {showRecipePreview && previewRecipeSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={() => setShowRecipePreview(false)}>
          <div className="w-full max-w-md mx-4 rounded-lg bg-slate-900 border border-slate-700 shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-slate-100">配方预览</span>
              </div>
              <button
                onClick={() => setShowRecipePreview(false)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <div className="text-base font-semibold text-slate-100">{previewRecipeSummary.name}</div>
              <div className="text-xs text-slate-400 mt-1">{previewRecipeSummary.description || '无描述'}</div>
              <div className="mt-3 text-[11px] text-slate-500 flex items-center gap-1">
                <ListChecks className="w-3 h-3" />
                共 {previewRecipeSummary.stepCount} 个步骤
              </div>
              <div className="mt-3 space-y-1.5">
                {previewRecipeSummary.steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-slate-800/50 border border-slate-700/60">
                    <div className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-medium">
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-200">{s.label}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{s.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-700">
              <button
                onClick={() => setShowRecipePreview(false)}
                className="px-3 py-1.5 text-xs rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 transition"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  setSelectedRecipeId(previewRecipeSummary.id);
                  setShowRecipePreview(false);
                  handleApplyRecipe();
                }}
                disabled={recipeApplying}
                className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition flex items-center gap-1.5"
              >
                <Play className="w-3 h-3" /> 套用此配方
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
