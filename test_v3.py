import requests
import json
import io

BASE = 'http://127.0.0.1:8000/api'

sample_csv = """姓名,年龄,城市,入职日期,薪资,部门,邮箱,是否在职
 张三 ,28,北京,2021/03/15,15000,技术部,zhangsan@example.com,是
 李四 ,35,上海,2020-07-22,20000,市场部,lisi@example.com,Yes
王五,,广州,2019.05.10,18000,技术部,wangwu@example.com,true
赵六,42,深圳,2018/09/01,,人事部,zhaoliu@example.com,1
钱七,31,杭州,2022-01-20,16000,财务部,,否
 张三 ,28,北京,2021/03/15,15000,技术部,zhangsan@example.com,是
孙八,29,成都,2021.11.05,14500,技术部,sunba@example.com,NO
周九,,武汉,2020/03/18,17000,市场部,zhoujiu@example.com,False
吴十,45,南京,2019-06-30,25000,财务部,wushi@example.com,0
郑十一,33,西安,2021-08-12,15500,人事部,,是
E004,38,重庆,2020.12.25,22000,技术部,e004@example.com,对
E005,,苏州,2022/05/09,19000,市场部,e005@example.com,错
"""

total = 0
passed = 0

def check(name, cond, detail=''):
    global total, passed
    total += 1
    if cond:
        passed += 1
        print(f'  ✓ {name}')
    else:
        print(f'  ✗ {name}  --- 失败: {detail}')

def upload():
    files = {'file': ('test.csv', sample_csv.encode('utf-8'), 'text/csv')}
    r = requests.post(f'{BASE}/upload', files=files, timeout=20)
    return r.json()

# ============= 测试 1：列级规则批量执行 =============
print('\n=== 测试 1：列级规则批量执行 ===')
d = upload()
sid = d['sessionId']
check('获取 sessionId', bool(sid))

r = requests.post(f'{BASE}/clean/{sid}/smart_clean', json={
    'dropDuplicates': True,
    'stripSpaces': True,
    'fillNa': None,
    'normalizeDates': False,
    'autoFixDtypes': False,
    'columnRules': [
        {'type': 'fillna', 'column': '年龄', 'method': 'mean'},
        {'type': 'fillna', 'column': '薪资', 'method': 'median'},
        {'type': 'normalize_dates', 'column': '入职日期', 'format': '%Y-%m-%d'},
    ],
}, timeout=20)
check('smart_clean 带 columnRules 200', r.status_code == 200, str(r.status_code) + r.text[:200])
sc = r.json()
steps = sc.get('smartCleanSteps', [])
hist = sc.get('history', [])
check('columnRules 步骤数 >= 3', len(steps) >= 3, f'实际 {len(steps)} 步')
check('历史记录 >= 5 条（去重+去空格+3条列规则）', len(hist) >= 5)

det = sc.get('detection', {})
cols = {c['name']: c for c in det.get('columns', [])}
check('年龄列缺失数为 0', cols.get('年龄', {}).get('nullCount', -1) == 0, str(cols.get('年龄', {}).get('nullCount')))
check('薪资列缺失数为 0', cols.get('薪资', {}).get('nullCount', -1) == 0, str(cols.get('薪资', {}).get('nullCount')))

# ============= 测试 2：按步骤索引获取快照 =============
print('\n=== 测试 2：按步骤索引获取快照 ===')
r0 = requests.get(f'{BASE}/data/{sid}/snapshot/0', timeout=20)
check('快照 0（初始）200', r0.status_code == 200)
s0 = r0.json()
check('初始数据行数 = 12', len(s0['data']) == 12)

n = len(hist)
r_last = requests.get(f'{BASE}/data/{sid}/snapshot/{n}', timeout=20)
check(f'快照 {n}（最终）200', r_last.status_code == 200)
s_last = r_last.json()
check(f'最终数据行数 = {len(sc["data"])}', len(s_last['data']) == len(sc['data']))

r_invalid = requests.get(f'{BASE}/data/{sid}/snapshot/999', timeout=20)
check('不存在的快照返回 404', r_invalid.status_code == 404)

# ============= 测试 3：步骤 diff 含 affectedColumns / columnDiffs =============
print('\n=== 测试 3：步骤 diff 含列级详情 ===')
r_diff = requests.get(f'{BASE}/data/{sid}/step_diff/0', timeout=20)
check('step_diff/0 200', r_diff.status_code == 200)
diff0 = r_diff.json()
check('含 affectedColumns 字段', 'affectedColumns' in diff0)
check('含 columnDiffs 字段', 'columnDiffs' in diff0)

# 找一个 fillna 的步骤，看 diff
for i, h in enumerate(hist):
    if h['operation'] == 'fillna' and '年龄' in h['description']:
        rd = requests.get(f'{BASE}/data/{sid}/step_diff/{i}', timeout=20)
        check(f'步骤 {i} (fillna 年龄) 200', rd.status_code == 200)
        d = rd.json()
        check('fillna 后 nulls diff 为负（减少）', d.get('nulls', {}).get('diff', 0) < 0)
        aff = d.get('affectedColumns', [])
        check('affectedColumns 包含 年龄', '年龄' in aff, str(aff))
        cds = d.get('columnDiffs', [])
        check('columnDiffs 非空', len(cds) > 0)
        age_cd = next((c for c in cds if c['column'] == '年龄'), None)
        check('年龄列 diff 存在', age_cd is not None)
        if age_cd:
            check('年龄 nullsDiff < 0', age_cd.get('nullsDiff', 0) < 0)
        break

