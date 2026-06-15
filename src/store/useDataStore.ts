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
  viewingSnapshot: boolean;
  snapshotStepIndex: number;
  cachedFinal: {
    data: Record<string, any>[];
    columns: string[];
    detection: DetectionResult | null;
    currentStep: number;
    history: HistoryEntry[];
  };

  setResponse: (r: Partial<ApiResponse>) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string) => void;
  setReport: (r: QualityReport | null) => void;
  setReportOpen: (v: boolean) => void;
  setRecipeList: (r: CleaningRecipe[]) => void;
  viewSnapshot: (stepIndex: number, data: Record<string, any>[], columns: string[], detection: DetectionResult) => void;
  exitSnapshotView: () => void;
  reset: () => void;
}

export const useDataStore = create<DataState>((set, get) => ({
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
  viewingSnapshot: false,
  snapshotStepIndex: 0,
  cachedFinal: {
    data: [],
    columns: [],
    detection: null,
    currentStep: 0,
    history: [],
  },

  setResponse: (r) =>
    set((state) => {
      const next = {
        sessionId: r.sessionId !== undefined ? r.sessionId ?? null : state.sessionId,
        filename: r.filename !== undefined ? r.filename ?? '' : state.filename,
        data: r.data !== undefined ? r.data : state.data,
        columns: r.columns !== undefined ? r.columns : state.columns,
        detection: r.detection !== undefined ? r.detection : state.detection,
        history: r.history !== undefined ? r.history : state.history,
        currentStep: r.currentStep !== undefined ? r.currentStep : state.currentStep,
        error: '',
      };
      if (state.viewingSnapshot) {
        return {
          ...state,
          cachedFinal: {
            data: next.data,
            columns: next.columns,
            detection: next.detection,
            currentStep: next.currentStep,
            history: next.history,
          },
          sessionId: next.sessionId,
          filename: next.filename,
          error: '',
        };
      }
      return { ...state, ...next };
    }),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
  setReport: (r) => set({ report: r }),
  setReportOpen: (v) => set({ reportOpen: v }),
  setRecipeList: (r) => set({ recipeList: r }),

  viewSnapshot: (stepIndex, data, columns, detection) => {
    const s = get();
    if (!s.viewingSnapshot) {
      set({
        cachedFinal: {
          data: s.data,
          columns: s.columns,
          detection: s.detection,
          currentStep: s.currentStep,
          history: s.history,
        },
      });
    }
    set({
      viewingSnapshot: true,
      snapshotStepIndex: stepIndex,
      data,
      columns,
      detection,
    });
  },

  exitSnapshotView: () => {
    const s = get();
    if (!s.viewingSnapshot) return;
    set({
      viewingSnapshot: false,
      snapshotStepIndex: 0,
      data: s.cachedFinal.data,
      columns: s.cachedFinal.columns,
      detection: s.cachedFinal.detection,
      currentStep: s.cachedFinal.currentStep,
      history: s.cachedFinal.history,
    });
  },

  reset: () =>
    set({
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
      viewingSnapshot: false,
      snapshotStepIndex: 0,
      cachedFinal: { data: [], columns: [], detection: null, currentStep: 0, history: [] },
    }),
}));
