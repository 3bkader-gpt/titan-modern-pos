import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve('data', 'pharmacy.sqlite');
const TAR_PATH = 'D:\\pharmacy\\old_sys\\Labirdo\\M-TITAN-11\\Files\\DBI\\tar.phy';
const RECORD_SIZE = 856;

const db = new Database(DB_PATH, { readonly: true });
const tarBuf = fs.readFileSync(TAR_PATH);

// Get top 60 solid drugs (excluding liquids/creams/sundries)
const EXCLUDED_PATTERNS = [
  'SYRUP', 'SUSP', 'SUSPENSION', 'ELIXIR', 'EMULSION', 'شراب', 'معلق',
  'CREAM', 'OINT', 'OINTMENT', 'GEL', 'JELLY', 'PASTE', 'كريم', 'مرهم', 'جيل', 'جل', 'دهان', 'معجون',
  'SPRAY', 'AEROSOL', 'INHALER', 'EVOHALER', 'بخاخ', 'سبراى', 'اسبراي', 'اسبراى', 'بخاخة', 'مستنشق',
  'DROPS', 'EYE DROPS', 'EAR DROPS', 'NASAL DROPS', 'ORAL DROPS', 'قطرة', 'نقط',
  'LOTION', 'SOLUTION', 'SOLN', 'WASH', 'MOUTH WASH', 'غسول', 'محلول', 'شامبو', 'SHAMPOO', 'صابون', 'SOAP',
  'COTTON', 'TOWEL', 'DIAPER', 'PANTS', 'PADS', 'SERUM', 'BRUSH', 'سيروم', 'حفاضات', 'فوط', 'مناديل', 'فرشاة', 'بامبرز', 'قطن', 'سويت', 'مخمرية',
  'VIAL', 'فيال'
];

const SOLID_PATTERNS = [
  'TAB', 'TABS', 'TABLET', 'TABLETS', 'قرص', 'اقراص', 'أقراص',
  'CAP', 'CAPS', 'CAPSULE', 'CAPSULES', 'كبسول', 'كبسولة', 'كبسولات',
  'SACH', 'SACHET', 'SACHETS', 'كيس', 'أكياس', 'اكياس', 'فوار',
  'AMP', 'AMPS', 'AMPOULE', 'AMPOULES', 'امبول', 'أمبول', 'امبولات', 'أمبولات',
  'SUPP', 'SUPPOSITORY', 'SUPPOSITORIES', 'قمع', 'اقماع', 'أقماع', 'لبوس',
  'FILM', 'ORAL FILM', 'فيلم',
  'SYRINGE', 'PREFILLED SYRINGE', 'سرنجة', 'سرنجه'
];

function isExcluded(name) {
  const upper = name.toUpperCase();
  return EXCLUDED_PATTERNS.some(k => upper.includes(k));
}

function isSolid(name) {
  const upper = name.toUpperCase();
  return SOLID_PATTERNS.some(k => upper.includes(k));
}

// Get top selling solid items
const topRows = db.prepare(`
  SELECT 
    s.item_id, 
    i.item_name_en, 
    i.item_name_ar, 
    i.consumer_price, 
    i.current_stock,
    COUNT(s.invoice_number) as sales_count, 
    SUM(s.quantity) as total_sold
  FROM sales_invoice_items s
  JOIN items i ON s.item_id = i.item_id
  GROUP BY s.item_id
  ORDER BY total_sold DESC, sales_count DESC
`).all();

const topSolids = [];
for (const r of topRows) {
  const fullName = `${r.item_name_en} ${r.item_name_ar}`;
  if (!isExcluded(fullName) && isSolid(fullName)) {
    const off = (r.item_id - 1) * RECORD_SIZE;
    const s196 = tarBuf.readInt16LE(off + 196);
    topSolids.push({ ...r, s196 });
    if (topSolids.length >= 40) break;
  }
}

console.log(`Top 35 Solid Selling Medicines in Pharmacy:`);
console.table(topSolids.slice(0, 35).map((r, idx) => ({
  '#': idx + 1,
  ID: r.item_id,
  Name: r.item_name_en,
  Price: r.consumer_price,
  'tar.phy s196': r.s196,
  Sold: r.total_sold,
  Stock: r.current_stock
})));

db.close();
