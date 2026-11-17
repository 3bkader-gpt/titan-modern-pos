"""
Titan 3 / M-TITAN-11 -> SQLite Production ETL Extractor (Stage 1)
Strictly READ-ONLY on the legacy snapshot directory.
Produces a clean, schema-compatible SQLite database ready for:
  - Stage 2: auto_detect_package_units.mjs
  - Stage 3: fix_gl_duplicates.cjs
  - Stage 4: Modern POS ensureSchemaUpgrades() + checkLedgerIntegrity()
"""

import os
import re
import glob
import math
import struct
import sqlite3
import datetime
import time

BASE_DIR = os.environ.get("TITAN_OLD_SYS", r"D:\Titan_Migration_Staging\old_sys")
BASELINE_DB = os.environ.get("TITAN_BASELINE_DB", r"G:\data\pharmacy.sqlite")
OUTPUT_DB = os.environ.get("TITAN_OUTPUT_DB", r"D:\Titan_Migration_Staging\titan_extracted.sqlite")

M_TITAN = os.path.join(BASE_DIR, "Labirdo", "M-TITAN-11")
DBI_DIR = os.path.join(M_TITAN, "Files", "DBI")
DB_DIR = os.path.join(M_TITAN, "Files", "DB")
ARCHIVE_DIR = os.path.join(M_TITAN, "Files", "Archive")
EVERYTIME_DIR = os.path.join(BASE_DIR, "Everytime stock")
EVERYDAY_DIR = os.path.join(BASE_DIR, "titan.everyday", "2026")


def decode_cp1256(raw: bytes) -> str:
    return raw.decode("cp1256", errors="ignore").replace("\x00", "").strip()


def vb_date_to_dt(val: float):
    if val is None or math.isnan(val) or math.isinf(val) or val < 36526 or val > 73050:
        return None
    try:
        return datetime.datetime(1899, 12, 30) + datetime.timedelta(days=float(val))
    except Exception:
        return None


def safe_float(val: float, ndigits: int = 2) -> float:
    if val is None or math.isnan(val) or math.isinf(val):
        return 0.0
    if abs(val) > 1e12:
        return 0.0
    return round(float(val), ndigits)


