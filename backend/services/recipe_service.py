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
