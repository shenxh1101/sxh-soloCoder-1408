from pydantic import BaseModel, Field
from typing import Optional, Any, Literal


class ColumnInfo(BaseModel):
    name: str
    dtype: str
    nullCount: int
    nullPercentage: float
    uniqueCount: int
    sampleValues: list = []
    outliers: list = []


class DetectionResult(BaseModel):
    rowCount: int
    columnCount: int
    duplicateCount: int
    totalNullCount: int
    columns: list[ColumnInfo] = []
    memoryUsage: str


class HistoryEntry(BaseModel):
    id: str
    operation: str
    description: str
    timestamp: float
    params: dict = {}


class FillNaParams(BaseModel):
    column: str
    method: Literal['mean', 'median', 'mode', 'custom']
    value: Optional[Any] = None


class DropDuplicatesParams(BaseModel):
    subset: Optional[list[str]] = None


class FixDtypeParams(BaseModel):
    column: str
    dtype: Literal['int', 'float', 'string', 'datetime', 'bool']


class NormalizeDatesParams(BaseModel):
    column: str
    format: Optional[str] = '%Y-%m-%d'


class StripSpacesParams(BaseModel):
    columns: Optional[list[str]] = None


class Condition(BaseModel):
    op: Literal['==', '!=', '>', '<', '>=', '<=', 'contains', 'not_contains']
    value: Any


class ReplaceParams(BaseModel):
    column: str
    condition: Optional[Condition] = None
    oldValue: Optional[Any] = None
    newValue: Any
    regex: bool = False


class RegexExtractParams(BaseModel):
    column: str
    pattern: str
    newColumn: str


class SplitColumnParams(BaseModel):
    column: str
    separator: str
    newColumns: list[str]


class MergeColumnsParams(BaseModel):
    columns: list[str]
    separator: str
    newColumn: str


class PivotParams(BaseModel):
    index: str
    columns: str
    values: str
    aggFunc: Literal['sum', 'mean', 'count', 'min', 'max']


class OperationResponse(BaseModel):
    data: list[dict]
    columns: list[str]
    detection: DetectionResult
    historyEntry: Optional[HistoryEntry] = None
    history: list[HistoryEntry] = []
    currentStep: int = 0


class QualityReport(BaseModel):
    filename: str
    initialStats: dict
    finalStats: dict
    operations: list[HistoryEntry] = []
    summary: dict
