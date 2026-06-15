import requests
import os
import io
import pandas as pd

BASE = 'http://127.0.0.1:8000/api'

sample_csv = '''编号,姓名,年龄,部门,入职日期,是否在职,薪资
E001, 张三 ,28,技术部,2021/03/15,是,18000
E002,李四,,市场部,2020-07-22,Yes,
E003,王五,35,技术部,2019.05.10,true,25000
E004,赵六,28,技术部,2021/03/15,1,18000
E005,钱七,42,人事部,2017-11-03,否,20000
E006,孙八,,财务部,2018/06/18,0,
E007, 周九 ,31,市场部,2022.01.25,NO,16500
E008,吴十,29,技术部,2021/09/08,False,19000
E009,郑十一,33,人事部,,是,21000
E010,冯十二,27,财务部,2023-02-14,yes,
E011,陈十三,36,技术部,2019/08/30,1,28000
E012,褚十四,30,市场部,2021.12.05,,17500
'''

passed = 0
failed = 0

def check(name, cond, detail=''):
    global passed, failed
    if cond:
        passed += 1
        print(f'  ✓ {name}')
    else:
        failed += 1
        print(f'  ✗ {name} {detail}')

def upload():
    files = {'file': ('sample_v2.csv', sample_csv.encode('utf-8'), 'text/csv')}
    r = requests.post(f'{BASE}/upload', files=files, timeout=15)
    assert r.status_code == 200, f'upload failed {r.status_code}'
    return r.json()

print('\n=== 测试启动：上传 ===')
data = upload()
sid = data['sessionId']
check('获取 sessionId', bool(sid))
check('数据行数 = 12', len(data['data']) == 12, f"实际 {len(data['data'])}")
check('列数 = 7', len(data['columns']) == 7)

print('\n=== 测试 1：配方列表 ===')
r = requests.get(f'{BASE}/recipes', timeout=10)
check('GET /recipes 200', r.status_code == 200, str(r.status_code))
recipes = r.json()
check('至少 2 个内置配方', len(recipes) >= 2)
names = [x['name'] for x in recipes]
check('包含 标准清洗配方', '标准清洗配方' in names)
check('包含 人事数据清洗', '人事数据清洗' in names)

print('\n=== 测试 2：布尔预览 ===')
r = requests.post(f'{BASE}/clean/{sid}/bool_preview', json={
    'column': '是否在职',
    'mapping': {
        'trueValues': ['true', 'yes', '1', '是', '对'],
        'falseValues': ['false', 'no', '0', '否', '错'],
        'caseSensitive': False,
    },
    'limit': 12,
}, timeout=15)
check('bool_preview 200', r.status_code == 200, str(r.status_code) + r.text[:100])
bp = r.json()
check('真 > 0 个', bp['trueCount'] > 0)
check('假 > 0 个', bp['falseCount'] > 0)
check('samples 有值', len(bp.get('samples', [])) > 0)
if bp.get('samples'):
    check('sample 含 original', 'original' in bp['samples'][0])
    check('sample 含 converted', 'converted' in bp['samples'][0])
    check('sample 含 status', 'status' in bp['samples'][0])

print('\n=== 测试 3：智能清洗（默认配置，含 去重+去空格+填充） ===')
r = requests.post(f'{BASE}/clean/{sid}/smart_clean', json={
    'dropDuplicates': True,
    'stripSpaces': True,
    'fillNa': {
        'enabled': True,
        'numericMethod': 'mean',
        'textMethod': 'mode',
    },
    'normalizeDates': False,
    'dateFormat': '%Y-%m-%d',
    'autoFixDtypes': False,
}, timeout=20)
check('smart_clean 200', r.status_code == 200, str(r.status_code) + r.text[:150])
sc = r.json()
check('返回 smartCleanSteps', 'smartCleanSteps' in sc)
check('至少执行 3 步', len(sc.get('smartCleanSteps', [])) >= 3, str(sc.get('smartCleanSteps', [])))
check('历史记录 >= 3 条', len(sc.get('history', [])) >= 3, str(len(sc.get('history', []))))
# 去重后 <= 11 行（原来 12 行，E001/E004 其中一对重复）
check('去重后行数减少或不变', len(sc['data']) <= 12)

print('\n=== 测试 4：语义布尔转换 ===')
# 重新上传一个 session 避免重复
data2 = upload()
sid2 = data2['sessionId']
r = requests.post(f'{BASE}/clean/{sid2}/fix_bool', json={
    'column': '是否在职',
    'dtype': 'bool',
    'mapping': {
        'trueValues': ['true', 'yes', '1', '是', '对'],
        'falseValues': ['false', 'no', '0', '否', '错'],
        'caseSensitive': False,
    },
}, timeout=15)
check('fix_bool 200', r.status_code == 200, str(r.status_code) + r.text[:150])
fb = r.json()
check('列值中出现 bool', any(type(rr.get('是否在职')) == bool for rr in fb['data'][:5]))

