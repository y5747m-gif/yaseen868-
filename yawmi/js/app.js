/* ============================================================
 * يومي | YAWMI — app.js (واجهة التطبيق)
 * ============================================================ */
import * as C from './core.js';

const { TYPES, CATEGORIES, DAYS_AR, fmt12, dateKey, addDays, startOfWeek, dayIdx, toMin, fromMin, arDate, newId } = C;
const KEY = 'yawmi:v1';
const TIMER_KEY = 'yawmi:timer';
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  pause: '<path d="M7 4h4v16H7zM15 4h4v16h-4z"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  next: '<path d="M15 6l-6 6 6 6"/>',
  alarm: '<circle cx="12" cy="13" r="7"/><path d="M12 9v4l2 2M5 3L2 6M22 6l-3-3"/>',
  down: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  up: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
};
const icon = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const STATUS_LABEL = { done: 'تم', skipped: 'لم يُنفَّذ', postponed: 'مؤجل' };
const PRIORITY_LABEL = { 1: 'عالية', 2: 'متوسطة', 3: 'منخفضة' };

let state;
let readOnly = false;
let saveFailed = false;
let timer;
const ui = {
  tab: 'home',
  selDate: dateKey(),
  search: '',
  typeFilter: '',
  taskFilter: 'today',
  histFilter: 'all',
  audio: null,
  ringQueue: [],
  ringing: null,
  ringTimer: null,
  vibTimer: null,
  toastTimer: null,
};

/* ================= التخزين ================= */

function loadState() {
  const now = new Date();
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { saveFailed = true; }
  if (!raw) return C.createDefaultState(now);
  try {
    return C.migrate(JSON.parse(raw), now);
  } catch (err) {
    try { localStorage.setItem(KEY + ':backup:' + Date.now(), raw); } catch { /* ignore */ }
    if (err instanceof C.DataError) readOnly = true;
    pendingNotice = readOnly
      ? 'البيانات المحفوظة من إصدار أحدث من التطبيق، لذلك فُتحت للقراءة فقط لحمايتها.'
      : 'تعذّر قراءة البيانات المحفوظة. حُفظت نسخة احتياطية منها، وبدأ التطبيق ببيانات افتراضية.';
    return C.createDefaultState(now);
  }
}
let pendingNotice = null;

function save() {
  if (readOnly) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveFailed = false;
  } catch {
    saveFailed = true;
    toast('تعذّر الحفظ: مساحة التخزين ممتلئة. صدّر نسخة احتياطية من حسابي.', 'error', 6000);
  }
}

function mutate(fn, msg) {
  if (readOnly) { toast('التطبيق للقراءة فقط حاليًا.', 'error'); return; }
  fn(state);
  save();
  render();
  if (msg) toast(msg, 'ok');
}

function saveTimer() {
  try { localStorage.setItem(TIMER_KEY, JSON.stringify(timer)); } catch { /* ignore */ }
}

function loadTimer() {
  const fallback = { phase: 'study', plannedMin: null, subjectId: '', goal: '', endAt: null, leftMs: null, running: false, cycles: 0 };
  try { return { ...fallback, ...(JSON.parse(localStorage.getItem(TIMER_KEY)) || {}) }; } catch { return fallback; }
}

/* ================= أدوات الواجهة ================= */

function toast(msg, kind = 'info', ms = 3200) {
  const el = $('#toast');
  el.className = 'toast show ' + kind;
  el.textContent = msg;
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function openSheet(title, html, { wide = false, onMount } = {}) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.id = 'sheet';
  wrap.innerHTML = `<div class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-act="close-sheet" aria-label="إغلاق">${icon('x')}</button></div>
    <div class="sheet-body">${html}</div></div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeSheet(); });
  document.body.appendChild(wrap);
  document.body.classList.add('locked');
  if (onMount) onMount(wrap);
  const first = wrap.querySelector('input,select,textarea,button:not([data-act="close-sheet"])');
  if (first && first.focus && !first.matches('[type=color]')) setTimeout(() => first.focus({ preventScroll: true }), 30);
  return wrap;
}

function closeSheet() {
  $('#sheet')?.remove();
  document.body.classList.toggle('locked', !!ui.ringing);
}

function confirmBox(title, text, okLabel, onOk, danger = true) {
  openSheet(title, `
    <p class="muted">${esc(text)}</p>
    <div class="row-btns">
      <button class="btn ${danger ? 'danger' : 'primary'}" data-act="confirm-ok">${esc(okLabel)}</button>
      <button class="btn ghost" data-act="close-sheet">إلغاء</button>
    </div>`, {
    onMount: (w) => w.querySelector('[data-act="confirm-ok"]').addEventListener('click', () => { closeSheet(); onOk(); }),
  });
}

function formatCountdown(ms) {
  if (ms <= 0) return 'الآن';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  if (h >= 1) return `${h} ساعة و${m} دقيقة`;
  if (m >= 1) return `${m} دقيقة و${String(s).padStart(2, '0')} ثانية`;
  return `${s} ثانية`;
}

function subjectOf(id) { return state.subjects.find((s) => s.id === id) || null; }
function colorOf(o) {
  const sub = subjectOf(o.subject);
  return sub && o.type === 'lesson' ? sub.color : TYPES[o.type]?.color || '#64748b';
}
function eventIdOf(occId) { return occId.slice(0, occId.lastIndexOf('@')); }
function dateOfOcc(occId) { return occId.slice(occId.lastIndexOf('@') + 1); }
function greeting(now) {
  const h = now.getHours();
  const name = state.settings.name ? '، ' + esc(state.settings.name) : '';
  if (h < 12) return 'صباح الخير' + name;
  if (h < 18) return 'مساء الخير' + name;
  return 'مساء النور' + name;
}
function hm(ms) { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function nowMinOf(d) { return d.getHours() * 60 + d.getMinutes(); }
function nowParts(d) {
  let h = d.getHours(); const m = d.getMinutes(), s = d.getSeconds();
  const suffix = h < 12 ? 'صباحًا' : 'مساءً';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${suffix}`;
}
function ringSvg(p, size = 124) {
  const r = 52, c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="60" r="${r}" class="ring-bg"/>
    <circle cx="60" cy="60" r="${r}" class="ring-fg" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - p / 100)).toFixed(1)}" transform="rotate(-90 60 60)"/></svg>`;
}

/* ================= الجدول اليومي ================= */

function dayOccurrences(date) {
  return C.occurrencesOn(state, date);
}

function evRow(o, date, now) {
  const today = dateKey(now);
  const nowMin = nowMinOf(now);
  const isNow = o.counts && date === today && o.startMin <= nowMin && nowMin < o.endMin;
  const past = date < today || (date === today && o.endMin <= nowMin);
  const sub = subjectOf(o.subject);
  const tentative = !o.confirmed;
  const cls = ['ev', isNow ? 'now' : '', tentative ? 'tentative' : '', o.status === 'done' ? 'done' : '', o.status === 'skipped' || o.status === 'postponed' ? 'resolved' : ''].join(' ');
  let actions = '';
  if (o.counts && past && !o.status && date <= today) {
    actions = `<div class="ev-actions">
      <button class="chip ok" data-act="resolve" data-occ="${esc(o.occId)}" data-status="done">${icon('check')} تم</button>
      <button class="chip" data-act="resolve" data-occ="${esc(o.occId)}" data-status="skipped">لم يُنفَّذ</button>
      ${o.type !== 'lesson' ? `<button class="chip" data-act="resolve" data-occ="${esc(o.occId)}" data-status="postponed">تأجيل</button>` : ''}
    </div>`;
  } else if (o.status) {
    actions = `<div class="ev-actions"><span class="badge ${o.status === 'done' ? 'ok' : 'warn'}">${STATUS_LABEL[o.status]}</span>
      ${o.status !== 'done' ? `<button class="chip" data-act="resolve" data-occ="${esc(o.occId)}" data-status="clear">تراجع</button>` : ''}</div>`;
  }
  return `<article class="${cls}" style="--c:${colorOf(o)}">
    <button class="ev-main" data-act="open-event" data-occ="${esc(o.occId)}" aria-label="تفاصيل ${esc(o.title)}">
      <div class="ev-time"><b>${fmt12(o.start)}</b><small>${fmt12(o.end)}</small></div>
      <div class="ev-body">
        <strong>${esc(o.title)}</strong>
        <small>${TYPES[o.type].label}${sub ? ' · ' + esc(sub.name) : ''}${tentative ? ' · <span class="warn-t">غير مؤكدة</span>' : ''}${isNow ? ' · <span class="now-t">الآن</span>' : ''}</small>
      </div></button>
    ${actions}
  </article>`;
}

function suggestionRow(o) {
  return `<article class="ev suggest" style="--c:#94a3b8">
    <div class="ev-main static"><div class="ev-time"><b>${fmt12(o.start)}</b><small>${fmt12(o.end)}</small></div>
    <div class="ev-body"><strong>${esc(o.title)}</strong><small>وقت مقترح: مذاكرة أو راحة إن لم تُؤكَّد الحصة</small></div></div>
    <div class="ev-actions"><button class="chip" data-act="confirm-optional" data-id="${esc(o.id)}">تأكيد الحصة</button>
    <button class="chip" data-act="add-suggested" data-occ="${esc(o.occId)}">جعلها مذاكرة</button></div></article>`;
}

/* ================= الرئيسية ================= */

function renderHome(now) {
  const today = dateKey(now);
  const occ = dayOccurrences(today);
  const countable = occ.filter((o) => o.counts && !['sleep', 'break', 'meal'].includes(o.type));
  const done = countable.filter((o) => o.status === 'done').length;
  const progress = pct(done, countable.length);
  const next = C.nextLesson(state, now);
  const cur = C.currentBlock(state, now);
  const na = C.nextAlarm(state, now);
  const tasksOpen = state.tasks.filter((t) => !t.done && (!t.due || t.due.slice(0, 10) <= today)).sort((a, b) => (a.due || 'z').localeCompare(b.due || 'z'));
  const conflicts = C.findConflicts(state, today);
  const stats = C.studyStats(state, today);
  const plannedStudy = occ.filter((o) => o.type === 'study' && o.counts).reduce((a, o) => a + (o.endMin - o.startMin), 0);
  const water = (state.habitLog[today] || {})['h-water'] || 0;
  const missedStudy = occ.filter((o) => o.type === 'study' && o.counts && !o.status && o.endMin <= nowMinOf(now));
  const revs = C.revisionsDue(state, today);
  const exDone = (state.habitLog[today] || {})['h-exercise'] >= 1;
  const nextLessonCard = next ? `
      <div class="card hero">
        <div class="hero-top"><span class="badge">${next.inProgress ? 'جارية الآن' : 'الحصة القادمة'}</span><span class="muted">${arDate(next.date)}</span></div>
        <h3>${esc(next.title)}</h3>
        <p>${fmt12(next.start)} — ${fmt12(next.end)}</p>
        <div class="countdown"><span>${next.inProgress ? 'تنتهي خلال' : 'تبدأ خلال'}</span><b data-live="next">${formatCountdown((next.inProgress ? next.endAt : next.startAt) - now.getTime())}</b></div>
      </div>` : `<div class="card"><h3>لا توجد حصص قادمة</h3><p class="muted">أضف حصصًا من شاشة الجدول متى احتجت.</p></div>`;

  return `
  <section class="stack">
    <header class="page-head home-head">
      <div>
        <p class="eyebrow">${esc(state.settings.schoolYear)} · ${esc(state.settings.section)}</p>
        <h1>${greeting(now)}</h1>
        <p class="muted">${arDate(today)}</p>
      </div>
      <button class="icon-btn bell" data-act="open-notifs" aria-label="مركز الإشعارات">${icon('bell')}${notifCount() ? `<span class="dot">${notifCount()}</span>` : ''}</button>
    </header>

    <div class="clock-card card">
      <div><small>الوقت الآن</small><b class="clock" data-live="clock">${nowParts(now)}</b></div>
      <button class="chip ${na ? '' : 'muted-chip'}" data-act="go-alarms">${icon('alarm')} ${na ? 'المنبه القادم: ' + fmt12(hm(na.at)) : 'لا منبه قادم'}</button>
    </div>

    ${pendingWarn()}
    ${conflicts.length ? `<div class="alert danger">${icon('alert')}<div><b>يوجد ${conflicts.length} تعارض في جدول اليوم</b><p>${esc(conflicts[0].a.title)} و${esc(conflicts[0].b.title)} يتداخلان. أصلحه من شاشة الجدول.</p></div><button class="chip" data-act="go-schedule">عرض</button></div>` : ''}

    <div class="grid-2">
      ${nextLessonCard}
      <div class="card now-card">
        <p class="eyebrow">ما الذي يجب أن أفعله الآن؟</p>
        ${cur ? `<h3>${esc(cur.title)}</h3><p>${fmt12(cur.start)} — ${fmt12(cur.end)} · ${TYPES[cur.type].label}</p>
          <div class="row-btns wrap">
            ${cur.type === 'study' ? `<button class="btn primary" data-act="start-study" data-subject="${esc(cur.subject || '')}">${icon('play')} ابدأ جلسة مذاكرة</button>` : ''}
            ${!cur.status ? `<button class="btn ghost" data-act="resolve" data-occ="${esc(cur.occId)}" data-status="done">${icon('check')} تم الإنجاز</button>` : `<span class="badge ok">${STATUS_LABEL[cur.status] || ''}</span>`}
          </div>`
          : `<h3>وقت حر أو خارج الجدول</h3><p class="muted">استرح قليلًا، أو ابدأ جلسة مذاكرة قصيرة.</p>
          <div class="row-btns wrap"><button class="btn primary" data-act="start-study">${icon('play')} ابدأ جلسة مذاكرة</button></div>`}
      </div>
    </div>

    <div class="grid-2">
      <div class="card progress-card">
        <div class="ring-wrap">${ringSvg(progress)}<div class="ring-text"><b>${progress}%</b><small>${done} من ${countable.length}</small></div></div>
        <div><h3>إنجاز اليوم</h3><p class="muted">تُحتسب الأنشطة التي وضعتَ لها حالة (تم) بيدك فقط — لا يُعتبر أي نشاط منجزًا لمجرد مرور الوقت.</p></div>
      </div>
      <div class="card">
        <h3>أهداف اليوم</h3>
        ${goalBar('المذاكرة', stats.todayMin, plannedStudy, 'دقيقة مُنجزة من المخطط')}
        ${goalBar('الماء', water, state.settings.waterGoal, 'كوب')}
        ${goalBar('الرياضة', exDone ? 1 : 0, 1, exDone ? 'تمت' : 'لم تُسجَّل بعد')}
        ${missedStudy.length ? `<div class="suggest-box"><p>فاتتك ${missedStudy.length} جلسة مذاكرة. يمكنني اقتراح أوقات بديلة دون المساس بالحصص.</p><button class="chip ok" data-act="assistant-prefill" data-q="فاتني جلسة المذاكرة، رتّب يومي">${icon('spark')} اقتراح خطة معدّلة</button></div>` : ''}
      </div>
    </div>

    <div class="quick">
      <button class="quick-btn primary" data-act="start-study">${icon('play')}<span>ابدأ مذاكرة</span></button>
      <button class="quick-btn" data-act="add-task">${icon('plus')}<span>أضف مهمة</span></button>
      <button class="quick-btn" data-act="go-schedule">${icon('calendar')}<span>الجدول الأسبوعي</span></button>
      <button class="quick-btn" data-act="open-assistant">${icon('spark')}<span>المساعد</span></button>
    </div>

    <div class="card">
      <div class="card-head"><h3>جدول اليوم</h3><span class="muted">${occ.length} بند</span></div>
      <div class="timeline">${occ.length ? occ.map((o) => o.confirmed || o.type !== 'lesson' ? evRow(o, today, now) : suggestionRow(o)).join('') : '<p class="muted">لا توجد بنود لهذا اليوم.</p>'}</div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h3>مهام متبقية</h3><button class="chip" data-act="go-study-tasks">الكل</button></div>
        ${tasksOpen.length ? tasksOpen.slice(0, 5).map(taskRow).join('') : '<p class="muted">لا توجد مهام مستحقة اليوم. ✅</p>'}
      </div>
      <div class="card">
        <h3>مراجعة اليوم</h3>
        ${revs.length ? revs.map((r) => `<div class="mini-row"><span>${esc(r.topic)} <small class="muted">${esc(subjectOf(r.subjectId)?.name || '')}</small></span><button class="chip ok" data-act="rev-done" data-id="${esc(r.id)}">${icon('check')} راجعت</button></div>`).join('') : '<p class="muted">لا توجد مراجعات مستحقة اليوم.</p>'}
        <p class="small muted">المراجعات مقترحة وليست مواعيد ثابتة. يمكن تغيير الفواصل من حسابي.</p>
      </div>
    </div>
  </section>`;
}

