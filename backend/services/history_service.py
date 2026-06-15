import uuid
import time
import copy
import pandas as pd
from typing import Optional

from backend.api.schemas import HistoryEntry


class HistoryService:
    def __init__(self):
        self._sessions: dict[str, dict] = {}

    def create_session(self, filename: str, df: pd.DataFrame) -> str:
        session_id = str(uuid.uuid4())
        snapshot = df.copy(deep=True)
        self._sessions[session_id] = {
            'filename': filename,
            'initial_df': snapshot,
            'snapshots': [snapshot],
            'history': [],
            'current_step': 0,
            'redo_stack': [],
            'used_recipe': None,
            'step_diffs': {},
        }
        return session_id

    def get_session(self, session_id: str) -> Optional[dict]:
        return self._sessions.get(session_id)

    def get_step_diffs(self, session_id: str) -> dict:
        session = self._sessions.get(session_id)
        return session.get('step_diffs', {}) if session else {}

    def set_used_recipe(self, session_id: str, recipe_info: dict):
        session = self._sessions.get(session_id)
        if session:
            session['used_recipe'] = recipe_info

    def get_used_recipe(self, session_id: str) -> Optional[dict]:
        session = self._sessions.get(session_id)
        return session.get('used_recipe') if session else None

    def get_current_df(self, session_id: str) -> Optional[pd.DataFrame]:
        session = self._sessions.get(session_id)
        if not session:
            return None
        return session['snapshots'][session['current_step']].copy(deep=True)

    def record_operation(
        self,
        session_id: str,
        operation: str,
        description: str,
        params: dict,
        new_df: pd.DataFrame,
        diff: Optional[dict] = None,
    ) -> Optional[HistoryEntry]:
        session = self._sessions.get(session_id)
        if not session:
            return None

        entry = HistoryEntry(
            id=str(uuid.uuid4()),
            operation=operation,
            description=description,
            timestamp=time.time(),
            params=params
        )

        session['snapshots'] = session['snapshots'][:session['current_step'] + 1]
        session['history'] = session['history'][:session['current_step']]
        session['step_diffs'] = {k: v for k, v in session['step_diffs'].items() if k < session['current_step']}
        session['snapshots'].append(new_df.copy(deep=True))
        session['history'].append(entry)
        if diff is not None:
            session['step_diffs'][len(session['history']) - 1] = diff
        session['current_step'] = len(session['history'])
        session['redo_stack'] = []

        return entry

    def undo(self, session_id: str) -> Optional[dict]:
        session = self._sessions.get(session_id)
        if not session or session['current_step'] <= 0:
            return None

        session['current_step'] -= 1
        df = session['snapshots'][session['current_step']]
        return {
            'df': df,
            'history': session['history'],
            'currentStep': session['current_step']
        }

    def redo(self, session_id: str) -> Optional[dict]:
        session = self._sessions.get(session_id)
        if not session or session['current_step'] >= len(session['history']):
            return None

        session['current_step'] += 1
        df = session['snapshots'][session['current_step']]
        return {
            'df': df,
            'history': session['history'],
            'currentStep': session['current_step']
        }

    def get_history(self, session_id: str) -> list[HistoryEntry]:
        session = self._sessions.get(session_id)
        if not session:
            return []
        return session['history']

    def get_filename(self, session_id: str) -> str:
        session = self._sessions.get(session_id)
        return session['filename'] if session else ''

    def get_initial_df(self, session_id: str) -> Optional[pd.DataFrame]:
        session = self._sessions.get(session_id)
        return session['initial_df'].copy(deep=True) if session else None

    def get_snapshot_by_index(self, session_id: str, index: int) -> Optional[pd.DataFrame]:
        session = self._sessions.get(session_id)
        if not session:
            return None
        if index < 0 or index > len(session['snapshots']) - 1:
            return None
        return session['snapshots'][index].copy(deep=True)

    def get_step_diff_by_index(self, session_id: str, step_index: int) -> Optional[dict]:
        session = self._sessions.get(session_id)
        if not session:
            return None
        return session['step_diffs'].get(step_index)
