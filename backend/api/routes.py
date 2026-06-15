from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse, Response
import io

from backend.api.schemas import (
    FillNaParams, DropDuplicatesParams, FixDtypeParams,
    NormalizeDatesParams, StripSpacesParams, ReplaceParams,
    RegexExtractParams, SplitColumnParams, MergeColumnsParams, PivotParams
)
from backend.services.history_service import HistoryService
from backend.services.data_service import DataService
from backend.services.export_service import ExportService


router = APIRouter(prefix='/api', tags=['csv-cleaner'])

history_service = HistoryService()
data_service = DataService()
export_service = ExportService(history_service, data_service)


def _build_response(session_id: str, extra=None):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    records, cols = data_service.df_to_records(df)
    detection = data_service.detect(df)
    history = history_service.get_history(session_id)
    session = history_service.get_session(session_id)
    result = {
        'data': records,
        'columns': cols,
        'detection': detection.model_dump(),
        'history': [h.model_dump() for h in history],
        'currentStep': session['current_step'] if session else 0
    }
    if extra:
        result.update(extra)
    return result


@router.post('/upload')
async def upload_file(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail='请上传 CSV 文件')
    content = await file.read()
    try:
        df = data_service.parse_csv(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f'CSV 解析失败: {str(e)}')
    session_id = history_service.create_session(file.filename, df)
    result = _build_response(session_id)
    result['sessionId'] = session_id
    result['filename'] = file.filename
    return result


@router.get('/data/{session_id}')
async def get_data(session_id: str):
    return _build_response(session_id)


@router.get('/data/{session_id}/detect')
async def detect_data(session_id: str):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    return data_service.detect(df).model_dump()


def _apply_operation(session_id: str, operation: str, description: str, params: dict, new_df):
    entry = history_service.record_operation(session_id, operation, description, params, new_df)
    return _build_response(session_id, {'historyEntry': entry.model_dump() if entry else None})


@router.post('/clean/{session_id}/fillna')
async def fill_na(session_id: str, params: FillNaParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.fill_na(df, params)
    method_map = {'mean': '均值', 'median': '中位数', 'mode': '众数', 'custom': '自定义值'}
    desc = f"填充列 [{params.column}] 的缺失值（{method_map.get(params.method, params.method)}）"
    return _apply_operation(session_id, 'fillna', desc, params.model_dump(), new_df)


@router.post('/clean/{session_id}/drop_duplicates')
async def drop_duplicates(session_id: str, params: DropDuplicatesParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    old_count = len(df)
    new_df = data_service.drop_duplicates(df, params)
    new_count = len(new_df)
    subset_info = f"（列: {', '.join(params.subset)}）" if params.subset else ""
    desc = f"删除重复行{subset_info}，共移除 {old_count - new_count} 行"
    return _apply_operation(session_id, 'drop_duplicates', desc, params.model_dump(), new_df)


@router.post('/clean/{session_id}/fix_dtypes')
async def fix_dtypes(session_id: str, params: FixDtypeParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.fix_dtypes(df, params)
    desc = f"修正列 [{params.column}] 的数据类型为 {params.dtype}"
    return _apply_operation(session_id, 'fix_dtypes', desc, params.model_dump(), new_df)


@router.post('/clean/{session_id}/normalize_dates')
async def normalize_dates(session_id: str, params: NormalizeDatesParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.normalize_dates(df, params)
    fmt = params.format or '%Y-%m-%d'
    desc = f"标准化列 [{params.column}] 的日期格式为 {fmt}"
    return _apply_operation(session_id, 'normalize_dates', desc, params.model_dump(), new_df)


@router.post('/clean/{session_id}/strip_spaces')
async def strip_spaces(session_id: str, params: StripSpacesParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.strip_spaces(df, params)
    cols_info = f"（列: {', '.join(params.columns)}）" if params.columns else "（所有文本列）"
    desc = f"去除文本前后空格{cols_info}"
    return _apply_operation(session_id, 'strip_spaces', desc, params.model_dump(), new_df)


@router.post('/advanced/{session_id}/replace')
async def replace_values(session_id: str, params: ReplaceParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.replace_values(df, params)
    cond_info = ""
    if params.condition:
        cond_info = f"（条件: {params.condition.op} {params.condition.value}）"
    desc = f"在列 [{params.column}] 中批量替换值{cond_info}"
    return _apply_operation(session_id, 'replace', desc, params.model_dump(), new_df)


@router.post('/advanced/{session_id}/regex_extract')
async def regex_extract(session_id: str, params: RegexExtractParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.regex_extract(df, params)
    desc = f"从列 [{params.column}] 用正则提取到新列 [{params.newColumn}]"
    return _apply_operation(session_id, 'regex_extract', desc, params.model_dump(), new_df)


@router.post('/advanced/{session_id}/split_column')
async def split_column(session_id: str, params: SplitColumnParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.split_column(df, params)
    desc = f"拆分列 [{params.column}] 为 {', '.join(params.newColumns)}"
    return _apply_operation(session_id, 'split_column', desc, params.model_dump(), new_df)


@router.post('/advanced/{session_id}/merge_columns')
async def merge_columns(session_id: str, params: MergeColumnsParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.merge_columns(df, params)
    desc = f"合并列 [{', '.join(params.columns)}] 为新列 [{params.newColumn}]"
    return _apply_operation(session_id, 'merge_columns', desc, params.model_dump(), new_df)


@router.post('/advanced/{session_id}/pivot')
async def pivot_table(session_id: str, params: PivotParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.pivot(df, params)
    desc = f"生成透视表（索引: {params.index}, 列: {params.columns}, 值: {params.values}, 聚合: {params.aggFunc}）"
    return _apply_operation(session_id, 'pivot', desc, params.model_dump(), new_df)


@router.post('/history/{session_id}/undo')
async def undo(session_id: str):
    result = history_service.undo(session_id)
    if result is None:
        raise HTTPException(status_code=400, detail='无法撤销')
    return _build_response(session_id)


@router.post('/history/{session_id}/redo')
async def redo(session_id: str):
    result = history_service.redo(session_id)
    if result is None:
        raise HTTPException(status_code=400, detail='无法重做')
    return _build_response(session_id)


@router.get('/export/{session_id}/csv')
async def export_csv(session_id: str):
    data = export_service.export_csv(session_id)
    if data is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    filename = history_service.get_filename(session_id)
    base = filename.rsplit('.', 1)[0] if filename else 'data'
    return StreamingResponse(
        io.BytesIO(data),
        media_type='text/csv',
        headers={'Content-Disposition': f'attachment; filename="{base}_cleaned.csv"'}
    )


@router.get('/export/{session_id}/excel')
async def export_excel(session_id: str):
    data = export_service.export_excel(session_id)
    if data is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    filename = history_service.get_filename(session_id)
    base = filename.rsplit('.', 1)[0] if filename else 'data'
    return StreamingResponse(
        io.BytesIO(data),
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': f'attachment; filename="{base}_cleaned.xlsx"'}
    )


@router.get('/export/{session_id}/report')
async def get_report(session_id: str):
    report = export_service.generate_report(session_id)
    if report is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    return report.model_dump()