function goalBar(label, val, max, unit) {
  const p = Math.min(100, pct(val, max || 1));
  return `<div class="goal"><div class="goal-top"><span>${label}</span><b>${val} / ${max} <small>${unit}</small></b></div><div class="bar"><i style="width:${p}%"></i></div></div>`;
}

function pendingWarn() {
  if (readOnly) return `<div class="alert warn">${icon('alert')}<div><b>وضع القراءة فقط</b><p>${esc(pendingNotice || '')}</p></div></div>`;
  if (saveFailed) return `<div class="alert danger">${icon('alert')}<div><b>تعذّر الحفظ</b><p>مساحة التخزين ممتلئة أو المتصفح يمنع التخزين. صدّر نسخة من حسابي.</p></div></div>`;
  if (pendingNotice) return `<div class="alert warn">${icon('alert')}<div><b>تنبيه</b><p>${esc(pendingNotice)}</p></div></div>`;
  return '';
}

function taskRow(t) {
  const st = C.taskState(t);
  const sub = subjectOf(t.subjectId);
  const steps = t.steps || [];
  const sd = steps.filter((s) => s.done).length;
  return `<div class="task ${st}">
    <button class="check ${t.done ? 'on' : ''}" data-act="task-toggle" data-id="${esc(t.id)}" aria-label="تبديل الإنجاز">${t.done ? icon('check') : ''}</button>
    <div class="task-body" data-act="edit-task" data-id="${esc(t.id)}">
      <strong>${esc(t.title)}</strong>
      <small>${sub ? esc(sub.name) + ' · ' : ''}${t.due ? (st === 'overdue' ? '<span class="danger-t">متأخرة</span> · ' : '') + esc(t.due.replace('T', ' ')) : 'بدون موعد'}${t.duration ? ' · ' + t.duration + ' د' : ''}${steps.length ? ' · ' + sd + '/' + steps.length + ' خطوات' : ''}</small>
    </div>
    <span class="prio p${t.priority}">${PRIORITY_LABEL[t.priority]}</span>
  </div>`;
}

function notifications(now = new Date()) {
  const today = dateKey(now);
  const out = [];
  const nowMs = now.getTime();
  const next = C.nextLesson(state, now, 2);
  if (next && next.startAt - nowMs < 24 * 3600e3) out.push({ kind: 'lesson', title: `حصة: ${next.title}`, body: `${arDate(next.date)} ${fmt12(next.start)}`, act: 'go-schedule', label: 'عرض' });
  for (const a of [C.nextAlarm(state, now)].filter(Boolean)) out.push({ kind: 'alarm', title: `منبه: ${a.title}`, body: fmt12(hm(a.at)), act: 'go-alarms', label: 'المنبهات' });
  for (const t of state.tasks.filter((x) => !x.done && x.due)) {
    const st = C.taskState(t, now);
    if (st === 'overdue') out.push({ kind: 'overdue', title: `متأخرة: ${t.title}`, body: t.due.replace('T', ' '), act: 'task-toggle', id: t.id, label: 'أنجزتها' });
    else if (st === 'soon') out.push({ kind: 'due', title: `واجب قريب: ${t.title}`, body: t.due.replace('T', ' '), act: 'edit-task', id: t.id, label: 'فتح' });
  }
  for (const c of C.findConflicts(state, today)) out.push({ kind: 'conflict', title: 'تعارض في الجدول', body: `${c.a.title} ⟷ ${c.b.title}`, act: 'go-schedule', label: 'إصلاح' });
  for (const h of state.history.filter((x) => x.action === 'missed' && nowMs - x.at < 24 * 3600e3).slice(-5)) out.push({ kind: 'missed', title: `تنبيه فائت: ${h.title}`, body: new Date(h.at).toLocaleString('ar-EG'), act: 'go-alarms', label: 'السجل' });
  for (const h of state.history.filter((x) => x.action === 'completed' && nowMs - x.at < 24 * 3600e3).slice(-3)) out.push({ kind: 'done', title: 'أحسنت! ✅', body: h.title, act: '', label: '' });
  return out;
}
function notifCount() { return notifications().filter((n) => n.kind !== 'done').length; }

/* ================= الجدول الأسبوعي ================= */

