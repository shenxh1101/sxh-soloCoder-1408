import json
import os
import time
import uuid
from typing import Optional
from backend.api.schemas import CleaningRecipe, SmartCleanConfig


class RecipeService:
    def __init__(self, storage_path: str = 'recipes.json'):
        self._storage = storage_path
        self._recipes: dict[str, CleaningRecipe] = {}
        self._load()

    def _load(self):
        if os.path.exists(self._storage):
            try:
                with open(self._storage, 'r', encoding='utf-8') as f:
                    raw = json.load(f)
                for item in raw:
                    cfg = SmartCleanConfig(**item.get('config', {}))
                    r = CleaningRecipe(
                        id=item.get('id', ''),
                        name=item.get('name', '未命名'),
                        description=item.get('description', ''),
                        config=cfg,
                        createdAt=item.get('createdAt', 0.0),
                    )
                    self._recipes[r.id] = r
            except Exception:
                pass
        if 'default' not in self._recipes:
            default_cfg = SmartCleanConfig()
            self._recipes['default'] = CleaningRecipe(
                id='default',
                name='标准清洗配方',
                description='去重+去空格+智能填充缺失值，适合一般场景',
                config=default_cfg,
                createdAt=time.time(),
            )
            hr_cfg = SmartCleanConfig(
                dropDuplicates=True,
                stripSpaces=True,
                fillNa=None,
                normalizeDates=True,
                dateFormat='%Y-%m-%d',
                autoFixDtypes=True,
            )
            self._recipes['hr_basic'] = CleaningRecipe(
                id='hr_basic',
                name='人事数据清洗',
                description='自动修正日期和类型，标准化入职日期格式',
                config=hr_cfg,
                createdAt=time.time(),
            )
            self._save()

    def _save(self):
        try:
            raw = [r.model_dump() for r in self._recipes.values()]
            with open(self._storage, 'w', encoding='utf-8') as f:
                json.dump(raw, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def list(self) -> list[CleaningRecipe]:
        return list(self._recipes.values())

    def get(self, recipe_id: str) -> Optional[CleaningRecipe]:
        return self._recipes.get(recipe_id)

    def create(self, name: str, description: str, config: SmartCleanConfig) -> CleaningRecipe:
        r = CleaningRecipe(
            id=str(uuid.uuid4()),
            name=name,
            description=description,
            config=config,
            createdAt=time.time(),
        )
        self._recipes[r.id] = r
        self._save()
        return r

    def delete(self, recipe_id: str) -> bool:
        if recipe_id in ('default', 'hr_basic'):
            return False
        if recipe_id in self._recipes:
            del self._recipes[recipe_id]
            self._save()
            return True
        return False

    def export_dict(self, recipe_id: str) -> Optional[dict]:
        r = self._recipes.get(recipe_id)
        if not r:
            return None
        return {
            'name': r.name,
            'description': r.description,
            'config': r.config.model_dump(),
            'version': 1,
            'exportedAt': time.time(),
        }

    def import_from_dict(self, data: dict) -> Optional[CleaningRecipe]:
        try:
            name = data.get('name', '导入配方')
            desc = data.get('description', '')
            cfg_raw = data.get('config', {})
            cfg = SmartCleanConfig(**cfg_raw)
            r = CleaningRecipe(
                id=str(uuid.uuid4()),
                name=name + ' (导入)',
                description=desc,
                config=cfg,
                createdAt=time.time(),
            )
            self._recipes[r.id] = r
            self._save()
            return r
        except Exception:
            return None

    def summarize(self, recipe_id: str) -> Optional[dict]:
        r = self._recipes.get(recipe_id)
        if not r:
            return None
        cfg = r.config
        steps: list[dict] = []
        if cfg.stripSpaces:
            steps.append({'key': 'strip_spaces', 'label': '去除文本列前后空格', 'detail': '所有文本列', 'category': 'basic'})
        if cfg.dropDuplicates:
            steps.append({'key': 'drop_duplicates', 'label': '删除重复行', 'detail': '完全相同的行只保留第一条', 'category': 'basic'})
        if cfg.fillNa and cfg.fillNa.enabled:
            steps.append({
                'key': 'fill_na',
                'label': '智能填充缺失值',
                'detail': f"数值列: {cfg.fillNa.numericMethod}，文本列: {cfg.fillNa.textMethod}",
                'category': 'basic',
            })
        if cfg.normalizeDates:
            steps.append({'key': 'normalize_dates', 'label': '统一日期格式', 'detail': cfg.dateFormat, 'category': 'basic'})
        if cfg.autoFixDtypes:
            steps.append({'key': 'auto_fix_dtypes', 'label': '自动修正数据类型', 'detail': '数值/文本自动识别', 'category': 'basic'})
        if cfg.columnRules and len(cfg.columnRules) > 0:
            for idx, cr in enumerate(cfg.columnRules):
                if cr.type == 'fillna':
                    detail = f"列 [{cr.column}] 缺失值 → {cr.method}" + (f": {cr.value}" if cr.method == 'custom' and cr.value is not None else "")
                    steps.append({'key': f'cr_fillna_{idx}', 'label': '列级·缺失值填充', 'detail': detail, 'category': 'column', 'ruleIndex': idx})
                elif cr.type == 'normalize_dates':
                    steps.append({'key': f'cr_normdates_{idx}', 'label': '列级·统一日期格式', 'detail': f"列 [{cr.column}] → {cr.format}", 'category': 'column', 'ruleIndex': idx})
                elif cr.type == 'fix_dtype':
                    extra = ""
                    if cr.dtype == 'bool' and cr.mapping:
                        extra = f" 真值:{len(cr.mapping.trueValues)}项/假值:{len(cr.mapping.falseValues)}项"
                    steps.append({'key': f'cr_fixdtype_{idx}', 'label': '列级·类型修正', 'detail': f"列 [{cr.column}] → {cr.dtype}{extra}", 'category': 'column', 'ruleIndex': idx})
                elif cr.type == 'bool_semantic':
                    steps.append({'key': f'cr_boolsem_{idx}', 'label': '列级·语义化布尔', 'detail': f"列 [{cr.column}] 自定义映射", 'category': 'column', 'ruleIndex': idx})
        return {
            'id': r.id,
            'name': r.name,
            'description': r.description,
            'stepCount': len(steps),
            'steps': steps,
            'config': cfg.model_dump(),
        }
