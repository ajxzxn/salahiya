// Salahiya — local-first document-expiry tracker. No network calls, no third-party code.
'use strict';

const CONFIG = {
  // Live payments stay OFF until the owner picks a merchant account. While off, there is no document limit.
  PAYMENTS_LIVE: false,
  FREE_LIMIT: 10,
  PRICES: { pro: 199, office: 499 },
  LIVE_KEY: { kty: 'EC', crv: 'P-256', x: 'FNSuXQhudBhb3pPAfK_f3ffLAoxC0ZA8dfMW0e3WyQA', y: 'N6aFlJQ9OFKRzXy_lb5kVw5TpqpxW0JZjRNo6iRziPc' },
  TEST_KEY: { kty: 'EC', crv: 'P-256', x: 'Uyj6F_c7cDZg_8_SJJ2WvLjpFFLyJ30P-ikDqenKJwM', y: 'ChEG28N-ORr683RGGQXS5KvJZupdnVAo8LGTixDET4c' },
  // Pre-issued TEST licence returned by the simulated checkout. Accepted only in test mode.
  TEST_LICENCE: 'SLH1.eyJ2IjoxLCJwIjoicHJvIiwibiI6ItmF2YbYtNij2Kkg2KrYrNix2YrYqNmK2KkiLCJlIjoiMjAzNi0xMC0xMSIsImkiOiI2MzI3MjI3ZTNhZDIiLCJ0IjoxfQ.PudhmkZ1AmxRyH4J6s5r7BmqGAoBxUSLgv05tt39-VoLO57pgP5mGtVl8RyT8SgxlTW-QQ7A7kyL5FVqOnbsXg',
  MAX_DOCS: 5000,
};

const TYPES = [
  ['iqama', 'إقامة', 'worker'], ['permit', 'رخصة عمل', 'worker'], ['passport', 'جواز سفر', 'worker'],
  ['health', 'شهادة صحية', 'worker'], ['reentry', 'تأشيرة خروج وعودة', 'worker'], ['license', 'رخصة قيادة', 'worker'],
  ['medins', 'تأمين طبي', 'worker'], ['contract', 'عقد عمل', 'worker'],
  ['cr', 'تأكيد السجل التجاري السنوي', 'est'], ['balady', 'رخصة بلدي (النشاط)', 'est'], ['civil', 'شهادة الدفاع المدني', 'est'],
  ['chamber', 'عضوية الغرفة التجارية', 'est'], ['zakat', 'شهادة الزكاة', 'est'], ['gosi', 'شهادة التأمينات الاجتماعية', 'est'],
  ['nitaqat', 'شهادة السعودة', 'est'], ['lease', 'عقد الإيجار', 'est'], ['istimara', 'استمارة مركبة', 'est'],
  ['vehins', 'تأمين مركبة', 'est'], ['fahs', 'الفحص الدوري', 'est'], ['other', 'أخرى', 'any'],
];
const TYPE_LABEL = Object.fromEntries(TYPES.map(([k, l]) => [k, l]));
const STORE_KEY = 'salahiya.v1';
const $ = (s, r = document) => r.querySelector(s);

/* ---------- storage (never throws) ---------- */
let state = { docs: [], licence: null };
let storageOk = true;
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const s = JSON.parse(raw); state = { docs: Array.isArray(s.docs) ? s.docs.map(clean).filter(Boolean) : [], licence: typeof s.licence === 'string' ? s.licence : null }; }
  } catch (e) { storageOk = false; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); storageOk = true; }
  catch (e) { storageOk = false; }
  renderStorageWarning();
}
function clean(d) {
  if (!d || typeof d !== 'object') return null;
  const date = String(d.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(utcOf(date))) return null;
  return {
    id: String(d.id || uid()).slice(0, 24),
    holder: String(d.holder || '').trim().slice(0, 80) || 'المنشأة',
    type: TYPE_LABEL[d.type] ? d.type : 'other',
    date,
    note: String(d.note || '').trim().slice(0, 160),
    est: String(d.est || '').trim().slice(0, 80),
  };
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ---------- dates ---------- */
function utcOf(iso) { const [y, m, d] = iso.split('-').map(Number); const t = Date.UTC(y, m - 1, d); const c = new Date(t); return (c.getUTCFullYear() === y && c.getUTCMonth() === m - 1 && c.getUTCDate() === d) ? t : NaN; }
function todayUTC(now = new Date()) { return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()); }
function daysLeft(iso, now) { return Math.round((utcOf(iso) - todayUTC(now)) / 86400000); }
function isoFromUTC(t) { return new Date(t).toISOString().slice(0, 10); }
function bucket(n) { return n < 0 ? 'expired' : n <= 30 ? 'soon' : n <= 90 ? 'mid' : 'valid'; }