function renderSchedule(now) {
  const today = dateKey(now);
  const sel = ui.selDate;
  const weekStart = startOfWeek(sel);
  const dates = [...Array(7)].map((_, i) => addDays(weekStart, i));
  const occ = dayOccurrences(sel);
  const conflicts = C.findConflicts(state, sel);
  const q = ui.search.trim();
  let list;
  let title = `${DAYS_AR[dayIdx(sel)]} · ${arDate(sel)}`;
  if (q || ui.typeFilter) {
    const all = dates.flatMap((d) => dayOccurrences(d).map((o) => ({ ...o, date: d })));
    list = all.filter((o) => (!q || o.title.includes(q) || (subjectOf(o.subject)?.name || '').includes(q)) && (!ui.typeFilter || o.type === ui.typeFilter));
    title = `نتائج البحث (${list.length}) — هذا الأسبوع`;
  } else {
    list = occ;
  }
  const dayRow = (o) => (o.confirmed || o.type !== 'lesson' ? evRow(o, o.date, now) : suggestionRow(o));

  return `
  <section class="stack">
    <header class="page-head"><div><p class="eyebrow">جدول الأسبوع</p><h1>الجدول</h1></div>
      <button class="btn primary" data-act="add-event">${icon('plus')} حدث جديد</button></header>

    <div class="card week-nav">
      <button class="icon-btn" data-act="week-shift" data-n="-1" aria-label="الأسبوع السابق" style="transform:scaleX(-1)">${icon('next')}</button>
      <div class="center"><b>${arDate(weekStart)}</b><small class="muted">إلى ${arDate(addDays(weekStart, 6))}</small></div>
      <button class="icon-btn" data-act="week-shift" data-n="1" aria-label="الأسبوع التالي">${icon('next')}</button>
      <button class="chip" data-act="today">اليوم</button>
    </div>

    <div class="day-strip" role="tablist">
      ${dates.map((d, i) => `<button class="day-chip ${d === sel ? 'active' : ''} ${d === today ? 'today' : ''}" data-act="sel-date" data-date="${d}" role="tab" aria-selected="${d === sel}">
        <small>${DAYS_AR[i].replace('ال', '')}</small><b>${Number(d.slice(8))}</b><i>${C.findConflicts(state, d).length ? '!' : ''}</i></button>`).join('')}
    </div>

    <div class="filters">
      <label class="search">${icon('search')}<input id="search" type="search" placeholder="ابحث في الأسبوع" value="${esc(ui.search)}" data-input="search"></label>
      <select data-change="type-filter" aria-label="تصفية حسب النوع">
        <option value="">كل الأنواع</option>
        ${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${ui.typeFilter === k ? 'selected' : ''}>${v.label}</option>`).join('')}
      </select>
    </div>

    ${conflicts.length ? `<div class="alert danger">${icon('alert')}<div><b>تعارض في ${DAYS_AR[dayIdx(sel)]}</b>
      ${conflicts.map((c) => `<p>${esc(c.a.title)} (${fmt12(c.a.start)}) يتداخل مع ${esc(c.b.title)} (${fmt12(c.b.start)}) بمقدار ${c.overlap} دقيقة.${c.severe ? ' <b>تحتوي على حصة</b> — لن أنقلها دون موافقتك.' : ''}</p>`).join('')}
      </div></div>` : ''}

    <div class="card">
      <div class="card-head"><h3>${title}</h3><span class="legend">${Object.entries(TYPES).slice(0, 4).map(([, v]) => `<i style="background:${v.color}"></i>${v.label}`).join(' ')}</span></div>
      <div class="timeline">${list.length ? list.map(dayRow).join('') : '<p class="muted">لا توجد أحداث مطابقة.</p>'}</div>
    </div>

    <div class="card">
      <h3>نظرة أسبوعية</h3>
      <div class="week-grid">
        ${dates.map((d, i) => {
          const o = dayOccurrences(d).filter((x) => x.counts);
          const lessons = o.filter((x) => x.type === 'lesson').length;
          const study = o.filter((x) => x.type === 'study').reduce((a, x) => a + x.endMin - x.startMin, 0);
          return `<button class="week-cell ${d === sel ? 'active' : ''} ${d === today ? 'today' : ''}" data-act="sel-date" data-date="${d}">
            <b>${DAYS_AR[i]}</b><small>${lessons} حصة</small><small>${Math.round(study / 60 * 10) / 10} س مذاكرة</small></button>`;
        }).join('')}
      </div>
    </div>
  </section>`;
}

function openEventDetails(occId) {
  const id = eventIdOf(occId);
  const date = dateOfOcc(occId);
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return toast('هذا الحدث لم يعد موجودًا.', 'error');
  const sub = subjectOf(ev.subject);
  const body = `
    <div class="detail" style="--c:${TYPES[ev.type].color}">
      <p><span class="badge" style="background:${TYPES[ev.type].color}22;color:${TYPES[ev.type].color}">${TYPES[ev.type].label}</span>
      ${ev.confirmed ? '<span class="badge ok">مؤكد</span>' : '<span class="badge warn">غير مؤكد</span>'}
      ${ev.recurring ? '<span class="badge">متكرر أسبوعيًا</span>' : '<span class="badge">حدث لمرة واحدة</span>'}</p>
      <h3>${esc(ev.title)}</h3>
      <p>${DAYS_AR[ev.recurring ? ev.day : dayIdx(ev.date)]} ${ev.recurring ? '' : arDate(ev.date)} · ${fmt12(ev.start)} — ${fmt12(ev.end)} · ${toMin(ev.end) - toMin(ev.start)} دقيقة</p>
      ${sub ? `<p>المادة: ${esc(sub.name)}${sub.teacher ? ' · المعلم: ' + esc(sub.teacher) : ''}</p>` : ''}
      ${ev.notes ? `<p class="muted">${esc(ev.notes)}</p>` : ''}
    </div>
    <div class="row-btns wrap">
      <button class="btn ghost" data-act="edit-event" data-id="${esc(id)}" data-date="${date}">${icon('edit')} تعديل / نقل</button>
      <button class="btn ghost" data-act="dup-event" data-id="${esc(id)}" data-date="${date}">${icon('copy')} نسخ</button>
      ${ev.optional ? `<button class="btn ${ev.confirmed ? 'ghost' : 'primary'}" data-act="confirm-optional" data-id="${esc(id)}">${ev.confirmed ? 'جعلها غير مؤكدة' : 'تأكيد الحصة'}</button>` : ''}
      <button class="btn danger" data-act="del-event" data-id="${esc(id)}" data-date="${date}">${icon('trash')} حذف</button>
    </div>`;
  openSheet('تفاصيل الحدث', body);
}

function eventForm(ev, date) {
  const e = ev || { title: '', type: 'study', start: '08:00', end: '09:00', recurring: false, day: dayIdx(date), date, subject: '', confirmed: true, optional: false, notes: '' };
  return `
  <form id="event-form" class="form" novalidate>
    <label>العنوان<input name="title" maxlength="120" required value="${esc(e.title)}" placeholder="مثال: مذاكرة الفلسفة"></label>
    <div class="grid-2 tight">
      <label>النوع<select name="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${e.type === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <label>المادة<select name="subject"><option value="">بدون مادة</option>${state.subjects.filter((s) => !s.archived || s.id === e.subject).map((s) => `<option value="${s.id}" ${e.subject === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    </div>
    <div class="grid-2 tight">
      <label>من<input type="time" name="start" value="${e.start}" required></label>
      <label>إلى<input type="time" name="end" value="${e.end}" required></label>
    </div>
    <label class="check-row"><input type="checkbox" name="recurring" ${e.recurring ? 'checked' : ''}> متكرر أسبوعيًا</label>
    <div id="rec-fields" class="${e.recurring ? '' : 'hidden'}">
      <label>اليوم<select name="day">${DAYS_AR.map((d, i) => `<option value="${i}" ${e.day === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
    </div>
    <div id="once-fields" class="${e.recurring ? 'hidden' : ''}">
      <label>التاريخ<input type="date" name="date" value="${e.date || date}"></label>
    </div>
    <div class="grid-2 tight">
      <label class="check-row"><input type="checkbox" name="optional" ${e.optional ? 'checked' : ''}> اختياري (غير مؤكد)</label>
      <label class="check-row"><input type="checkbox" name="confirmed" ${e.confirmed !== false ? 'checked' : ''}> مؤكد</label>
    </div>
    <label>ملاحظات<textarea name="notes" rows="2" maxlength="500">${esc(e.notes || '')}</textarea></label>
    <p class="form-err" role="alert" hidden></p>
    <div class="row-btns"><button class="btn primary" type="submit">حفظ</button><button class="btn ghost" type="button" data-act="close-sheet">إلغاء</button></div>
  </form>`;
}

function readEventForm(f) {
  const fd = new FormData(f);
  return {
    title: String(fd.get('title') || '').trim(),
    type: fd.get('type'),
    subject: fd.get('subject') || null,
    start: fd.get('start'),
    end: fd.get('end'),
    recurring: f.recurring.checked,
    day: Number(fd.get('day')),
    date: fd.get('date'),
    optional: f.optional.checked,
    confirmed: f.confirmed.checked,
    notes: String(fd.get('notes') || '').trim(),
  };
}

function openEventForm(id, date) {
  const ev = id ? state.events.find((e) => e.id === id) : null;
  const w = openSheet(ev ? 'تعديل الحدث' : 'حدث جديد', eventForm(ev, date || ui.selDate), { wide: true });
  const form = w.querySelector('#event-form');
  form.recurring.addEventListener('change', () => {
    form.querySelector('#rec-fields').classList.toggle('hidden', !form.recurring.checked);
    form.querySelector('#once-fields').classList.toggle('hidden', form.recurring.checked);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = readEventForm(form);
    const errs = C.validateEventInput(input);
    const errEl = form.querySelector('.form-err');
    if (errs.length) { errEl.hidden = false; errEl.textContent = errs.join(' '); return; }
    // تحقّق من التعارض قبل الحفظ دون نقل أي حصة تلقائيًا
    const tempId = ev ? ev.id : '__new__';
    const tempEv = { ...input, id: tempId, optional: input.optional, confirmed: input.confirmed };
    const day = input.recurring ? null : input.date;
    const dates = input.recurring ? [addDays(startOfWeek(ui.selDate), input.day)] : [day];
    const hasLesson = ev && ev.type === 'lesson' && ev.confirmed !== false;
    const movedLesson = hasLesson && (ev.start !== input.start || ev.end !== input.end || (ev.recurring ? ev.day : ev.date) !== (input.recurring ? input.day : input.date));
    const doSave = () => {
      const obj = { ...input, optional: input.optional, confirmed: input.optional ? input.confirmed : true };
      if (obj.recurring) delete obj.date; else delete obj.day;
      mutate((st) => {
        if (ev) {
          const target = st.events.find((x) => x.id === ev.id);
          Object.keys(target).forEach((k) => { if (k !== 'id') delete target[k]; });
          Object.assign(target, obj, { id: ev.id, exceptions: target.exceptions });
        } else {
          st.events.push({ id: newId('ev'), ...obj });
        }
      }, ev ? 'تم تحديث الحدث' : 'تمت إضافة الحدث');
      ui.selDate = obj.recurring ? addDays(startOfWeek(ui.selDate), obj.day) : obj.date;
      closeSheet();
      render();
    };
    const conflictWith = [];
    for (const d of dates) {
      for (const o of C.occurrencesOn(state, d)) {
        if (o.id === tempId || !o.counts || o.id === (ev && ev.id)) continue;
        const cs = toMin(input.start), ce = toMin(input.end);
        if (input.optional && !input.confirmed) continue;
        if (cs < o.endMin && o.startMin < ce) conflictWith.push(o);
      }
    }
    if (movedLesson || (conflictWith.some((o) => o.type === 'lesson'))) {
      confirmBox('تأكيد التعديل', movedLesson ? 'أنت على وشك تغيير موعد حصة مؤكدة. سيُعاد حساب تذكيراتها. هل توافق؟' : `هذا الحدث يتعارض مع حصة (${conflictWith.find((o) => o.type === 'lesson').title}). هل تريد الحفظ رغم ذلك؟`, 'حفظ على أي حال', doSave, false);
      return;
    }
    if (conflictWith.length) {
      confirmBox('تعارض في الجدول', `يتداخل الحدث مع: ${conflictWith.map((o) => o.title).join('، ')}. هل تريد الحفظ وإصلاحه لاحقًا؟`, 'حفظ', doSave, false);
      return;
    }
    doSave();
  });
}

function removeEvent(id, date, forceSeries = false) {
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return;
  const del = () => mutate((s) => {
    const idx = s.events.findIndex((e) => e.id === id);
    if (ev.recurring && !forceSeries) {
      const target = s.events[idx];
      target.exceptions = [...(target.exceptions || []), date];
    } else {
      s.events.splice(idx, 1);
    }
  }, 'تم حذف الحدث');
  if (ev.type === 'lesson' && ev.confirmed !== false) {
    confirmBox('حذف حصة مؤكدة', `"${ev.title}" حصة مؤكدة. هل أنت متأكد من حذفها${ev.recurring ? ' لهذا التاريخ' : ''}؟`, 'نعم، احذف', () => { closeSheet(); del(); });
  } else if (ev.recurring) {
    openSheet('حذف حدث متكرر', `
      <p class="muted">"${esc(ev.title)}" حدث متكرر. ماذا تريد أن تحذف؟</p>
      <div class="stack">
        <button class="btn ghost" data-act="confirm-ok" data-mode="one">حذف هذا التاريخ فقط</button>
        <button class="btn danger" data-act="confirm-ok" data-mode="all">حذف السلسلة كاملة</button>
      </div>`, {
      onMount: (w) => w.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { closeSheet(); if (b.dataset.mode === 'all') { mutate((s) => { s.events = s.events.filter((e) => e.id !== id); }, 'تم حذف السلسلة'); } else { mutate((s) => { const t = s.events.find((e) => e.id === id); t.exceptions = [...(t.exceptions || []), date]; }, 'تم حذف هذا التاريخ'); } })),
    });
  } else {
    confirmBox('حذف الحدث', `هل تريد حذف "${ev.title}"؟`, 'حذف', del);
  }
}

function duplicateEvent(id, date) {
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return;
  const copy = { ...ev, id: newId('ev'), title: ev.title + ' (نسخة)', recurring: false, date: ui.selDate, exceptions: undefined };
  copy.day = undefined;
  mutate((s) => s.events.push(copy));
  closeSheet();
  openEventForm(copy.id, ui.selDate);
  void date;
}

function resolveOcc(occId, status) {
  const id = eventIdOf(occId);
  const date = dateOfOcc(occId);
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return;
  if (status === 'postponed') {
    const now = new Date();
    const dur = toMin(ev.end) - toMin(ev.start);
    const fromMin = date === dateKey(now) ? nowMinOf(now) : toMin(state.settings.wake);
    const slot = C.findFreeSlot(state, date, fromMin, dur, 3);
    if (!slot) return toast('لا توجد فترة حرة مناسبة قريبًا. اختر وقتًا يدويًا من الجدول.', 'warn', 5000);
    mutate((s) => {
      s.completions[date] = { ...(s.completions[date] || {}), [id]: 'postponed' };
      s.events.push({ id: newId('ev'), title: ev.title, type: ev.type, subject: ev.subject, notes: 'منقول من ' + date, recurring: false, date: slot.date, start: slot.start, end: slot.end, optional: false, confirmed: true, status: 'confirmed' });
    }, `تم التأجيل إلى ${arDate(slot.date)} ${fmt12(slot.start)}`);
    return;
  }
  mutate((s) => {
    const day = { ...(s.completions[date] || {}) };
    if (status === 'clear') delete day[id]; else day[id] = status;
    s.completions[date] = day;
    if (status === 'done') s.history.push({ id: newId('h'), at: Date.now(), action: 'completed', title: ev.title, category: 'custom' });
  }, status === 'done' ? 'أحسنت! تم تسجيل الإنجاز ✅' : status === 'skipped' ? 'سُجّل أنه لم يُنفَّذ — لا بأس، يمكن تعويضه' : status === 'clear' ? 'تم التراجع' : '');
}

/* ================= المذاكرة والمؤقت ================= */

function timerTotals(phase) {
  if (phase === 'break') return state.settings.breakMin;
  if (phase === 'long') return state.settings.longBreakMin;
  return timer.plannedMin || state.settings.studyMin;
}

function timerLeftMs() {
  if (timer.running && timer.endAt) return Math.max(0, timer.endAt - Date.now());
  if (timer.leftMs != null) return timer.leftMs;
  return timerTotals(timer.phase) * 60e3;
}

function timerStart() {
  if (!timer.plannedMin) timer.plannedMin = state.settings.studyMin;
  if (timer.running) return;
  const left = timerLeftMs();
  timer.endAt = Date.now() + left;
  timer.leftMs = null;
  timer.running = true;
  saveTimer();
  render();
  unlockAudio();
}
function timerPause() {
  if (!timer.running) return;
  timer.leftMs = Math.max(0, timer.endAt - Date.now());
  timer.endAt = null; timer.running = false;
  saveTimer(); render();
}
function timerReset() {
  timer = { ...timer, endAt: null, leftMs: null, running: false, phase: 'study', cycles: 0 };
  saveTimer(); render();
}

function timerFinishStudy() {
  const left = timerLeftMs();
  const planned = timer.plannedMin || state.settings.studyMin;
  const elapsed = (planned * 60e3 - left) / 60e3;
  timer.running = false; timer.endAt = null; timer.leftMs = null;
  saveTimer();
  openSessionEnd(Math.max(1, Math.round(elapsed)), true);
}

function openSessionEnd(actualMin, early) {
  const subj = subjectOf(timer.subjectId);
  const body = `
    <form id="session-form" class="form">
      <p class="muted">${subj ? 'المادة: ' + esc(subj.name) + ' · ' : ''}مدة الجلسة: ${actualMin} دقيقة${early ? ' (أنهيتها مبكرًا)' : ''}</p>
      <label class="check-row"><input type="checkbox" name="finished" checked> هل أنجزت المهمة المخططة؟</label>
      <fieldset><legend>كم فهمت المادة؟</legend>
        <div class="scale">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="understanding" value="${n}" ${n === 3 ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
        <small class="muted">١ = لم أفهم، ٥ = فهمت جيدًا</small></fieldset>
      <label class="check-row"><input type="checkbox" name="needMore"> أحتاج جلسة أخرى لهذه المادة</label>
      <label>ما الذي يجب مراجعته لاحقًا؟<textarea name="review" rows="2" maxlength="300" placeholder="مثال: قواعد الفرنسية — المضارع"></textarea></label>
      <div class="row-btns"><button class="btn primary" type="submit">حفظ الجلسة</button><button class="btn ghost" type="button" data-act="close-sheet">تخطي</button></div>
    </form>`;
  const w = openSheet('انتهت الجلسة 🎉', body);
  w.querySelector('#session-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const review = String(f.review.value || '').trim();
    const understanding = Number(f.querySelector('input[name=understanding]:checked')?.value || 3);
    const session = { id: newId('s'), date: dateKey(), subjectId: timer.subjectId || null, plannedMin: timer.plannedMin || state.settings.studyMin, actualMin, finishedPlanned: f.finished.checked, understanding, needMore: f.needMore.checked, review, startedAt: Date.now() - actualMin * 60e3 };
    mutate((s) => {
      s.sessions.push(session);
      if (review && subj) subj.weakTopics = [...new Set([...(subj.weakTopics || []), review.slice(0, 80)])];
      s.history.push({ id: newId('h'), at: Date.now(), action: 'completed', title: 'جلسة مذاكرة ' + actualMin + ' دقيقة', category: 'study' });
    }, 'تم حفظ الجلسة. أحسنت!');
    closeSheet();
    timer.cycles = (timer.cycles || 0) + 1;
    const long = timer.cycles % state.settings.sessionsBeforeLong === 0;
    timer.phase = long ? 'long' : 'break';
    timer.endAt = null; timer.running = false; timer.leftMs = null;
    saveTimer(); render();
  });
}

