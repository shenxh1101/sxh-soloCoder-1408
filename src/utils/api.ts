import type {
  ApiResponse, QualityReport, BoolPreviewResult, BoolMapping,
  SmartCleanConfig, CleaningRecipe, RecipeSummary, DetectionResult,
} from '@/types';

const API_BASE = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '请求失败' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function uploadCsv(file: File): Promise<ApiResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: form });
  return handleResponse<ApiResponse>(res);
}

export async function getData(sessionId: string): Promise<ApiResponse> {
  const res = await fetch(`${API_BASE}/data/${sessionId}`);
  return handleResponse<ApiResponse>(res);
}

async function postJson<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function fillNa(sessionId: string, params: { column: string; method: string; value?: any }) {
  return postJson<ApiResponse>(`${API_BASE}/clean/${sessionId}/fillna`, params);
}

export async function dropDuplicates(sessionId: string, params: { subset?: string[] }) {
  return postJson<ApiResponse>(`${API_BASE}/clean/${sessionId}/drop_duplicates`, params);
}

export async function fixDtypes(sessionId: string, params: { column: string; dtype: string; mapping?: BoolMapping }) {
  return postJson<ApiResponse>(`${API_BASE}/clean/${sessionId}/fix_dtypes`, params);
}

export async function normalizeDates(sessionId: string, params: { column: string; format?: string }) {
  return postJson<ApiResponse>(`${API_BASE}/clean/${sessionId}/normalize_dates`, params);
}

export async function stripSpaces(sessionId: string, params: { columns?: string[] }) {
  return postJson<ApiResponse>(`${API_BASE}/clean/${sessionId}/strip_spaces`, params);
}

export async function replaceValues(sessionId: string, params: any) {
  return postJson<ApiResponse>(`${API_BASE}/advanced/${sessionId}/replace`, params);
}

export async function regexExtract(sessionId: string, params: any) {
  return postJson<ApiResponse>(`${API_BASE}/advanced/${sessionId}/regex_extract`, params);
}

export async function splitColumn(sessionId: string, params: any) {
  return postJson<ApiResponse>(`${API_BASE}/advanced/${sessionId}/split_column`, params);
}

export async function mergeColumns(sessionId: string, params: any) {
  return postJson<ApiResponse>(`${API_BASE}/advanced/${sessionId}/merge_columns`, params);
}

export async function pivotTable(sessionId: string, params: any) {
  return postJson<ApiResponse>(`${API_BASE}/advanced/${sessionId}/pivot`, params);
}

export async function undo(sessionId: string) {
  return postJson<ApiResponse>(`${API_BASE}/history/${sessionId}/undo`, {});
}

export async function redo(sessionId: string) {
  return postJson<ApiResponse>(`${API_BASE}/history/${sessionId}/redo`, {});
}

export function getCsvUrl(sessionId: string) {
  return `${API_BASE}/export/${sessionId}/csv`;
}

export function getExcelUrl(sessionId: string) {
  return `${API_BASE}/export/${sessionId}/excel`;
}

export async function getReport(sessionId: string): Promise<QualityReport> {
  const res = await fetch(`${API_BASE}/export/${sessionId}/report`);
  return handleResponse<QualityReport>(res);
}

export async function boolPreview(
  sessionId: string,
  params: { column: string; mapping?: BoolMapping; limit?: number },
): Promise<BoolPreviewResult> {
  return postJson<BoolPreviewResult>(`${API_BASE}/clean/${sessionId}/bool_preview`, params);
}

export async function fixBool(
  sessionId: string,
  params: { column: string; dtype: string; mapping?: BoolMapping },
) {
  return postJson<ApiResponse>(`${API_BASE}/clean/${sessionId}/fix_bool`, params);
}

export async function smartClean(sessionId: string, config: SmartCleanConfig) {
  return postJson<ApiResponse>(`${API_BASE}/clean/${sessionId}/smart_clean`, config);
}

export async function listRecipes(): Promise<CleaningRecipe[]> {
  const res = await fetch(`${API_BASE}/recipes`);
  return handleResponse<CleaningRecipe[]>(res);
}

export async function getRecipe(id: string): Promise<CleaningRecipe> {
  const res = await fetch(`${API_BASE}/recipes/${id}`);
  return handleResponse<CleaningRecipe>(res);
}

export async function createRecipe(
  params: { name: string; description: string; config: SmartCleanConfig },
): Promise<CleaningRecipe> {
  return postJson<CleaningRecipe>(`${API_BASE}/recipes`, params);
}

export async function deleteRecipe(id: string) {
  const res = await fetch(`${API_BASE}/recipes/${id}`, { method: 'DELETE' });
  return handleResponse<{ success: boolean }>(res);
}

export async function applyRecipe(sessionId: string, recipeId: string) {
  return postJson<ApiResponse>(`${API_BASE}/clean/${sessionId}/apply_recipe/${recipeId}`, {});
}

export async function getSnapshot(
  sessionId: string,
  stepIndex: number,
): Promise<{ stepIndex: number; data: Record<string, any>[]; columns: string[]; detection: DetectionResult }> {
  const res = await fetch(`${API_BASE}/data/${sessionId}/snapshot/${stepIndex}`);
  return handleResponse(res);
}

export async function getStepDiff(sessionId: string, stepIndex: number): Promise<any> {
  const res = await fetch(`${API_BASE}/data/${sessionId}/step_diff/${stepIndex}`);
  return handleResponse(res);
}

export async function getRecipeSummary(recipeId: string): Promise<RecipeSummary> {
  const res = await fetch(`${API_BASE}/recipes/${recipeId}/summary`);
  return handleResponse<RecipeSummary>(res);
}

export function getRecipeExportUrl(recipeId: string): string {
  return `${API_BASE}/recipes/${recipeId}/export`;
}

export async function importRecipe(file: File): Promise<CleaningRecipe> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/recipes/import`, { method: 'POST', body: form });
  return handleResponse<CleaningRecipe>(res);
}
