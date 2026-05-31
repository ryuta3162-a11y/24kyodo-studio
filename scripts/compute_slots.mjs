/**
 * 6月シフト + レッスン表経堂 → 予約可能時間（2人以上60分空き）
 * 実行: node scripts/compute_slots.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const SHIFT_CSV = path.join(ROOT, '第7エリアテリトリー2　シフト (経堂・ひばりが丘)  - 2026年6月シフト.csv');
const LESSON_CSV = path.join(ROOT, '第7エリアテリトリー2　シフト (経堂・ひばりが丘)  - レッスン表経堂.csv');
const OUT_JSON = path.join(ROOT, 'booking', 'slots.json');

const TARGET_STAFF = ['蜂谷', '日下', '中田', '美絵', '由岐恵', '澤野'];
const YEAR = 2026;
const MONTH = 6;
const SLOT_MIN = 60;
const STEP_MIN = 15;
const MIN_STAFF = 2;
const GRID_START = 8 * 60;
const GRID_END = 22 * 60;
const MAX_TASK_MIN = 240;

const DOW_CHARS = ['日', '月', '火', '水', '木', '金', '土'];

const INSTRUCTOR_MAP = {
  YUKI: '由岐恵', Yuki: '由岐恵',
  MIE: '美絵', Mie: '美絵',
  HACHI: '蜂谷', Hachi: '蜂谷',
  Hana: '中田', HANA: '中田',
  蜂谷: '蜂谷', 中田: '中田', 日下: '日下', 澤野: '澤野',
  由岐恵: '由岐恵', 美絵: '美絵',
};

const OFF_RE = /^(休|公休|×|有休|有給|育休)$/;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else cell += c;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function toFullWidthDigits(s) {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function parseTimeRange(str) {
  if (!str) return null;
  const src = toFullWidthDigits(String(str))
    .replace(/\r?\n/g, ' ')
    .replace(/[：:]/g, ':')
    .replace(/[－ー〜～−‐—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const m = src.match(/(\d{1,2})(?::?(\d{2}))?\s*-\s*(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return null;
  const sh = parseInt(m[1], 10), sm = parseInt(m[2] || '0', 10);
  const eh = parseInt(m[3], 10), em = parseInt(m[4] || '0', 10);
  return { start: sh * 60 + sm, end: eh * 60 + em };
}

function parseAllTimeRanges(str) {
  const src = toFullWidthDigits(String(str || '')).replace(/\r?\n/g, ' ');
  const re = /(\d{1,2})(?::?(\d{2}))?\s*-\s*(\d{1,2})(?::?(\d{2}))?/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({
      start: parseInt(m[1], 10) * 60 + parseInt(m[2] || '0', 10),
      end: parseInt(m[3], 10) * 60 + parseInt(m[4] || '0', 10),
    });
  }
  return out;
}

function fmtMin(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function isOff(val) {
  const t = String(val || '').trim();
  if (!t) return true;
  if (OFF_RE.test(t)) return true;
  if (/有休|有給|育休/.test(t)) return true;
  return false;
}

function loadLessons() {
  const rows = parseCsv(fs.readFileSync(LESSON_CSV, 'utf8'));
  const byDow = {};
  for (let i = 1; i < rows.length; i++) {
    const [dow, , start, end, , , instructor] = rows[i];
    if (!dow) continue;
    const d = String(dow).trim().charAt(0);
    const staff = INSTRUCTOR_MAP[String(instructor || '').trim()];
    if (!staff || !TARGET_STAFF.includes(staff)) continue;
    const tr = parseTimeRange(`${start}-${end}`);
    if (!tr) continue;
    if (!byDow[d]) byDow[d] = [];
    byDow[d].push({ staff, start: tr.start, end: tr.end });
  }
  return byDow;
}

function loadKyodoShifts(rows) {
  let endRow = rows.length;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][1] || '').includes('ひばりが丘')) {
      endRow = i;
      break;
    }
  }
  const kyodoRows = rows.slice(0, endRow);
  const dateRow = kyodoRows[2];
  const dowRow = kyodoRows[3];
  const dataStartCol = 2;
  const days = [];
  for (let c = dataStartCol; c < dateRow.length; c++) {
    const d = String(dateRow[c] || '').trim();
    if (!d && days.length > 0) break;
    if (!d) continue;
    const dayNum = parseInt(d.replace(/[^\d]/g, ''), 10);
    if (!dayNum) continue;
    days.push({
      col: c,
      day: dayNum,
      dow: String(dowRow[c] || '').trim().charAt(0),
    });
  }

  const staffData = {};
  for (let i = 4; i < kyodoRows.length - 1; i++) {
    const name = String(kyodoRows[i][1] || '').trim();
    if (!TARGET_STAFF.includes(name)) continue;
    const memoRow = kyodoRows[i + 1];
    const shifts = [];
    for (const d of days) {
      const shiftText = String(kyodoRows[i][d.col] || '').trim();
      const memoText = memoRow ? String(memoRow[d.col] || '').trim() : '';
      shifts.push({ day: d.day, dow: d.dow, shiftText, memoText });
    }
    staffData[name] = shifts;
    i++; // skip memo row
  }
  return { days, staffData };
}

function getWorkRange(shiftText, memoText) {
  if (isOff(shiftText)) return null;
  if (memoText.includes('ひばり')) return null;
  const tr = parseTimeRange(shiftText);
  if (!tr || tr.end <= tr.start) return null;
  return tr;
}

function getBusyBlocks(shiftText, memoText, work, lessonsForDay, staff) {
  const busy = [];
  for (const l of lessonsForDay) {
    if (l.staff === staff) busy.push({ start: l.start, end: l.end });
  }
  const shiftRange = parseTimeRange(shiftText);
  for (const t of parseAllTimeRanges(memoText)) {
    const dur = t.end - t.start;
    if (dur <= 0 || dur >= MAX_TASK_MIN) continue;
    if (shiftRange && t.start === shiftRange.start && t.end === shiftRange.end) continue;
    busy.push(t);
  }
  return busy;
}

function staffFreeAt(staff, dayInfo, lessonsByDow) {
  const { shiftText, memoText, dow } = dayInfo;
  const work = getWorkRange(shiftText, memoText);
  if (!work) return null;
  const lessons = (lessonsByDow[dow] || []).filter((l) => l.staff === staff);
  const busy = getBusyBlocks(shiftText, memoText, work, lessons, staff);
  return { work, busy };
}

function isStaffAvailable(free, slotStart) {
  const slotEnd = slotStart + SLOT_MIN;
  if (slotStart < free.work.start || slotEnd > free.work.end) return false;
  for (const b of free.busy) {
    if (overlaps(slotStart, slotEnd, b.start, b.end)) return false;
  }
  return true;
}

function main() {
  const shiftRows = parseCsv(fs.readFileSync(SHIFT_CSV, 'utf8'));
  const lessonsByDow = loadLessons();
  const { days, staffData } = loadKyodoShifts(shiftRows);

  const slots = [];

  for (const d of days) {
    const date = new Date(YEAR, MONTH - 1, d.day);
    const iso = `${YEAR}-${String(MONTH).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    const label = `${MONTH}月${d.day}日（${d.dow}）`;

    for (let t = GRID_START; t <= GRID_END - SLOT_MIN; t += STEP_MIN) {
      let count = 0;
      const available = [];
      for (const staff of TARGET_STAFF) {
        const dayInfo = staffData[staff].find((x) => x.day === d.day);
        if (!dayInfo) continue;
        const free = staffFreeAt(staff, dayInfo, lessonsByDow);
        if (free && isStaffAvailable(free, t)) {
          count++;
          available.push(staff);
        }
      }
      if (count >= MIN_STAFF) {
        slots.push({
          date: iso,
          label,
          dow: d.dow,
          start: fmtMin(t),
          end: fmtMin(t + SLOT_MIN),
          availableStaffCount: count,
          availableStaff: available,
        });
      }
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    month: `${YEAR}年${MONTH}月`,
    store: '経堂',
    slotDurationMin: SLOT_MIN,
    minStaffAvailable: MIN_STAFF,
    targetStaff: TARGET_STAFF,
    totalSlots: slots.length,
    slots,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Generated ${slots.length} bookable slots → ${OUT_JSON}`);
}

main();