const HIJRI_OK = (() => { try { return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: 'UTC' }).resolvedOptions().calendar === 'islamic-umalqura'; } catch (e) { return false; } })();
const hFmt = HIJRI_OK ? new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' }) : null;
function hijriParts(t) { const p = {}; for (const x of hFmt.formatToParts(new Date(t))) if (x.type !== 'literal') p[x.type] = parseInt(x.value, 10); return p; }
function hijriLabel(iso) { if (!HIJRI_OK) return ''; const p = hijriParts(utcOf(iso)); return `${p.year}/${String(p.month).padStart(2, '0')}/${String(p.day).padStart(2, '0')} هـ`; }
const ltr = (s) => '\u2066' + s + '\u2069'; // keep dates left-to-right inside Arabic text
// Umm al-Qura Hijri -> Gregorian ISO, by searching around an estimate. Returns null for an impossible date.
function hijriToIso(y, m, d) {
  if (!HIJRI_OK || m < 1 || m > 12 || d < 1 || d > 30 || y < 1350 || y > 1550) return null;
  const epoch = Date.UTC(622, 6, 19);
  const est = epoch + Math.round(((y - 1) * 354.36667 + (m - 1) * 29.5306 + (d - 1)) * 86400000);
  for (let k = 0; k <= 60; k++) for (const s of k ? [k, -k] : [0]) {
    const t = est + s * 86400000; const p = hijriParts(t);
    if (p.year === y && p.month === m && p.day === d) return isoFromUTC(t);
  }
  return null;
}
const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
function normDigits(s) { return String(s).replace(/[٠-٩۰-۹]/g, (c) => AR_DIGITS[c]); }
// Accepts 2026-11-03, 03/11/2026, 1448/05/12, 12-05-1448 (Arabic or Latin digits). Year decides the calendar.
function parseAnyDate(raw) {
  const s = normDigits(raw).trim().replace(/\s*هـ?$/, '');
  const m = s.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);
  if (!m) return null;
  let [a, b, c] = [m[1], m[2], m[3]].map(Number);
  let y, mo, d;
  if (m[1].length === 4) { y = a; mo = b; d = c; } else if (m[3].length === 4) { y = c; mo = b; d = a; } else return null;
  if (y >= 1900 && y <= 2200) { const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return isNaN(utcOf(iso)) ? null : { iso, cal: 'g' }; }
  if (y >= 1350 && y <= 1550) { const iso = hijriToIso(y, mo, d); return iso ? { iso, cal: 'h' } : null; }
  return null;
}

/* ---------- licence (ECDSA P-256, verified locally) ---------- */
const TEST_MODE = (() => { try { return new URLSearchParams(location.search).get('pay') === 'test'; } catch (e) { return false; } })();
const paymentsOn = () => CONFIG.PAYMENTS_LIVE || TEST_MODE;
function b64uToBytes(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); }
async function verifyLicence(key, now = new Date()) {
  try {
    const parts = String(key || '').trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'SLH1') return { ok: false, why: 'صيغة المفتاح غير صحيحة' };
    const payload = JSON.parse(new TextDecoder().decode(b64uToBytes(parts[1])));
    if (payload.t === 1 && !TEST_MODE) return { ok: false, why: 'هذا مفتاح تجريبي ولا يعمل في النسخة الفعلية' };
    const jwk = payload.t === 1 ? CONFIG.TEST_KEY : CONFIG.LIVE_KEY;
    const pub = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const good = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64uToBytes(parts[2]), new TextEncoder().encode(parts[1]));
    if (!good) return { ok: false, why: 'المفتاح غير صالح' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.e) || daysLeft(payload.e, now) < 0) return { ok: false, why: 'انتهت صلاحية الترخيص' };
    if (!['pro', 'office'].includes(payload.p)) return { ok: false, why: 'خطة غير معروفة' };
    return { ok: true, plan: payload.p, name: payload.n || '', exp: payload.e, test: payload.t === 1 };
  } catch (e) { return { ok: false, why: 'المفتاح غير صالح' }; }
}
let plan = { ok: false };
const limitReached = () => paymentsOn() && !plan.ok && state.docs.length >= CONFIG.FREE_LIMIT;