function renderStudy(now) {
  const today = dateKey(now);
  const stats = C.studyStats(state, today);
  const total = timerTotals(timer.phase);
  const left = timerLeftMs();
  const p = pct(total * 60e3 - left, total * 60e3);
  const phaseLabel = timer.phase === 'study' ? 'جلسة تركيز' : timer.phase === 'long' ? 'استراحة طويلة' : 'استراحة قصيرة';
  const subjects = state.subjects.filter((s) => !s.archived);
  const tasks = state.tasks.slice().sort((a, b) => (a.done - b.done) || (a.due || 'z').localeCompare(b.due || 'z'));
  const filt = ui.taskFilter;
  const shown = tasks.filter((t) => {
    if (filt === 'done') return t.done;
    if (t.done) return false;
    if (filt === 'today') return !t.due || t.due.slice(0, 10) <= today;
    if (filt === 'week') return !t.due || t.due.slice(0, 10) <= addDays(today, 7);
    return true;
  });
  const maxSub = Math.max(1, ...Object.values(stats.bySubject));
  const planOpts = [15, 25, 35, 50, 60].concat(state.settings.studyMin).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);

  return `
  <section class="stack">
    <header class="page-head"><div><p class="eyebrow">مؤقت التركيز</p><h1>المذاكرة</h1></div></header>

    <div class="card timer-card ${timer.phase}">
      <div class="timer-top">
        <span class="badge">${phaseLabel}</span>
        <span class="muted">الجلسة ${((timer.cycles || 0) % state.settings.sessionsBeforeLong) + 1} من ${state.settings.sessionsBeforeLong}</span>
      </div>
      <div class="timer-face">${ringSvg(p, 200)}<div class="timer-text"><b data-live="timer">${fmtMMSS(left)}</b><small>${timer.running ? 'جارٍ' : timer.endAt == null && timer.leftMs != null ? 'متوقف مؤقتًا' : 'جاهز'}</small></div></div>
      <div class="timer-controls">
        ${timer.running
          ? `<button class="btn ghost" data-act="t-pause">${icon('pause')} إيقاف مؤقت</button>`
          : `<button class="btn primary" data-act="t-start">${icon('play')} ${timer.leftMs != null ? 'استئناف' : 'ابدأ'}</button>`}
        <button class="btn ghost" data-act="t-reset">${icon('reset')} إعادة</button>
        ${timer.phase === 'study' ? `<button class="btn ghost" data-act="t-finish">إنهاء الجلسة</button>` : `<button class="btn ghost" data-act="t-skip-break">تخطي الاستراحة</button>`}
      </div>
      <div class="grid-2 tight">
        <label>المادة<select data-change="t-subject" ${timer.running ? 'disabled' : ''}><option value="">بدون مادة محددة</option>${subjects.map((s) => `<option value="${s.id}" ${timer.subjectId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label>مدة الجلسة<select data-change="t-plan" ${timer.running || timer.phase !== 'study' ? 'disabled' : ''}>${planOpts.map((m) => `<option value="${m}" ${m === (timer.plannedMin || state.settings.studyMin) ? 'selected' : ''}>${m} دقيقة${m === state.settings.studyMin ? ' (الافتراضية)' : ''}</option>`).join('')}</select></label>
      </div>
      <label>هدف الجلسة<input data-change="t-goal" maxlength="120" value="${esc(timer.goal || '')}" placeholder="مثال: حل ١٠ أسئلة في الفصل الثالث"></label>
      <p class="small muted">تُكمل الجلسة مدتها ثم تسألك عن النتيجة. الاستراحة القصيرة ${state.settings.breakMin} دقائق، والطويلة ${state.settings.longBreakMin} دقيقة بعد كل ${state.settings.sessionsBeforeLong} جلسات. ${hasNotif() && Notification.permission === 'granted' ? 'سيُرسل التطبيق إشعارًا عند انتهاء الجلسة.' : 'فعّل الإشعارات من المنبهات لتصلك رسالة عند انتهاء الجلسة.'}</p>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3>إحصاءات المذاكرة</h3>
        <div class="stat-row"><div><b>${stats.todayMin}</b><small>دقيقة اليوم</small></div><div><b>${stats.todayCount}</b><small>جلسات اليوم</small></div><div><b>${Math.round(stats.weekMin / 60 * 10) / 10}</b><small>ساعة هذا الأسبوع</small></div></div>
        ${Object.keys(stats.bySubject).length ? Object.entries(stats.bySubject).map(([sid, m]) => `<div class="goal"><div class="goal-top"><span>${esc(subjectOf(sid)?.name || 'بدون مادة')}</span><b>${m} د</b></div><div class="bar"><i style="width:${pct(m, maxSub)}%"></i></div></div>`).join('') : '<p class="muted">لم تُسجَّل جلسات هذا الأسبوع بعد.</p>'}
      </div>
      <div class="card">
        <div class="card-head"><h3>المواد</h3><button class="chip" data-act="add-subject">${icon('plus')} مادة</button></div>
        <div class="subjects">${state.subjects.map(subjectCard).join('')}</div>
        ${state.subjects.some((s) => s.archived) ? `<p class="small muted">المواد المؤرشفة تظهر بشكل باهت ولا تُدرج في المذاكرة الجديدة.</p>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>المهام والواجبات</h3><button class="btn primary sm" data-act="add-task">${icon('plus')} مهمة</button></div>
      <div class="seg">
        ${[['today', 'اليوم والمتأخرة'], ['week', 'هذا الأسبوع'], ['all', 'الكل'], ['done', 'المنجزة']].map(([k, l]) => `<button class="${filt === k ? 'on' : ''}" data-act="task-filter" data-f="${k}">${l}</button>`).join('')}
      </div>
      <div class="tasks">${shown.length ? shown.map(taskRow).join('') : '<p class="muted">لا توجد مهام في هذا العرض.</p>'}</div>
      <p class="small muted">المرفقات غير مدعومة في هذا الإصدار. يمكن إضافة ملاحظات وخطوات لكل مهمة.</p>
    </div>

    <div class="card">
      <div class="card-head"><h3>المراجعة المتباعدة</h3><button class="chip" data-act="add-revision">${icon('plus')} موضوع</button></div>
      ${state.revisions.length ? state.revisions.slice().sort((a, b) => (C.revisionDueDate(a, state.settings.revisionIntervals) || 'z').localeCompare(C.revisionDueDate(b, state.settings.revisionIntervals) || 'z')).map((r) => {
        const due = C.revisionDueDate(r, state.settings.revisionIntervals);
        const overdue = due && due < today;
        return `<div class="mini-row"><span><b>${esc(r.topic)}</b> <small class="muted">${esc(subjectOf(r.subjectId)?.name || '')}</small><br><small class="${overdue ? 'danger-t' : 'muted'}">${due ? (overdue ? 'متأخرة منذ ' + arDate(due) : 'الموعد المقترح: ' + arDate(due)) : 'اكتملت المراجعات ✅'}</small></span>
          ${due ? `<button class="chip ok" data-act="rev-done" data-id="${esc(r.id)}">${icon('check')} راجعت</button>` : ''}</div>`;
      }).join('') : '<p class="muted">أضف موضوعًا تعلّمته اليوم، وسنقترح مراجعته بعد يوم وثلاثة أيام وأسبوع.</p>'}
    </div>
  </section>`;
}

function fmtMMSS(ms) {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function subjectCard(s) {
  const upcoming = (s.tests || []).filter((t) => t.date >= dateKey()).sort((a, b) => a.date.localeCompare(b.date))[0];
  return `<button class="subject ${s.archived ? 'archived' : ''}" style="--c:${s.color}" data-act="edit-subject" data-id="${s.id}">
    <span class="sub-ico">${esc(s.icon || '📘')}</span>
    <span class="sub-body"><strong>${esc(s.name)}</strong><small>${PRIORITY_LABEL[s.priority]} · ${s.completedLessons || 0} درس مكتمل${upcoming ? ' · اختبار ' + arDate(upcoming.date) : ''}</small>
      <span class="bar thin"><i style="width:${s.progress || 0}%"></i></span></span>
    <b class="pct">${s.progress || 0}%</b></button>`;
}

function openSubjectForm(id) {
  const s = id ? state.subjects.find((x) => x.id === id) : { name: '', color: '#1e3a8a', icon: '📘', teacher: '', notes: '', priority: 2, progress: 0, weakTopics: [], tests: [], completedLessons: 0, archived: false };
  if (!s) return;
  const body = `
  <form id="subject-form" class="form">
    <div class="grid-2 tight">
      <label>الاسم<input name="name" required maxlength="60" value="${esc(s.name)}"></label>
      <label>أيقونة (إيموجي)<input name="icon" maxlength="4" value="${esc(s.icon || '')}"></label>
    </div>
    <div class="grid-2 tight">
      <label>اللون<input name="color" type="color" value="${s.color}"></label>
      <label>الأولوية الشخصية<select name="priority">${[1, 2, 3].map((p) => `<option value="${p}" ${s.priority === p ? 'selected' : ''}>${PRIORITY_LABEL[p]}</option>`).join('')}</select></label>
    </div>
    <label>المعلم / تفاصيل الحصة<input name="teacher" maxlength="80" value="${esc(s.teacher || '')}" placeholder="اختياري"></label>
    <label>نسبة التقدم: <b data-out="progress">${s.progress || 0}%</b><input name="progress" type="range" min="0" max="100" value="${s.progress || 0}" data-input-out="progress"></label>
    <label>عدد الدروس المكتملة<input name="completedLessons" type="number" min="0" max="500" value="${s.completedLessons || 0}"></label>
    <label>نقاط الضعف (سطر لكل موضوع)<textarea name="weak" rows="2" maxlength="600">${esc((s.weakTopics || []).join('\n'))}</textarea></label>
    <label>المواعيد الامتحانية (تاريخ: عنوان — سطر لكل امتحان)<textarea name="tests" rows="2" placeholder="2026-11-02: امتحان منتصف الفصل">${esc((s.tests || []).map((t) => t.date + ': ' + t.title).join('\n'))}</textarea></label>
    <label>ملاحظات<textarea name="notes" rows="3" maxlength="1000">${esc(s.notes || '')}</textarea></label>
    <label class="check-row"><input type="checkbox" name="archived" ${s.archived ? 'checked' : ''}> مؤرشفة (لا تظهر في المذاكرة الجديدة)</label>
    <p class="form-err" hidden role="alert"></p>
    <div class="row-btns wrap"><button class="btn primary" type="submit">حفظ</button>${id ? `<button class="btn danger" type="button" data-act="del-subject" data-id="${id}">حذف</button>` : ''}<button class="btn ghost" type="button" data-act="close-sheet">إلغاء</button></div>
  </form>`;
  const w = openSheet(id ? 'تعديل المادة' : 'مادة جديدة', body, { wide: true });
  const f = w.querySelector('#subject-form');
  f.progress.addEventListener('input', () => { w.querySelector('[data-out=progress]').textContent = f.progress.value + '%'; });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = f.name.value.trim();
    if (!name) { f.querySelector('.form-err').hidden = false; f.querySelector('.form-err').textContent = 'اكتب اسم المادة.'; return; }
    const tests = f.tests.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [d, ...rest] = l.split(':'); return { date: d.trim(), title: rest.join(':').trim() || 'امتحان' }; }).filter((t) => C.isValidDate(t.date));
    const data = {
      name, icon: f.icon.value.trim() || '📘', color: f.color.value, priority: Number(f.priority.value),
      teacher: f.teacher.value.trim(), progress: Number(f.progress.value), completedLessons: Math.max(0, Number(f.completedLessons.value) || 0),
      weakTopics: f.weak.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 50), tests, notes: f.notes.value.trim(), archived: f.archived.checked,
    };
    mutate((st) => {
      if (id) Object.assign(st.subjects.find((x) => x.id === id), data);
      else st.subjects.push({ id: newId('sub'), ...data });
    }, 'تم حفظ المادة');
    closeSheet();
  });
}

function taskForm(t) {
  const e = t || { title: '', subjectId: '', due: '', duration: 30, priority: 2, notes: '', recurring: 'none' };
  const [dd, tt] = (e.due || '').split('T');
  return `
  <form id="task-form" class="form">
    <label>عنوان المهمة<input name="title" required maxlength="140" value="${esc(e.title)}" placeholder="مثال: حل تمارين الفصل الثاني"></label>
    <div class="grid-2 tight">
      <label>المادة<select name="subjectId"><option value="">بدون مادة</option>${state.subjects.filter((s) => !s.archived || s.id === e.subjectId).map((s) => `<option value="${s.id}" ${e.subjectId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label>الأولوية<select name="priority">${[1, 2, 3].map((p) => `<option value="${p}" ${Number(e.priority) === p ? 'selected' : ''}>${PRIORITY_LABEL[p]}</option>`).join('')}</select></label>
    </div>
    <div class="grid-3 tight">
      <label>تاريخ التسليم<input type="date" name="dueDate" value="${dd || ''}"></label>
      <label>الوقت<input type="time" name="dueTime" value="${tt || ''}"></label>
      <label>المدة (دقيقة)<input type="number" name="duration" min="5" max="600" value="${e.duration || 30}"></label>
    </div>
    <label>التكرار<select name="recurring">${[['none', 'لمرة واحدة'], ['daily', 'يوميًا'], ['weekly', 'أسبوعيًا']].map(([k, l]) => `<option value="${k}" ${e.recurring === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>ملاحظات<textarea name="notes" rows="2" maxlength="800">${esc(e.notes || '')}</textarea></label>
    <p class="small muted">إن حددت موعدًا فسيُذكّرك التطبيق قبله بساعة. تُخزَّن المهام محليًا على جهازك.</p>
    <p class="form-err" hidden role="alert"></p>
    <div class="row-btns wrap"><button class="btn primary" type="submit">حفظ</button>${t ? `<button class="btn ghost" type="button" data-act="task-steps" data-id="${t.id}">الخطوات (${(t.steps || []).length})</button><button class="btn danger" type="button" data-act="del-task" data-id="${t.id}">حذف</button>` : ''}</div>
  </form>`;
}

function openTaskForm(id) {
  const t = id ? state.tasks.find((x) => x.id === id) : null;
  const w = openSheet(t ? 'تعديل المهمة' : 'مهمة جديدة', taskForm(t), { wide: true });
  const f = w.querySelector('#task-form');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = f.title.value.trim();
    const errEl = f.querySelector('.form-err');
    if (!title) { errEl.hidden = false; errEl.textContent = 'اكتب عنوان المهمة.'; return; }
    if (f.dueDate.value && !C.isValidDate(f.dueDate.value)) { errEl.hidden = false; errEl.textContent = 'التاريخ غير صحيح.'; return; }
    const dur = Number(f.duration.value);
    if (!(dur >= 5 && dur <= 600)) { errEl.hidden = false; errEl.textContent = 'المدة بين ٥ و٦٠٠ دقيقة.'; return; }
    const due = f.dueDate.value ? `${f.dueDate.value}T${f.dueTime.value || '23:59'}` : null;
    const data = { title, subjectId: f.subjectId.value || null, priority: Number(f.priority.value), duration: dur, due, recurring: f.recurring.value, notes: f.notes.value.trim() };
    mutate((s) => {
      if (t) Object.assign(s.tasks.find((x) => x.id === id), data);
      else s.tasks.push({ id: newId('t'), done: false, steps: [], createdAt: Date.now(), ...data });
    }, 'تم حفظ المهمة');
    closeSheet();
  });
}

function toggleTask(id) {
  mutate((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.completedAt = t.done ? Date.now() : null;
    if (t.done) {
      s.history.push({ id: newId('h'), at: Date.now(), action: 'completed', title: t.title, category: 'homework' });
      if (t.recurring && t.recurring !== 'none' && t.due) {
        const step = t.recurring === 'daily' ? 1 : 7;
        const [d, tm] = t.due.split('T');
        s.tasks.push({ ...t, id: newId('t'), done: false, completedAt: null, due: `${addDays(d, step)}T${tm || '23:59'}`, steps: (t.steps || []).map((x) => ({ ...x, done: false })) });
      }
    }
  }, '');
  const t = state.tasks.find((x) => x.id === id);
  if (t && t.done) toast('أحسنت! أنجزت: ' + t.title, 'ok');
}

function openSteps(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  const steps = t.steps || [];
  const w = openSheet('خطوات المهمة', `
    <p class="muted">${esc(t.title)}</p>
    <div class="steps">${steps.length ? steps.map((s) => `<label class="check-row step"><input type="checkbox" data-step="${s.id}" ${s.done ? 'checked' : ''}> <span class="${s.done ? 'done-t' : ''}">${esc(s.text)}</span></label>`).join('') : '<p class="muted">لا توجد خطوات بعد.</p>'}</div>
    <form class="row-inline" id="step-form"><input name="text" maxlength="120" placeholder="خطوة جديدة" required><button class="btn primary sm" type="submit">إضافة</button></form>`);
  w.querySelectorAll('[data-step]').forEach((cb) => cb.addEventListener('change', () => {
    mutate((s) => { const st = s.tasks.find((x) => x.id === id).steps.find((x) => x.id === cb.dataset.step); st.done = cb.checked; });
    closeSheet(); openSteps(id);
  }));
  w.querySelector('#step-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = e.target.text.value.trim();
    if (!text) return;
    mutate((s) => { const tk = s.tasks.find((x) => x.id === id); tk.steps = [...(tk.steps || []), { id: newId('st'), text, done: false }]; });
    closeSheet(); openSteps(id);
  });
}

