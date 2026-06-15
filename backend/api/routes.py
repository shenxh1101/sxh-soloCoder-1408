from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
import io

from backend.api.schemas import (
    FillNaParams, DropDuplicatesParams, FixDtypeParams,
    NormalizeDatesParams, StripSpacesParams, ReplaceParams,
    RegexExtractParams, SplitColumnParams, MergeColumnsParams, PivotParams,
    BoolPreviewRequest, BoolMapping, SmartCleanConfig,
)
from backend.services.history_service import HistoryService
from backend.services.data_service import DataService
from backend.services.export_service import ExportService
from backend.services.recipe_service import RecipeService


router = APIRouter(prefix='/api', tags=['csv-cleaner'])

history_service = HistoryService()
data_service = DataService()
export_service = ExportService(history_service, data_service)
recipe_service = RecipeService()


class CreateRecipeRequest(BaseModel):
    name: str
    description: str = ''
    config: SmartCleanConfig


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


def _apply_operation(session_id: str, operation: str, description: str, params: dict, new_df, before_df=None):
    diff = None
    if before_df is not None:
        try:
            diff = data_service.get_step_diff(before_df, new_df)
        except Exception:
            diff = None
    entry = history_service.record_operation(session_id, operation, description, params, new_df, diff)
    return _build_response(session_id, {'historyEntry': entry.model_dump() if entry else None})