/* ---------- ICS export ---------- */
function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function foldLine(line) {
  const enc = new TextEncoder(); const out = []; let cur = ''; let bytes = 0;
  for (const ch of line) { const b = enc.encode(ch).length; if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; } cur += ch; bytes += b; }
  out.push(cur); return out.join('\r\n ');
}
function buildIcs(docs, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Salahiya//AR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:صلاحية — مواعيد الانتهاء'];
  for (const d of docs) {
    const start = d.date.replace(/-/g, ''); const end = isoFromUTC(utcOf(d.date) + 86400000).replace(/-/g, '');
    const title = `انتهاء ${TYPE_LABEL[d.type]} — ${d.holder}`;
    L.push('BEGIN:VEVENT', `UID:${d.id}@salahiya`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${icsEscape(title)}`, `DESCRIPTION:${icsEscape([d.est && 'المنشأة: ' + d.est, d.note, 'جدّد قبل الموعد عبر المنصة الرسمية.'].filter(Boolean).join('\n'))}`, 'TRANSP:TRANSPARENT');
    for (const [trig, txt] of [['-P29DT15H', 'بعد 30 يومًا'], ['-P6DT15H', 'بعد 7 أيام'], ['-PT15H', 'غدًا']]) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${trig}`, `DESCRIPTION:${icsEscape(title + ' — ' + txt)}`, 'END:VALARM');
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(foldLine).join('\r\n') + '\r\n';
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- bulk paste ---------- */
function matchType(s) {
  const t = String(s || '').trim();
  if (!t) return 'other';
  for (const [k, l] of TYPES) if (l === t) return k;
  const n = t.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه');
  const rules = [['iqama', /اقام/], ['permit', /رخصه عمل|تصريح عمل/], ['passport', /جواز/], ['health', /صحي/], ['reentry', /خروج|عوده/],
    ['license', /رخصه قياده|قياده/], ['medins', /تامين طبي/], ['contract', /عقد عمل/], ['cr', /سجل/], ['balady', /بلدي|بلديه/], ['civil', /دفاع/],
    ['chamber', /غرفه/], ['zakat', /زكا/], ['gosi', /تامينات/], ['nitaqat', /سعوده|نطاقات/], ['lease', /ايجار/], ['istimara', /استمار/],
    ['vehins', /تامين مركب|تامين سياره/], ['fahs', /فحص/]];
  for (const [k, re] of rules) if (re.test(n)) return k;
  return 'other';
}
function parseBulk(text) {
  const ok = []; const bad = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = line.split(/\t|,|،|;/).map((c) => c.trim());
    if (cells.length < 3) { bad.push(i + 1); return; }
    const dateIdx = cells.findIndex((c) => parseAnyDate(c));
    if (dateIdx < 0) { bad.push(i + 1); return; }
    const rest = cells.filter((_, j) => j !== dateIdx);
    const typeRaw = rest[1] || ''; const type = matchType(typeRaw);
    ok.push(clean({ id: uid(), holder: rest[0], type, date: parseAnyDate(cells[dateIdx]).iso, note: type === 'other' ? typeRaw : (rest.slice(2).join(' ')) }));
  });
  return { ok: ok.filter(Boolean), bad };
}

/* ---------- UI ---------- */
let filter = 'all'; let query = ''; let editingId = null; let cal = 'g';
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._h); toast._h = setTimeout(() => t.classList.remove('show'), 2600); }
function el(tag, attrs = {}, ...kids) { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } for (const k of kids) e.append(k); return e; }
function pillText(n) { if (n < 0) return `منتهية منذ ${-n} يوم`; if (n === 0) return 'تنتهي اليوم'; if (n === 1) return 'تنتهي غدًا'; return `باقي ${n} يوم`; }
function renderStorageWarning() { const w = $('#storage-warn'); if (w) w.hidden = storageOk; }

