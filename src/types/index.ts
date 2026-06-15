export interface ColumnInfo {
  name: string;
  dtype: string;
  nullCount: number;
  nullPercentage: number;
  uniqueCount: number;
  sampleValues: any[];
  outliers: any[];
}

export interface DetectionResult {
  rowCount: number;
  columnCount: number;
  duplicateCount: number;
  totalNullCount: number;
  columns: ColumnInfo[];
  memoryUsage: string;
}

export interface HistoryEntry {
  id: string;
  operation: string;
  description: string;
  timestamp: number;
  params: Record<string, any>;
}

export interface ColumnDiffDetail {
  column: string;
  nullsBefore: number;
  nullsAfter: number;
  nullsDiff: number;
  dtypeBefore: string;
  dtypeAfter: string;
  sampleBefore: any[];
  sampleAfter: any[];
}

export interface StepChangeDetail {
  step: number;
  operation: string;
  description: string;
  before: Record<string, any>;
  after: Record<string, any>;
  diff: Record<string, any>;
  affectedColumns: string[];
  columnDiffs: ColumnDiffDetail[];
}

export interface QualityReport {
  filename: string;
  initialStats: Record<string, any>;
  finalStats: Record<string, any>;
  operations: HistoryEntry[];
  stepDetails: StepChangeDetail[];
  usedRecipe?: { id: string; name: string; description: string };
  summary: {
    totalOperations: number;
    rowsRemoved: number;
    nullsFixed: number;
    duplicatesRemoved: number;
    columnsChanged: number;
    qualityScore: number;
  };
}

export interface BoolMapping {
  trueValues: string[];
  falseValues: string[];
  caseSensitive: boolean;
}

export interface BoolPreviewRow {
  original: any;
  converted: any;
  status: 'true' | 'false' | 'unmapped' | 'null';
}

export interface BoolPreviewResult {
  column: string;
  totalRows: number;
  trueCount: number;
  falseCount: number;
  unmappedCount: number;
  nullCount: number;
  samples: BoolPreviewRow[];
}

export interface FillNaStrategy {
  enabled: boolean;
  numericMethod: 'mean' | 'median';
  textMethod: 'mode' | 'custom';
  customValue?: any;
}

export interface ColumnRuleFillNa {
  type: 'fillna';
  column: string;
  method: 'mean' | 'median' | 'mode' | 'custom';
  value?: any;
}

export interface ColumnRuleNormalizeDates {
  type: 'normalize_dates';
  column: string;
  format: string;
}

export interface ColumnRuleFixDtype {
  type: 'fix_dtype';
  column: string;
  dtype: 'int' | 'float' | 'string' | 'datetime' | 'bool';
  mapping?: BoolMapping;
}

export interface ColumnRuleBoolSemantic {
  type: 'bool_semantic';
  column: string;
  mapping?: BoolMapping;
}

export type ColumnCleanRule = ColumnRuleFillNa | ColumnRuleNormalizeDates | ColumnRuleFixDtype | ColumnRuleBoolSemantic;

export interface SmartCleanConfig {
  dropDuplicates: boolean;
  stripSpaces: boolean;
  fillNa?: FillNaStrategy;
  normalizeDates: boolean;
  dateFormat: string;
  autoFixDtypes: boolean;
  columnRules: ColumnCleanRule[];
  usedRecipeId?: string;
}

export interface RecipeSummaryStep {
  key: string;
  label: string;
  detail: string;
}

export interface RecipeSummary {
  id: string;
  name: string;
  description: string;
  stepCount: number;
  steps: RecipeSummaryStep[];
}

export interface CleaningRecipe {
  id: string;
  name: string;
  description: string;
  config: SmartCleanConfig;
  createdAt: number;
}

export type FillMethod = 'mean' | 'median' | 'mode' | 'custom';
export type DtypeOption = 'int' | 'float' | 'string' | 'datetime' | 'bool';
export type ConditionOp = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'not_contains';
export type AggFunc = 'sum' | 'mean' | 'count' | 'min' | 'max';

export interface ApiResponse {
  sessionId?: string;
  filename?: string;
  data: Record<string, any>[];
  columns: string[];
  detection: DetectionResult;
  history: HistoryEntry[];
  currentStep: number;
  historyEntry?: HistoryEntry;
  smartCleanSteps?: Array<{ step: number; id: string; description: string; operation: string }>;
}
