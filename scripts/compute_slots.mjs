/**
 * シフト + レッスン表 → 予約可能なヨガレッスン（レッスン表の枠そのまま）
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
const MIN_STAFF = 2;
const MAX_TASK_MIN = 240;

const INSTRUCTOR_MAP = {
  YUKI: '由岐恵', Yuki: '由岐恵',
  MIE: '美絵', Mie: '美絵',
  HACHI: '蜂谷', Hachi: '蜂谷',
  Hana: '中田', HANA: '中田',
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

function parseTime(str) {
  const s = toFullWidthDigits(String(str || '')).trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function parseTimeRange(str) {
  if (!str) return null;
  const src = toFullWidthDigits(String(str))
    .replace(/\r?\n/g, ' ')
    .replace(/[：:]/g, ':')
    .replace(/[－ー〜～−‐—]/g, '-')
    .trim();
  const m = src.match(/(\d{1,2})(?::?(\d{2}))?\s*-\s*(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return null;
  return {
    start: parseInt(m[1], 10) * 60 + parseInt(m[2] || '0', 10),
    end: parseInt(m[3], 10) * 60 + parseInt(m[4] || '0', 10),
  };
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

/** ヨガレッスンのみ（ピラティスルーム・ピラティス系を除外） */
function isYogaLesson(area, name) {
  const a = String(area || '').trim();
  const n = String(name || '').trim();
  if (a.includes('ピラティス')) return false;
  if (/ピラティス|サーキット|リズムステップ|フレッチャー/i.test(n)) return false;
  return a.includes('ホット') || a.includes('スタジオ');
}

function loadYogaLessonsFromCsv() {
  const rows = parseCsv(fs.readFileSync(LESSON_CSV, 'utf8'));
  const templates = [];
  for (let i = 1; i < rows.length; i++) {
    const [dow, area, start, end, lessonName, stars, instructor, , note] = rows[i];
    if (!dow || !isYogaLesson(area, lessonName)) continue;
    const startMin = parseTime(start);
    const endMin = parseTime(end);
    if (startMin === null || endMin === null || endMin <= startMin) continue;
    const d = String(dow).trim().charAt(0);
    templates.push({
      id: `${d}-${start}-${end}-${String(lessonName).slice(0, 12)}`.replace(/\s/g, ''),
      dow: d,
      area: String(area).trim(),
      start: fmtMin(startMin),
      end: fmtMin(endMin),
      startMin,
      endMin,
      lessonName: String(lessonName).trim(),
      stars: String(stars || '').trim(),
      instructor: String(instructor || '').trim(),
      note: String(note || '').trim(),
    });
  }
  return templates;
}

/** スタッフのレッスン担当（シフト対象者のみ・空き判定用） */
function loadStaffLessonsByDow() {
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
      shifts.push({
        day: d.day,
        dow: d.dow,
        shiftText: String(kyodoRows[i][d.col] || '').trim(),
        memoText: memoRow ? String(memoRow[d.col] || '').trim() : '',
      });
    }
    staffData[name] = shifts;
    i++;
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

function getBusyBlocks(shiftText, memoText, lessonsForDow, staff) {
  const busy = [];
  for (const l of lessonsForDow) {
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

function isStaffFreeDuring(free, slotStart, slotEnd) {
  if (slotStart < free.work.start || slotEnd > free.work.end) return false;
  for (const b of free.busy) {
    if (overlaps(slotStart, slotEnd, b.start, b.end)) return false;
  }
  return true;
}

function countAvailableStaff(staffData, lessonsByDow, day, slotStart, slotEnd) {
  let count = 0;
  const available = [];
  const dow = staffData[TARGET_STAFF[0]].find((x) => x.day === day)?.dow;
  const lessonsForDow = lessonsByDow[dow] || [];

  for (const staff of TARGET_STAFF) {
    const dayInfo = staffData[staff].find((x) => x.day === day);
    if (!dayInfo) continue;
    const work = getWorkRange(dayInfo.shiftText, dayInfo.memoText);
    if (!work) continue;
    const busy = getBusyBlocks(dayInfo.shiftText, dayInfo.memoText, lessonsForDow, staff);
    const free = { work, busy };
    if (isStaffFreeDuring(free, slotStart, slotEnd)) {
      count++;
      available.push(staff);
    }
  }
  return { count, available };
}

function main() {
  const shiftRows = parseCsv(fs.readFileSync(SHIFT_CSV, 'utf8'));
  const templates = loadYogaLessonsFromCsv();
  const lessonsByDow = loadStaffLessonsByDow();
  const { days, staffData } = loadKyodoShifts(shiftRows);

  const bookable = [];

  for (const d of days) {
    const iso = `${YEAR}-${String(MONTH).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    const dateLabel = `${MONTH}月${d.day}日（${d.dow}）`;

    for (const tpl of templates) {
      if (tpl.dow !== d.dow) continue;

      const { count, available } = countAvailableStaff(
        staffData,
        lessonsByDow,
        d.day,
        tpl.startMin,
        tpl.endMin
      );

      if (count >= MIN_STAFF) {
        bookable.push({
          id: `${iso}-${tpl.id}`,
          date: iso,
          dateLabel,
          dow: d.dow,
          start: tpl.start,
          end: tpl.end,
          durationMin: tpl.endMin - tpl.startMin,
          lessonName: tpl.lessonName,
          stars: tpl.stars,
          instructor: tpl.instructor,
          area: tpl.area,
          note: tpl.note,
          availableStaffCount: count,
          availableStaff: available,
        });
      }
    }
  }

  const dowOrder = ['月', '火', '水', '木', '金', '土', '日'];
  const scheduleByDow = {};
  for (const tpl of templates) {
    if (!scheduleByDow[tpl.dow]) scheduleByDow[tpl.dow] = [];
    scheduleByDow[tpl.dow].push({
      id: tpl.id,
      start: tpl.start,
      end: tpl.end,
      lessonName: tpl.lessonName,
      stars: tpl.stars,
      instructor: tpl.instructor,
      note: tpl.note,
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    month: `${YEAR}年${MONTH}月`,
    store: '経堂',
    type: 'yoga-lessons',
    minStaffAvailable: MIN_STAFF,
    scheduleByDow,
    dowOrder,
    totalBookable: bookable.length,
    bookable,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Generated ${bookable.length} bookable yoga lessons → ${OUT_JSON}`);
}

main();