function openRevisionForm() {
  const subs = state.subjects.filter((s) => !s.archived);
  const w = openSheet('موضوع للمراجعة', `
    <form id="rev-form" class="form">
      <label>المادة<select name="subjectId">${subs.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
      <label>الموضوع الذي تعلّمته<input name="topic" required maxlength="120" placeholder="مثال: المضارع في الفرنسية"></label>
      <label>تاريخ التعلّم<input type="date" name="learned" value="${dateKey()}"></label>
      <p class="small muted">الفواصل المقترحة: ${state.settings.revisionIntervals.map((d) => (d === 0 ? 'اليوم نفسه' : d + ' يوم')).join(' · ')} — يمكن تغييرها من حسابي.</p>
      <p class="form-err" hidden role="alert"></p>
      <div class="row-btns"><button class="btn primary" type="submit">إضافة</button><button class="btn ghost" type="button" data-act="close-sheet">إلغاء</button></div>
    </form>`);
  w.querySelector('#rev-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const topic = f.topic.value.trim();
    if (!topic || !C.isValidDate(f.learned.value)) { f.querySelector('.form-err').hidden = false; f.querySelector('.form-err').textContent = 'اكتب الموضوع وتاريخًا صحيحًا.'; return; }
    mutate((s) => s.revisions.push({ id: newId('r'), subjectId: f.subjectId.value, topic, learned: f.learned.value, stage: 0 }), 'تمت إضافة الموضوع للمراجعة');
    closeSheet();
  });
}

/* ================= المنبهات ================= */

