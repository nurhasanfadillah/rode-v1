# RODE API regression tests: auth, transactions/idempotency, RBAC, corrections, admin master data, settings, displays
import os
import uuid
import time
import datetime as dt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
ORIGIN = BASE_URL
WIB = dt.timezone(dt.timedelta(hours=7))
TIMEOUT = 90

CREDS = {
    "admin": "RodeAdmin2026!", "manajer": "Manajer123!", "op.sewing1": "Operator123!", "op.sewing2": "Operator123!",
    "op.printing": "Operator123!", "op.packing": "Operator123!",
}


def login(username):
    s = requests.Session()
    s.headers.update({"Origin": ORIGIN, "Content-Type": "application/json"})
    for _ in range(4):  # login rate limit is 20/min per IP -> back off
        r = s.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": CREDS[username]}, timeout=TIMEOUT)
        if r.status_code == 429 and "RATE_LIMIT" in r.text:
            time.sleep(20)
            continue
        break
    assert r.status_code == 200, r.text
    return s


_cache = {}


def sess(u):
    if u not in _cache:
        _cache[u] = login(u)
    return _cache[u]


def meta(u="admin"):
    r = sess(u).get(f"{BASE_URL}/api/meta", timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


def today():
    return dt.datetime.now(WIB).strftime("%Y-%m-%d")


def dept(code):
    return next(d for d in meta()["departments"] if d["code"] == code)


def inside_sewing_hours():
    n = dt.datetime.now(WIB)
    return n.isoweekday() <= 6 and (8 <= n.hour < 12 or 13 <= n.hour < 16)


# ---------- Auth ----------
class TestAuth:
    @pytest.mark.parametrize("u", list(CREDS.keys()))
    def test_login_me(self, u):
        s = login(u)
        assert "rode_session" in s.cookies.get_dict()
        r = s.get(f"{BASE_URL}/api/auth/me", timeout=TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        user = body.get("user", body)
        assert user["username"] == u

    def test_cookie_httponly(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "manajer", "password": CREDS["manajer"]}, timeout=TIMEOUT)
        sc = r.headers.get("set-cookie", "")
        assert "rode_session=" in sc and "httponly" in sc.lower()

    def test_wrong_password(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "op.sewing3", "password": "wrong"}, timeout=TIMEOUT)
        assert r.status_code == 401
        assert "error" in r.json()
        # clear failure counter via successful login
        requests.post(f"{BASE_URL}/api/auth/login", json={"username": "op.sewing3", "password": "Operator123!"}, timeout=TIMEOUT)

    def test_lockout(self):
        u = f"test_lock_{uuid.uuid4().hex[:6]}"
        codes = [requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": "x"}, timeout=TIMEOUT).status_code for _ in range(6)]
        assert codes[:5] == [401] * 5
        assert codes[5] == 429

    def test_logout(self):
        s = login("op.packing")
        r = s.post(f"{BASE_URL}/api/auth/logout", timeout=TIMEOUT)
        assert r.status_code in (200, 204)
        assert s.get(f"{BASE_URL}/api/auth/me", timeout=TIMEOUT).status_code == 401

    def test_csrf_cross_origin(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", headers={"Origin": "https://evil.example.com"},
                          json={"username": "admin", "password": "x"}, timeout=TIMEOUT)
        assert r.status_code == 403


# ---------- Transactions ----------
class TestTransactions:
    def test_sewing_outside_hours_or_ok(self):
        pid = meta("op.sewing1")["products"][0]["id"]
        r = sess("op.sewing1").post(f"{BASE_URL}/api/transactions", json={"productId": pid, "quantity": 1, "idempotencyKey": f"test-{uuid.uuid4()}"}, timeout=TIMEOUT)
        if inside_sewing_hours():
            assert r.status_code == 201, r.text
        else:
            assert r.status_code == 422, r.text
            assert "jam kerja" in r.json()["error"].lower()

    def test_idempotency_printing(self):
        s = sess("op.printing")
        pid = meta("op.printing")["products"][0]["id"]
        before = s.get(f"{BASE_URL}/api/operator/summary", timeout=TIMEOUT).json()["departmentTotal"]
        key = f"test-{uuid.uuid4()}"
        body = {"productId": pid, "quantity": 7, "idempotencyKey": key, "notes": "TEST_idem"}
        r1 = s.post(f"{BASE_URL}/api/transactions", json=body, timeout=TIMEOUT)
        r2 = s.post(f"{BASE_URL}/api/transactions", json=body, timeout=TIMEOUT)
        assert r1.status_code == 201, r1.text
        assert r2.status_code == 200
        assert r1.json()["transaction"]["id"] == r2.json()["transaction"]["id"]
        assert r2.json()["duplicate"] is True
        after = s.get(f"{BASE_URL}/api/operator/summary", timeout=TIMEOUT).json()["departmentTotal"]
        print("dept total before/after", before, after)
        # another user same key
        r3 = sess("op.packing").post(f"{BASE_URL}/api/transactions", json=body, timeout=TIMEOUT)
        assert r3.status_code == 409

    def test_future_date_rejected(self):
        pid = meta("op.packing")["products"][0]["id"]
        tmr = (dt.datetime.now(WIB) + dt.timedelta(days=1)).strftime("%Y-%m-%d")
        r = sess("op.packing").post(f"{BASE_URL}/api/transactions", json={"productId": pid, "quantity": 3, "idempotencyKey": f"test-{uuid.uuid4()}", "workDate": tmr}, timeout=TIMEOUT)
        assert r.status_code == 400

    def test_validation_qty_zero(self):
        pid = meta("op.packing")["products"][0]["id"]
        r = sess("op.packing").post(f"{BASE_URL}/api/transactions", json={"productId": pid, "quantity": 0, "idempotencyKey": f"test-{uuid.uuid4()}"}, timeout=TIMEOUT)
        assert r.status_code == 400

    def test_operator_sees_own_only(self):
        r = sess("op.printing").get(f"{BASE_URL}/api/transactions?pageSize=100", timeout=TIMEOUT)
        assert r.status_code == 200
        me = sess("op.printing").get(f"{BASE_URL}/api/auth/me", timeout=TIMEOUT).json()
        uid = me.get("user", me)["id"]
        assert all(i["operatorId"] == uid for i in r.json()["items"])

    def test_operator_other_tx_404(self):
        items = sess("admin").get(f"{BASE_URL}/api/transactions?pageSize=50", timeout=TIMEOUT).json()["items"]
        me = sess("op.printing").get(f"{BASE_URL}/api/auth/me", timeout=TIMEOUT).json()
        uid = me.get("user", me)["id"]
        other = next(i for i in items if i["operatorId"] != uid)
        assert sess("op.printing").get(f"{BASE_URL}/api/transactions/{other['id']}", timeout=TIMEOUT).status_code == 404

    def test_invalid_uuid_tx(self):
        r = sess("admin").get(f"{BASE_URL}/api/transactions/not-a-uuid", timeout=TIMEOUT)
        print("non-uuid GET status", r.status_code, r.text[:200])
        assert r.status_code in (400, 404)


# ---------- Corrections ----------
class TestCorrections:
    def test_correct_and_cancel(self):
        s = sess("op.packing")
        pid = meta("op.packing")["products"][0]["id"]
        packing_id = dept("PACKING")["id"]
        d0 = sess("admin").get(f"{BASE_URL}/api/dashboard?departmentId={packing_id}", timeout=TIMEOUT).json()
        r = s.post(f"{BASE_URL}/api/transactions", json={"productId": pid, "quantity": 10, "idempotencyKey": f"test-{uuid.uuid4()}", "notes": "TEST_corr"}, timeout=TIMEOUT)
        assert r.status_code == 201
        tx = r.json()["transaction"]
        a = sess("admin")
        # short reason
        bad = a.post(f"{BASE_URL}/api/transactions/{tx['id']}/correct", json={"newQuantity": 4, "reason": "abc", "expectedVersion": tx["version"]}, timeout=TIMEOUT)
        assert bad.status_code == 400
        ok = a.post(f"{BASE_URL}/api/transactions/{tx['id']}/correct", json={"newQuantity": 4, "reason": "TEST koreksi", "expectedVersion": tx["version"]}, timeout=TIMEOUT)
        assert ok.status_code == 200, ok.text
        assert ok.json()["transaction"]["quantity"] == 4
        # stale version conflict
        st = a.post(f"{BASE_URL}/api/transactions/{tx['id']}/correct", json={"newQuantity": 5, "reason": "TEST stale", "expectedVersion": tx["version"]}, timeout=TIMEOUT)
        assert st.status_code == 409
        d1 = a.get(f"{BASE_URL}/api/dashboard?departmentId={packing_id}", timeout=TIMEOUT).json()
        t0 = d0["departments"][0]; t1 = d1["departments"][0]
        print("dept before/after correct", t0.get("total", t0), t1.get("total", t1))
        det = a.get(f"{BASE_URL}/api/transactions/{tx['id']}", timeout=TIMEOUT).json()
        assert det["status"] == "corrected" and det["originalQuantity"] == 10 and len(det["corrections"]) == 1
        c = a.post(f"{BASE_URL}/api/transactions/{tx['id']}/cancel", json={"reason": "TEST batal", "expectedVersion": det["version"]}, timeout=TIMEOUT)
        assert c.status_code == 200
        det2 = a.get(f"{BASE_URL}/api/transactions/{tx['id']}", timeout=TIMEOUT).json()
        assert det2["status"] == "cancelled" and len(det2["corrections"]) == 2
        again = a.post(f"{BASE_URL}/api/transactions/{tx['id']}/cancel", json={"reason": "TEST batal", "expectedVersion": det2["version"]}, timeout=TIMEOUT)
        assert again.status_code == 409


# ---------- RBAC ----------
class TestRBAC:
    @pytest.mark.parametrize("path", ["/api/dashboard", "/api/admin/products", "/api/admin/settings"])
    def test_operator_403(self, path):
        assert sess("op.sewing1").get(f"{BASE_URL}{path}", timeout=TIMEOUT).status_code == 403

    @pytest.mark.parametrize("path", ["/api/dashboard", "/api/admin/products", "/api/transactions", "/api/meta"])
    def test_unauth_401(self, path):
        assert requests.get(f"{BASE_URL}{path}", timeout=TIMEOUT).status_code == 401

    def test_manager(self):
        m = sess("manajer")
        pid = meta("manajer")["products"][0]["id"]
        assert m.post(f"{BASE_URL}/api/transactions", json={"productId": pid, "quantity": 1, "idempotencyKey": f"test-{uuid.uuid4()}"}, timeout=TIMEOUT).status_code == 403
        assert m.get(f"{BASE_URL}/api/admin/products", timeout=TIMEOUT).status_code == 403
        assert m.get(f"{BASE_URL}/api/dashboard", timeout=TIMEOUT).status_code == 200


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard_historical(self):
        r = sess("manajer").get(f"{BASE_URL}/api/dashboard?date=2026-10-17", timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert len(d["departments"]) >= 3 and len(d["lines"]) >= 1
        print("dash 10-17 departments", [(x.get("name"), x.get("total", x.get("qty"))) for x in d["departments"]])

    def test_dashboard_bad_range(self):
        assert sess("manajer").get(f"{BASE_URL}/api/dashboard?from=2026-10-18&to=2026-10-10", timeout=TIMEOUT).status_code == 400


# ---------- Admin master data ----------
class TestAdmin:
    def test_product_crud(self):
        a = sess("admin")
        code = f"TEST_P{uuid.uuid4().hex[:6]}"
        r = a.post(f"{BASE_URL}/api/admin/products", json={"code": code, "name": "TEST Produk", "unit": "PCS"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["code"] == code.upper()
        dup = a.post(f"{BASE_URL}/api/admin/products", json={"code": code, "name": "dup"}, timeout=TIMEOUT)
        assert dup.status_code == 409
        u = a.patch(f"{BASE_URL}/api/admin/products/{p['id']}", json={"name": "TEST Produk Edit", "isActive": False}, timeout=TIMEOUT)
        if u.status_code == 405:
            u = a.put(f"{BASE_URL}/api/admin/products/{p['id']}", json={"name": "TEST Produk Edit", "isActive": False}, timeout=TIMEOUT)
        assert u.status_code == 200, u.text
        lst = a.get(f"{BASE_URL}/api/admin/products?q={code}&active=false", timeout=TIMEOUT).json()
        assert lst["total"] == 1 and lst["items"][0]["name"] == "TEST Produk Edit"

    def test_line_and_user(self):
        a = sess("admin")
        sew = dept("SEWING")
        code = f"TEST_L{uuid.uuid4().hex[:5]}"
        lr = a.post(f"{BASE_URL}/api/admin/lines", json={"code": code, "name": "TEST Line", "departmentId": sew["id"], "sortOrder": 99, "isActive": False}, timeout=TIMEOUT)
        assert lr.status_code == 200, lr.text
        un = f"test_op{uuid.uuid4().hex[:5]}"
        nol = a.post(f"{BASE_URL}/api/admin/users", json={"fullName": "TEST Op", "username": un, "role": "operator", "departmentId": sew["id"], "password": "Operator123!"}, timeout=TIMEOUT)
        assert nol.status_code == 400
        line1 = next(l for l in meta()["lines"] if l["departmentId"] == sew["id"])
        ok = a.post(f"{BASE_URL}/api/admin/users", json={"fullName": "TEST Op", "username": un, "role": "operator", "departmentId": sew["id"], "lineId": line1["id"], "password": "Operator123!"}, timeout=TIMEOUT)
        assert ok.status_code == 200, ok.text
        assert "passwordHash" not in ok.json()
        CREDS[un] = "Operator123!"
        login(un)
        uid = ok.json()["id"]
        d = a.patch(f"{BASE_URL}/api/admin/users/{uid}", json={"isActive": False}, timeout=TIMEOUT)
        assert d.status_code == 200, d.text
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": un, "password": "Operator123!"}, timeout=TIMEOUT)
        assert r.status_code == 401

    def test_schedule_past_rejected(self):
        a = sess("admin")
        sch = a.get(f"{BASE_URL}/api/admin/schedule", timeout=TIMEOUT).json()
        v = sch["versions"][0]
        body = {"action": "create_version", "shiftId": v["shiftId"], "effectiveFrom": "2026-01-01", "startTime": v["startTime"], "endTime": v["endTime"],
                "blockMinutes": v["blockMinutes"], "workDays": v["workDays"], "breakMode": v["breakMode"], "outsidePolicy": v["outsidePolicy"],
                "breaks": v["breaks"]}
        assert a.post(f"{BASE_URL}/api/admin/schedule", json=body, timeout=TIMEOUT).status_code == 400

    def test_target_past_rejected(self):
        a = sess("admin")
        t = a.get(f"{BASE_URL}/api/admin/targets", timeout=TIMEOUT).json()
        row = next(r for r in t["rows"] if r["kind"] == "line")
        r = a.post(f"{BASE_URL}/api/admin/targets", json={"departmentId": row["departmentId"], "lineId": row["lineId"], "effectiveFrom": "2026-01-01", "dailyTarget": 100}, timeout=TIMEOUT)
        assert r.status_code == 400


# ---------- Settings & Displays ----------
class TestSettingsDisplay:
    def test_bulk_toggle(self):
        a = sess("admin")
        orig = a.get(f"{BASE_URL}/api/admin/settings", timeout=TIMEOUT).json()
        try:
            r = a.put(f"{BASE_URL}/api/admin/settings", json={**orig, "allowBulkInput": False}, timeout=TIMEOUT)
            assert r.status_code == 200
            assert meta("op.sewing1")["settings"]["allowBulkInput"] is False
            pid = meta("op.sewing1")["products"][0]["id"]
            b = sess("op.sewing1").post(f"{BASE_URL}/api/transactions", json={"productId": pid, "quantity": 12, "idempotencyKey": f"test-{uuid.uuid4()}"}, timeout=TIMEOUT)
            assert b.status_code == 403 and b.json().get("code") == "BULK_DISABLED"
        finally:
            a.put(f"{BASE_URL}/api/admin/settings", json={**orig, "allowBulkInput": True}, timeout=TIMEOUT)
        assert meta("op.sewing1")["settings"]["allowBulkInput"] is True

    def test_display_token(self):
        a = sess("admin")
        r = a.post(f"{BASE_URL}/api/admin/displays", json={"name": "TEST_TV", "mode": "all"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        tok, did = r.json()["token"], r.json()["id"]
        assert tok.startswith("rdtv_")
        d = requests.get(f"{BASE_URL}/api/display?token={tok}", timeout=TIMEOUT)
        assert d.status_code == 200 and "lines" in d.json()
        assert requests.get(f"{BASE_URL}/api/display?token=rdtv_invalid", timeout=TIMEOUT).status_code == 401
        rv = a.patch(f"{BASE_URL}/api/admin/displays/{did}", json={"isActive": False}, timeout=TIMEOUT)
        assert rv.status_code == 200
        assert requests.get(f"{BASE_URL}/api/display?token={tok}", timeout=TIMEOUT).status_code == 401
        lst = a.get(f"{BASE_URL}/api/admin/displays", timeout=TIMEOUT).json()["items"]
        assert "tokenHash" not in lst[0]

    def test_audit_log(self):
        r = sess("admin").get(f"{BASE_URL}/api/admin/audit", timeout=TIMEOUT)
        assert r.status_code == 200


# ---------- Operator self-correction / manager correction ----------
class TestCorrectionRules:
    def test_operator_own_correction_and_manager(self):
        s = sess("op.packing")
        pid = meta("op.packing")["products"][0]["id"]
        tx = s.post(f"{BASE_URL}/api/transactions", json={"productId": pid, "quantity": 6, "idempotencyKey": f"test-{uuid.uuid4()}", "notes": "TEST_own"}, timeout=TIMEOUT).json()["transaction"]
        r = s.post(f"{BASE_URL}/api/transactions/{tx['id']}/correct", json={"newQuantity": 5, "reason": "TEST salah ketik", "expectedVersion": tx["version"]}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        m = sess("manajer").post(f"{BASE_URL}/api/transactions/{tx['id']}/cancel", json={"reason": "TEST manajer batal", "expectedVersion": r.json()["transaction"]["version"]}, timeout=TIMEOUT)
        assert m.status_code == 200, m.text
        # other operator cannot touch it
        o = sess("op.printing").post(f"{BASE_URL}/api/transactions/{tx['id']}/correct", json={"newQuantity": 3, "reason": "TEST hack", "expectedVersion": 3}, timeout=TIMEOUT)
        assert o.status_code == 404

    def test_patch_invalid_uuid(self):
        r = sess("admin").patch(f"{BASE_URL}/api/admin/products/not-a-uuid", json={"name": "x"}, timeout=TIMEOUT)
        print("PATCH non-uuid", r.status_code)
        assert r.status_code in (400, 404)


# ---------- Sewing flow (only inside 08:00-16:00 WIB working hours) ----------
@pytest.mark.skipif(not inside_sewing_hours(), reason="outside Sewing working hours")
class TestSewingLive:
    def test_plus_one_bulk_idempotency(self):
        s = sess("op.sewing1")
        pid = meta("op.sewing1")["products"][0]["id"]
        before = s.get(f"{BASE_URL}/api/operator/summary", timeout=TIMEOUT).json()
        t0 = before["line"]["actual"] if before.get("line") else 0
        key = f"test-{uuid.uuid4()}"
        r1 = s.post(f"{BASE_URL}/api/transactions", json={"productId": pid, "quantity": 1, "idempotencyKey": key}, timeout=TIMEOUT)
        assert r1.status_code == 201, r1.text
        assert r1.json()["transaction"]["blockNo"] == before["context"]["blockNo"]
        r2 = s.post(f"{BASE_URL}/api/transactions", json={"productId": pid, "quantity": 1, "idempotencyKey": key}, timeout=TIMEOUT)
        assert r2.json()["duplicate"] is True and r2.json()["transaction"]["id"] == r1.json()["transaction"]["id"]
        assert sess("op.sewing2").post(f"{BASE_URL}/api/transactions", json={"productId": pid, "quantity": 1, "idempotencyKey": key}, timeout=TIMEOUT).status_code == 409
        b = s.post(f"{BASE_URL}/api/transactions", json={"productId": pid, "quantity": 12, "idempotencyKey": f"test-{uuid.uuid4()}"}, timeout=TIMEOUT)
        assert b.status_code == 201 and b.json()["transaction"]["quantity"] == 12 and b.json()["transaction"]["inputMode"] == "bulk"
        after = s.get(f"{BASE_URL}/api/operator/summary", timeout=TIMEOUT).json()
        print("line before/after", t0, after["line"]["actual"])
        assert after["line"]["actual"] == t0 + 13