def create_schema(conn: sqlite3.Connection):
    conn.executescript(
        """
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;

        CREATE TABLE items (
            item_id INTEGER PRIMARY KEY,
            item_name_en TEXT,
            item_name_ar TEXT,
            producer TEXT,
            generic_name TEXT,
            category TEXT,
            consumer_price REAL,
            previous_price REAL,
            package_units REAL,
            discount_pct INTEGER,
            buy_price REAL,
            current_stock REAL DEFAULT 0,
            expiry_date TEXT,
            barcode TEXT,
            barcode_source TEXT,
            pharmacy_discount_percent INTEGER,
            tax_schedule_category INTEGER
        );

        CREATE TABLE sales_invoices (
            invoice_number INTEGER PRIMARY KEY,
            invoice_date TEXT,
            invoice_time TEXT,
            item_count INTEGER,
            total_selling_price REAL,
            total_cost_price REAL,
            profit REAL,
            year INTEGER
        );

        CREATE TABLE sales_invoice_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_number INTEGER,
            line_number INTEGER,
            item_id INTEGER,
            item_name TEXT,
            quantity REAL,
            unit_price REAL,
            discount_pct INTEGER,
            line_total REAL,
            invoice_date TEXT,
            invoice_time TEXT,
            FOREIGN KEY(invoice_number) REFERENCES sales_invoices(invoice_number),
            FOREIGN KEY(item_id) REFERENCES items(item_id)
        );

        CREATE TABLE suppliers (
            supplier_id INTEGER PRIMARY KEY,
            supplier_name TEXT,
            contact_phone TEXT
        );

        CREATE TABLE purchases_invoices (
            purchase_invoice_id INTEGER PRIMARY KEY,
            supplier_id INTEGER,
            supplier_name TEXT,
            invoice_date TEXT,
            item_count INTEGER,
            total_amount REAL
        );

        CREATE TABLE purchase_invoice_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purchase_invoice_id INTEGER,
            line_number INTEGER,
            item_id INTEGER,
            item_name TEXT,
            quantity REAL,
            consumer_price REAL,
            buy_price REAL,
            line_total REAL,
            FOREIGN KEY(purchase_invoice_id) REFERENCES purchases_invoices(purchase_invoice_id),
            FOREIGN KEY(item_id) REFERENCES items(item_id)
        );

        CREATE TABLE supplier_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_id INTEGER,
            supplier_name TEXT,
            transaction_type TEXT,
            amount REAL,
            transaction_date TEXT,
            FOREIGN KEY(supplier_id) REFERENCES suppliers(supplier_id)
        );

        CREATE TABLE customers (
            customer_id INTEGER PRIMARY KEY,
            customer_name TEXT,
            phone TEXT,
            address TEXT,
            account_balance REAL
        );

        CREATE TABLE users (
            user_id INTEGER PRIMARY KEY,
            user_name TEXT,
            is_active INTEGER,
            permissions_mask INTEGER
        );

        CREATE TABLE delivery_orders (
            order_id INTEGER PRIMARY KEY,
            item_ordered TEXT,
            order_timestamp TEXT,
            status TEXT
        );

        CREATE TABLE daily_financial_summary (
            record_date TEXT PRIMARY KEY,
            val_1 REAL,
            val_2 REAL,
            val_3 REAL
        );

        CREATE TABLE undo_sales_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_timestamp TEXT,
            user_name TEXT,
            item_name TEXT,
            unit_price REAL,
            fraction REAL,
            package_unit REAL,
            invoice_id INTEGER
        );

        CREATE TABLE medical_generic_dictionary (
            generic_id INTEGER PRIMARY KEY,
            generic_name TEXT
        );

        CREATE TABLE medical_disease_interactions (
            condition_id INTEGER PRIMARY KEY,
            condition_name TEXT
        );

        CREATE TABLE medical_pregnancy_warnings (
            rule_id INTEGER PRIMARY KEY,
            generic_id INTEGER,
            generic_name TEXT,
            condition_id INTEGER,
            condition_name TEXT,
            FOREIGN KEY(generic_id) REFERENCES medical_generic_dictionary(generic_id),
            FOREIGN KEY(condition_id) REFERENCES medical_disease_interactions(condition_id)
        );

        CREATE TABLE contact_phone_numbers (
            id INTEGER PRIMARY KEY,
            phone_number TEXT
        );

        CREATE TABLE shortages_drafts (
            id INTEGER PRIMARY KEY,
            supplier_id INTEGER,
            supplier_name TEXT,
            item_id INTEGER,
            item_name TEXT,
            quantity REAL,
            order_code TEXT
        );

        CREATE TABLE price_change_history (
            id INTEGER PRIMARY KEY,
            item_name TEXT,
            new_price REAL,
            change_timestamp TEXT
        );

        CREATE TABLE general_ledger_2026 (
            entry_id INTEGER PRIMARY KEY,
            entry_date TEXT,
            account_name TEXT,
            document_ref TEXT,
            notes TEXT,
            amount REAL,
            debit REAL,
            credit REAL
        );

        CREATE TABLE treasury_state (
            id INTEGER PRIMARY KEY,
            cash_balance REAL,
            last_updated TEXT
        );

        CREATE TABLE work_shifts (
            shift_id INTEGER PRIMARY KEY,
            start_time TEXT,
            end_time TEXT,
            user_name TEXT,
            total_sales REAL,
            status TEXT
        );

        CREATE TABLE customer_transactions (
            session_id INTEGER PRIMARY KEY,
            checkpoint_timestamp TEXT,
            status TEXT
        );
        """
    )


def load_expiry_from_everytime() -> dict:
    """Scan Everytime stock/<YYMMDD>/*.csv (oldest -> newest) for latest valid MM-YYYY expiry per item_id."""
    expiry_map = {}
    if not os.path.isdir(EVERYTIME_DIR):
        return expiry_map
    day_dirs = sorted(
        d for d in os.listdir(EVERYTIME_DIR)
        if os.path.isdir(os.path.join(EVERYTIME_DIR, d))
    )
    # Scan last 60 days (or all available) chronologically so newest wins
    exp_re = re.compile(r"^\d{2}-\d{4}$")
    for day in day_dirs:
        dpath = os.path.join(EVERYTIME_DIR, day)
        csvs = sorted(glob.glob(os.path.join(dpath, "*.csv")))
        if not csvs:
            continue
        # Only need the latest CSV per day (they are full stock snapshots)
        latest_csv = csvs[-1]
        try:
            with open(latest_csv, "r", encoding="cp1256", errors="ignore") as f:
                for line in f:
                    parts = line.strip().split(",")
                    if len(parts) >= 3:
                        try:
                            iid = int(parts[0])
                        except ValueError:
                            continue
                        exp = parts[2].strip()
                        if exp_re.match(exp):
                            expiry_map[iid] = exp
        except Exception:
            pass
    return expiry_map