function render() {
  const now = new Date();
  const rows = state.docs.map((d) => ({ d, n: daysLeft(d.date, now) })).sort((a, b) => a.n - b.n);
  const counts = { expired: 0, soon: 0, mid: 0, valid: 0 };
  rows.forEach((r) => counts[bucket(r.n)]++);
  for (const k of Object.keys(counts)) { $(`#c-${k}`).textContent = counts[k]; $(`.stat.${k}`).setAttribute('aria-pressed', String(filter === k)); }
  const q = query.trim();
  const shown = rows.filter((r) => (filter === 'all' || bucket(r.n) === filter) && (!q || [r.d.holder, TYPE_LABEL[r.d.type], r.d.note, r.d.est].join(' ').includes(q)));
  const list = $('#list'); list.replaceChildren();
  if (!state.docs.length) {
    list.append(el('div', { class: 'empty' }, el('p', {}, 'لا توجد وثائق بعد.'), el('p', {}, 'أضف أول إقامة أو رخصة، أو الصق قائمتك من إكسل.')));
  } else if (!shown.length) {
    list.append(el('div', { class: 'empty' }, 'لا نتائج تطابق البحث أو التصفية.'));
  }
  for (const { d, n } of shown) {
    const sub = [TYPE_LABEL[d.type], d.est, `${ltr(d.date)} · ${ltr(hijriLabel(d.date).replace(' هـ', ''))} هـ`, d.note].filter(Boolean).join(' · ');
    list.append(el('div', { class: 'item', 'data-id': d.id },
      el('span', { class: `pill ${bucket(n)}` }, pillText(n)),
      el('div', {}, el('div', { class: 't' }, d.holder), el('div', { class: 's' }, sub)),
      el('div', { class: 'acts' },
        el('button', { class: 'btn small', type: 'button', 'aria-label': 'تعديل', onclick: () => openEdit(d.id) }, 'تعديل'),
        el('button', { class: 'btn small danger', type: 'button', 'aria-label': 'حذف', onclick: () => remove(d.id) }, 'حذف'))));
  }
  $('#total').textContent = state.docs.length;
  renderPlan();
}
function renderPlan() {
  const p = $('#plan-line');
  if (plan.ok) p.textContent = `خطتك: ${plan.plan === 'office' ? 'مكتب التعقيب' : 'المنشأة'}${plan.test ? ' (تجريبية)' : ''} — سارية حتى ${ltr(plan.exp)}`;
  else if (!paymentsOn()) p.textContent = 'الإطلاق المبكر: كل المزايا مجانية حاليًا وبلا حد.';
  else p.textContent = `الخطة المجانية: ${state.docs.length} من ${CONFIG.FREE_LIMIT} وثائق.`;
  $('#btn-upgrade').hidden = plan.ok;
}

