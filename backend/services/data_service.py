import io
import re
import pandas as pd
import numpy as np
from typing import Optional, Any

from backend.api.schemas import (
    DetectionResult, ColumnInfo,
    FillNaParams, DropDuplicatesParams, FixDtypeParams,
    NormalizeDatesParams, StripSpacesParams, ReplaceParams,
    RegexExtractParams, SplitColumnParams, MergeColumnsParams, PivotParams
)
from backend.utils.validators import detect_outliers


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
        preview = df.head(limit).replace({np.nan: None})
        records = []
        for _, row in preview.iterrows():
            rec = {}
            for c in cols:
                v = row[c]
                if pd.isna(v) if isinstance(v, float) else False:
                    rec[c] = None
                else:
                    try:
                        if hasattr(v, 'item'):
                            v = v.item()
                    except Exception:
                        pass
                    if hasattr(v, 'isoformat'):
                        v = v.isoformat()
                    rec[c] = v
            records.append(rec)
        return records, cols

    def fill_na(self, df: pd.DataFrame, params: FillNaParams) -> pd.DataFrame:
        col = params.column
        if col not in df.columns:
            return df
        series = df[col]
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
        if pd.notna(val) or val is not None:
            new_df[col] = new_df[col].fillna(val)
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