def load_barcodes_from_xml() -> dict:
    """Recover scanned/catalog barcodes from titan.everyday/2026/*.xml."""
    bc_map = {}
    if not os.path.isdir(EVERYDAY_DIR):
        return bc_map
    xmls = sorted(glob.glob(os.path.join(EVERYDAY_DIR, "*.xml")))
    for xp in xmls:
        try:
            with open(xp, "r", encoding="cp1256", errors="ignore") as f:
                for line in f:
                    if line.startswith("<drg>"):
                        parts = line[5:].strip().split("^")
                        if len(parts) >= 3:
                            try:
                                iid = int(parts[0])
                                bc = parts[2].strip()
                                if bc and bc != "0" and bc.isdigit() and len(bc) >= 5:
                                    bc_map[iid] = bc
                            except ValueError:
                                pass
                    elif line.startswith("<oot-items>") or line.startswith("<inn-items>"):
                        if "|^" in line:
                            tail = line.split("|^", 1)[1].split("^")
                            if len(tail) >= 3:
                                try:
                                    iid = int(tail[1])
                                    bc = tail[2].strip()
                                    if bc and bc != "0" and bc.isdigit() and len(bc) >= 5:
                                        bc_map[iid] = bc
                                except ValueError:
                                    pass
        except Exception:
            pass
    return bc_map


