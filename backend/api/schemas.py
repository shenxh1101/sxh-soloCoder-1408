from pydantic import BaseModel, Field
from typing import Optional, Any, Literal
import time
import uuid


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


class BoolMapping(BaseModel):
    trueValues: list[str] = ['true', 'yes', '1', 't', 'y', '是', '对']
    falseValues: list[str] = ['false', 'no', '0', 'f', 'n', '否', '错']
    caseSensitive: bool = False


class BoolPreviewRequest(BaseModel):
    column: str
    mapping: Optional[BoolMapping] = None
    limit: int = 20


class BoolPreviewRow(BaseModel):
    original: Any
    converted: Any
    status: Literal['true', 'false', 'unmapped', 'null']


class BoolPreviewResult(BaseModel):
    column: str
    totalRows: int
    trueCount: int
    falseCount: int
    unmappedCount: int
    nullCount: int
    samples: list[BoolPreviewRow] = []


class FillNaStrategy(BaseModel):
    enabled: bool = True
    numericMethod: Literal['mean', 'median'] = 'mean'
    textMethod: Literal['mode', 'custom'] = 'mode'
    customValue: Optional[Any] = None


class ColumnRuleFillNa(BaseModel):
    type: Literal['fillna'] = 'fillna'
    column: str
    method: Literal['mean', 'median', 'mode', 'custom'] = 'mean'
    value: Optional[Any] = None


class ColumnRuleNormalizeDates(BaseModel):
    type: Literal['normalize_dates'] = 'normalize_dates'
    column: str
    format: str = '%Y-%m-%d'


class ColumnRuleFixDtype(BaseModel):
    type: Literal['fix_dtype'] = 'fix_dtype'
    column: str
    dtype: Literal['int', 'float', 'string', 'datetime', 'bool'] = 'string'
    mapping: Optional[BoolMapping] = None


class ColumnRuleBoolSemantic(BaseModel):
    type: Literal['bool_semantic'] = 'bool_semantic'
    column: str
    mapping: Optional[BoolMapping] = None


ColumnCleanRule = ColumnRuleFillNa | ColumnRuleNormalizeDates | ColumnRuleFixDtype | ColumnRuleBoolSemantic


class ColumnDiffDetail(BaseModel):
    column: str
    nullsBefore: int = 0
    nullsAfter: int = 0
    nullsDiff: int = 0
    dtypeBefore: str = ''
    dtypeAfter: str = ''
    sampleBefore: list = []
    sampleAfter: list = []


class SmartCleanConfig(BaseModel):
    dropDuplicates: bool = True
    stripSpaces: bool = True
    fillNa: Optional[FillNaStrategy] = FillNaStrategy()
    normalizeDates: bool = False
    dateFormat: str = '%Y-%m-%d'
    autoFixDtypes: bool = False
    columnRules: list[ColumnCleanRule] = []
    usedRecipeId: Optional[str] = None


class StepChangeDetail(BaseModel):
    step: int
    operation: str
    description: str
    before: dict
    after: dict
    diff: dict
    affectedColumns: list[str] = []
    columnDiffs: list[ColumnDiffDetail] = []


class CleaningRecipe(BaseModel):
    id: str = ""
    name: str
    description: str = ""
    config: SmartCleanConfig
    createdAt: float = 0.0


class QualityReport(BaseModel):
    filename: str
    initialStats: dict
    finalStats: dict
    operations: list[HistoryEntry] = []
    stepDetails: list[StepChangeDetail] = []
    summary: dict
    usedRecipe: Optional[dict] = None
