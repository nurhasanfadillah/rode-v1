# RODE Reports (Laporan) API tests: /api/reports JSON, /api/reports/export CSV/XLSX, RBAC (read-only)
import io
import time
import zipfile
import pytest
import requests

BASE_URL = ""
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
T = 90
CREDS = {"manajer": "Manajer123!", "admin": "RodeAdmin2026!", "op.sewing1": "Operator123!"}
_cache = {}


def sess(u):
    if u in _cache:
        return _cache[u]
    s = requests.Session()
    s.headers.update({"Origin": BASE_URL})
    for _ in range(4):
        r = s.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": CREDS[u]}, timeout=T)
        if r.status_code == 429:
            time.sleep(20); continue
        break
    if r.status_code != 200:
        pytest.skip(f"login {u} failed: {r.status_code} {r.text[:200]}")
    _cache[u] = s
    return s


RANGE = {"from": "2026-10-13", "to": "2026-10-19"}
DAY = {"from": "2026-10-19", "to": "2026-10-19"}


def meta(r, k):
    return dict(r["meta"]).get(k)


def secs(r):
    return {s["key"]: s for s in r["sections"]}


class TestReportJson:
    def test_daily_report(self):
        r = sess("manajer").get(f"{BASE_URL}/api/reports", params=DAY, timeout=T)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "Laporan Produksi Harian"
        assert "WIB" in meta(d, "Dibuat pada")
        keys = secs(d).keys()
        for k in ["departments", "products", "lines", "blocks"]:
            assert k in keys, keys
        assert "daily" not in keys
        print(meta(d, "Periode"), [(x[0], x[1]) for x in secs(d)["departments"]["rows"]])

    def test_default_today(self):
        r = sess("manajer").get(f"{BASE_URL}/api/reports", timeout=T)
        assert r.status_code == 200
        assert r.json()["title"] == "Laporan Produksi Harian"

    def test_range_report_daily_rows(self):
        d = sess("manajer").get(f"{BASE_URL}/api/reports", params=RANGE, timeout=T).json()
        assert d["title"] == "Laporan Produksi Rentang Tanggal"
        s = secs(d)
        assert "daily" in s and "blocks" not in s
        dates = [row[0] for row in s["daily"]["rows"]]
        assert len(dates) == len(set(dates)) and len(dates) >= 5, dates
        # daily sum per dept == department totals
        deps = s["departments"]["rows"]
        for i, dep in enumerate(deps):
            assert sum(row[i + 1] for row in s["daily"]["rows"]) == dep[1], dep

    def test_filter_department_changes_totals(self):
        s = sess("manajer")
        m = s.get(f"{BASE_URL}/api/meta", timeout=T).json()
        all_ = s.get(f"{BASE_URL}/api/reports", params=RANGE, timeout=T).json()
        dep = m["departments"][0]
        f = s.get(f"{BASE_URL}/api/reports", params={**RANGE, "departmentId": dep["id"]}, timeout=T).json()
        assert meta(f, "Departemen") == dep["name"]
        assert len(secs(f)["departments"]["rows"]) <= len(secs(all_)["departments"]["rows"])

    def test_filter_line_product_shift(self):
        s = sess("manajer")
        m = s.get(f"{BASE_URL}/api/meta", timeout=T).json()
        all_ = s.get(f"{BASE_URL}/api/reports", params=RANGE, timeout=T).json()
        tot = sum(x[1] for x in secs(all_)["departments"]["rows"])
        line = m["lines"][0]
        fl = s.get(f"{BASE_URL}/api/reports", params={**RANGE, "lineId": line["id"]}, timeout=T).json()
        assert meta(fl, "Line") == line["name"]
        assert len(secs(fl).get("lines", {"rows": []})["rows"]) <= 1
        prod = m["products"][0]
        fp = s.get(f"{BASE_URL}/api/reports", params={**RANGE, "productId": prod["id"]}, timeout=T).json()
        assert meta(fp, "Produk") == prod["name"]
        assert sum(x[1] for x in secs(fp)["departments"]["rows"]) <= tot
        sh = m["shifts"][0]
        fs = s.get(f"{BASE_URL}/api/reports", params={**RANGE, "shiftId": sh["id"]}, timeout=T).json()
        assert meta(fs, "Shift") == sh["name"]

    def test_invalid_date_400(self):
        r = sess("manajer").get(f"{BASE_URL}/api/reports", params={"from": "abc"}, timeout=T)
        assert r.status_code == 400, r.status_code


class TestExport:
    def test_csv(self):
        r = sess("manajer").get(f"{BASE_URL}/api/reports/export", params={**RANGE, "format": "csv"}, timeout=T)
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers["content-type"]
        assert ".csv" in r.headers["content-disposition"]
        print(r.headers["content-disposition"])
        txt = r.content.decode("utf-8")
        assert txt.startswith("\ufeff")
        assert "Dibuat pada;" in txt and "Departemen;" in txt and ";" in txt
        assert "Laporan Produksi Rentang Tanggal" in txt and "Tren harian" in txt

    def test_csv_follows_filter(self):
        s = sess("manajer")
        m = s.get(f"{BASE_URL}/api/meta", timeout=T).json()
        dep = m["departments"][0]
        txt = s.get(f"{BASE_URL}/api/reports/export", params={**DAY, "departmentId": dep["id"], "format": "csv"}, timeout=T).content.decode()
        assert f"Departemen;{dep['name']}" in txt
        assert "Laporan Produksi Harian" in txt

    def test_xlsx(self):
        r = sess("admin").get(f"{BASE_URL}/api/reports/export", params={**DAY, "format": "xlsx"}, timeout=T)
        if r.status_code != 200:
            r = sess("manajer").get(f"{BASE_URL}/api/reports/export", params={**DAY, "format": "xlsx"}, timeout=T)
        assert r.status_code == 200, r.text
        assert "spreadsheetml" in r.headers["content-type"]
        assert r.content[:2] == b"PK"
        z = zipfile.ZipFile(io.BytesIO(r.content))
        assert "xl/workbook.xml" in z.namelist()
        wb = z.read("xl/workbook.xml").decode()
        assert "Info" in wb
        print(r.headers["content-disposition"], wb.count("<sheet "))

    def test_invalid_format_400(self):
        r = sess("manajer").get(f"{BASE_URL}/api/reports/export", params={"format": "pdf"}, timeout=T)
        assert r.status_code == 400


class TestRbac:
    def test_unauth(self):
        r = requests.get(f"{BASE_URL}/api/reports/export", params={"format": "csv"}, timeout=T)
        assert r.status_code == 401
        r = requests.get(f"{BASE_URL}/api/reports", timeout=T)
        assert r.status_code == 401

    def test_operator_forbidden(self):
        s = sess("op.sewing1")
        assert s.get(f"{BASE_URL}/api/reports/export", params={"format": "csv"}, timeout=T).status_code == 403
        assert s.get(f"{BASE_URL}/api/reports", timeout=T).status_code == 403
