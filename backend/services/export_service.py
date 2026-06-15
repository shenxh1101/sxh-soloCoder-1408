import io
import pandas as pd
from typing import Optional

from backend.api.schemas import QualityReport, HistoryEntry
from backend.services.history_service import HistoryService
from backend.services.data_service import DataService


class ExportService:
    def __init__(self, history_service: HistoryService, data_service: DataService):
        self.history_service = history_service
        self.data_service = data_service

    def export_csv(self, session_id: str) -> Optional[bytes]:
        df = self.history_service.get_current_df(session_id)
        if df is None:
            return None
        output = io.BytesIO()
        df.to_csv(output, index=False, encoding='utf-8-sig')
        output.seek(0)
        return output.getvalue()

    def export_excel(self, session_id: str) -> Optional[bytes]:
        df = self.history_service.get_current_df(session_id)
        if df is None:
            return None
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Cleaned Data')
        output.seek(0)
        return output.getvalue()

    def generate_report(self, session_id: str) -> Optional[QualityReport]:
        initial_df = self.history_service.get_initial_df(session_id)
        current_df = self.history_service.get_current_df(session_id)
        if initial_df is None or current_df is None:
            return None

        initial_det = self.data_service.detect(initial_df)
        final_det = self.data_service.detect(current_df)
        history = self.history_service.get_history(session_id)
        filename = self.history_service.get_filename(session_id)

        initial_stats = {
            'rowCount': initial_det.rowCount,
            'columnCount': initial_det.columnCount,
            'duplicateCount': initial_det.duplicateCount,
            'totalNullCount': initial_det.totalNullCount,
            'memoryUsage': initial_det.memoryUsage,
            'columns': [c.model_dump() for c in initial_det.columns]
        }

        final_stats = {
            'rowCount': final_det.rowCount,
            'columnCount': final_det.columnCount,
            'duplicateCount': final_det.duplicateCount,
            'totalNullCount': final_det.totalNullCount,
            'memoryUsage': final_det.memoryUsage,
            'columns': [c.model_dump() for c in final_det.columns]
        }

        rows_removed = initial_stats['rowCount'] - final_stats['rowCount']
        nulls_fixed = initial_stats['totalNullCount'] - final_stats['totalNullCount']
        dups_removed = initial_stats['duplicateCount'] - final_stats['duplicateCount']
        cols_changed = final_stats['columnCount'] - initial_stats['columnCount']

        summary = {
            'totalOperations': len(history),
            'rowsRemoved': rows_removed,
            'nullsFixed': nulls_fixed,
            'duplicatesRemoved': dups_removed,
            'columnsChanged': cols_changed,
            'qualityScore': self._calc_score(initial_stats, final_stats)
        }

        return QualityReport(
            filename=filename,
            initialStats=initial_stats,
            finalStats=final_stats,
            operations=history,
            summary=summary
        )

    def _calc_score(self, initial: dict, final: dict) -> float:
        try:
            init_null_pct = initial['totalNullCount'] / max(initial['rowCount'], 1) * 100
            final_null_pct = final['totalNullCount'] / max(final['rowCount'], 1) * 100
            init_dup_pct = initial['duplicateCount'] / max(initial['rowCount'], 1) * 100
            final_dup_pct = final['duplicateCount'] / max(final['rowCount'], 1) * 100

            score = 100.0
            score -= final_null_pct * 2
            score -= final_dup_pct * 1.5
            score = max(0.0, min(100.0, score))
            return round(score, 2)
        except Exception:
            return 0.0
