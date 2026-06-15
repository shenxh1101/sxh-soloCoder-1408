import { create } from 'zustand';
import type { ApiResponse, DetectionResult, HistoryEntry, QualityReport, CleaningRecipe } from '@/types';

interface DataState {
  sessionId: string | null;
  filename: string;
  data: Record<string, any>[];
  columns: string[];
  detection: DetectionResult | null;
  history: HistoryEntry[];
  currentStep: number;
  loading: boolean;
  error: string;
  report: QualityReport | null;
  reportOpen: boolean;
  recipeList: CleaningRecipe[];

  setResponse: (r: Partial<ApiResponse>) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string) => void;
  setReport: (r: QualityReport | null) => void;
  setReportOpen: (v: boolean) => void;
  setRecipeList: (r: CleaningRecipe[]) => void;
  reset: () => void;
}

export const useDataStore = create<DataState>((set) => ({
  sessionId: null,
  filename: '',
  data: [],
  columns: [],
  detection: null,
  history: [],
  currentStep: 0,
  loading: false,
  error: '',
  report: null,
  reportOpen: false,
  recipeList: [],

  setResponse: (r) =>
    set((state) => ({
      sessionId: r.sessionId !== undefined ? r.sessionId ?? null : state.sessionId,
      filename: r.filename !== undefined ? r.filename ?? '' : state.filename,
      data: r.data !== undefined ? r.data : state.data,
      columns: r.columns !== undefined ? r.columns : state.columns,
      detection: r.detection !== undefined ? r.detection : state.detection,
      history: r.history !== undefined ? r.history : state.history,
      currentStep: r.currentStep !== undefined ? r.currentStep : state.currentStep,
      error: '',
    })),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
  setReport: (r) => set({ report: r }),
  setReportOpen: (v) => set({ reportOpen: v }),
  setRecipeList: (r) => set({ recipeList: r }),
  reset: () =>
    set({
      sessionId: null,
      filename: '',
      data: [],
      columns: [],
      detection: null,
      history: [],
      currentStep: 0,
      error: '',
      report: null,
      reportOpen: false,
      recipeList: [],
    }),
}));
