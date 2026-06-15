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

export interface ApiResponse {
  sessionId?: string;
  filename?: string;
  data: Record<string, any>[];
  columns: string[];
  detection: DetectionResult;
  history: HistoryEntry[];
  currentStep: number;
  historyEntry?: HistoryEntry;
}

export interface QualityReport {
  filename: string;
  initialStats: Record<string, any>;
  finalStats: Record<string, any>;
  operations: HistoryEntry[];
  summary: {
    totalOperations: number;
    rowsRemoved: number;
    nullsFixed: number;
    duplicatesRemoved: number;
    columnsChanged: number;
    qualityScore: number;
  };
}

export type FillMethod = 'mean' | 'median' | 'mode' | 'custom';
export type DtypeOption = 'int' | 'float' | 'string' | 'datetime' | 'bool';
export type ConditionOp = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'not_contains';
export type AggFunc = 'sum' | 'mean' | 'count' | 'min' | 'max';