function openAdd() {
  if (limitReached()) { openUpgrade(true); return; }
  editingId = null; $('#dlg-title').textContent = 'إضافة وثيقة'; $('#f-holder').value = ''; $('#f-type').value = 'iqama';
  $('#f-date').value = ''; $('#f-note').value = ''; $('#f-est').value = ''; setCal('g'); $('#date-hint').textContent = ''; $('#dlg-doc').showModal(); $('#f-holder').focus();
}
function openEdit(id) {
  const d = state.docs.find((x) => x.id === id); if (!d) return;
  editingId = id; $('#dlg-title').textContent = 'تعديل وثيقة'; $('#f-holder').value = d.holder; $('#f-type').value = d.type;
  setCal('g'); $('#f-date').value = d.date; $('#f-note').value = d.note; $('#f-est').value = d.est; updateDateHint(); $('#dlg-doc').showModal();
}
function setCal(c) {
  cal = c; for (const b of document.querySelectorAll('#cal-seg button')) b.setAttribute('aria-pressed', String(b.dataset.cal === c));
  $('#f-date').placeholder = c === 'h' ? '1448/05/12' : '2026-11-03';
  updateDateHint();
}
function dateFromForm() {
  const raw = $('#f-date').value.trim(); if (!raw) return null;
  const r = parseAnyDate(raw); if (!r) return null;
  if (cal === 'h' && r.cal !== 'h') return null; if (cal === 'g' && r.cal !== 'g') return null;
  return r.iso;
}
function updateDateHint() {
  const h = $('#date-hint'); const raw = $('#f-date').value.trim(); h.classList.remove('err');
  if (!raw) { h.textContent = cal === 'h' ? 'اكتب التاريخ الهجري كما في أبشر أو مقيم.' : ''; return; }
  const iso = dateFromForm();
  if (!iso) { h.textContent = cal === 'h' ? 'تاريخ هجري غير صحيح — الصيغة: سنة/شهر/يوم' : 'تاريخ غير صحيح — الصيغة: 2026-11-03'; h.classList.add('err'); return; }
  h.textContent = cal === 'h' ? `يوافق ${ltr(iso)} م — ${pillText(daysLeft(iso))}` : `يوافق ${ltr(hijriLabel(iso).replace(' هـ', ''))} هـ — ${pillText(daysLeft(iso))}`;
}
function submitDoc(ev) {
  ev.preventDefault();
  const iso = dateFromForm();
  if (!iso) { updateDateHint(); $('#date-hint').classList.add('err'); if (!$('#f-date').value.trim()) $('#date-hint').textContent = 'التاريخ مطلوب.'; $('#f-date').focus(); return; }
  const doc = clean({ id: editingId || uid(), holder: $('#f-holder').value, type: $('#f-type').value, date: iso, note: $('#f-note').value, est: $('#f-est').value });
  if (editingId) state.docs = state.docs.map((x) => (x.id === editingId ? doc : x)); else state.docs.push(doc);
  save(); render(); $('#dlg-doc').close(); toast(editingId ? 'تم الحفظ' : 'أُضيفت الوثيقة');
}
function remove(id) {
  const d = state.docs.find((x) => x.id === id); if (!d) return;
  if (!confirm(`حذف ${TYPE_LABEL[d.type]} — ${d.holder}؟`)) return;
  state.docs = state.docs.filter((x) => x.id !== id); save(); render(); toast('حُذفت الوثيقة');
}
function doBulk() {
  const { ok, bad } = parseBulk($('#bulk-text').value);
  if (!ok.length) { $('#bulk-hint').textContent = 'لم أجد صفوفًا صالحة. كل سطر: الاسم، نوع الوثيقة، تاريخ الانتهاء.'; $('#bulk-hint').classList.add('err'); return; }
  let room = CONFIG.MAX_DOCS - state.docs.length;
  if (paymentsOn() && !plan.ok) room = Math.min(room, CONFIG.FREE_LIMIT - state.docs.length);
  const take = ok.slice(0, Math.max(0, room));
  state.docs.push(...take); save(); render(); $('#dlg-bulk').close();
  toast(`أُضيفت ${take.length} وثيقة${bad.length ? ` — وتُجوهلت أسطر غير صالحة: ${bad.slice(0, 8).join('، ')}` : ''}`);
  if (take.length < ok.length) openUpgrade(true);
}
function exportIcs() {
  if (!state.docs.length) { toast('أضف وثيقة أولًا'); return; }
  const upcoming = state.docs.filter((d) => daysLeft(d.date) >= -1);
  if (!upcoming.length) { toast('كل الوثائق منتهية — جدّدها ثم حدّث تواريخها'); return; }
  download('salahiya-reminders.ics', buildIcs(upcoming), 'text/calendar;charset=utf-8');
  toast(`صدّرتُ ${upcoming.length} موعدًا بتنبيهات قبل 30 و7 أيام ويوم`);
}
function exportBackup() { download(`salahiya-backup-${isoFromUTC(todayUTC())}.json`, JSON.stringify({ app: 'salahiya', v: 1, docs: state.docs }, null, 1), 'application/json'); toast('حُفظت النسخة الاحتياطية'); }
function importBackup(file) {
  if (!file) return;
  if (file.size > 2_000_000) { toast('الملف كبير جدًا'); return; }
  file.text().then((t) => {
    const j = JSON.parse(t); if (!j || j.app !== 'salahiya' || !Array.isArray(j.docs)) throw new Error('bad');
    const docs = j.docs.map(clean).filter(Boolean).slice(0, CONFIG.MAX_DOCS);
    if (state.docs.length && !confirm(`استبدال ${state.docs.length} وثيقة حالية بـ ${docs.length} من النسخة الاحتياطية؟`)) return;
    state.docs = docs; save(); render(); toast(`استُعيدت ${docs.length} وثيقة`);
  }).catch(() => toast('هذا ليس ملف نسخة احتياطية من صلاحية'));
}
function openUpgrade(fromLimit) {
  $('#up-limit').hidden = !fromLimit;
  $('#up-live').hidden = !paymentsOn(); $('#up-soon').hidden = paymentsOn();
  $('#lic-hint').textContent = ''; $('#dlg-up').showModal();
}
async function applyLicence(key) {
  const r = await verifyLicence(key);
  const h = $('#lic-hint');
  if (!r.ok) { h.textContent = r.why; h.classList.add('err'); return false; }
  state.licence = key.trim(); plan = r; save(); render(); h.classList.remove('err'); h.textContent = 'تم التفعيل'; toast('تم تفعيل الترخيص'); $('#dlg-up').close(); return true;
}
function simulateCheckout(planKey) {
  // TEST MODE ONLY: no gateway, no money. Mimics "paid → licence key issued" with the pre-signed TEST licence.
  if (!TEST_MODE) return;
  $('#lic-input').value = CONFIG.TEST_LICENCE;
  toast(`دفع تجريبي لخطة ${planKey === 'office' ? 'مكتب التعقيب' : 'المنشأة'} — لم يُخصم شيء`);
  applyLicence(CONFIG.TEST_LICENCE);
}