# ============= 测试 4：配方摘要（预览） =============
print('\n=== 测试 4：配方摘要预览 ===')
r_sum = requests.get(f'{BASE}/recipes/default/summary', timeout=20)
check('default 配方摘要 200', r_sum.status_code == 200)
s = r_sum.json()
check('含 steps 数组', 'steps' in s and isinstance(s['steps'], list))
check('含 stepCount', 'stepCount' in s)
check('步骤数 > 0', s['stepCount'] > 0)
check('含 name / description', s.get('name') and s.get('description'))

r_sum_bad = requests.get(f'{BASE}/recipes/nonexistent/summary', timeout=20)
check('不存在配方摘要返回 404', r_sum_bad.status_code == 404)

# ============= 测试 5：配方导出 =============
print('\n=== 测试 5：配方导出 ===')
r_exp = requests.get(f'{BASE}/recipes/default/export', timeout=20)
check('配方导出 200', r_exp.status_code == 200)
check('Content-Type 是 json', 'json' in r_exp.headers.get('Content-Type', ''))
exp_data = r_exp.json()
check('导出含 name 字段', 'name' in exp_data)
check('导出含 config 字段', 'config' in exp_data)
check('导出含 version 字段', 'version' in exp_data)
check('config 含 dropDuplicates', 'dropDuplicates' in exp_data.get('config', {}))

r_exp_bad = requests.get(f'{BASE}/recipes/nonexistent/export', timeout=20)
check('不存在配方导出返回 404', r_exp_bad.status_code == 404)

# ============= 测试 6：配方导入 =============
print('\n=== 测试 6：配方导入 ===')
test_recipe = {
    'name': '测试导入配方',
    'description': '从 JSON 导入的配方',
    'config': {
        'dropDuplicates': True,
        'stripSpaces': False,
        'fillNa': {'enabled': True, 'numericMethod': 'median', 'textMethod': 'custom', 'customValue': 'N/A'},
        'normalizeDates': True,
        'dateFormat': '%Y/%m/%d',
        'autoFixDtypes': False,
        'columnRules': [
            {'type': 'fillna', 'column': '年龄', 'method': 'mean'},
        ],
    },
}
files = {'file': ('test_recipe.json', json.dumps(test_recipe, ensure_ascii=False).encode('utf-8'), 'application/json')}
r_imp = requests.post(f'{BASE}/recipes/import', files=files, timeout=20)
check('配方导入 200', r_imp.status_code == 200, str(r_imp.status_code) + r_imp.text[:200])
imp = r_imp.json()
check('导入配方有 id', 'id' in imp and imp['id'])
check('导入配方 name 正确', '导入' in imp.get('name', ''))
imported_id = imp['id']

# 验证导入的配方能被获取
r_get = requests.get(f'{BASE}/recipes/{imported_id}', timeout=20)
check('导入后可查询', r_get.status_code == 200)
g = r_get.json()
check('columnRules 被正确保存', len(g.get('config', {}).get('columnRules', [])) == 1)

# 测试套用导入的配方
d2 = upload()
sid2 = d2['sessionId']
r_apply = requests.post(f'{BASE}/clean/{sid2}/apply_recipe/{imported_id}', timeout=20)
check('套用导入配方 200', r_apply.status_code == 200, str(r_apply.status_code) + r_apply.text[:200])
apply_res = r_apply.json()
check('套用后 history 非空', len(apply_res.get('history', [])) > 0)

# 清理：删除导入的配方
r_del = requests.delete(f'{BASE}/recipes/{imported_id}', timeout=20)
check('删除导入配方 200', r_del.status_code == 200)

# 测试导入坏文件
bad_files = {'file': ('bad.json', b'not json{{{', 'application/json')}
r_bad = requests.post(f'{BASE}/recipes/import', files=bad_files, timeout=20)
check('坏文件导入返回 4xx', 400 <= r_bad.status_code < 500)

# ============= 测试 7：质量报告 stepDetails 含列级详情 =============
print('\n=== 测试 7：质量报告 stepDetails 含列级详情 ===')
d3 = upload()
sid3 = d3['sessionId']
requests.post(f'{BASE}/clean/{sid3}/smart_clean', json={
    'dropDuplicates': True,
    'stripSpaces': True,
    'fillNa': {'enabled': True, 'numericMethod': 'mean', 'textMethod': 'mode'},
    'normalizeDates': True,
    'autoFixDtypes': False,
}, timeout=20)
r_rep = requests.get(f'{BASE}/export/{sid3}/report', timeout=20)
check('报告 200', r_rep.status_code == 200)
rep = r_rep.json()
sds = rep.get('stepDetails', [])
check('stepDetails 非空', len(sds) > 0)
sd0 = sds[0]
check('stepDetail 含 affectedColumns', 'affectedColumns' in sd0)
check('stepDetail 含 columnDiffs', 'columnDiffs' in sd0)

# ============= 总结 =============
print(f'\n===================== 总计：通过 {passed}，失败 {total - passed} =====================')