print('\n=== 测试 5：质量报告（含每步详情） ===')
r = requests.get(f'{BASE}/export/{sid}/report', timeout=15)
check('report 200', r.status_code == 200, str(r.status_code))
rep = r.json()
check('含 stepDetails', 'stepDetails' in rep)
check('stepDetails 数量 = 历史数量', len(rep['stepDetails']) == len(rep['operations']),
      f"stepDetails {len(rep['stepDetails'])} vs ops {len(rep['operations'])}")
check('含 initialStats / finalStats', 'initialStats' in rep and 'finalStats' in rep)
if rep['stepDetails']:
    s0 = rep['stepDetails'][0]
    check('单步含 before', 'before' in s0)
    check('单步含 after', 'after' in s0)
    check('单步含 diff', 'diff' in s0)
    check('单步含 operation', 'operation' in s0)

print('\n=== 测试 6：保存 + 删除配方 ===')
r = requests.post(f'{BASE}/recipes', json={
    'name': '我的财务配方',
    'description': '测试用',
    'config': {
        'dropDuplicates': True,
        'stripSpaces': True,
        'fillNa': {'enabled': True, 'numericMethod': 'median', 'textMethod': 'custom', 'customValue': 'N/A'},
        'normalizeDates': True,
        'dateFormat': '%Y/%m/%d',
        'autoFixDtypes': True,
    },
}, timeout=10)
check('POST /recipes 200', r.status_code == 200, str(r.status_code) + r.text[:120])
new_recipe = r.json()
check('配方有 id', bool(new_recipe.get('id')))
check('配方 name 正确', new_recipe.get('name') == '我的财务配方')
new_id = new_recipe['id']

# 列表中能找到
r2 = requests.get(f'{BASE}/recipes', timeout=10).json()
ids = [x['id'] for x in r2]
check('列表中出现新配方', new_id in ids)

# 套用配方
r3 = requests.post(f'{BASE}/clean/{sid2}/apply_recipe/{new_id}', json={}, timeout=20)
check('套用配方 200', r3.status_code == 200, str(r3.status_code) + r3.text[:150])
ar = r3.json()
check('套用后 history >= 2', len(ar.get('history', [])) >= 2)

# 检查报告中的 usedRecipe
r4 = requests.get(f'{BASE}/export/{sid2}/report', timeout=10)
rep2 = r4.json()
check('报告含 usedRecipe', 'usedRecipe' in rep2 and rep2.get('usedRecipe') is not None,
      f"实际 usedRecipe = {rep2.get('usedRecipe')}")
if rep2.get('usedRecipe'):
    check('usedRecipe 名称匹配', rep2['usedRecipe'].get('name') == '我的财务配方')

# 删除配方
r5 = requests.delete(f'{BASE}/recipes/{new_id}', timeout=10)
check('DELETE /recipes 200', r5.status_code == 200, str(r5.status_code) + r5.text[:80])

r6 = requests.get(f'{BASE}/recipes', timeout=10).json()
ids2 = [x['id'] for x in r6]
check('删除后列表不再含该配方', new_id not in ids2)

print('\n=== 测试 7：尝试删除内置配方（应失败） ===')
r7 = requests.delete(f'{BASE}/recipes/default', timeout=10)
check('删除内置 default 返回 4xx', r7.status_code >= 400, f'实际 {r7.status_code}')

# 再次列出，确保仍然在
r8 = requests.get(f'{BASE}/recipes', timeout=10).json()
ids3 = [x['id'] for x in r8]
check('删除失败后 default 仍在', 'default' in ids3)

print('\n=== 测试 8：质量评分和导出 ===')
r9 = requests.get(f'{BASE}/export/{sid}/csv', timeout=10)
check('CSV 导出 200', r9.status_code == 200)
check('CSV 有内容长度', len(r9.content) > 100)

r10 = requests.get(f'{BASE}/export/{sid}/excel', timeout=10)
check('Excel 导出 200', r10.status_code == 200)
check('Excel 有内容长度', len(r10.content) > 100)

check('报告质量分有值', 0 <= rep['summary']['qualityScore'] <= 100,
      f"分 = {rep['summary']['qualityScore']}")

print(f'\n===================== 总计：通过 {passed}，失败 {failed} =====================')
