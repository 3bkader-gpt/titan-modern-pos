import sqlite3
import sys

sys.stdout.reconfigure(encoding='utf-8')

db_path = r'd:\pharmacy\titan_modern_pos\data\pharmacy.sqlite'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print("==================================================")
print("  CLEANUP TODAY TEST INVOICES (2026-11-01)")
print("==================================================")

# 1. Fetch target invoices
cursor.execute("""
    SELECT invoice_number, invoice_date, invoice_time, item_count, total_selling_price, discount, profit, payment_method
    FROM sales_invoices
    WHERE invoice_date >= '2026-11-01'
    ORDER BY invoice_number ASC
""")
target_invoices = cursor.fetchall()

if not target_invoices:
    print("No invoices found for today. Nothing to delete.")
    conn.close()
    sys.exit(0)

print(f"Found {len(target_invoices)} test invoice(s) created today:")
for inv in target_invoices:
    net = inv['total_selling_price'] - (inv['discount'] or 0)
    print(f"  - Invoice #{inv['invoice_number']} | Time: {inv['invoice_time']} | Total: {net:.2f} EGP | Payment: {inv['payment_method']}")

inv_numbers = [inv['invoice_number'] for inv in target_invoices]
placeholders = ','.join('?' for _ in inv_numbers)

# 2. Fetch items for these invoices
cursor.execute(f"""
    SELECT id, invoice_number, item_id, item_name, quantity, unit_price, line_total, unit_type
    FROM sales_invoice_items
    WHERE invoice_number IN ({placeholders})
""", inv_numbers)
items_to_revert = cursor.fetchall()

print(f"\nItems to revert stock for ({len(items_to_revert)} line items):")
for it in items_to_revert:
    print(f"  - Item ID {it['item_id']} ({it['item_name']}): {it['quantity']} ({it['unit_type']}) from Invoice #{it['invoice_number']}")

# 3. Check current stock before revert
print("\nCurrent Stock before revert:")
cursor.execute(f"""
    SELECT item_id, item_name_en, current_stock, package_units
    FROM items
    WHERE item_id IN ({','.join(str(it['item_id']) for it in items_to_revert)})
""")
items_info = {r['item_id']: dict(r) for r in cursor.fetchall()}
for item_id, info in items_info.items():
    print(f"  - ID {item_id}: {info['item_name_en']} -> Stock: {info['current_stock']}")

# 4. Check treasury balance before revert
cursor.execute("SELECT id, cash_balance, last_updated FROM treasury_state WHERE id = 1")
treasury_before = dict(cursor.fetchone())
print(f"\nTreasury Cash Balance before revert: {treasury_before['cash_balance']:.2f} EGP")

# Execute atomic cleanup transaction
try:
    cursor.execute("BEGIN TRANSACTION")

    # Step A: Restore Stock
    total_cash_to_deduct = 0.0
    for it in items_to_revert:
        item_id = it['item_id']
        qty = it['quantity']
        unit_type = it['unit_type']
        pkg_units = items_info[item_id]['package_units'] or 1

        restore_qty = qty
        if unit_type == 'شريط' and pkg_units > 1:
            restore_qty = round(qty / pkg_units, 4)

        cursor.execute("""
            UPDATE items
            SET current_stock = ROUND(current_stock + ?, 4)
            WHERE item_id = ?
        """, (restore_qty, item_id))
        print(f"  -> Restored {restore_qty} pack(s) to Item ID {item_id}")

    # Step B: Adjust Treasury Balance for Cash Payments
    for inv in target_invoices:
        if inv['payment_method'] in ('نقدي', 'دليفري'):
            net_inv = round(inv['total_selling_price'] - (inv['discount'] or 0), 2)
            total_cash_to_deduct += net_inv

    if total_cash_to_deduct > 0:
        cursor.execute("""
            UPDATE treasury_state
            SET cash_balance = ROUND(cash_balance - ?, 2),
                last_updated = datetime('now', 'localtime')
            WHERE id = 1
        """, (total_cash_to_deduct,))
        print(f"\n  -> Deducted {total_cash_to_deduct:.2f} EGP from treasury_state (cash_balance restored)")

    # Step C: Delete General Ledger 2026 Entries
    gl_refs = [f"INV-{n}" for n in inv_numbers]
    cursor.execute(f"""
        DELETE FROM general_ledger_2026
        WHERE document_ref IN ({','.join('?' for _ in gl_refs)})
    """, gl_refs)
    print(f"  -> Deleted {cursor.rowcount} General Ledger entries")

    # Step D: Delete Delivery Orders (if any)
    cursor.execute(f"""
        DELETE FROM delivery_orders
        WHERE invoice_number IN ({placeholders})
    """, inv_numbers)
    if cursor.rowcount > 0:
        print(f"  -> Deleted {cursor.rowcount} delivery orders")

    # Step E: Delete sales_invoice_items
    cursor.execute(f"""
        DELETE FROM sales_invoice_items
        WHERE invoice_number IN ({placeholders})
    """, inv_numbers)
    print(f"  -> Deleted {cursor.rowcount} sales invoice items")

    # Step F: Delete sales_invoices
    cursor.execute(f"""
        DELETE FROM sales_invoices
        WHERE invoice_number IN ({placeholders})
    """, inv_numbers)
    print(f"  -> Deleted {cursor.rowcount} sales invoices")

    conn.commit()
    print("\n[SUCCESS] Transaction committed successfully!")

except Exception as e:
    conn.rollback()
    print(f"\n[ERROR] Transaction failed, rolled back: {e}")
    sys.exit(1)

# Verification after cleanup
print("\n==================================================")
print("  VERIFICATION POST-CLEANUP")
print("==================================================")

cursor.execute("SELECT count(*) as cnt FROM sales_invoices WHERE invoice_date >= '2026-11-01'")
print(f"Today sales invoices count: {cursor.fetchone()['cnt']}")

cursor.execute("SELECT id, cash_balance FROM treasury_state WHERE id = 1")
print(f"Treasury Cash Balance now: {cursor.fetchone()['cash_balance']:.2f} EGP (Expected: 119242.50)")

cursor.execute(f"""
    SELECT item_id, item_name_en, current_stock
    FROM items
    WHERE item_id IN ({','.join(str(it['item_id']) for it in items_to_revert)})
""")
for r in cursor.fetchall():
    print(f"  - Item ID {r['item_id']} ({r['item_name_en']}): Stock = {r['current_stock']}")

conn.close()