@router.post('/clean/{session_id}/fillna')
async def fill_na(session_id: str, params: FillNaParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.fill_na(df, params)
    method_map = {'mean': '均值', 'median': '中位数', 'mode': '众数', 'custom': '自定义值'}
    desc = f"填充列 [{params.column}] 的缺失值（{method_map.get(params.method, params.method)}）"
    return _apply_operation(session_id, 'fillna', desc, params.model_dump(), new_df, before_df=df)


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
    return _apply_operation(session_id, 'drop_duplicates', desc, params.model_dump(), new_df, before_df=df)


@router.post('/clean/{session_id}/fix_dtypes')
async def fix_dtypes(session_id: str, params: FixDtypeParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.fix_dtypes(df, params)
    desc = f"修正列 [{params.column}] 的数据类型为 {params.dtype}"
    return _apply_operation(session_id, 'fix_dtypes', desc, params.model_dump(), new_df, before_df=df)


@router.post('/clean/{session_id}/normalize_dates')
async def normalize_dates(session_id: str, params: NormalizeDatesParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.normalize_dates(df, params)
    fmt = params.format or '%Y-%m-%d'
    desc = f"标准化列 [{params.column}] 的日期格式为 {fmt}"
    return _apply_operation(session_id, 'normalize_dates', desc, params.model_dump(), new_df, before_df=df)


@router.post('/clean/{session_id}/strip_spaces')
async def strip_spaces(session_id: str, params: StripSpacesParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.strip_spaces(df, params)
    cols_info = f"（列: {', '.join(params.columns)}）" if params.columns else "（所有文本列）"
    desc = f"去除文本前后空格{cols_info}"
    return _apply_operation(session_id, 'strip_spaces', desc, params.model_dump(), new_df, before_df=df)


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
    return _apply_operation(session_id, 'replace', desc, params.model_dump(), new_df, before_df=df)


@router.post('/advanced/{session_id}/regex_extract')
async def regex_extract(session_id: str, params: RegexExtractParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.regex_extract(df, params)
    desc = f"从列 [{params.column}] 用正则提取到新列 [{params.newColumn}]"
    return _apply_operation(session_id, 'regex_extract', desc, params.model_dump(), new_df, before_df=df)


@router.post('/advanced/{session_id}/split_column')
async def split_column(session_id: str, params: SplitColumnParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.split_column(df, params)
    desc = f"拆分列 [{params.column}] 为 {', '.join(params.newColumns)}"
    return _apply_operation(session_id, 'split_column', desc, params.model_dump(), new_df, before_df=df)


@router.post('/advanced/{session_id}/merge_columns')
async def merge_columns(session_id: str, params: MergeColumnsParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.merge_columns(df, params)
    desc = f"合并列 [{', '.join(params.columns)}] 为新列 [{params.newColumn}]"
    return _apply_operation(session_id, 'merge_columns', desc, params.model_dump(), new_df, before_df=df)


@router.post('/advanced/{session_id}/pivot')
async def pivot_table(session_id: str, params: PivotParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    new_df = data_service.pivot(df, params)
    desc = f"生成透视表（索引: {params.index}, 列: {params.columns}, 值: {params.values}, 聚合: {params.aggFunc}）"
    return _apply_operation(session_id, 'pivot', desc, params.model_dump(), new_df, before_df=df)


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


@router.post('/clean/{session_id}/bool_preview')
async def bool_preview(session_id: str, params: BoolPreviewRequest):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    result = data_service.bool_preview(df, params)
    return result.model_dump()


@router.post('/clean/{session_id}/fix_bool')
async def fix_bool(session_id: str, params: FixDtypeParams):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    mapping_raw = params.__dict__.get('mapping', None)
    mapping = BoolMapping(**mapping_raw) if mapping_raw else BoolMapping()
    new_df = data_service.fix_bool_semantic(df, params.column, mapping)
    desc = f"列 [{params.column}] 按语义转换为布尔类型"
    return _apply_operation(session_id, 'fix_bool_semantic', desc, params.model_dump(), new_df, before_df=df)


@router.post('/clean/{session_id}/smart_clean')
async def smart_clean(session_id: str, config: SmartCleanConfig):
    df = history_service.get_current_df(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail='会话不存在')
    steps = data_service.smart_clean(df, config)
    entries_info = []
    before = df
    for op, desc, params_dict, new_df in steps:
        try:
            diff = data_service.get_step_diff(before, new_df)
        except Exception:
            diff = None
        entry = history_service.record_operation(session_id, op, desc, params_dict, new_df, diff)
        if entry:
            entries_info.append({'step': len(entries_info) + 1, 'id': entry.id, 'description': desc, 'operation': op})
        before = new_df
    if config.usedRecipeId:
        r = recipe_service.get(config.usedRecipeId)
        if r:
            history_service.set_used_recipe(session_id, {'id': r.id, 'name': r.name, 'description': r.description})
    return _build_response(session_id, {'smartCleanSteps': entries_info})


@router.get('/recipes')
async def list_recipes():
    return [r.model_dump() for r in recipe_service.list()]


@router.get('/recipes/{recipe_id}')
async def get_recipe(recipe_id: str):
    r = recipe_service.get(recipe_id)
    if r is None:
        raise HTTPException(status_code=404, detail='配方不存在')
    return r.model_dump()


@router.post('/recipes')
async def create_recipe(req: CreateRecipeRequest):
    r = recipe_service.create(req.name, req.description, req.config)
    return r.model_dump()


@router.delete('/recipes/{recipe_id}')
async def delete_recipe(recipe_id: str):
    ok = recipe_service.delete(recipe_id)
    if not ok:
        raise HTTPException(status_code=400, detail='删除失败（内置配方不可删除或配方不存在）')
    return {'success': True}


@router.get('/recipes/{recipe_id}/summary')
async def get_recipe_summary(recipe_id: str):
    s = recipe_service.summarize(recipe_id)
    if s is None:
        raise HTTPException(status_code=404, detail='配方不存在')
    return s


@router.get('/recipes/{recipe_id}/export')
async def export_recipe(recipe_id: str):
    data = recipe_service.export_dict(recipe_id)
    if data is None:
        raise HTTPException(status_code=404, detail='配方不存在')
    import json
    content = json.dumps(data, ensure_ascii=False, indent=2)
    filename = f"recipe_{recipe_id}.json"
    return Response(
        content=content,
        media_type='application/json',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'}
    )


@router.post('/recipes/import')
async def import_recipe(file: UploadFile = File(...)):
    try:
        content = await file.read()
        import json
        data = json.loads(content.decode('utf-8'))
        r = recipe_service.import_from_dict(data)
        if r is None:
            raise HTTPException(status_code=400, detail='配方文件格式不正确')
        return r.model_dump()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f'导入失败: {str(e)}')


@router.get('/data/{session_id}/snapshot/{step_index}')
async def get_snapshot(session_id: str, step_index: int):
    df = history_service.get_snapshot_by_index(session_id, step_index)
    if df is None:
        raise HTTPException(status_code=404, detail='快照不存在')
    records, cols = data_service.df_to_records(df)
    detection = data_service.detect(df)
    return {
        'stepIndex': step_index,
        'data': records,
        'columns': cols,
        'detection': detection.model_dump(),
    }


@router.get('/data/{session_id}/step_diff/{step_index}')
async def get_step_diff(session_id: str, step_index: int):
    diff = history_service.get_step_diff_by_index(session_id, step_index)
    if diff is None:
        raise HTTPException(status_code=404, detail='步骤不存在')
    return diff


@router.post('/clean/{session_id}/apply_recipe/{recipe_id}')
async def apply_recipe(session_id: str, recipe_id: str):
    r = recipe_service.get(recipe_id)
    if r is None:
        raise HTTPException(status_code=404, detail='配方不存在')
    history_service.set_used_recipe(session_id, {'id': r.id, 'name': r.name, 'description': r.description})
    return await smart_clean(session_id, r.config)
