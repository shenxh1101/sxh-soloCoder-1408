import requests
import json

print("=" * 60)
print("CSV Data Cleaner - API 集成测试")
print("=" * 60)

BASE = "http://localhost:8000"

# 1. 测试健康检查
print("\n[1] 健康检查...")
r = requests.get(f"{BASE}/api/health")
assert r.status_code == 200, f"Health check failed: {r.text}"
print("  OK:", r.json())

# 2. 测试上传 CSV
print("\n[2] 上传 CSV 文件...")
with open("sample_data.csv", "rb") as f:
    files = {"file": ("sample_data.csv", f, "text/csv")}
    r = requests.post(f"{BASE}/api/upload", files=files)
assert r.status_code == 200, f"Upload failed: {r.text}"
data = r.json()
sid = data["sessionId"]
det = data["detection"]
print(f"  Session: {sid[:12]}...")
print(f"  数据: {det['rowCount']}行 x {det['columnCount']}列")
print(f"  缺失值: {det['totalNullCount']}个, 重复行: {det['duplicateCount']}行")
for c in det["columns"]:
    print(f"    - {c['name']}: {c['dtype']}, 缺失={c['nullCount']}({c['nullPercentage']}%)")

# 3. 测试删除重复行
print("\n[3] 删除重复行...")
r = requests.post(f"{BASE}/api/clean/{sid}/drop_duplicates", json={})
assert r.status_code == 200, f"Drop duplicates failed: {r.text}"
d = r.json()
print(f"  OK: 行数={d['detection']['rowCount']}, 历史={len(d['history'])}步")
print(f"  最近操作: {d['history'][-1]['description']}")

# 4. 测试填充缺失值
print("\n[4] 填充缺失值(年龄,均值)...")
r = requests.post(f"{BASE}/api/clean/{sid}/fillna", json={"column": "年龄", "method": "mean"})
assert r.status_code == 200, f"Fill NaN failed: {r.text}"
d = r.json()
age_col = [c for c in d["detection"]["columns"] if c["name"] == "年龄"][0]
print(f"  OK: 年龄缺失={age_col['nullCount']}个")
print(f"  最近操作: {d['history'][-1]['description']}")

# 5. 测试去空格
print("\n[5] 去除文本前后空格...")
r = requests.post(f"{BASE}/api/clean/{sid}/strip_spaces", json={})
assert r.status_code == 200, f"Strip spaces failed: {r.text}"
d = r.json()
print(f"  OK: 历史={len(d['history'])}步")
print(f"  最近操作: {d['history'][-1]['description']}")

# 6. 测试正则提取
print("\n[6] 正则提取(从邮箱提取域名)...")
r = requests.post(
    f"{BASE}/api/advanced/{sid}/regex_extract",
    json={"column": "邮箱", "pattern": r"@(.+)$", "newColumn": "邮箱域名"},
)
assert r.status_code == 200, f"Regex extract failed: {r.text}"
d = r.json()
print(f"  OK: 列数={d['detection']['columnCount']}")
print(f"  最近操作: {d['history'][-1]['description']}")
print(f"  新列预览: {[row.get('邮箱域名') for row in d['data'][:3]]}")

# 7. 测试条件替换
print("\n[7] 条件替换(部门:技术部->研发部)...")
r = requests.post(
    f"{BASE}/api/advanced/{sid}/replace",
    json={"column": "部门", "oldValue": "技术部", "newValue": "研发部"},
)
assert r.status_code == 200, f"Replace failed: {r.text}"
d = r.json()
depts = set(row["部门"] for row in d["data"])
print(f"  OK: 部门集合={depts}")

# 8. 测试撤销
print("\n[8] 撤销上一步操作...")
r = requests.post(f"{BASE}/api/history/{sid}/undo", json={})
assert r.status_code == 200, f"Undo failed: {r.text}"
d = r.json()
print(f"  OK: 当前步骤={d['currentStep']}/{len(d['history'])}")
depts = set(row["部门"] for row in d["data"])
print(f"  部门集合已恢复: {depts}")

# 9. 测试重做
print("\n[9] 重做已撤销操作...")
r = requests.post(f"{BASE}/api/history/{sid}/redo", json={})
assert r.status_code == 200, f"Redo failed: {r.text}"
d = r.json()
print(f"  OK: 当前步骤={d['currentStep']}/{len(d['history'])}")

# 10. 测试生成报告
print("\n[10] 生成数据质量报告...")
r = requests.get(f"{BASE}/api/export/{sid}/report")
assert r.status_code == 200, f"Report failed: {r.text}"
rep = r.json()
print(f"  OK: 质量评分={rep['summary']['qualityScore']}/100")
print(f"  摘要: 操作{rep['summary']['totalOperations']}次, "
      f"删除{rep['summary']['rowsRemoved']}行, "
      f"修复{rep['summary']['nullsFixed']}个缺失值")

# 11. 测试导出 CSV
print("\n[11] 导出 CSV 文件...")
r = requests.get(f"{BASE}/api/export/{sid}/csv")
assert r.status_code == 200, f"Export CSV failed: {r.status_code}"
print(f"  OK: {len(r.content)} bytes")

# 12. 测试导出 Excel
print("\n[12] 导出 Excel 文件...")
r = requests.get(f"{BASE}/api/export/{sid}/excel")
assert r.status_code == 200, f"Export Excel failed: {r.status_code}"
print(f"  OK: {len(r.content)} bytes")

print("\n" + "=" * 60)
print("所有测试通过!")
print("=" * 60)
