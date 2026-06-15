import io
import re
import pandas as pd
import numpy as np
from typing import Optional, Any

from backend.api.schemas import (
    DetectionResult, ColumnInfo,
    FillNaParams, DropDuplicatesParams, FixDtypeParams,
    NormalizeDatesParams, StripSpacesParams, ReplaceParams,
    RegexExtractParams, SplitColumnParams, MergeColumnsParams, PivotParams,
    BoolMapping, BoolPreviewRequest, BoolPreviewResult, SmartCleanConfig, FillNaStrategy, BoolPreviewRow
)
from backend.utils.validators import detect_outliers


def _san(v: Any) -> Any:
    if v is None:
        return None
    try:
        if v is pd.NA or v is pd.NaT:
            return None
    except Exception:
        pass
    try:
        if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
            return None
    except Exception:
        pass
    try:
        if not isinstance(v, str) and pd.isna(v):
            return None
    except Exception:
        pass
    return v


class DataService:
    def __init__(self):
        pass

    def parse_csv(self, content: bytes) -> pd.DataFrame:
        encodings = ['utf-8', 'gbk', 'gb2312', 'latin1']
        last_err = None
        for enc in encodings:
            try:
                df = pd.read_csv(io.BytesIO(content), encoding=enc)
                return df
            except Exception as e:
                last_err = e
        raise last_err or Exception('无法解析 CSV 文件')

    def detect(self, df: pd.DataFrame) -> DetectionResult:
        columns_info: list[ColumnInfo] = []
        total_null = 0

        for col in df.columns:
            series = df[col]
            null_count = int(series.isna().sum())
            total_null += null_count
            null_pct = round(null_count / len(df) * 100, 2) if len(df) > 0 else 0.0
            unique_count = int(series.nunique(dropna=True))
            sample_values = series.dropna().head(5).tolist()
            outliers = detect_outliers(series)

            columns_info.append(ColumnInfo(
                name=str(col),
                dtype=str(series.dtype),
                nullCount=null_count,
                nullPercentage=null_pct,
                uniqueCount=unique_count,
                sampleValues=sample_values,
                outliers=outliers
            ))

        duplicate_count = int(df.duplicated().sum())
        mem_usage = f"{df.memory_usage(deep=True).sum() / 1024 / 1024:.2f} MB"

        return DetectionResult(
            rowCount=len(df),
            columnCount=len(df.columns),
            duplicateCount=duplicate_count,
            totalNullCount=total_null,
            columns=columns_info,
            memoryUsage=mem_usage
        )

    def df_to_records(self, df: pd.DataFrame, limit: int = 100) -> tuple[list[dict], list[str]]:
        cols = [str(c) for c in df.columns]
        records = []
        for _, row in df.head(limit).iterrows():
            rec = {}
            for c in cols:
                v = _san(row[c])
                if isinstance(v, bool):
                    rec[c] = v
                else:
                    try:
                        if hasattr(v, 'item') and not isinstance(v, str):
                            v = v.item()
                    except Exception:
                        pass
                    if hasattr(v, 'isoformat') and not isinstance(v, str):
                        v = v.isoformat()
                rec[c] = v
            records.append(rec)
        return records, cols

    def fill_na(self, df: pd.DataFrame, params: FillNaParams) -> pd.DataFrame:
        col = params.column
        if col not in df.columns:
            return df
        series = df[col]
        val = None
        if params.method == 'mean':
            val = series.mean(numeric_only=True)
        elif params.method == 'median':
            val = series.median(numeric_only=True)
        elif params.method == 'mode':
            modes = series.mode(dropna=True)
            val = modes.iloc[0] if len(modes) > 0 else None
        else:
            val = params.value
        new_df = df.copy()
        if val is None:
            return new_df
        try:
            val_san = _san(val)
            if val_san is None:
                return new_df
            if str(series.dtype) == 'boolean':
                try:
                    bool_val = bool(int(float(val_san))) if isinstance(val_san, (int, float, str)) else bool(val_san)
                    new_df[col] = series.fillna(bool_val)
                except Exception:
                    return new_df
            else:
                new_df[col] = series.fillna(val_san)
        except Exception:
            pass
        return new_df

    def drop_duplicates(self, df: pd.DataFrame, params: DropDuplicatesParams) -> pd.DataFrame:
        subset = params.subset if params.subset else None
        return df.drop_duplicates(subset=subset).reset_index(drop=True)

    def fix_dtypes(self, df: pd.DataFrame, params: FixDtypeParams) -> pd.DataFrame:
        col = params.column
        if col not in df.columns:
            return df
        new_df = df.copy()
        try:
            if params.dtype == 'int':
                new_df[col] = pd.to_numeric(new_df[col], errors='coerce').astype('Int64')
            elif params.dtype == 'float':
                new_df[col] = pd.to_numeric(new_df[col], errors='coerce')
            elif params.dtype == 'string':
                new_df[col] = new_df[col].astype('string')
            elif params.dtype == 'datetime':
                new_df[col] = pd.to_datetime(new_df[col], errors='coerce')
            elif params.dtype == 'bool':
                new_df[col] = new_df[col].astype('bool')
        except Exception:
            pass
        return new_df

    def normalize_dates(self, df: pd.DataFrame, params: NormalizeDatesParams) -> pd.DataFrame:
        col = params.column
        if col not in df.columns:
            return df
        new_df = df.copy()
        new_df[col] = pd.to_datetime(new_df[col], errors='coerce')
        fmt = params.format or '%Y-%m-%d'
        new_df[col] = new_df[col].dt.strftime(fmt)
        new_df[col] = new_df[col].where(new_df[col].notna(), None)
        return new_df

    def strip_spaces(self, df: pd.DataFrame, params: StripSpacesParams) -> pd.DataFrame:
        cols = params.columns if params.columns else list(df.select_dtypes(include=['object', 'string']).columns)
        new_df = df.copy()
        for c in cols:
            if c in new_df.columns and new_df[c].dtype in ['object', 'string']:
                new_df[c] = new_df[c].astype('string').str.strip()
        return new_df

    def replace_values(self, df: pd.DataFrame, params: ReplaceParams) -> pd.DataFrame:
        col = params.column
        if col not in df.columns:
            return df
        new_df = df.copy()
        mask = pd.Series([True] * len(new_df), index=new_df.index)

        if params.condition:
            op = params.condition.op
            val = params.condition.value
            series = new_df[col]
            if op == '==':
                mask = series == val
            elif op == '!=':
                mask = series != val
            elif op == '>':
                mask = pd.to_numeric(series, errors='coerce') > float(val) if val is not None else mask
            elif op == '<':
                mask = pd.to_numeric(series, errors='coerce') < float(val) if val is not None else mask
            elif op == '>=':
                mask = pd.to_numeric(series, errors='coerce') >= float(val) if val is not None else mask
            elif op == '<=':
                mask = pd.to_numeric(series, errors='coerce') <= float(val) if val is not None else mask
            elif op == 'contains':
                mask = series.astype('string').str.contains(str(val), na=False, regex=False)
            elif op == 'not_contains':
                mask = ~series.astype('string').str.contains(str(val), na=False, regex=False)

        if params.oldValue is not None and not params.regex:
            mask = mask & (new_df[col] == params.oldValue)

        if params.regex and params.oldValue is not None:
            try:
                new_df.loc[mask, col] = new_df.loc[mask, col].astype('string').str.replace(
                    str(params.oldValue), str(params.newValue), regex=True
                )
            except Exception:
                pass
        else:
            new_df.loc[mask, col] = params.newValue

        return new_df

    def regex_extract(self, df: pd.DataFrame, params: RegexExtractParams) -> pd.DataFrame:
        col = params.column
        if col not in df.columns:
            return df
        new_df = df.copy()
        try:
            extracted = new_df[col].astype('string').str.extract(params.pattern, expand=False)
            new_df[params.newColumn] = extracted
        except Exception:
            pass
        return new_df

    def split_column(self, df: pd.DataFrame, params: SplitColumnParams) -> pd.DataFrame:
        col = params.column
        if col not in df.columns:
            return df
        new_df = df.copy()
        try:
            n = len(params.newColumns)
            split_df = new_df[col].astype('string').str.split(params.separator, n=n - 1, expand=True)
            for i, name in enumerate(params.newColumns):
                if i < split_df.shape[1]:
                    new_df[name] = split_df[i]
                else:
                    new_df[name] = None
        except Exception:
            pass
        return new_df

    def merge_columns(self, df: pd.DataFrame, params: MergeColumnsParams) -> pd.DataFrame:
        cols = [c for c in params.columns if c in df.columns]
        if not cols:
            return df
        new_df = df.copy()
        sep = params.separator
        merged = new_df[cols[0]].astype('string')
        for c in cols[1:]:
            merged = merged + sep + new_df[c].astype('string')
        merged = merged.str.replace(r'<NA>', '', regex=False)
        new_df[params.newColumn] = merged
        return new_df

    def pivot(self, df: pd.DataFrame, params: PivotParams) -> pd.DataFrame:
        agg_map = {
            'sum': 'sum',
            'mean': 'mean',
            'count': 'count',
            'min': 'min',
            'max': 'max'
        }
        try:
            pivot_df = df.pivot_table(
                index=params.index,
                columns=params.columns,
                values=params.values,
                aggfunc=agg_map.get(params.aggFunc, 'mean'),
                fill_value=0
            ).reset_index()
            pivot_df.columns = [str(c) for c in pivot_df.columns]
            return pivot_df
        except Exception:
            return df

    def is_numeric_column(self, df: pd.DataFrame, col: str) -> bool:
        if col not in df.columns:
            return False
        s = df[col]
        if pd.api.types.is_numeric_dtype(s):
            return True
        numeric = pd.to_numeric(s, errors='coerce')
        return numeric.notna().sum() >= len(s) * 0.7 and numeric.notna().sum() > 0

    def is_text_column(self, df: pd.DataFrame, col: str) -> bool:
        if col not in df.columns:
            return False
        return df[col].dtype in ['object', 'string'] and not self.is_numeric_column(df, col)

    def is_date_like_column(self, df: pd.DataFrame, col: str) -> bool:
        if col not in df.columns:
            return False
        s = df[col].dropna().astype(str)
        if len(s) == 0:
            return False
        parsed = pd.to_datetime(s, errors='coerce')
        return parsed.notna().sum() >= len(s) * 0.6

    def bool_preview(self, df: pd.DataFrame, params: BoolPreviewRequest) -> BoolPreviewResult:
        col = params.column
        if col not in df.columns:
            return BoolPreviewResult(column=col, totalRows=0, trueCount=0, falseCount=0, unmappedCount=0, nullCount=0, samples=[])
        series = df[col]
        mapping = params.mapping or BoolMapping()
        true_vals = [v if mapping.caseSensitive else v.lower() for v in mapping.trueValues]
        false_vals = [v if mapping.caseSensitive else v.lower() for v in mapping.falseValues]

        true_count = 0
        false_count = 0
        unmapped_count = 0
        null_count = 0

        def _convert(v) -> tuple[Any, Any, str]:
            nonlocal true_count, false_count, unmapped_count, null_count
            orig = _san(v)
            if orig is None:
                null_count += 1
                return None, None, 'null'
            sv = str(orig) if mapping.caseSensitive else str(orig).lower()
            if sv in true_vals:
                true_count += 1
                return orig, True, 'true'
            if sv in false_vals:
                false_count += 1
                return orig, False, 'false'
            unmapped_count += 1
            return orig, None, 'unmapped'

        rows_list: list[BoolPreviewRow] = []
        for i, v in enumerate(series.head(params.limit).tolist()):
            orig, conv, status = _convert(v)
            rows_list.append(BoolPreviewRow(original=orig, converted=conv, status=status))

        # 对于超过 limit 的部分，我们也统计总数
        for v in series.tolist()[params.limit:]:
            _convert(v)

        return BoolPreviewResult(
            column=col,
            totalRows=len(series),
            trueCount=true_count,
            falseCount=false_count,
            unmappedCount=unmapped_count,
            nullCount=null_count,
            samples=rows_list,
        )

    def fix_bool_semantic(self, df: pd.DataFrame, col: str, mapping: Optional[BoolMapping] = None) -> pd.DataFrame:
        if col not in df.columns:
            return df
        mp = mapping or BoolMapping()
        true_vals = [v if mp.caseSensitive else v.lower() for v in mp.trueValues]
        false_vals = [v if mp.caseSensitive else v.lower() for v in mp.falseValues]

        def _convert(v) -> Any:
            if pd.isna(v):
                return None
            sv = str(v) if mp.caseSensitive else str(v).lower()
            if sv in true_vals:
                return True
            if sv in false_vals:
                return False
            return None

        new_df = df.copy()
        new_df[col] = new_df[col].apply(_convert).astype('boolean')
        return new_df

    def get_step_diff(self, before_df: pd.DataFrame, after_df: pd.DataFrame) -> dict:
        before_det = self.detect(before_df)
        after_det = self.detect(after_df)
        column_diffs = self._get_column_diffs(before_df, after_df)
        affected = [cd.column for cd in column_diffs if cd.nullsDiff != 0 or cd.dtypeBefore != cd.dtypeAfter]
        return {
            'rows': {'before': before_det.rowCount, 'after': after_det.rowCount, 'diff': after_det.rowCount - before_det.rowCount},
            'columns': {'before': before_det.columnCount, 'after': after_det.columnCount, 'diff': after_det.columnCount - before_det.columnCount},
            'nulls': {'before': before_det.totalNullCount, 'after': after_det.totalNullCount, 'diff': after_det.totalNullCount - before_det.totalNullCount},
            'duplicates': {'before': before_det.duplicateCount, 'after': after_det.duplicateCount, 'diff': after_det.duplicateCount - before_det.duplicateCount},
            'affectedColumns': affected,
            'columnDiffs': [cd.model_dump() for cd in column_diffs],
        }

    def _get_column_diffs(self, before_df: pd.DataFrame, after_df: pd.DataFrame) -> list:
        from backend.api.schemas import ColumnDiffDetail
        result: list[ColumnDiffDetail] = []
        common_cols = [c for c in before_df.columns if c in after_df.columns]
        for col in common_cols:
            before_series = before_df[col]
            after_series = after_df[col]
            nulls_before = int(before_series.isna().sum())
            nulls_after = int(after_series.isna().sum())
            dtype_before = str(before_series.dtype)
            dtype_after = str(after_series.dtype)
            sample_before = [_san(v) for v in before_series.head(5).tolist()]
            sample_after = [_san(v) for v in after_series.head(5).tolist()]
            if nulls_before != nulls_after or dtype_before != dtype_after:
                result.append(ColumnDiffDetail(
                    column=col,
                    nullsBefore=nulls_before,
                    nullsAfter=nulls_after,
                    nullsDiff=nulls_after - nulls_before,
                    dtypeBefore=dtype_before,
                    dtypeAfter=dtype_after,
                    sampleBefore=sample_before,
                    sampleAfter=sample_after,
                ))
        return result

    def smart_clean(self, df: pd.DataFrame, cfg: SmartCleanConfig) -> list[tuple[str, str, dict, pd.DataFrame]]:
        steps: list[tuple[str, str, dict, pd.DataFrame]] = []
        current = df

        if cfg.stripSpaces:
            before = current
            current = self.strip_spaces(current, StripSpacesParams())
            steps.append(('strip_spaces', '去除所有文本列前后空格', {}, current))

        if cfg.dropDuplicates:
            before = current
            new = self.drop_duplicates(current, DropDuplicatesParams())
            removed = len(before) - len(new)
            if removed > 0:
                current = new
                steps.append(('drop_duplicates', f'删除 {removed} 行重复数据', {}, current))

        if cfg.fillNa and cfg.fillNa.enabled:
            det = self.detect(current)
            for col_info in det.columns:
                if col_info.nullCount == 0:
                    continue
                col = col_info.name
                col_dtype = str(current[col].dtype)
                is_bool = col_dtype == 'boolean' or col_dtype == 'bool'
                is_num = not is_bool and self.is_numeric_column(current, col)
                strategy = cfg.fillNa
                if is_bool:
                    p = FillNaParams(column=col, method='mode')
                    desc = f"布尔列 [{col}] 用众数填充 {col_info.nullCount} 个缺失值"
                    current = self.fill_na(current, p)
                    steps.append(('fillna', desc, p.model_dump(), current))
                elif is_num:
                    method = strategy.numericMethod
                    p = FillNaParams(column=col, method=method)
                    desc = f"数值列 [{col}] 用{method}填充 {col_info.nullCount} 个缺失值"
                    current = self.fill_na(current, p)
                    steps.append(('fillna', desc, p.model_dump(), current))
                else:
                    method = strategy.textMethod
                    val = strategy.customValue if method == 'custom' else None
                    p = FillNaParams(column=col, method=method, value=val)
                    mname = '众数' if method == 'mode' else f'自定义值({val})'
                    desc = f"文本列 [{col}] 用{mname}填充 {col_info.nullCount} 个缺失值"
                    current = self.fill_na(current, p)
                    steps.append(('fillna', desc, p.model_dump(), current))

        if cfg.normalizeDates:
            det = self.detect(current)
            for col_info in det.columns:
                col = col_info.name
                if self.is_date_like_column(current, col):
                    p = NormalizeDatesParams(column=col, format=cfg.dateFormat)
                    before = current
                    current = self.normalize_dates(current, p)
                    if not before.equals(current):
                        steps.append(('normalize_dates', f"标准化日期列 [{col}] 为 {cfg.dateFormat}", p.model_dump(), current))

        if cfg.autoFixDtypes:
            det = self.detect(current)
            for col_info in det.columns:
                col = col_info.name
                if self.is_numeric_column(current, col) and not pd.api.types.is_numeric_dtype(current[col]):
                    p = FixDtypeParams(column=col, dtype='float')
                    before = current
                    current = self.fix_dtypes(current, p)
                    steps.append(('fix_dtypes', f"自动转换列 [{col}] 为数值类型", p.model_dump(), current))
                elif self.is_text_column(current, col) and current[col].dtype != 'string':
                    p = FixDtypeParams(column=col, dtype='string')
                    current = self.fix_dtypes(current, p)
                    steps.append(('fix_dtypes', f"自动转换列 [{col}] 为文本类型", p.model_dump(), current))

        if cfg.columnRules and len(cfg.columnRules) > 0:
            for rule in cfg.columnRules:
                col = rule.column
                if col not in current.columns:
                    continue
                if rule.type == 'fillna':
                    p = FillNaParams(column=col, method=rule.method, value=rule.value)
                    desc = f"列 [{col}] 填充缺失值（{rule.method}）"
                    current = self.fill_na(current, p)
                    steps.append(('fillna', desc, p.model_dump(), current))
                elif rule.type == 'normalize_dates':
                    p = NormalizeDatesParams(column=col, format=rule.format)
                    before = current
                    current = self.normalize_dates(current, p)
                    if not before[col].equals(current[col]):
                        steps.append(('normalize_dates', f"标准化日期列 [{col}] 为 {rule.format}", p.model_dump(), current))
                elif rule.type == 'fix_dtype':
                    if rule.dtype == 'bool' and rule.mapping:
                        current = self.fix_bool_semantic(current, col, rule.mapping)
                        steps.append(('fix_dtypes', f"列 [{col}] 按自定义映射转换为布尔类型",
                                       {'column': col, 'dtype': 'bool', 'mapping': rule.mapping.model_dump()},
                                       current))
                    else:
                        p = FixDtypeParams(column=col, dtype=rule.dtype)
                        current = self.fix_dtypes(current, p)
                        steps.append(('fix_dtypes', f"列 [{col}] 转换为 {rule.dtype} 类型",
                                       p.model_dump(), current))
                elif rule.type == 'bool_semantic':
                    mapping = rule.mapping or BoolMapping()
                    current = self.fix_bool_semantic(current, col, mapping)
                    steps.append(('fix_dtypes', f"列 [{col}] 语义化布尔转换",
                                   {'column': col, 'mapping': mapping.model_dump()}, current))

        return steps
