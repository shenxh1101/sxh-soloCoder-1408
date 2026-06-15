import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Eraser, Trash2, Type, Calendar, AlignLeft, ChevronDown, ChevronUp, Wand2,
  Plus, Settings, FlaskConical, Save, FolderKanban, Eye, Check, X, AlertTriangle,
  Lightbulb, Trash, LayoutGrid, ClipboardCheck, Download, Upload, ListChecks,
  ArrowRight, Play, RotateCcw, GripVertical, FileDiff, Search, ZoomIn,
} from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import {
  fillNa, dropDuplicates, fixDtypes, normalizeDates, stripSpaces,
  smartClean, boolPreview, fixBool,
  listRecipes, createRecipe, deleteRecipe, applyRecipe,
  getRecipeSummary, importRecipe, getRecipeExportUrl,
  getSnapshot, getStepDiff,
} from '@/utils/api';
import type {
  FillMethod, DtypeOption, SmartCleanConfig, BoolMapping, BoolPreviewResult,
  CleaningRecipe, ColumnInfo, RecipeSummary, ColumnCleanRule, StepChangeDetail,
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

  const [showStepModal, setShowStepModal] = useState(false);
  const [stepModalIdx, setStepModalIdx] = useState<number | null>(null);
  const [stepModalData, setStepModalData] = useState<StepChangeDetail | null>(null);
  const [stepModalLoading, setStepModalLoading] = useState(false);

  // 草稿（批量列操作）
  const [columnDrafts, setColumnDrafts] = useState<Array<{ name: string; rules: ColumnCleanRule[]; savedAt: number }>>(() => {
    try {
      const s = localStorage.getItem('csv_column_drafts');
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });
  const [draftName, setDraftName] = useState('');
  const [showDraftSaveModal, setShowDraftSaveModal] = useState(false);
  const [showDraftLoadModal, setShowDraftLoadModal] = useState(false);

  // 配方对比 & 选择性套用
  const [showRecipeCompareModal, setShowRecipeCompareModal] = useState(false);
  const [compareTarget, setCompareTarget] = useState<RecipeSummary | null>(null);
  const [compareSelectedKeys, setCompareSelectedKeys] = useState<Set<string>>(new Set());
  const [compareMode, setCompareMode] = useState<'override' | 'merge' | 'select'>('select');

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
      setCompareTarget(s);
      // 默认 select 模式下，选中所有步骤
      const allKeys = new Set(s.steps.map((st) => st.key));
      setCompareSelectedKeys(allKeys);
      setCompareMode('select');
      setShowRecipeCompareModal(true);
    } catch (e: any) {
      setError(e.message || '获取配方预览失败');
    }
  };

  // 计算差异（和当前 smartCfg / columnRules 对比）
  const computeDiffList = useMemo(() => {
    if (!compareTarget?.config) return [];
    const rc = compareTarget.config;
    const diffs: Array<{ key: string; label: string; current: string; recipe: string; status: 'same' | 'diff' | 'new' }> = [];
    const push = (k: string, label: string, cur: string, rec: string) => {
      const same = cur === rec;
      diffs.push({ key: k, label, current: cur || '(未设置)', recipe: rec, status: same ? 'same' : 'diff' });
    };
    push('stripSpaces', '去除文本空格', String(smartCfg.stripSpaces), String(rc.stripSpaces));
    push('dropDuplicates', '删除重复行', String(smartCfg.dropDuplicates), String(rc.dropDuplicates));
    push('fillNa.enabled', '智能填充缺失', String(!!smartCfg.fillNa?.enabled), String(!!rc.fillNa?.enabled));
    if (rc.fillNa?.enabled || smartCfg.fillNa?.enabled) {
      push('fillNa.numericMethod', '  数值列方案', smartCfg.fillNa?.numericMethod || '-', rc.fillNa?.numericMethod || '-');
      push('fillNa.textMethod', '  文本列方案', smartCfg.fillNa?.textMethod || '-', rc.fillNa?.textMethod || '-');
    }
    push('normalizeDates', '统一日期格式', String(smartCfg.normalizeDates), String(rc.normalizeDates));
    if (rc.normalizeDates || smartCfg.normalizeDates) {
      push('dateFormat', '  日期格式', smartCfg.dateFormat, rc.dateFormat);
    }
    push('autoFixDtypes', '自动修正类型', String(smartCfg.autoFixDtypes), String(rc.autoFixDtypes));
    push('columnRules', '列级自定义规则', `${smartCfg.columnRules.length} 条`, `${rc.columnRules?.length ?? 0} 条`);
    return diffs;
  }, [compareTarget, smartCfg]);

  // 把选中的步骤同步到 smartCfg 和 columnRules（预览，不直接套用到数据）
  const syncSelectedToConfig = () => {
    if (!compareTarget?.config) return;
    const rc = compareTarget.config;
    let nextCfg: SmartCleanConfig = JSON.parse(JSON.stringify(smartCfg));
    let nextCRules: ColumnCleanRule[] = JSON.parse(JSON.stringify(compareMode === 'override' ? [] : columnRules));

    const keys = compareSelectedKeys;
    const hasSel = (k: string) => compareMode !== 'select' || keys.has(k);
    if (compareMode === 'override') {
      // 覆盖模式：从配方默认值开始，只对未选中的步骤回退
      nextCfg = {
        ...JSON.parse(JSON.stringify(DEFAULT_SMART_CONFIG)),
        columnRules: [],
      };
      if (!keys.has('strip_spaces')) nextCfg.stripSpaces = smartCfg.stripSpaces;
      if (!keys.has('drop_duplicates')) nextCfg.dropDuplicates = smartCfg.dropDuplicates;
      if (!keys.has('fill_na')) {
        nextCfg.fillNa = smartCfg.fillNa ? { ...smartCfg.fillNa } : undefined;
      } else {
        nextCfg.fillNa = rc.fillNa ? { ...rc.fillNa } : undefined;
      }
      if (!keys.has('normalize_dates')) {
        nextCfg.normalizeDates = smartCfg.normalizeDates;
        nextCfg.dateFormat = smartCfg.dateFormat;
      } else {
        nextCfg.normalizeDates = rc.normalizeDates;
        nextCfg.dateFormat = rc.dateFormat;
      }
      if (!keys.has('auto_fix_dtypes')) nextCfg.autoFixDtypes = smartCfg.autoFixDtypes;
      // column rules：先收集配方里勾选的 ruleIndex，再把当前未勾选的追加
      const keepRecipeIdx: number[] = [];
      compareTarget.steps.forEach((st) => {
        if (st.category === 'column' && st.ruleIndex != null && keys.has(st.key)) {
          keepRecipeIdx.push(st.ruleIndex);
        }
      });
      const recipeCols = keepRecipeIdx
        .map((i) => rc.columnRules?.[i])
        .filter(Boolean) as ColumnCleanRule[];
      const curKeepIdx: number[] = [];
      compareTarget.steps.forEach((st) => {
        if (st.category === 'column' && st.ruleIndex != null && !keys.has(st.key) && st.ruleIndex < smartCfg.columnRules.length) {
          curKeepIdx.push(st.ruleIndex);
        }
      });
      const curCols = smartCfg.columnRules.filter((_, i) => !compareTarget!.steps.some(
        (s) => s.category === 'column' && s.ruleIndex === i
      ) || curKeepIdx.includes(i));
      nextCRules = [...recipeCols, ...curCols];
    } else {
      // 叠加 / 勾选模式：在当前基础上合并
      if (hasSel('strip_spaces')) nextCfg.stripSpaces = nextCfg.stripSpaces || rc.stripSpaces;
      if (hasSel('drop_duplicates')) nextCfg.dropDuplicates = nextCfg.dropDuplicates || rc.dropDuplicates;
      if (hasSel('fill_na') && rc.fillNa?.enabled) {
        nextCfg.fillNa = { ...rc.fillNa };
      }
      if (hasSel('normalize_dates') && rc.normalizeDates) {
        nextCfg.normalizeDates = true;
        nextCfg.dateFormat = rc.dateFormat;
      }
      if (hasSel('auto_fix_dtypes')) nextCfg.autoFixDtypes = nextCfg.autoFixDtypes || rc.autoFixDtypes;
      // 列级规则
      compareTarget.steps.forEach((st) => {
        if (st.category === 'column' && st.ruleIndex != null && hasSel(st.key)) {
          const r = rc.columnRules?.[st.ruleIndex];
          if (r) {
            // 同列同类型覆盖，否则追加
            const existIdx = nextCRules.findIndex(
              (x) => (x as any).column === (r as any).column && x.type === r.type
            );
            if (existIdx >= 0) nextCRules[existIdx] = JSON.parse(JSON.stringify(r));
            else nextCRules.push(JSON.parse(JSON.stringify(r)));
          }
        }
      });
    }
    nextCfg.columnRules = nextCRules;
    setSmartCfg(nextCfg);
    setColumnRules(nextCRules);
    setError('');
  };

  // 模式变化时，重算默认勾选（select 模式默认全选；merge 默认全选；override 默认全选）
  useEffect(() => {
    if (!compareTarget) return;
    const allKeys = new Set(compareTarget.steps.map((st) => st.key));
    setCompareSelectedKeys(allKeys);
    // 每次打开或切模式时先同步一次「如果现在点套用」的状态，方便编辑
    syncSelectedToConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareTarget, compareMode]);

  // select 模式下，勾选变化时实时同步到配置区
  useEffect(() => {
    if (!compareTarget || compareMode !== 'select') return;
    syncSelectedToConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareSelectedKeys]);

  const toggleSelectStep = (key: string) => {
    setCompareSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const applyRecipeFromCompare = async () => {
    if (!selectedRecipeId) return;
    // 同步最终配置再 apply
    syncSelectedToConfig();
    try {
      setRecipeApplying(true);
      setError('');
      const r = await applyRecipe(sessionId, selectedRecipeId);
      setResponse(r);
      setShowRecipeCompareModal(false);
      setCompareTarget(null);
    } catch (e: any) {
      setError(e.message || '套用配方失败');
    } finally {
      setRecipeApplying(false);
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
    const cached = stepDetailCache[stepIndex];
    if (cached) {
      setStepModalData(cached);
      setStepModalIdx(stepIndex);
      setShowStepModal(true);
      return;
    }
    setStepModalLoading(true);
    try {
      const [diff] = await Promise.all([
        getStepDiff(sessionId, stepIndex),
      ]);
      const wrapped: StepChangeDetail = {
        step: stepIndex,
        operation: smartSteps[stepIndex - smartStartStep - 1]?.operation || '',
        description: smartSteps[stepIndex - smartStartStep - 1]?.description || '',
        before: diff.rows?.before != null ? {
          rowCount: diff.rows?.before ?? 0,
          columnCount: diff.columns?.before ?? 0,
          totalNullCount: diff.nulls?.before ?? 0,
          duplicateCount: diff.duplicates?.before ?? 0,
        } : {},
        after: diff.rows?.after != null ? {
          rowCount: diff.rows?.after ?? 0,
          columnCount: diff.columns?.after ?? 0,
          totalNullCount: diff.nulls?.after ?? 0,
          duplicateCount: diff.duplicates?.after ?? 0,
        } : {},
        diff: {
          rows: diff.rows?.diff ?? 0,
          columns: diff.columns?.diff ?? 0,
          nulls: diff.nulls?.diff ?? 0,
          duplicates: diff.duplicates?.diff ?? 0,
        },
        affectedColumns: diff.affectedColumns || [],
        columnDiffs: diff.columnDiffs || [],
      };
      setStepDetailCache((c) => ({ ...c, [stepIndex]: wrapped }));
      setStepModalData(wrapped);
      setStepModalIdx(stepIndex);
      setShowStepModal(true);
    } catch (e: any) {
      setError(e.message || '获取步骤详情失败');
    } finally {
      setStepModalLoading(false);
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

  const saveDraft = () => {
    if (columnRules.length === 0) { setError('暂无规则可保存'); return; }
    if (!draftName.trim()) { setError('请输入草稿名称'); return; }
    const newDrafts = [
      { name: draftName.trim(), rules: JSON.parse(JSON.stringify(columnRules)), savedAt: Date.now() },
      ...columnDrafts,
    ].slice(0, 20);
    setColumnDrafts(newDrafts);
    localStorage.setItem('csv_column_drafts', JSON.stringify(newDrafts));
    setDraftName('');
    setShowDraftSaveModal(false);
    setError('');
  };

  const loadDraft = (idx: number) => {
    const d = columnDrafts[idx];
    if (!d) return;
    setColumnRules(JSON.parse(JSON.stringify(d.rules)));
    setShowDraftLoadModal(false);
  };

  const deleteDraft = (idx: number) => {
    const newDrafts = columnDrafts.filter((_, i) => i !== idx);
    setColumnDrafts(newDrafts);
    localStorage.setItem('csv_column_drafts', JSON.stringify(newDrafts));
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
                清洗流程审阅（{smartSteps.length} 步）
              </div>
            </div>
            <div className="space-y-2">
              {smartSteps.map((step, i) => {
                const snapIdx = smartStartStep + i + 1;
                const cached = stepDetailCache[snapIdx];
                const rows = cached?.diff?.rows;
                const nulls = cached?.diff?.nulls;
                const dups = cached?.diff?.duplicates;
                const affectedCount = cached?.affectedColumns?.length ?? 0;
                const fmtDelta = (n: number | undefined) => {
                  if (n === undefined || n === 0) return <span className="text-slate-500">0</span>;
                  if (n > 0) return <span className="text-amber-400">+{n}</span>;
                  return <span className="text-emerald-400">{n}</span>;
                };
                return (
                  <div
                    key={step.id || i}
                    className="rounded-md border border-slate-700 bg-slate-800/60 overflow-hidden"
                  >
                    <button
                      onClick={() => handleViewStepSnapshot(snapIdx)}
                      className="w-full text-left p-2 flex items-start gap-2 hover:bg-slate-700/40 transition"
                    >
                      <div className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-white flex items-center justify-center text-[11px] font-semibold">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-100 truncate">{step.description}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 font-mono">{step.operation}</div>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <span className="text-slate-500">行数</span>
                            {cached ? fmtDelta(rows) : <span className="text-slate-600">—</span>}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="text-slate-500">缺失</span>
                            {cached ? fmtDelta(nulls) : <span className="text-slate-600">—</span>}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="text-slate-500">重复</span>
                            {cached ? fmtDelta(dups) : <span className="text-slate-600">—</span>}
                          </span>
                          {cached && affectedCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">
                              {affectedCount} 列受影响
                            </span>
                          )}
                        </div>
                      </div>
                      <ZoomIn className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1">
              <Lightbulb className="w-3 h-3 text-amber-400" />
              点击步骤卡弹出详情窗口：影响列、前后样本值、规则说明
            </div>
          </div>
        )}
      </Section>

      {/* 步骤详情弹层 */}
      {showStepModal && stepModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-white flex items-center justify-center text-sm font-semibold">
                  #{(stepModalIdx ?? 0) - smartStartStep}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">{stepModalData.description}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{stepModalData.operation}</div>
                </div>
              </div>
              <button onClick={() => setShowStepModal(false)} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* 指标变化面板 */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: '行数', before: stepModalData.before?.rowCount, after: stepModalData.after?.rowCount, diff: stepModalData.diff?.rows },
                  { label: '列数', before: stepModalData.before?.columnCount, after: stepModalData.after?.columnCount, diff: stepModalData.diff?.columns },
                  { label: '缺失值', before: stepModalData.before?.totalNullCount, after: stepModalData.after?.totalNullCount, diff: stepModalData.diff?.nulls },
                  { label: '重复行', before: stepModalData.before?.duplicateCount, after: stepModalData.after?.duplicateCount, diff: stepModalData.diff?.duplicates },
                ].map((it) => (
                  <div key={it.label} className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">{it.label}</div>
                    <div className="mt-1 flex items-baseline gap-1 text-[11px] font-mono">
                      <span className="text-slate-400">{it.before ?? '-'}</span>
                      <ArrowRight className="w-3 h-3 text-slate-600" />
                      <span className="text-slate-100 font-semibold">{it.after ?? '-'}</span>
                    </div>
                    <div className={`text-[11px] mt-0.5 font-semibold ${
                      (it.diff ?? 0) > 0 ? 'text-amber-400' : (it.diff ?? 0) < 0 ? 'text-emerald-400' : 'text-slate-500'
                    }`}>
                      {(it.diff ?? 0) > 0 ? '+' : ''}{it.diff ?? 0}
                    </div>
                  </div>
                ))}
              </div>

              {/* 影响列 + 前后样本 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <LayoutGrid className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs font-medium text-slate-200">影响列详情</span>
                  <span className="text-[10px] text-slate-500">（共 {stepModalData.affectedColumns.length} 列）</span>
                </div>
                {stepModalData.columnDiffs && stepModalData.columnDiffs.length > 0 ? (
                  <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                    {stepModalData.columnDiffs.map((cd) => (
                      <div key={cd.column} className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-blue-300 font-mono">{cd.column}</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {cd.dtypeBefore && cd.dtypeBefore !== cd.dtypeAfter ? (
                              <>{cd.dtypeBefore} <ArrowRight className="inline w-2.5 h-2.5" /> {cd.dtypeAfter}</>
                            ) : cd.dtypeBefore || '-'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] mb-2">
                          <span className="text-slate-400">
                            缺失: <span className="text-slate-200 font-mono">{cd.nullsBefore}</span>
                            <ArrowRight className="inline w-2.5 h-2.5 mx-0.5 text-slate-600" />
                            <span className="text-slate-200 font-mono">{cd.nullsAfter}</span>
                            <span className={`ml-1 font-semibold ${
                              cd.nullsDiff > 0 ? 'text-amber-400' : cd.nullsDiff < 0 ? 'text-emerald-400' : 'text-slate-500'
                            }`}>
                              {cd.nullsDiff > 0 ? '+' : ''}{cd.nullsDiff}
                            </span>
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">改前样本</div>
                            <div className="flex flex-wrap gap-1">
                              {(cd.sampleBefore || []).map((v, i) => (
                                <span key={i} className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-900/80 text-slate-300 rounded border border-slate-700 max-w-[120px] truncate" title={String(v ?? '')}>
                                  {v === null || v === undefined ? '∅' : String(v)}
                                </span>
                              ))}
                              {(!cd.sampleBefore || cd.sampleBefore.length === 0) && (
                                <span className="text-[10px] text-slate-600">-</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">改后样本</div>
                            <div className="flex flex-wrap gap-1">
                              {(cd.sampleAfter || []).map((v, i) => (
                                <span key={i} className="px-1.5 py-0.5 text-[10px] font-mono bg-emerald-900/30 text-emerald-200 rounded border border-emerald-800/50 max-w-[120px] truncate" title={String(v ?? '')}>
                                  {v === null || v === undefined ? '∅' : String(v)}
                                </span>
                              ))}
                              {(!cd.sampleAfter || cd.sampleAfter.length === 0) && (
                                <span className="text-[10px] text-slate-600">-</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 text-center py-3 border border-dashed border-slate-700 rounded-md">
                    本步骤无列级变更（可能是整体去重或空格清洗等行级操作）
                  </div>
                )}
              </div>

              {/* 规则说明 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Settings className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-medium text-slate-200">使用的规则</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700 text-[11px] text-slate-300 font-mono">
                  <div>op: <span className="text-blue-300">{stepModalData.operation}</span></div>
                  <div className="mt-0.5">desc: <span className="text-emerald-300">{stepModalData.description}</span></div>
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-700 shrink-0 flex justify-end">
              <button
                onClick={() => setShowStepModal(false)}
                className="px-4 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-500 text-white transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div className="flex gap-1.5 mt-1.5">
          <button
            onClick={() => setShowDraftSaveModal(true)}
            disabled={columnRules.length === 0}
            className="flex-1 py-1 text-[10px] rounded-md bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition flex items-center justify-center gap-1"
          >
            <Save className="w-2.5 h-2.5" /> 存为草稿
          </button>
          <button
            onClick={() => setShowDraftLoadModal(true)}
            disabled={columnDrafts.length === 0}
            className="flex-1 py-1 text-[10px] rounded-md bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition flex items-center justify-center gap-1"
          >
            <FolderKanban className="w-2.5 h-2.5" /> 回填草稿 ({columnDrafts.length})
          </button>
        </div>
      </Section>

      {/* 草稿保存 Modal */}
      {showDraftSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Save className="w-4 h-4 text-emerald-400" /> 保存为草稿
              </div>
              <button onClick={() => setShowDraftSaveModal(false)} className="p-1 rounded hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">草稿名称</label>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="比如：HR 入职表列清洗方案"
                className="w-full p-2 text-xs bg-slate-800 border border-slate-600 rounded-md text-slate-200 focus:border-emerald-500 outline-none"
                autoFocus
              />
            </div>
            <div className="text-[11px] text-slate-500 bg-slate-800/40 p-2 rounded-md">
              共 <span className="text-slate-200 font-mono">{columnRules.length}</span> 条规则，保存在本地浏览器中
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowDraftSaveModal(false)}
                className="px-3 py-1.5 text-[11px] rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 transition"
              >取消</button>
              <button
                onClick={saveDraft}
                className="px-3 py-1.5 text-[11px] rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition"
              >保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 草稿回填 Modal */}
      {showDraftLoadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md max-h-[70vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
              <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-blue-400" /> 选择草稿回填
              </div>
              <button onClick={() => setShowDraftLoadModal(false)} className="p-1 rounded hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {columnDrafts.length === 0 && (
                <div className="text-[11px] text-slate-500 text-center py-6">暂无草稿</div>
              )}
              {columnDrafts.map((d, i) => (
                <div key={i} className="p-3 rounded-lg bg-slate-800/60 border border-slate-700 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-200 truncate">{d.name}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {d.rules.length} 条规则 · {new Date(d.savedAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => loadDraft(i)}
                      className="px-2 py-1 text-[10px] rounded bg-blue-600 hover:bg-blue-500 text-white transition"
                    >回填</button>
                    <button
                      onClick={() => deleteDraft(i)}
                      className="px-2 py-1 text-[10px] rounded bg-slate-700 hover:bg-rose-600 text-slate-300 hover:text-white transition"
                    ><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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

      {/* 配方对比 & 选择性套用 Modal */}
      {showRecipeCompareModal && compareTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <FileDiff className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-semibold text-slate-100">配方对比</span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  <span className="text-violet-300 font-medium">{compareTarget.name}</span>
                  {compareTarget.description ? ` · ${compareTarget.description}` : ''}
                </div>
              </div>
              <button onClick={() => { setShowRecipeCompareModal(false); setCompareTarget(null); }} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode tabs */}
            <div className="px-5 pt-3 border-b border-slate-700/50 shrink-0">
              <div className="flex items-center gap-1 text-[11px] mb-3 bg-slate-800/50 p-0.5 rounded-lg w-fit">
                {[
                  { k: 'select', label: '勾选步骤', desc: '只挑选几步加入当前流程' },
                  { k: 'merge', label: '叠加合并', desc: '在当前基础上合并配方' },
                  { k: 'override', label: '整份覆盖', desc: '用配方替换当前配置' },
                ].map((m) => (
                  <button
                    key={m.k}
                    onClick={() => setCompareMode(m.k as any)}
                    className={`px-3 py-1.5 rounded-md transition ${
                      compareMode === m.k
                        ? 'bg-slate-700 text-slate-100 shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title={m.desc}
                  >{m.label}</button>
                ))}
              </div>
              <div className="text-[10px] text-slate-500 pb-3">
                💡 当前配置区已根据选择同步，你可以继续编辑或直接套用
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex">
              {/* 左：差异清单 */}
              <div className="w-1/2 overflow-y-auto p-4 border-r border-slate-700/50">
                <div className="text-xs font-medium text-slate-200 mb-2 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-blue-400" /> 当前配置 vs 配方
                </div>
                <div className="space-y-1">
                  {computeDiffList.map((d) => (
                    <div key={d.key} className="p-2 rounded-md bg-slate-800/40 border border-slate-700/60">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-300">{d.label}</span>
                        {d.status === 'same' && <span className="text-[10px] text-emerald-400 flex items-center gap-0.5"><Check className="w-2.5 h-2.5" />一致</span>}
                        {d.status === 'diff' && <span className="text-[10px] text-amber-400 flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />不同</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 mt-1 text-[10px]">
                        <div>
                          <div className="text-slate-500 mb-0.5">当前</div>
                          <div className="text-slate-200 font-mono px-1.5 py-0.5 rounded bg-slate-900/70">{d.current}</div>
                        </div>
                        <div>
                          <div className="text-violet-400 mb-0.5">配方</div>
                          <div className="text-violet-200 font-mono px-1.5 py-0.5 rounded bg-violet-950/40 border border-violet-900/40">{d.recipe}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 右：步骤勾选 */}
              <div className="w-1/2 overflow-y-auto p-4">
                <div className="text-xs font-medium text-slate-200 mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" />
                    步骤勾选
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {compareSelectedKeys.size}/{compareTarget.steps.length} 项
                  </span>
                </div>
                {compareMode === 'select' && (
                  <div className="flex gap-1 mb-2">
                    <button
                      onClick={() => setCompareSelectedKeys(new Set(compareTarget.steps.map((s) => s.key)))}
                      className="px-2 py-0.5 text-[10px] rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition"
                    >全选</button>
                    <button
                      onClick={() => setCompareSelectedKeys(new Set())}
                      className="px-2 py-0.5 text-[10px] rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition"
                    >清空</button>
                  </div>
                )}
                <div className="space-y-1.5">
                  {compareTarget.steps.map((s, i) => {
                    const checked = compareMode !== 'select' || compareSelectedKeys.has(s.key);
                    const disabled = compareMode !== 'select';
                    return (
                      <button
                        key={s.key || i}
                        onClick={() => !disabled && toggleSelectStep(s.key)}
                        className={`w-full text-left p-2 rounded-md border transition flex items-start gap-2 ${
                          checked
                            ? 'bg-emerald-950/30 border-emerald-800/50 hover:bg-emerald-950/50'
                            : 'bg-slate-800/30 border-slate-700/60 hover:bg-slate-800/50'
                        } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        <div className={`shrink-0 w-4 h-4 mt-0.5 rounded border flex items-center justify-center transition ${
                          checked
                            ? 'bg-emerald-600 border-emerald-500'
                            : 'bg-slate-900 border-slate-600'
                        }`}>
                          {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {s.category === 'column' && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-violet-500/20 text-violet-300 font-medium">列级</span>
                            )}
                            {s.category === 'basic' && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium">基础</span>
                            )}
                            <span className={`text-[11px] font-medium ${checked ? 'text-slate-100' : 'text-slate-400'}`}>{s.label}</span>
                          </div>
                          <div className={`text-[10px] mt-0.5 ${checked ? 'text-slate-400' : 'text-slate-600'}`}>{s.detail}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-700 shrink-0 flex items-center justify-between">
              <div className="text-[11px] text-slate-500">
                套用后将调用 smartClean 流水线执行最终配置
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowRecipeCompareModal(false); setCompareTarget(null); }}
                  className="px-3 py-1.5 text-xs rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 transition"
                >取消</button>
                <button
                  onClick={applyRecipeFromCompare}
                  disabled={recipeApplying || compareSelectedKeys.size === 0}
                  className="px-4 py-1.5 text-xs rounded-md bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white transition flex items-center gap-1.5"
                >
                  <Play className="w-3 h-3" /> {recipeApplying ? '套用中…' : '同步配置并套用'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
