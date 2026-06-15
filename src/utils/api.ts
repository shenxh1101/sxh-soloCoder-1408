import type { ApiResponse, QualityReport } from '@/types';

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

export async function fixDtypes(sessionId: string, params: { column: string; dtype: string }) {
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
