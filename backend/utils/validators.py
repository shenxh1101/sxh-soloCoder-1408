from typing import Any
import pandas as pd


def detect_outliers(series: pd.Series) -> list:
    if series.dtype not in ['int64', 'float64', 'Int64', 'Float64']:
        return []
    clean = series.dropna()
    if len(clean) < 4:
        return []
    q1 = clean.quantile(0.25)
    q3 = clean.quantile(0.75)
    iqr = q3 - q1
    if iqr == 0:
        return []
    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr
    outliers = clean[(clean < lower) | (clean > upper)]
    return outliers.head(10).tolist()


def safe_to_json(value: Any) -> Any:
    if pd.isna(value):
        return None
    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()
    if isinstance(value, (pd.Int64Dtype,)):
        return int(value) if pd.notna(value) else None
    return value