def extract_items(conn: sqlite3.Connection) -> dict:
    expiry_map = load_expiry_from_everytime()
    xml_bc_map = load_barcodes_from_xml()
    print(f"  [aux] Loaded {len(expiry_map):,} expiry dates from Everytime stock, {len(xml_bc_map):,} barcodes from XML.")

    tar_path = os.path.join(DBI_DIR, "tar.phy")
    data = open(tar_path, "rb").read()
    rec_sz = 856
    n_recs = len(data) // rec_sz
    item_names = {}
    rows = []

    for i in range(n_recs):
        off = i * rec_sz
        rec = data[off : off + rec_sz]
        name_en = decode_cp1256(rec[0:40])
        name_ar = decode_cp1256(rec[40:70])
        if not name_en and not name_ar:
            continue

        item_id = i + 1
        producer = decode_cp1256(rec[70:90])
        generic = decode_cp1256(rec[90:130])
        category = decode_cp1256(rec[796:846])

        bc_raw = struct.unpack_from("<d", rec, 130)[0]
        barcode = ""
        barcode_source = ""
        if not math.isnan(bc_raw) and not math.isinf(bc_raw) and bc_raw >= 1000:
            barcode = str(int(round(bc_raw)))
            barcode_source = "tar.phy (native)"
        elif item_id in xml_bc_map:
            barcode = xml_bc_map[item_id]
            barcode_source = "titan.everyday (xml)"

        stock = safe_float(struct.unpack_from("<f", rec, 176)[0], 4)
        pkg_units_raw = struct.unpack_from("<h", rec, 196)[0]
        pkg_units = float(pkg_units_raw) if 1 <= pkg_units_raw <= 100 else 1.0
        consumer_price = safe_float(struct.unpack_from("<f", rec, 208)[0], 2)
        previous_price = safe_float(struct.unpack_from("<f", rec, 224)[0], 2)
        discount_pct = int(struct.unpack_from("<h", rec, 238)[0])
        buy_price = safe_float(struct.unpack_from("<f", rec, 244)[0], 2)
        pharm_disc = int(struct.unpack_from("<h", rec, 786)[0])
        tax_sched = int(struct.unpack_from("<h", rec, 788)[0])
        expiry = expiry_map.get(item_id, "")

        item_names[item_id] = name_en or name_ar
        rows.append(
            (
                item_id, name_en, name_ar, producer, generic, category,
                consumer_price, previous_price, pkg_units, discount_pct, buy_price,
                stock, expiry, barcode, barcode_source, pharm_disc, tax_sched,
            )
        )

    conn.executemany(
        """
        INSERT INTO items (
            item_id, item_name_en, item_name_ar, producer, generic_name, category,
            consumer_price, previous_price, package_units, discount_pct, buy_price,
            current_stock, expiry_date, barcode, barcode_source,
            pharmacy_discount_percent, tax_schedule_category
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        rows,
    )
    print(f"  [1] items: {len(rows):,} extracted (max item_id={max(item_names.keys())})")
    return item_names


def extract_suppliers(conn: sqlite3.Connection) -> dict:
    mrd_path = os.path.join(DBI_DIR, "MRDINFO.phy")
    data = open(mrd_path, "rb").read()
    suppliers = {}
    rows = []
    # 128-byte blocks for supplier headers (scan first 200 slots until empty)
    for i in range(200):
        off = i * 128
        if off + 128 > len(data):
            break
        rec = data[off : off + 128]
        str_len = struct.unpack_from("<H", rec, 0)[0]
        if 0 < str_len <= 60:
            name = decode_cp1256(rec[2 : 2 + str_len])
            if name and any(c.isalnum() for c in name):
                sid = i + 1
                phone = "01201535860" if sid == 1 else ""
                suppliers[sid] = name
                rows.append((sid, name, phone))
        elif i >= 17:
            # Stop after consecutive empty supplier slots
            if all(struct.unpack_from("<H", data, (i + k) * 128)[0] == 0 for k in range(3) if (i + k + 1) * 128 <= len(data)):
                break

    conn.executemany(
        "INSERT INTO suppliers (supplier_id, supplier_name, contact_phone) VALUES (?,?,?)",
        rows,
    )
    print(f"  [2] suppliers: {len(rows):,} extracted")
    return suppliers


def extract_sales(conn: sqlite3.Connection, item_names: dict):
    sf_path = os.path.join(DBI_DIR, "salesfull.phy")
    data = open(sf_path, "rb").read()
    rec_sz = 997
    n_slots = len(data) // rec_sz
    inv_rows = []
    item_rows = []
    max_inv = 0

    for i in range(n_slots):
        off = i * rec_sz
        rec = data[off : off + rec_sz]
        if not any(rec[:16]):
            continue
        dt_val = struct.unpack_from("<d", rec, 0)[0]
        dt = vb_date_to_dt(dt_val)
        if not dt:
            continue

        tm_val = struct.unpack_from("<d", rec, 8)[0]
        tm = vb_date_to_dt(tm_val) or dt

        inv_no = i + 1
        max_inv = inv_no
        inv_date = dt.strftime("%Y-%m-%d")
        inv_time = tm.strftime("%Y-%m-%d %H:%M:%S")
        tot_sell = safe_float(struct.unpack_from("<f", rec, 64)[0], 2)
        tot_cost = safe_float(struct.unpack_from("<f", rec, 72)[0], 2)
        profit = round(tot_sell - tot_cost, 2)

        line_cnt = 0
        for k in range(15):
            iid = struct.unpack_from("<H", rec, 172 + 2 * k)[0]
            if iid <= 0 or iid not in item_names:
                continue
            qty = safe_float(struct.unpack_from("<f", rec, 202 + 4 * k)[0], 3)
            if qty == 0:
                continue
            uprice = safe_float(struct.unpack_from("<f", rec, 292 + 4 * k)[0], 2)
            disc = int(struct.unpack_from("<h", rec, 352 + 2 * k)[0])
            ltotal = round(qty * uprice, 2)
            line_cnt += 1
            item_rows.append(
                (
                    inv_no, line_cnt, iid, item_names[iid],
                    qty, uprice, disc, ltotal, inv_date, inv_time,
                )
            )

        inv_rows.append(
            (inv_no, inv_date, inv_time, line_cnt, tot_sell, tot_cost, profit, dt.year)
        )

    conn.executemany(
        """
        INSERT INTO sales_invoices (
            invoice_number, invoice_date, invoice_time, item_count,
            total_selling_price, total_cost_price, profit, year
        ) VALUES (?,?,?,?,?,?,?,?)
        """,
        inv_rows,
    )
    conn.executemany(
        """
        INSERT INTO sales_invoice_items (
            invoice_number, line_number, item_id, item_name,
            quantity, unit_price, discount_pct, line_total, invoice_date, invoice_time
        ) VALUES (?,?,?,?,?,?,?,?,?,?)
        """,
        item_rows,
    )
    print(f"  [3] sales_invoices: {len(inv_rows):,} (max #{max_inv}), sales_invoice_items: {len(item_rows):,}")


def extract_purchases(conn: sqlite3.Connection, item_names: dict, suppliers: dict):
    pw_path = os.path.join(DBI_DIR, "pruchworld.phy")
    data = open(pw_path, "rb").read()
    rec_sz = 5234
    n_slots = len(data) // rec_sz
    hdr_rows = []
    line_rows = []
    max_pid = 0

    for i in range(n_slots):
        off = i * rec_sz
        rec = data[off : off + rec_sz]
        if not any(rec[:16]):
            continue
        dt = vb_date_to_dt(struct.unpack_from("<d", rec, 0)[0])
        if not dt:
            continue

        pid = i + 1
        max_pid = pid
        inv_date = dt.strftime("%Y-%m-%d")
        sid = struct.unpack_from("<H", rec, 252)[0]
        if sid <= 0:
            sid = 1
        sname = suppliers.get(sid, f"Supplier #{sid}")
        hdr_total = safe_float(struct.unpack_from("<f", rec, 18)[0], 2)

        line_cnt = 0
        for k in range(50):
            iid = struct.unpack_from("<H", rec, 388 + 2 * k)[0]
            if iid <= 0 or iid not in item_names:
                continue
            cp = safe_float(struct.unpack_from("<f", rec, 592 + 4 * k)[0], 2)
            bp = safe_float(struct.unpack_from("<f", rec, 792 + 4 * k)[0], 2)
            qty = safe_float(struct.unpack_from("<f", rec, 992 + 4 * k)[0], 3)
            ltot = round(qty * bp, 2) if bp > 0 else round(qty * cp, 2)
            line_cnt += 1
            line_rows.append((pid, line_cnt, iid, item_names[iid], qty, cp, bp, ltot))

        hdr_rows.append((pid, sid, sname, inv_date, line_cnt, hdr_total))

    conn.executemany(
        """
        INSERT INTO purchases_invoices (
            purchase_invoice_id, supplier_id, supplier_name, invoice_date, item_count, total_amount
        ) VALUES (?,?,?,?,?,?)
        """,
        hdr_rows,
    )
    conn.executemany(
        """
        INSERT INTO purchase_invoice_items (
            purchase_invoice_id, line_number, item_id, item_name,
            quantity, consumer_price, buy_price, line_total
        ) VALUES (?,?,?,?,?,?,?,?)
        """,
        line_rows,
    )
    print(f"  [4] purchases_invoices: {len(hdr_rows):,} (max #{max_pid}), purchase_invoice_items: {len(line_rows):,}")


def extract_gl_and_treasury(conn: sqlite3.Connection):
    # General Ledger 2026
    jz_path = os.path.join(DBI_DIR, "JZ.2026.phy")
    jz = open(jz_path, "rb").read()
    rec_sz = 328
    gl_rows = []
    for i in range(len(jz) // rec_sz):
        rec = jz[i * rec_sz : (i + 1) * rec_sz]
        acct = decode_cp1256(rec[0:100])
        doc = decode_cp1256(rec[100:200])
        notes = decode_cp1256(rec[200:300])
        amt = safe_float(struct.unpack_from("<f", rec, 308)[0], 2)
        d_int = struct.unpack_from("<i", rec, 312)[0]
        dt = vb_date_to_dt(d_int)
        if not acct or not dt:
            continue
        deb = amt if amt > 0 else 0.0
        cred = -amt if amt < 0 else 0.0
        gl_rows.append((i + 1, dt.strftime("%Y-%m-%d"), acct, doc, notes, amt, deb, cred))

    conn.executemany(
        """
        INSERT INTO general_ledger_2026 (
            entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit
        ) VALUES (?,?,?,?,?,?,?,?)
        """,
        gl_rows,
    )

    # Treasury State (Foloos.phy offset 8)
    foloos_path = os.path.join(DBI_DIR, "Foloos.phy")
    foloos = open(foloos_path, "rb").read()
    cash_bal = safe_float(struct.unpack_from("<d", foloos, 8)[0], 2)
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        "INSERT INTO treasury_state (id, cash_balance, last_updated) VALUES (1, ?, ?)",
        (cash_bal, now_str),
    )
    print(f"  [5] general_ledger_2026: {len(gl_rows):,} raw entries | treasury_state cash: {cash_bal:,.2f} EGP")


def extract_text_and_aux_tables(conn: sqlite3.Connection, item_names: dict, suppliers: dict):
    # Delivery orders (delhis.phy)
    dh_path = os.path.join(DBI_DIR, "delhis.phy")
    if os.path.exists(dh_path):
        rows = []
        oid = 0
        with open(dh_path, "r", encoding="cp1256", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if ";" not in line:
                    continue
                parts = [p.strip() for p in line.split(";")]
                if len(parts) >= 2 and parts[0]:
                    oid += 1
                    rows.append((oid, parts[0], parts[1], "Delivered"))
        conn.executemany(
            "INSERT INTO delivery_orders (order_id, item_ordered, order_timestamp, status) VALUES (?,?,?,?)",
            rows,
        )
        print(f"  [6] delivery_orders: {len(rows):,}")

    # Undo sales history (Files/Archive/undo.sales.txt)
    undo_path = os.path.join(ARCHIVE_DIR, "undo.sales.txt")
    if os.path.exists(undo_path):
        rows = []
        inv_re = re.compile(r"<Fat-Id-(\d+)>")
        with open(undo_path, "r", encoding="cp1256", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if "^" not in line:
                    continue
                parts = line.split("^")
                if len(parts) < 6:
                    continue
                ts = parts[0].strip()
                uname = parts[1].strip()
                iname = parts[2].replace("(=)", "").strip()
                try:
                    uprice = float(parts[3].strip())
                except ValueError:
                    uprice = 0.0
                try:
                    frac = float(parts[4].strip())
                except ValueError:
                    frac = 0.0
                tail = parts[5]
                pkg_str = tail.split("$")[0].strip()
                try:
                    pkg = float(pkg_str)
                except ValueError:
                    pkg = 1.0
                m = inv_re.search(tail)
                inv_id = int(m.group(1)) if m else 0
                rows.append((ts, uname, iname, uprice, frac, pkg, inv_id))
        conn.executemany(
            """
            INSERT INTO undo_sales_history (
                sale_timestamp, user_name, item_name, unit_price, fraction, package_unit, invoice_id
            ) VALUES (?,?,?,?,?,?,?)
            """,
            rows,
        )
        print(f"  [7] undo_sales_history: {len(rows):,}")

    # Shortages drafts (lastoot.txt)
    oot_path = os.path.join(DBI_DIR, "lastoot.txt")
    if os.path.exists(oot_path):
        rows = []
        rid = 0
        with open(oot_path, "r", encoding="cp1256", errors="ignore") as f:
            for line in f:
                parts = line.strip().split(";")
                if len(parts) < 3:
                    continue
                try:
                    sid = int(parts[0])
                    qty = float(parts[1])
                    iid = int(parts[2])
                except ValueError:
                    continue
                code = parts[3].strip() if len(parts) > 3 else ""
                rid += 1
                rows.append((rid, sid, suppliers.get(sid, f"Supplier #{sid}"), iid, item_names.get(iid, ""), qty, code))
        conn.executemany(
            """
            INSERT INTO shortages_drafts (
                id, supplier_id, supplier_name, item_id, item_name, quantity, order_code
            ) VALUES (?,?,?,?,?,?,?)
            """,
            rows,
        )
        print(f"  [8] shortages_drafts: {len(rows):,}")

    # Price change history (Price-log.txt)
    pl_path = os.path.join(DBI_DIR, "Price-log.txt")
    if os.path.exists(pl_path):
        rows = []
        rid = 0
        with open(pl_path, "r", encoding="cp1256", errors="ignore") as f:
            for line in f:
                parts = line.strip().split("^")
                if len(parts) < 3:
                    continue
                iname = parts[0].strip()
                try:
                    nprice = float(parts[1].strip())
                except ValueError:
                    continue
                ts = parts[2].strip()
                rid += 1
                rows.append((rid, iname, nprice, ts))
        conn.executemany(
            "INSERT INTO price_change_history (id, item_name, new_price, change_timestamp) VALUES (?,?,?,?)",
            rows,
        )
        print(f"  [9] price_change_history: {len(rows):,}")

    # Contact phone numbers (Files/DB/Nilsenlist.rar)
    ph_path = os.path.join(DB_DIR, "Nilsenlist.rar")
    if os.path.exists(ph_path):
        rows = []
        rid = 0
        with open(ph_path, "r", encoding="cp1256", errors="ignore") as f:
            for line in f:
                p = line.strip()
                if p:
                    rid += 1
                    rows.append((rid, p))
        conn.executemany("INSERT INTO contact_phone_numbers (id, phone_number) VALUES (?,?)", rows)
        print(f"  [10] contact_phone_numbers: {len(rows):,}")

    # Customer transactions checkpoints (CustHis2.phy - 2010 B blocks)
    ch_path = os.path.join(DBI_DIR, "CustHis2.phy")
    if os.path.exists(ch_path):
        ch = open(ch_path, "rb").read()
        rows = []
        sid = 0
        for i in range(len(ch) // 2010):
            dt = vb_date_to_dt(struct.unpack_from("<d", ch, i * 2010)[0])
            if dt:
                sid += 1
                rows.append((sid, dt.strftime("%Y-%m-%d %H:%M:%S"), "Closed / Settled"))
        conn.executemany(
            "INSERT INTO customer_transactions (session_id, checkpoint_timestamp, status) VALUES (?,?,?)",
            rows,
        )
        print(f"  [11] customer_transactions: {len(rows):,}")


def copy_static_reference_tables(conn: sqlite3.Connection):
    """Copy static legacy reference tables (unchanged medical dictionaries 2013, users, customers) from verified baseline."""
    if not os.path.exists(BASELINE_DB):
        print(f"  [WARN] Baseline DB not found at {BASELINE_DB}; skipping static tables.")
        return
    src = sqlite3.connect(BASELINE_DB)
    static_tables = [
        ("medical_generic_dictionary", ["generic_id", "generic_name"]),
        ("medical_disease_interactions", ["condition_id", "condition_name"]),
        ("medical_pregnancy_warnings", ["rule_id", "generic_id", "generic_name", "condition_id", "condition_name"]),
        ("customers", ["customer_id", "customer_name", "phone", "address", "account_balance"]),
        ("users", ["user_id", "user_name", "is_active", "permissions_mask"]),
    ]
    for tbl, cols in static_tables:
        col_csv = ", ".join(cols)
        placeholders = ", ".join(["?"] * len(cols))
        data = src.execute(f"SELECT {col_csv} FROM {tbl}").fetchall()
        conn.executemany(f"INSERT INTO {tbl} ({col_csv}) VALUES ({placeholders})", data)
        print(f"  [ref] {tbl}: {len(data):,}")
    src.close()


def main():
    t0 = time.time()
    print("=" * 72)
    print("TITAN 3 -> SQLITE STAGE 1 EXTRACTOR (READ-ONLY ON LEGACY SNAPSHOT)")
    print(f"Source: {BASE_DIR}")
    print(f"Output: {OUTPUT_DB}")
    print("=" * 72)

    os.makedirs(os.path.dirname(OUTPUT_DB), exist_ok=True)
    for ext in ("", "-wal", "-shm"):
        p = OUTPUT_DB + ext
        if os.path.exists(p):
            os.remove(p)

    conn = sqlite3.connect(OUTPUT_DB)
    create_schema(conn)
    with conn:
        item_names = extract_items(conn)
        suppliers = extract_suppliers(conn)
        extract_sales(conn, item_names)
        extract_purchases(conn, item_names, suppliers)
        extract_gl_and_treasury(conn)
        extract_text_and_aux_tables(conn, item_names, suppliers)
        copy_static_reference_tables(conn)

    conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
    conn.close()
    print(f"\nDONE in {time.time() - t0:.2f}s -> {OUTPUT_DB}")


if __name__ == "__main__":
    main()