function renderAlarms(now) {
  const perm = notifPerm();
  const na = C.nextAlarm(state, now);
  const rem = C.buildReminders(state, dateKey(now), 2).filter((r) => r.at > now.getTime()).sort((a, b) => a.at - b.at).slice(0, 6);
  const hist = state.history.slice().reverse().filter((h) => ui.histFilter === 'all' || (ui.histFilter === 'done' ? h.action === 'completed' || h.action === 'dismissed' : h.action === ui.histFilter)).slice(0, 40);
  return `
  <section class="stack">
    <header class="page-head"><div><p class="eyebrow">تذكيرات ومنبهات</p><h1>المنبهات</h1></div>
      <button class="btn primary" data-act="add-alarm">${icon('plus')} منبه جديد</button></header>

    <div class="card perm perm-${perm.kind}">
      <div class="perm-top"><b>${icon('bell')} ${perm.label}</b>${perm.kind !== 'granted' && perm.kind !== 'unsupported' ? '<button class="btn sm primary" data-act="ask-perm">طلب الإذن</button>' : ''}</div>
      <p class="small">${perm.help}</p>
      <div class="row-btns wrap"><button class="chip" data-act="unlock-audio">${icon('bell')} تفعيل الصوت والاهتزاز</button><button class="chip ok" data-act="test-alarm">${icon('alarm')} منبه تجريبي</button></div>
      <p class="small muted">تنبيه مهم: المتصفح لا يضمن تشغيل المنبه بدقة عند إغلاق التطبيق أو قفل الهاتف. أبقِ التطبيق مثبتًا ومفتوحًا في الخلفية، وفعّل إشعارات المتصفح، ولا تعتمد عليه وحده لمنبه الاستيقاظ المهم.</p>
    </div>

    <div class="card next-alarm">
      <p class="eyebrow">المنبه القادم</p>
      ${na ? `<h3>${esc(na.title)}</h3><p>${DAYS_AR[dayIdx(na.date)]} · ${fmt12(hm(na.at))}</p><small class="muted" data-live="alarm-in">${formatCountdown(na.at - Date.now())}</small>` : '<h3>لا يوجد منبه قادم</h3>'}
    </div>

    <div class="stack-sm">
      ${state.alarms.length ? state.alarms.map(alarmCard).join('') : '<p class="muted">لا توجد منبهات. أضف منبهًا جديدًا.</p>'}
    </div>

    <div class="card">
      <h3>تذكيرات الجدول القادمة (مشتقة تلقائيًا)</h3>
      <p class="small muted">تُحسب من الجدول: قبل الحصة بساعة وبنصف ساعة وبربع ساعة، وموعد التحرك، وبداية الحصة. تُعاد حسابها تلقائيًا عند تعديل الجدول.</p>
      ${rem.length ? rem.map((r) => `<div class="mini-row"><span>${esc(r.title)}<br><small class="muted">${esc(r.body)}</small></span><b>${fmt12(hm(r.at))}</b></div>`).join('') : '<p class="muted">لا توجد تذكيرات قادمة في الساعات الحالية.</p>'}
    </div>

    <div class="card">
      <div class="card-head"><h3>السجل</h3></div>
      <div class="seg">${[['all', 'الكل'], ['triggered', 'مُطلَق'], ['done', 'مُنجز/مُغلَق'], ['snoozed', 'مؤجل'], ['missed', 'فائت']].map(([k, l]) => `<button class="${ui.histFilter === k ? 'on' : ''}" data-act="hist-filter" data-f="${k}">${l}</button>`).join('')}</div>
      ${hist.length ? hist.map((h) => `<div class="mini-row"><span>${esc(h.title)}<br><small class="muted">${new Date(h.at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</small></span><span class="badge ${h.action === 'missed' ? 'danger' : h.action === 'completed' ? 'ok' : ''}">${HIST_LABEL[h.action] || h.action}</span></div>`).join('') : '<p class="muted">لا يوجد سجل بعد.</p>'}
      ${state.history.length ? '<button class="chip" data-act="clear-history">مسح السجل</button>' : ''}
    </div>
  </section>`;
}
const HIST_LABEL = { triggered: 'مُطلَق', dismissed: 'أُغلق', snoozed: 'مؤجل', missed: 'فائت', completed: 'مُنجز' };

function alarmCard(a) {
  const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => a.days.includes(d));
  const catLabel = CATEGORIES.find((c) => c.id === a.category)?.label || '';
  return `<article class="alarm ${a.enabled ? '' : 'off'}">
    <div class="alarm-main" data-act="edit-alarm" data-id="${esc(a.id)}">
      <b class="alarm-time">${fmt12(a.time)}</b>
      <div><strong>${esc(a.title)}</strong><small>${esc(catLabel)} · ${a.repeat === 'once' ? 'لمرة واحدة ' + arDate(a.date) : days.length === 7 ? 'كل يوم' : days.map((d) => DAYS_AR[d]).join('، ') || 'بدون أيام'} · غفوة ${a.snooze || 10} د${a.sound === false ? ' · بدون صوت' : ''}</small></div>
    </div>
    <div class="alarm-actions">
      <label class="switch" title="تفعيل/تعطيل"><input type="checkbox" data-change="alarm-toggle" data-id="${esc(a.id)}" ${a.enabled ? 'checked' : ''} aria-label="تفعيل ${esc(a.title)}"><span></span></label>
      <button class="icon-btn sm" data-act="test-alarm" data-id="${esc(a.id)}" aria-label="تجربة">${icon('bell')}</button>
      <button class="icon-btn sm" data-act="del-alarm" data-id="${esc(a.id)}" aria-label="حذف">${icon('trash')}</button>
    </div></article>`;
}

function hasNotif() { return typeof window !== 'undefined' && 'Notification' in window; }
function notifPerm() {
  if (!('Notification' in window)) return { kind: 'unsupported', label: 'الإشعارات غير مدعومة في هذا المتصفح', help: 'ستظهر المنبهات داخل التطبيق فقط عندما يكون مفتوحًا.' };
  const p = Notification.permission;
  if (p === 'granted') return { kind: 'granted', label: 'الإشعارات مفعّلة', help: 'ستصلك التذكيرات كإشعارات حتى عندما تكون بالخلفية — ضمن حدود المتصفح ونظام التشغيل.' };
  if (p === 'denied') return { kind: 'denied', label: 'الإشعارات مرفوضة', help: 'لن تظهر إشعارات النظام. فعّلها من إعدادات المتصفح لهذا الموقع. التنبيهات داخل التطبيق ستعمل ما دام مفتوحًا.' };
  return { kind: 'default', label: 'الإشعارات غير مفعّلة بعد', help: 'نحتاج إذنك لإرسال التذكيرات والمنبهات كإشعارات. لن نرسل أي شيء دون إذنك.' };
}

function openAlarmForm(id) {
  const a = id ? state.alarms.find((x) => x.id === id) : { title: '', message: '', category: 'custom', time: '07:30', days: [0, 1, 2, 3, 4, 5, 6], enabled: true, sound: true, vibrate: true, snooze: state.settings.snooze, repeat: 'weekly', date: dateKey() };
  if (!a) return;
  const w = openSheet(id ? 'تعديل المنبه' : 'منبه جديد', `
  <form id="alarm-form" class="form">
    <div class="grid-2 tight">
      <label>الفئة<select name="category">${CATEGORIES.map((c) => `<option value="${c.id}" ${a.category === c.id ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label>
      <label>الوقت<input type="time" name="time" required value="${a.time}"></label>
    </div>
    <label>العنوان<input name="title" maxlength="60" required value="${esc(a.title)}"></label>
    <label>الرسالة<textarea name="message" rows="2" maxlength="200">${esc(a.message || '')}</textarea></label>
    <label>التكرار<select name="repeat"><option value="weekly" ${a.repeat !== 'once' ? 'selected' : ''}>أيام محددة أسبوعيًا</option><option value="once" ${a.repeat === 'once' ? 'selected' : ''}>مرة واحدة</option></select></label>
    <div data-show="weekly" class="${a.repeat === 'once' ? 'hidden' : ''}"><span class="small muted">الأيام</span>
      <div class="day-pick">${DAYS_AR.map((d, i) => `<label><input type="checkbox" name="d${i}" ${a.days.includes(i) ? 'checked' : ''}><span>${d.replace('ال', '')}</span></label>`).join('')}</div></div>
    <div data-show="once" class="${a.repeat === 'once' ? '' : 'hidden'}"><label>التاريخ<input type="date" name="date" value="${a.date || dateKey()}"></label></div>
    <div class="grid-2 tight">
      <label>الغفوة<select name="snooze">${[5, 10, 15].map((m) => `<option value="${m}" ${Number(a.snooze) === m ? 'selected' : ''}>${m} دقائق</option>`).join('')}</select></label>
      <div class="stack-sm"><label class="check-row"><input type="checkbox" name="sound" ${a.sound !== false ? 'checked' : ''}> صوت</label><label class="check-row"><input type="checkbox" name="vibrate" ${a.vibrate !== false ? 'checked' : ''}> اهتزاز</label></div>
    </div>
    <label class="check-row"><input type="checkbox" name="enabled" ${a.enabled ? 'checked' : ''}> مفعّل</label>
    <p class="form-err" hidden role="alert"></p>
    <div class="row-btns wrap"><button class="btn primary" type="submit">حفظ</button>${id ? `<button class="btn ghost" type="button" data-act="test-alarm" data-id="${id}">تجربة</button><button class="btn danger" type="button" data-act="del-alarm" data-id="${id}">حذف</button>` : ''}</div>
  </form>`, { wide: true });
  const f = w.querySelector('#alarm-form');
  f.repeat.addEventListener('change', () => {
    w.querySelector('[data-show=weekly]').classList.toggle('hidden', f.repeat.value === 'once');
    w.querySelector('[data-show=once]').classList.toggle('hidden', f.repeat.value !== 'once');
  });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const days = [0, 1, 2, 3, 4, 5, 6].filter((i) => f[`d${i}`].checked);
    const errEl = f.querySelector('.form-err');
    if (!C.isValidTime(f.time.value)) return showErr(errEl, 'اختر وقتًا صحيحًا.');
    if (f.repeat.value === 'weekly' && !days.length) return showErr(errEl, 'اختر يومًا واحدًا على الأقل.');
    if (f.repeat.value === 'once' && !C.isValidDate(f.date.value)) return showErr(errEl, 'اختر تاريخًا صحيحًا.');
    const data = {
      category: f.category.value, title: f.title.value.trim() || CATEGORIES.find((c) => c.id === f.category.value).label, message: f.message.value.trim(), time: f.time.value,
      repeat: f.repeat.value, days: f.repeat.value === 'once' ? [dayIdx(f.date.value)] : days, date: f.repeat.value === 'once' ? f.date.value : null,
      snooze: Number(f.snooze.value), sound: f.sound.checked, vibrate: f.vibrate.checked, enabled: f.enabled.checked,
    };
    mutate((s) => {
      if (id) Object.assign(s.alarms.find((x) => x.id === id), data);
      else s.alarms.push({ id: newId('al'), ...data });
    }, 'تم حفظ المنبه');
    closeSheet();
    if (hasNotif() && Notification.permission === 'default') setTimeout(() => toast('لتصلك المنبهات كإشعارات فعّل الإذن من الزر أعلاه.', 'info', 5000), 400);
  });
}
function showErr(el, msg) { el.hidden = false; el.textContent = msg; }

/* ================= حسابي ================= */

function renderMe(now) {
  const today = dateKey(now);
  const s = state.settings;
  const sleepH = (() => { let d = toMin(s.wake) - toMin(s.bedtime); if (d <= 0) d += 1440; return Math.round(d / 6) / 10; })();
  const todayCheck = state.checklists[today] || {};
  const tomorrow = addDays(today, 1);
  const tomorrowOcc = dayOccurrences(tomorrow);
  const tomorrowCountable = tomorrowOcc.filter((o) => o.counts && o.type !== 'sleep');
  const tomorrowLoad = tomorrowCountable.reduce((a, o) => a + (o.endMin - o.startMin), 0);
  const perm = notifPerm();
  const habitsToday = state.habitLog[today] || {};
  const workloadWarn = (() => {
    const busyMinutes = dayOccurrences(today).filter((o) => o.counts && o.type !== 'sleep' && o.type !== 'meal').reduce((a, o) => a + (o.endMin - o.startMin), 0);
    return busyMinutes > 11 * 60 ? `<div class="alert warn">${icon('alert')}<div><b>حمل يومي مرتفع</b><p>جدول اليوم يضم حوالي ${Math.round(busyMinutes / 60)} ساعة من الأنشطة غير النوم. تأكد من وجود استراحات كافية.</p></div></div>` : '';
  })();
  return `
  <section class="stack">
    <header class="page-head"><div><p class="eyebrow">الملف الشخصي والإعدادات</p><h1>حسابي</h1></div></header>
    ${workloadWarn}
    ${sleepH < 8 ? `<div class="alert warn">${icon('moon')}<div><b>نومك أقل من ٨ ساعات</b><p>المدة المقدّرة ${sleepH} ساعة بين ${fmt12(s.bedtime)} والاستيقاظ ${fmt12(s.wake)}.</p></div></div>` : ''}

    <div class="card">
      <h3>الملف الشخصي</h3>
      <form class="form" data-form="profile">
        <label>الاسم (يظهر في التحية)<input name="name" maxlength="40" value="${esc(s.name)}" placeholder="اختياري"></label>
        <div class="grid-2 tight">
          <label>الصف والنظام<input name="schoolYear" maxlength="80" value="${esc(s.schoolYear)}"></label>
          <label>القسم<input name="section" maxlength="60" value="${esc(s.section)}"></label>
        </div>
        <p class="small muted">اللغة: العربية (الواجهة مصممة بالعربية فقط في هذا الإصدار).</p>
        <button class="btn primary sm" type="submit">حفظ الملف</button>
      </form>
    </div>

    <div class="card">
      <h3>النوم والروتين الصباحي</h3>
      <form class="form" data-form="sleep">
        <div class="grid-2 tight">
          <label>الاستيقاظ<input type="time" name="wake" value="${s.wake}"></label>
          <label>بداية الاستعداد للنوم<input type="time" name="windDown" value="${s.windDown}"></label>
          <label>موعد النوم المستهدف<input type="time" name="bedtime" value="${s.bedtime}"></label>
          <label>آخر موعد للنوم<input type="time" name="latestBed" value="${s.latestBed}"></label>
        </div>
        <button class="btn primary sm" type="submit">حفظ مواعيد النوم</button>
      </form>
      <p class="small muted">مدة النوم المقدّرة: ${sleepH} ساعة.</p>
      <h4>قائمة التحضير المسائي</h4>
      ${s.sleepChecklist.map((item, i) => `<label class="check-row"><input type="checkbox" data-check="${i}" ${todayCheck[i] ? 'checked' : ''}> ${esc(item)}</label>`).join('')}
      <h4>جدول الغد (${arDate(tomorrow)})</h4>
      <p class="small">${tomorrowCountable.length} نشاط تقريبًا، ومجموع الساعات المخططة ${Math.round(tomorrowLoad / 60 * 10) / 10} ساعة.</p>
      <div class="tomorrow">${tomorrowOcc.length ? tomorrowOcc.filter((o) => o.type !== 'sleep').slice(0, 10).map((o) => `<div class="mini-row"><span>${esc(o.title)}</span><small>${fmt12(o.start)}</small></div>`).join('') : '<p class="muted">لا شيء مجدول غدًا.</p>'}</div>
    </div>

    <div class="card">
      <h3>الجدول والمذاكرة</h3>
      <form class="form" data-form="study">
        <div class="grid-3 tight">
          <label>الرياضة (دقيقة)<input type="number" name="exerciseMin" min="5" max="120" value="${s.exerciseMin}"></label>
          <label>مدة التحضير والسفر (دقيقة)<input type="number" name="travelMin" min="0" max="180" value="${s.travelMin}"></label>
          <label>جلسة المذاكرة (دقيقة)<input type="number" name="studyMin" min="10" max="120" value="${s.studyMin}"></label>
          <label>الاستراحة القصيرة (دقيقة)<input type="number" name="breakMin" min="1" max="60" value="${s.breakMin}"></label>
          <label>الاستراحة الطويلة (دقيقة)<input type="number" name="longBreakMin" min="5" max="90" value="${s.longBreakMin}"></label>
          <label>جلسات قبل الاستراحة الطويلة<input type="number" name="sessionsBeforeLong" min="2" max="8" value="${s.sessionsBeforeLong}"></label>
          <label>فواصل المراجعة (أيام، مفصولة بفاصلة)<input name="revisionIntervals" value="${s.revisionIntervals.join(', ')}"></label>
          <label>هدف الماء (أكواب)<input type="number" name="waterGoal" min="1" max="20" value="${s.waterGoal}"></label>
        </div>
        <label class="check-row"><input type="checkbox" name="thursdayLesson" ${s.thursdayLesson ? 'checked' : ''}> الحصة الشرعية الاختيارية يوم الخميس مؤكدة</label>
        <button class="btn primary sm" type="submit">حفظ إعدادات الجدول</button>
      </form>
    </div>

    <div class="card">
      <h3>المنبهات والإشعارات</h3>
      <div class="perm-inline ${perm.kind}"><b>${perm.label}</b><p class="small">${perm.help}</p>${perm.kind !== 'granted' && perm.kind !== 'unsupported' ? '<button class="chip" data-act="ask-perm">طلب الإذن</button>' : ''}</div>
      <form class="form" data-form="alarm-pref">
        <div class="grid-3 tight">
          <label>التذكيرات قبل الحصة (دقائق)<input name="leads" value="${s.leads.join(', ')}"></label>
          <label>وضع التذكير<select name="reminderMode"><option value="all" ${s.reminderMode === 'all' ? 'selected' : ''}>كل التذكيرات</option><option value="important" ${s.reminderMode === 'important' ? 'selected' : ''}>المهم فقط (حصص ومنبهات ومواعيد)</option></select></label>
          <label>الغفوة الافتراضية<select name="snooze">${[5, 10, 15].map((m) => `<option value="${m}" ${s.snooze === m ? 'selected' : ''}>${m} دقائق</option>`).join('')}</select></label>
        </div>
        <div class="grid-3 tight">
          <label class="check-row"><input type="checkbox" name="sound" ${s.sound ? 'checked' : ''}> الصوت</label>
          <label class="check-row"><input type="checkbox" name="vibrate" ${s.vibrate ? 'checked' : ''}> الاهتزاز</label>
          <label>المظهر<select name="theme"><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>داكن</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>فاتح</option></select></label>
        </div>
        <div class="grid-3 tight">
          <label class="check-row"><input type="checkbox" name="quietEnabled" ${s.quietEnabled ? 'checked' : ''}> ساعات هدوء</label>
          <label>من<input type="time" name="quietStart" value="${s.quietStart}"></label>
          <label>إلى<input type="time" name="quietEnd" value="${s.quietEnd}"></label>
        </div>
        <p class="small muted">في ساعات الهدوء تصل التذكيرات بصمت، ويبقى منبه الاستيقاظ يرن.</p>
        <h4>تفعيل الفئات</h4>
        <div class="day-pick cats">${CATEGORIES.map((c) => `<label><input type="checkbox" name="cat_${c.id}" ${s.cats[c.id] !== false ? 'checked' : ''}><span>${c.label}</span></label>`).join('')}</div>
        <button class="btn primary sm" type="submit">حفظ تفضيلات التنبيه</button>
      </form>
    </div>

    <div class="card">
      <div class="card-head"><h3>العادات اليومية</h3><button class="chip" data-act="add-habit">${icon('plus')} عادة</button></div>
      ${state.habits.map((h) => {
        const v = habitsToday[h.id] || 0;
        return `<div class="habit"><span>${h.icon || '✔️'} ${esc(h.name)}</span>
          <div class="habit-ctl"><button class="icon-btn sm" data-act="habit" data-id="${h.id}" data-d="-1" aria-label="إنقاص">−</button><b>${v}/${h.goal}</b><button class="icon-btn sm" data-act="habit" data-id="${h.id}" data-d="1" aria-label="زيادة">+</button>
          <button class="chip" data-act="habit-edit" data-id="${h.id}">تعديل</button></div></div>`;
      }).join('')}
      <p class="small muted">شجّع نفسك بخطوات صغيرة؛ الانقطاع عادي، والمهم أن تعود.</p>
    </div>

    <div class="card">
      <h3>البيانات والنسخ الاحتياطي</h3>
      <p class="small muted">كل بياناتك محفوظة على هذا الجهاز ولا تحتاج حسابًا أو اتصالًا بالإنترنت. صدّر نسخة احتياطية بانتظام.</p>
      <div class="row-btns wrap">
        <button class="btn ghost" data-act="export">${icon('down')} تصدير نسخة (JSON)</button>
        <label class="btn ghost file-btn">${icon('up')} استعادة من ملف<input type="file" accept="application/json,.json" data-change="import" hidden></label>
        <button class="btn ghost" data-act="restore-schedule">استعادة الجدول الأصلي</button>
        <button class="btn danger" data-act="reset-all">مسح كل البيانات</button>
      </div>
      <p class="small muted">الاستعادة تُبدل بياناتك الحالية بعد تأكيدك. استعادة الجدول الأصلي تعيد الحصص والمنبه الأساسي فقط ولا تحذف المهام أو الجلسات.</p>
    </div>
    <p class="center small muted">يومي | YAWMI · الإصدار ١.٠</p>
  </section>`;
}

/* ================= المساعد والإشعارات ================= */

function openAssistant(prefill = '') {
  const chips = ['ماذا أذاكر اليوم؟', 'كم وقتًا حرًا لدي؟', 'فاتني جلسة المذاكرة، رتّب يومي', 'اعرض المهام غير المكتملة', 'ذكّرني بمراجعة الفلسفة غدًا', 'عندي امتحان الأسبوع القادم، نظّم مراجعتي'];
  const w = openSheet('المساعد الذكي', `
    <p class="small muted">يقرأ جدولك ومهامك الحقيقية فقط، ولا يحذف أو ينقل حصة مؤكدة دون موافقتك. يعمل دون إنترنت.</p>
    <div class="chips">${chips.map((c) => `<button class="chip" data-q="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <form id="ask-form" class="row-inline"><input name="q" placeholder="اكتب سؤالك..." maxlength="300" value="${esc(prefill)}"><button class="btn primary sm" type="submit">${icon('spark')} اسأل</button></form>
    <div id="ans" class="answer" aria-live="polite"></div>`, { wide: true });
  const ans = w.querySelector('#ans');
  const run = (q) => {
    const r = C.assistantReply(state, q, new Date());
    ans.innerHTML = `<div class="bubble">${esc(r.text).replace(/\n/g, '<br>')}</div>` + (r.proposal ? `<div class="row-btns"><button class="btn primary sm" data-apply="prop">${esc(r.proposal.label)}</button><button class="btn ghost sm" data-act="close-sheet">لاحقًا</button></div>` : '') + (r.createTask ? `<div class="row-btns"><button class="btn primary sm" data-apply="task">إضافة المهمة</button></div>` : '');
    ans.querySelector('[data-apply=prop]')?.addEventListener('click', () => {
      mutate((st) => { for (const e of r.proposal.events) st.events.push({ id: newId('ev'), notes: 'من المساعد', recurring: false, optional: false, confirmed: true, status: 'confirmed', title: e.title, type: e.type, subject: e.subject || null, date: e.date, start: e.start, end: e.end }); }, 'أُضيفت الجلسات إلى الجدول');
      closeSheet();
    });
    ans.querySelector('[data-apply=task]')?.addEventListener('click', () => {
      const t = r.createTask;
      mutate((st) => st.tasks.push({ id: newId('t'), done: false, steps: [], createdAt: Date.now(), title: t.title, subjectId: t.subjectId, due: t.due, duration: t.duration, priority: t.priority, recurring: 'none', notes: 'من المساعد' }), 'أُضيفت المهمة وسيُذكّرك التطبيق قبلها');
      closeSheet();
    });
  };
  w.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => run(b.dataset.q)));
  w.querySelector('#ask-form').addEventListener('submit', (e) => { e.preventDefault(); run(e.target.q.value); });
  if (prefill) run(prefill);
}

function openNotifications() {
  const list = notifications();
  const rows = list.length ? list.map((n) => `<div class="notif ${n.kind}"><span class="ndot"></span><div><b>${esc(n.title)}</b><small>${esc(n.body)}</small></div>${n.act ? `<button class="chip" data-act="${n.act}" ${n.id ? `data-id="${esc(n.id)}"` : ''} data-date="${ui.selDate}">${esc(n.label)}</button>` : ''}</div>`).join('') : '<p class="muted">لا توجد إشعارات الآن. ✨</p>';
  const w = openSheet('مركز الإشعارات', `<div class="notifs">${rows}</div>
    <p class="small muted">هذا المركز يعرض الحصص والمنبهات والمهام والتعارضات والتنبيهات الفائتة. تُخفى الإشعارات المكررة تلقائيًا.</p>`);
}

/* ================= المنبه الرنّان والتشغيل ================= */

function unlockAudio() {
  try {
    if (!ui.audio) ui.audio = new (window.AudioContext || window.webkitAudioContext)();
    if (ui.audio.state === 'suspended') ui.audio.resume();
  } catch { /* لا صوت */ }
}

function beep() {
  try {
    if (!ui.audio) return;
    const ctx = ui.audio;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.75);
  } catch { /* ignore */ }
}

function showRing(item) {
  ui.ringQueue.push(item);
  if (!ui.ringing) nextRing();
}

function nextRing() {
  const item = ui.ringQueue.shift();
  ui.ringing = item || null;
  const el = $('#ring');
  if (!item) {
    el.hidden = true;
    clearInterval(ui.ringTimer); clearInterval(ui.vibTimer);
    return;
  }
  el.hidden = false;
  el.innerHTML = `<div class="ring-card" role="alertdialog" aria-labelledby="ring-title">
    <div class="ring-icon">${icon('alarm')}</div>
    <p class="eyebrow">${fmt12(hm(item.at))}</p>
    <h2 id="ring-title">${esc(item.title)}</h2>
    <p>${esc(item.body || '')}</p>
    <div class="ring-btns">
      <button class="btn primary" data-ring="complete">تم</button>
      <button class="btn ghost" data-ring="snooze">غفوة ${item.snooze || state.settings.snooze} د</button>
      <button class="btn ghost" data-ring="dismiss">إيقاف</button>
    </div>
    ${ui.ringQueue.length ? `<small>بعده: ${ui.ringQueue.length} تنبيه(ات)</small>` : ''}
  </div>`;
  document.body.classList.add('locked');
  const loud = item.sound !== false && (item.cat === 'wake' || !C.inQuietHours(state.settings, new Date()));
  if (loud && state.settings.sound) { beep(); clearInterval(ui.ringTimer); ui.ringTimer = setInterval(beep, 1400); }
  if (item.vibrate !== false && state.settings.vibrate && navigator.vibrate) { navigator.vibrate([400, 200, 400]); clearInterval(ui.vibTimer); ui.vibTimer = setInterval(() => navigator.vibrate([400, 200, 400]), 2400); }
}

function ringAction(act) {
  const item = ui.ringing;
  if (!item) return;
  mutate((s) => {
    if (act === 'snooze') {
      const mins = item.snooze || s.settings.snooze;
      s.snoozes.push({ id: newId('z'), alarmId: item.alarmId, title: item.title, message: item.body, at: Date.now() + mins * 60e3, sound: item.sound, vibrate: item.vibrate, category: item.cat, snooze: mins });
      s.history.push({ id: newId('h'), at: Date.now(), action: 'snoozed', title: item.title, category: item.cat });
    } else if (act === 'complete') {
      s.history.push({ id: newId('h'), at: Date.now(), action: 'completed', title: item.title, category: item.cat });
      if (item.occId) { const id = eventIdOf(item.occId); const d = dateOfOcc(item.occId); s.completions[d] = { ...(s.completions[d] || {}), [id]: 'done' }; }
      if (item.kind === 'task') { const t = s.tasks.find((x) => item.key.includes(x.id)); if (t) { t.done = true; t.completedAt = Date.now(); } }
    } else {
      s.history.push({ id: newId('h'), at: Date.now(), action: 'dismissed', title: item.title, category: item.cat });
    }
  });
  clearInterval(ui.ringTimer); clearInterval(ui.vibTimer);
  if (navigator.vibrate) navigator.vibrate(0);
  nextRing();
  if (!ui.ringing) document.body.classList.remove('locked');
}

async function notifyOS(title, body, tag, silent) {
  if (!hasNotif() || Notification.permission !== 'granted') return;
  try {
    const reg = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : null;
    const opts = { body, tag, silent: !!silent, lang: 'ar', dir: 'rtl', icon: 'icon.svg', badge: 'icon.svg', data: { tag } };
    if (reg && reg.showNotification) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch { /* الإشعار غير متاح */ }
}

function checkReminders() {
  if (!state || readOnly) return;
  const now = Date.now();
  const { fire, missed } = C.dueReminders(state, now);
  let changed = false;
  for (const m of missed) {
    state.fired[m.key] = now;
    state.history.push({ id: newId('h'), at: now, action: 'missed', title: m.title, category: m.cat });
    changed = true;
  }
  const quiet = C.inQuietHours(state.settings, new Date());
  for (const f of fire) {
    state.fired[f.key] = now;
    changed = true;
    state.history.push({ id: newId('h'), at: now, action: 'triggered', title: f.title, category: f.cat });
    if (f.kind === 'alarm') {
      const silent = quiet && f.cat !== 'wake';
      notifyOS(f.title, f.body || '', f.key, silent || !f.sound);
      if (!silent) showRing(f);
      else toast(`🔕 ${f.title} (ساعات الهدوء)`, 'info');
    } else {
      const silent = quiet || !state.settings.sound;
      notifyOS(f.title, f.body || '', f.key, silent);
      toast(`🔔 ${f.title}: ${f.body}`, 'info', 6000);
      if (!quiet && state.settings.sound) beep();
    }
  }
  state.snoozes = state.snoozes.filter((z) => !state.fired[`snz|${z.id}`]);
  // تنظيف مفاتيح قديمة
  for (const k of Object.keys(state.fired)) if (now - state.fired[k] > 4 * 24 * 3600e3) delete state.fired[k];
  state.meta.lastTick = now;
  if (changed) { save(); render(); } else { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } }
  if (changed && ui.tab !== 'home') updateLiveOnly();
}

/* ================= التحديث الحي ================= */

function updateLiveOnly() {
  const now = new Date();
  const c = $('[data-live="clock"]'); if (c) c.textContent = nowParts(now);
  const t = $('[data-live="timer"]'); if (t) t.textContent = fmtMMSS(timerLeftMs());
  const n = $('[data-live="next"]');
  if (n) { const next = C.nextLesson(state, now); if (next) n.textContent = formatCountdown((next.inProgress ? next.endAt : next.startAt) - now.getTime()); }
  const ai = $('[data-live="alarm-in"]');
  if (ai) { const na = C.nextAlarm(state, now); if (na) ai.textContent = formatCountdown(na.at - now.getTime()); }
}

function liveTick() {
  if (timer && timer.running && timer.endAt && Date.now() >= timer.endAt) {
    const planned = timer.plannedMin || state.settings.studyMin;
    const phase = timer.phase;
    timer.running = false; timer.endAt = null; timer.leftMs = null; saveTimer();
    notifyOS(phase === 'study' ? 'انتهت جلسة المذاكرة 🎉' : 'انتهت الاستراحة', phase === 'study' ? 'راجع ما فهمته وسجّل الجلسة.' : 'حان وقت الجلسة التالية.', 'timer-' + Date.now(), !state.settings.sound);
    if (state.settings.sound) { beep(); setTimeout(beep, 500); }
    if (state.settings.vibrate && navigator.vibrate) navigator.vibrate([300, 150, 300]);
    if (phase === 'study') openSessionEnd(planned, false);
    else { timer.phase = 'study'; saveTimer(); toast('انتهت الاستراحة. اضغط ابدأ للجلسة التالية.', 'info', 5000); }
    render();
    return;
  }
  if (ui.tab === 'study' && $('[data-live="timer"]')) updateLiveOnly();
  else if (ui.tab === 'home' && $('[data-live="clock"]')) updateLiveOnly();
  else if (ui.tab === 'alarms' && $('[data-live="alarm-in"]')) updateLiveOnly();
  const c = $('[data-live="clock"]'); if (c) c.textContent = nowParts(new Date());
}

/* ================= الرسم والتنقل ================= */

function render() {
  const now = new Date();
  const view = $('#view');
  const y = window.scrollY;
  const fn = { home: renderHome, schedule: renderSchedule, study: renderStudy, alarms: renderAlarms, me: renderMe }[ui.tab];
  view.innerHTML = fn(now);
  view.dataset.tab = ui.tab;
  document.querySelectorAll('.tabbar button').forEach((b) => {
    const on = b.dataset.tab === ui.tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  document.documentElement.dataset.theme = state.settings.theme;
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = state.settings.theme === 'dark' ? '#0b1220' : '#f5f7fb';
  window.scrollTo(0, y);
}

function go(tab) {
  ui.tab = tab;
  render();
  window.scrollTo(0, 0);
}

function startStudy(subjectId) {
  go('study');
  if (subjectId) timer.subjectId = subjectId;
  if (timer.running) return;
  timerStart();
}

function askPermission() {
  if (!('Notification' in window)) return toast('المتصفح لا يدعم الإشعارات.', 'error');
  Notification.requestPermission().then((p) => {
    render();
    if (p === 'granted') toast('تم تفعيل الإشعارات ✅', 'ok');
    else if (p === 'denied') toast('تم رفض الإذن. يمكنك تفعيله من إعدادات المتصفح.', 'warn', 5000);
  });
}

function testAlarm(id) {
  unlockAudio();
  const a = id ? state.alarms.find((x) => x.id === id) : null;
  showRing({ key: 'test-' + Date.now(), at: Date.now(), cat: a ? a.category : 'custom', kind: 'alarm', title: a ? a.title : 'منبه تجريبي', body: a ? a.message : 'هذا اختبار لصوت التنبيه واهتزازه. إن سمعته فالمنبهات تعمل على هذا الجهاز.', sound: a ? a.sound !== false : true, vibrate: a ? a.vibrate !== false : true, snooze: state.settings.snooze });
  notifyOS('منبه تجريبي — يومي', 'اختبار إشعار المنبه', 'test-' + Date.now(), false);
  if (!id) state.history.push({ id: newId('h'), at: Date.now(), action: 'triggered', title: 'منبه تجريبي', category: 'custom' });
  save(); render();
}

function exportData() {
  const payload = { app: 'yawmi', exportedAt: new Date().toISOString(), schema: C.SCHEMA_VERSION, state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `yawmi-backup-${dateKey()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('تم تنزيل النسخة الاحتياطية', 'ok');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let payload;
    try { payload = JSON.parse(String(reader.result)); } catch { return toast('الملف ليس JSON صالحًا.', 'error', 5000); }
    if (!payload || payload.app !== 'yawmi' || !payload.state) return toast('هذا الملف ليس نسخة احتياطية من يومي.', 'error', 5000);
    let next;
    try { next = C.migrate(payload.state); } catch (e) { return toast(e.message, 'error', 5000); }
    confirmBox('استعادة النسخة', `ستستبدل بياناتك الحالية ببيانات الملف (${next.events.length} حدث، ${next.tasks.length} مهمة، ${next.sessions.length} جلسة). هل تريد المتابعة؟ يُنصح بتصدير نسخة من الحالية أولًا.`, 'استعادة', () => {
      state = next; save(); render(); toast('تمت الاستعادة بنجاح', 'ok');
    });
  };
  reader.readAsText(file);
}

/* ================= معالج الأحداث ================= */

function bindEvents() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act],[data-ring],[data-q]');
    if (!t) return;
    if (t.dataset.ring) return ringAction(t.dataset.ring);
    if (t.dataset.q && !t.dataset.act) return;
    const a = t.dataset.act;
    const d = t.dataset;
    switch (a) {
      case 'close-sheet': return closeSheet();
      case 'go-schedule': closeSheet(); return go('schedule');
      case 'go-alarms': closeSheet(); return go('alarms');
      case 'go-study-tasks': return go('study');
      case 'today': ui.selDate = dateKey(); return render();
      case 'sel-date': ui.selDate = d.date; return render();
      case 'week-shift': ui.selDate = addDays(ui.selDate, 7 * Number(d.n)); return render();
      case 'open-event': return openEventDetails(d.occ);
      case 'resolve': return resolveOcc(d.occ, d.status);
      case 'add-event': return openEventForm(null, ui.selDate);
      case 'edit-event': closeSheet(); return openEventForm(d.id, d.date);
      case 'dup-event': closeSheet(); return duplicateEvent(d.id, d.date);
      case 'del-event': closeSheet(); return removeEvent(d.id, d.date);
      case 'confirm-optional': {
        const id = d.id || eventIdOf(d.occ || '');
        const ev = state.events.find((e) => e.id === id);
        if (!ev) return;
        mutate((s) => { const x = s.events.find((e) => e.id === id); x.confirmed = !x.confirmed; x.status = x.confirmed ? 'confirmed' : 'tentative'; }, ev.confirmed ? 'أصبحت الحصة غير مؤكدة' : 'تم تأكيد الحصة، وستُضاف تذكيراتها');
        closeSheet();
        return;
      }
      case 'add-suggested': {
        const id = eventIdOf(d.occ);
        const date = dateOfOcc(d.occ);
        const ev = state.events.find((e) => e.id === id);
        if (!ev) return;
        mutate((st) => st.events.push({ id: newId('ev'), title: 'مذاكرة بدلًا من الحصة غير المؤكدة', type: 'study', subject: ev.subject || null, notes: 'وقت مقترح من جدول الحصة الاختيارية', recurring: false, date, start: ev.start, end: ev.end, optional: false, confirmed: true }), 'أُضيفت جلسة مذاكرة في هذا الوقت');
        return;
      }
      case 'start-study': return startStudy(d.subject || '');
      case 't-start': return timerStart();
      case 't-pause': return timerPause();
      case 't-reset': return timerReset();
      case 't-finish': return timerFinishStudy();
      case 't-skip-break': timer.phase = 'study'; timer.endAt = null; timer.leftMs = null; timer.running = false; saveTimer(); return render();
      case 'add-task': return openTaskForm(null);
      case 'edit-task': return openTaskForm(d.id);
      case 'del-task': closeSheet(); return confirmBox('حذف المهمة', 'هل تريد حذف هذه المهمة؟', 'حذف', () => mutate((s) => { s.tasks = s.tasks.filter((x) => x.id !== d.id); }, 'تم حذف المهمة'));
      case 'task-toggle': return toggleTask(d.id);
      case 'task-steps': return openSteps(d.id);
      case 'task-filter': ui.taskFilter = d.f; return render();
      case 'add-subject': return openSubjectForm(null);
      case 'edit-subject': return openSubjectForm(d.id);
      case 'del-subject': closeSheet(); return confirmBox('حذف المادة', 'ستبقى الحصص والمهام المرتبطة بها، لكنها ستفقد اسم المادة. هل تريد الحذف؟ (يمكنك الأرشفة بدلًا من ذلك)', 'حذف', () => mutate((s) => { s.subjects = s.subjects.filter((x) => x.id !== d.id); }, 'تم حذف المادة'));
      case 'add-revision': return openRevisionForm();
      case 'rev-done': return mutate((s) => { const r = s.revisions.find((x) => x.id === d.id); if (r) { r.stage += 1; if (r.stage >= s.settings.revisionIntervals.length) r.stage = s.settings.revisionIntervals.length; } }, 'أحسنت! تم تحديث موعد المراجعة التالي');
      case 'ask-perm': return askPermission();
      case 'unlock-audio': unlockAudio(); return toast('تم تفعيل الصوت للتنبيهات', 'ok');
      case 'test-alarm': return testAlarm(d.id || null);
      case 'add-alarm': return openAlarmForm(null);
      case 'edit-alarm': return openAlarmForm(d.id);
      case 'del-alarm': closeSheet(); return confirmBox('حذف المنبه', 'هل تريد حذف هذا المنبه نهائيًا؟', 'حذف', () => mutate((s) => { s.alarms = s.alarms.filter((x) => x.id !== d.id); }, 'تم حذف المنبه'));
      case 'hist-filter': ui.histFilter = d.f; return render();
      case 'clear-history': return confirmBox('مسح السجل', 'سيُمسح سجل المنبهات والإنجازات. لا تُحذف المنبهات أو الجدول.', 'مسح', () => mutate((s) => { s.history = []; }, 'تم مسح السجل'));
      case 'open-notifs': return openNotifications();
      case 'open-assistant': return openAssistant();
      case 'assistant-prefill': return openAssistant(d.q);
      case 'export': return exportData();
      case 'restore-schedule': return confirmBox('استعادة الجدول الأصلي', 'ستُستبدل الحصص الحالية بالجدول الأصلي للطالب، ويُعاد المنبه الأساسي. المهام والجلسات والمواد لن تُمسّ. هل تريد المتابعة؟', 'استعادة الجدول', () => mutate((s) => { s.events = C.seedEvents(); s.alarms = s.alarms.filter((a) => a.id !== 'alarm-wake').concat(C.defaultAlarms(s.settings)); }, 'تمت استعادة الجدول الأصلي'));
      case 'reset-all': return openSheet('مسح كل البيانات', `<p class="muted">سيُحذف كل شيء على هذا الجهاز: الجدول والمهام والجلسات والإعدادات. لا يمكن التراجع. اكتب <b>حذف</b> للتأكيد.</p>
        <form id="reset-form" class="row-inline"><input name="c" placeholder="حذف" required><button class="btn danger sm" type="submit">مسح نهائي</button></form>`, {
        onMount: (w) => w.querySelector('#reset-form').addEventListener('submit', (ev) => { ev.preventDefault(); if (ev.target.c.value.trim() !== 'حذف') return toast('اكتب كلمة حذف للتأكيد', 'error'); state = C.createDefaultState(); timer = loadTimer(); timer = { phase: 'study', plannedMin: null, subjectId: '', goal: '', endAt: null, leftMs: null, running: false, cycles: 0 }; saveTimer(); save(); closeSheet(); render(); toast('تم مسح البيانات وبدأنا من جديد', 'info'); }),
      });
      case 'habit': {
        const today = dateKey();
        const h = state.habits.find((x) => x.id === d.id);
        if (!h) return;
        mutate((s) => { const log = { ...(s.habitLog[today] || {}) }; log[h.id] = Math.max(0, Math.min(h.goal * 2, (log[h.id] || 0) + Number(d.d))); s.habitLog[today] = log; });
        return;
      }
      case 'habit-edit': return openHabitForm(d.id);
      case 'add-habit': return openHabitForm(null);
      default:
        return;
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    const c = t.dataset.change;
    if (c === 'alarm-toggle') return mutate((s) => { const x = s.alarms.find((y) => y.id === t.dataset.id); if (x) x.enabled = t.checked; }, t.checked ? 'المنبه مفعّل' : 'تم إيقاف المنبه');
    if (c === 'type-filter') { ui.typeFilter = t.value; return render(); }
    if (c === 't-subject') { timer.subjectId = t.value; saveTimer(); return; }
    if (c === 't-plan') { timer.plannedMin = Number(t.value); saveTimer(); return render(); }
    if (c === 't-goal') { timer.goal = t.value.slice(0, 120); saveTimer(); return; }
    if (c === 'import' && t.files && t.files[0]) { importData(t.files[0]); t.value = ''; return; }
    if (t.dataset.check !== undefined) {
      mutate((s) => { const k = dateKey(); const cl = { ...(s.checklists[k] || {}) }; cl[t.dataset.check] = t.checked; s.checklists[k] = cl; });
      return;
    }
    if (t.dataset.inputOut) return;
  });

  document.addEventListener('input', (e) => {
    if (e.target.dataset.input === 'search') {
      ui.search = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const el = document.getElementById('search');
      if (el) { el.focus(); el.setSelectionRange(pos, pos); }
    }
  });

  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.dataset.form) {
      e.preventDefault();
      if (readOnly) return toast('التطبيق للقراءة فقط.', 'error');
      const fd = new FormData(f);
      const kind = f.dataset.form;
      const errs = [];
      const t = (k) => String(fd.get(k) || '');
      if (kind === 'profile') {
        mutate((s) => { s.settings.name = t('name').trim(); s.settings.schoolYear = t('schoolYear').trim() || s.settings.schoolYear; s.settings.section = t('section').trim() || s.settings.section; }, 'تم حفظ الملف');
      } else if (kind === 'sleep') {
        for (const k of ['wake', 'windDown', 'bedtime', 'latestBed']) if (!C.isValidTime(t(k))) errs.push('وقت غير صحيح');
        if (!errs.length) mutate((s) => {
          const st = s.settings;
          st.wake = t('wake'); st.windDown = t('windDown'); st.bedtime = t('bedtime'); st.latestBed = t('latestBed');
          const m = s.alarms.find((a) => a.id === 'alarm-wake');
          if (m) m.time = st.wake; else s.alarms.push({ ...C.defaultAlarms(st)[0] });
        }, 'تم حفظ مواعيد النوم');
      } else if (kind === 'study') {
        const nums = { exerciseMin: [5, 120], travelMin: [0, 180], studyMin: [10, 120], breakMin: [1, 60], longBreakMin: [5, 90], sessionsBeforeLong: [2, 8], waterGoal: [1, 20] };
        const vals = {};
        for (const [k, [lo, hi]] of Object.entries(nums)) { const v = Number(t(k)); if (!Number.isFinite(v) || v < lo || v > hi) errs.push(`قيمة غير صحيحة: ${k}`); vals[k] = v; }
        const iv = t('revisionIntervals').split(/[,،]/).map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x >= 0 && x <= 60);
        if (!iv.length) errs.push('أدخل فواصل مراجعة صحيحة');
        if (errs.length) return toast(errs[0], 'error');
        mutate((s) => { Object.assign(s.settings, vals); s.settings.revisionIntervals = [...new Set(iv)].sort((a, b) => a - b); s.settings.thursdayLesson = f.thursdayLesson.checked; const th = s.events.find((x) => x.optional && x.day === 5); if (th) { th.confirmed = s.settings.thursdayLesson; th.optional = true; th.status = s.settings.thursdayLesson ? 'confirmed' : 'tentative'; } }, 'تم حفظ إعدادات الجدول');
      } else if (kind === 'alarm-pref') {
        const leads = t('leads').split(/[,،]/).map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x >= 0 && x <= 240);
        if (!leads.length) return toast('أدخل دقائق تذكير صحيحة، مثل 60, 30, 15', 'error');
        mutate((s) => {
          Object.assign(s.settings, { leads: [...new Set(leads)].sort((a, b) => b - a), reminderMode: t('reminderMode'), snooze: Number(t('snooze')), sound: f.sound.checked, vibrate: f.vibrate.checked, theme: t('theme'), quietEnabled: f.quietEnabled.checked, quietStart: t('quietStart'), quietEnd: t('quietEnd') });
          for (const c of CATEGORIES) s.settings.cats[c.id] = f[`cat_${c.id}`].checked;
          for (const a of s.alarms) if (a.category === 'wake') a.snooze = s.settings.snooze;
        }, 'تم حفظ التفضيلات');
      }
    }
    if (f.id === 'session-form') return;
  });
}

function openHabitForm(id) {
  const h = id ? state.habits.find((x) => x.id === id) : { name: '', goal: 1, icon: '✔️' };
  const w = openSheet(id ? 'تعديل العادة' : 'عادة جديدة', `
    <form id="habit-form" class="form">
      <div class="grid-2 tight"><label>الأيقونة<input name="icon" maxlength="4" value="${esc(h.icon)}"></label><label>الهدف اليومي<input type="number" name="goal" min="1" max="20" value="${h.goal}"></label></div>
      <label>الاسم<input name="name" required maxlength="60" value="${esc(h.name)}"></label>
      <p class="form-err" hidden role="alert"></p>
      <div class="row-btns"><button class="btn primary" type="submit">حفظ</button>${id ? '<button class="btn danger" type="button" data-hdel>حذف</button>' : ''}</div>
    </form>`);
  w.querySelector('[data-hdel]')?.addEventListener('click', () => { mutate((s) => { s.habits = s.habits.filter((x) => x.id !== id); }, 'تم حذف العادة'); closeSheet(); });
  w.querySelector('#habit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const name = f.name.value.trim();
    if (!name) return;
    const goal = Math.max(1, Math.min(20, Number(f.goal.value) || 1));
    mutate((s) => { if (id) Object.assign(s.habits.find((x) => x.id === id), { name, goal, icon: f.icon.value || '✔️' }); else s.habits.push({ id: newId('h'), name, goal, icon: f.icon.value || '✔️' }); }, 'تم حفظ العادة');
    closeSheet();
  });
}

function maybeOnboard() {
  if (state.meta.onboarded) return;
  const w = openSheet('مرحبًا بك في يومي 👋', `
    <p>يومي مساعدك لتنظيم الجدول والمذاكرة والمنبهات. كل شيء يُحفظ على جهازك، ولا تحتاج حسابًا.</p>
    <form id="onb" class="form">
      <label>ما اسمك؟ (اختياري)<input name="name" maxlength="40"></label>
      <div class="alert info">${icon('bell')}<div><b>لماذا نحتاج الإشعارات؟</b><p>لتصلك تذكيرات الحصص والمذاكرة والاستيقاظ. يمكنك رفض الإذن وستظل التنبيهات تظهر داخل التطبيق عندما يكون مفتوحًا.</p></div></div>
      <div class="alert warn">${icon('alert')}<div><b>حدود مهمة</b><p>المتصفح لا يضمن منبهًا دقيقًا عند إغلاق التطبيق أو قفل الهاتف. أبقِ التطبيق مفتوحًا أو مثبتًا، ولا تعتمد عليه وحده لاستيقاظ حاسم.</p></div></div>
      <div class="row-btns wrap"><button class="btn primary" type="submit">ابدأ</button><button class="btn ghost" type="button" data-onb-perm>فعّل الإشعارات</button></div>
    </form>`);
  w.querySelector('[data-onb-perm]').addEventListener('click', askPermission);
  w.querySelector('#onb').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    mutate((s) => { s.settings.name = name; s.meta.onboarded = true; });
    closeSheet();
    unlockAudio();
  });
  // دعم المستخدمين الحاليين: لا تعرض الترحيب لمن لديه بيانات
}

/* ================= التهيئة ================= */

function init() {
  state = loadState();
  timer = loadTimer();
  document.documentElement.dataset.theme = state.settings.theme;
  bindEvents();
  document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  render();
  if (pendingNotice) toast(pendingNotice, 'warn', 6000);
  maybeOnboard();
  setInterval(liveTick, 1000);
  setInterval(checkReminders, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); render(); } });
  // تشغيل فوري للفحص
  checkReminders();
  // تحديث الحالة كل دقيقة لعرض الحصة الحالية والتعارضات
  setInterval(() => { if (ui.tab === 'home') render(); }, 60000);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* التطبيق يعمل بدون عمل خارجي */ });
    navigator.serviceWorker.addEventListener('message', (ev) => {
      if (ev.data && ev.data.type === 'open') go('alarms');
    });
  }
}

init();