async function init() {
  load();
  renderStorageWarning();
  if (TEST_MODE) { $('#test-banner').hidden = false; for (const b of document.querySelectorAll('[data-buy]')) b.hidden = false; }
  const sel = $('#f-type');
  for (const [k, l, g] of TYPES) sel.append(el('option', { value: k }, l + (g === 'est' ? ' (المنشأة)' : '')));
  if (!HIJRI_OK) $('#cal-seg button[data-cal="h"]').disabled = true;
  if (state.licence) { const r = await verifyLicence(state.licence); plan = r.ok ? r : { ok: false }; }
  $('#btn-add').addEventListener('click', openAdd);
  $('#btn-bulk').addEventListener('click', () => { if (limitReached()) return openUpgrade(true); $('#bulk-text').value = ''; $('#bulk-hint').textContent = ''; $('#bulk-hint').classList.remove('err'); $('#dlg-bulk').showModal(); });
  $('#btn-ics').addEventListener('click', exportIcs);
  $('#btn-backup').addEventListener('click', exportBackup);
  $('#btn-restore').addEventListener('click', () => $('#file-restore').click());
  $('#file-restore').addEventListener('change', (e) => { importBackup(e.target.files[0]); e.target.value = ''; });
  $('#btn-upgrade').addEventListener('click', () => openUpgrade(false));
  $('#form-doc').addEventListener('submit', submitDoc);
  $('#f-date').addEventListener('input', updateDateHint);
  for (const b of document.querySelectorAll('#cal-seg button')) b.addEventListener('click', () => setCal(b.dataset.cal));
  $('#bulk-go').addEventListener('click', doBulk);
  $('#lic-apply').addEventListener('click', () => applyLicence($('#lic-input').value));
  for (const b of document.querySelectorAll('[data-buy]')) b.addEventListener('click', () => simulateCheckout(b.dataset.buy));
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => b.closest('dialog').close());
  for (const s of document.querySelectorAll('.stat')) s.addEventListener('click', () => { filter = filter === s.dataset.f ? 'all' : s.dataset.f; render(); });
  $('#search').addEventListener('input', (e) => { query = e.target.value; render(); });
  render();
}
if (typeof window !== 'undefined' && document.getElementById('app-root')) init();
// exposed for tests
if (typeof window !== 'undefined') window.__salahiya = { parseAnyDate, hijriToIso, hijriLabel, daysLeft, buildIcs, parseBulk, matchType, verifyLicence };
