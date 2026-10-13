/* ============================================================
 * يومي | YAWMI — core.js
 * منطق خالص بدون DOM: الوقت، التكرار، التعارضات، التذكيرات،
 * الترحيل، والمساعد القائم على القواعد. قابل للاختبار في Node.
 * ============================================================ */

export const SCHEMA_VERSION = 1;
export const APP_ID = 'yawmi';

/** أيام الأسبوع: الفهرس 0 = السبت ... 6 = الجمعة */
export const DAYS_AR = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

export const TYPES = {
  lesson:   { label: 'حصة دراسية', color: '#1e3a8a' },
  study:    { label: 'مذاكرة',      color: '#3b82f6' },
  break:    { label: 'راحة',        color: '#64748b' },
  exercise: { label: 'رياضة',       color: '#0d9488' },
  meal:     { label: 'وجبة',        color: '#d97706' },
  sleep:    { label: 'نوم واستعداد', color: '#4338ca' },
  personal: { label: 'وقت شخصي',    color: '#8b5cf6' },
  travel:   { label: 'تحضير وسفر',  color: '#78716c' },
};

export const CATEGORIES = [
  { id: 'wake', label: 'الاستيقاظ' },
  { id: 'exercise', label: 'الرياضة' },
  { id: 'study', label: 'المذاكرة' },
  { id: 'lesson', label: 'الحصص' },
  { id: 'travel', label: 'السفر والتحضير' },
  { id: 'homework', label: 'المهام والواجبات' },
  { id: 'revision', label: 'المراجعة' },
  { id: 'meal', label: 'الوجبات والماء' },
  { id: 'sleep', label: 'النوم' },
  { id: 'custom', label: 'منبه مخصص' },
];
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

export const ALARM_WINDOW_MS = 10 * 60 * 1000; // أقصى تأخير مقبول لإطلاق منبه

/* ---------------- الوقت والتاريخ ---------------- */

export const pad = (n) => String(n).padStart(2, '0');

export function isValidTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}
export function toMin(hhmm) {
  if (!isValidTime(hhmm)) throw new Error('صيغة الوقت غير صحيحة: ' + hhmm);
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
export function fromMin(m) {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
}
/** وقت 12 ساعة بتمييز عربي: ٧:٠٠ صباحًا */
export function fmt12(hhmm) {
  const m = toMin(hhmm);
  const h = Math.floor(m / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m % 60)} ${h < 12 ? 'صباحًا' : 'مساءً'}`;
}
export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseDate(s);
  return !isNaN(d.getTime()) && dateKey(d) === s;
}
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
/** الفهرس وفق الأسبوع السعودي/المصري: السبت = 0 */
export function dayIdx(s) {
  return (parseDate(s).getDay() + 1) % 7;
}
export function startOfWeek(s) {
  return addDays(s, -dayIdx(s));
}
export function dateAt(s, hhmm) {
  const d = parseDate(s);
  const m = toMin(hhmm);
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d.getTime();
}
export function arDate(s) {
  const d = parseDate(s);
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return `${DAYS_AR[dayIdx(s)]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
export function newId(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------------- الإعدادات الافتراضية ---------------- */

export const DEFAULT_SETTINGS = Object.freeze({
  name: '',
  schoolYear: 'الصف الثاني الثانوي الأزهري',
  section: 'القسم الأدبي',
  wake: '07:00',
  windDown: '21:00',
  bedtime: '22:00',
  latestBed: '22:30',
  exerciseMin: 30,
  travelMin: 15,
  studyMin: 50,
  breakMin: 10,
  longBreakMin: 20,
  sessionsBeforeLong: 4,
  snooze: 10,
  sound: true,
  vibrate: true,
  theme: 'dark',
  leads: [60, 30, 15],
  reminderMode: 'all', // all | important
  quietEnabled: true,
  quietStart: '23:00',
  quietEnd: '06:30',
  thursdayLesson: false,
  revisionIntervals: [0, 1, 3, 7],
  waterGoal: 8,
  cats: { wake: true, exercise: true, study: true, lesson: true, travel: true, homework: true, revision: true, meal: true, sleep: true, custom: true },
  sleepChecklist: ['كتب الغد', 'الكراسات والأدوات', 'الزي المدرسي', 'الشاحن ووضع الهاتف جانبًا'],
});

/* ---------------- بيانات البداية (الجدول الأصلي للطالب) ---------------- */

export const SUBJECT_SEED = [
  { id: 'shar', name: 'شرعي', color: '#0f766e', icon: '🕌', note: 'الدراسات الشرعية' },
  { id: 'ar', name: 'اللغة العربية', color: '#b45309', icon: '✒️' },
  { id: 'en', name: 'اللغة الإنجليزية', color: '#1d4ed8', icon: '🇬🇧' },
  { id: 'fr', name: 'اللغة الفرنسية', color: '#7c3aed', icon: '🇫🇷' },
  { id: 'phil', name: 'الفلسفة', color: '#be185d', icon: '🧠' },
  { id: 'geo', name: 'الجغرافيا', color: '#15803d', icon: '🗺️' },
  { id: 'hist', name: 'التاريخ', color: '#9a3412', icon: '🏛️' },
];

/** [يوم, بداية, نهاية, نوع, عنوان, مادة, خيارات] — الأوقات الأصلية كما وردت في الجدول */
const S = (day, start, end, type, title, subject = null, extra = {}) => ({ day, start, end, type, title, subject, ...extra });
const OPT = { optional: true, confirmed: false };

export const SEED_EVENTS = [
  // السبت 0
  S(0, '07:00', '07:45', 'exercise', 'الاستيقاظ والتمرين'),
  S(0, '07:45', '08:15', 'meal', 'الإفطار والتجهيز'),
  S(0, '08:15', '10:00', 'study', 'مذاكرة الفلسفة أو مادة ذات أولوية', 'phil'),
  S(0, '10:00', '11:15', 'break', 'استراحة وتجهيز للدرس'),
  S(0, '11:30', '12:15', 'lesson', 'درس شرعي', 'shar'),
  S(0, '12:15', '12:30', 'break', 'استراحة قصيرة'),
  S(0, '12:30', '14:00', 'lesson', 'لغة إنجليزية', 'en'),
  S(0, '14:00', '17:00', 'lesson', 'فلسفة', 'phil'),
  S(0, '17:00', '18:00', 'meal', 'وجبة وراحة'),
  S(0, '18:00', '19:00', 'study', 'مراجعة الفلسفة والإنجليزية', 'phil'),
  S(0, '19:00', '20:00', 'meal', 'العشاء ووقت شخصي'),
  S(0, '20:00', '21:00', 'study', 'واجبات أو مراجعة خفيفة'),
  S(0, '21:00', '22:30', 'sleep', 'استرخاء والاستعداد للأحد والنوم'),
  // الأحد 1
  S(1, '07:00', '07:45', 'exercise', 'الاستيقاظ والتمرين'),
  S(1, '07:45', '08:15', 'meal', 'الإفطار'),
  S(1, '08:15', '10:00', 'study', 'مذاكرة مادة ذات أولوية'),
  S(1, '10:00', '10:30', 'break', 'استراحة'),
  S(1, '10:30', '11:30', 'study', 'مراجعة وأسئلة تدريبية'),
  S(1, '11:30', '12:30', 'meal', 'وجبة وراحة'),
  S(1, '12:30', '13:30', 'study', 'مفردات وقواعد فرنسية', 'fr'),
  S(1, '13:30', '14:30', 'break', 'راحة وتجهيز'),
  S(1, '14:30', '15:30', 'travel', 'السفر والتحضير للدرس (قابل للتعديل)'),
  S(1, '15:30', '18:30', 'lesson', 'لغة فرنسية', 'fr'),
  S(1, '18:30', '19:30', 'meal', 'العودة للمنزل والعشاء والراحة'),
  S(1, '19:30', '20:15', 'study', 'مراجعة الدرس الفرنسي', 'fr'),
  S(1, '20:15', '21:00', 'personal', 'وقت شخصي'),
  S(1, '21:00', '22:30', 'sleep', 'تحضير لليوم التالي والنوم'),
  // الإثنين 2
  S(2, '07:00', '07:45', 'exercise', 'الاستيقاظ والتمرين'),
  S(2, '07:45', '08:15', 'meal', 'الإفطار'),
  S(2, '08:15', '10:00', 'study', 'الجغرافيا أو مادة صعبة', 'geo'),
  S(2, '10:00', '10:30', 'break', 'استراحة'),
  S(2, '10:30', '12:00', 'study', 'تمارين ومراجعة'),
  S(2, '12:00', '13:00', 'meal', 'الغداء والراحة'),
  S(2, '13:00', '14:00', 'study', 'مذاكرة مادة أخرى'),
  S(2, '14:00', '15:00', 'personal', 'وقت حر'),
  S(2, '15:00', '16:15', 'travel', 'التحضير والسفر (قابل للتعديل)'),
  S(2, '16:30', '18:30', 'lesson', 'جغرافيا', 'geo'),
  S(2, '18:30', '19:30', 'meal', 'العودة والعشاء والراحة'),
  S(2, '19:30', '20:15', 'study', 'تلخيص درس الجغرافيا', 'geo'),
  S(2, '20:15', '21:00', 'personal', 'وقت شخصي'),
  S(2, '21:00', '22:30', 'sleep', 'استرخاء ونوم'),
  // الثلاثاء 3
  S(3, '07:00', '07:45', 'exercise', 'الاستيقاظ والتمرين'),
  S(3, '07:45', '08:15', 'meal', 'الإفطار'),
  S(3, '08:15', '10:00', 'study', 'مذاكرة مادة أساسية'),
  S(3, '10:00', '10:30', 'break', 'استراحة'),
  S(3, '10:30', '11:30', 'study', 'مراجعة وأسئلة تدريبية'),
  S(3, '11:30', '12:15', 'meal', 'وجبة خفيفة وتجهيز'),
  S(3, '12:30', '14:30', 'lesson', 'درس شرعي', 'shar'),
  S(3, '14:30', '15:30', 'meal', 'الغداء والراحة'),
  S(3, '15:30', '17:00', 'study', 'مذاكرة مادة أخرى'),
  S(3, '17:00', '18:00', 'break', 'راحة أو نشاط خفيف'),
  S(3, '18:00', '19:00', 'study', 'مراجعة الدرس الشرعي والواجبات', 'shar'),
  S(3, '19:00', '20:00', 'meal', 'العشاء ووقت شخصي'),
  S(3, '20:00', '21:00', 'study', 'مراجعة خفيفة'),
  S(3, '21:00', '22:30', 'sleep', 'تحضير للنوم'),
  // الأربعاء 4
  S(4, '07:00', '07:45', 'exercise', 'الاستيقاظ والتمرين'),
  S(4, '07:45', '08:15', 'meal', 'الإفطار'),
  S(4, '08:15', '10:00', 'study', 'مذاكرة مادة صعبة'),
  S(4, '10:00', '10:30', 'break', 'استراحة'),
  S(4, '10:30', '12:00', 'study', 'واجبات وتدريب'),
  S(4, '12:00', '13:00', 'meal', 'الغداء والراحة'),
  S(4, '13:00', '14:00', 'study', 'معاينة ومراجعة التاريخ', 'hist'),
  S(4, '14:00', '15:15', 'travel', 'التحضير والسفر (قابل للتعديل)'),
  S(4, '15:30', '18:30', 'lesson', 'تاريخ', 'hist'),
  S(4, '18:30', '19:30', 'meal', 'العشاء والراحة'),
  S(4, '19:30', '20:15', 'study', 'مراجعة الأحداث والتواريخ', 'hist'),
  S(4, '20:15', '21:00', 'personal', 'وقت شخصي'),
  S(4, '21:00', '22:30', 'sleep', 'تحضير للنوم'),
  // الخميس 5
  S(5, '07:00', '07:45', 'exercise', 'الاستيقاظ والتمرين'),
  S(5, '07:45', '08:15', 'meal', 'الإفطار'),
  S(5, '08:15', '10:00', 'study', 'اللحاق بالمواد غير المكتملة'),
  S(5, '10:00', '10:30', 'break', 'استراحة'),
  S(5, '10:30', '12:00', 'study', 'اختبار تدريبي أسبوعي'),
  S(5, '12:00', '12:45', 'meal', 'الغداء والتجهيز'),
  S(5, '13:00', '14:00', 'lesson', 'درس شرعي اختياري (غير مؤكد)', 'shar', OPT),
  S(5, '14:00', '15:00', 'break', 'راحة'),
  S(5, '15:00', '16:30', 'study', 'مراجعة مادة ضعيفة'),
  S(5, '16:30', '18:00', 'personal', 'رياضة أو هوايات أو خروج'),
  S(5, '18:00', '19:00', 'meal', 'العشاء والراحة'),
  S(5, '19:00', '20:00', 'study', 'إنهاء الواجبات المتبقية'),
  S(5, '20:00', '22:30', 'personal', 'وقت شخصي والاستعداد للنوم'),
  // الجمعة 6
  S(6, '07:00', '07:45', 'exercise', 'الاستيقاظ والتمرين'),
  S(6, '07:45', '08:15', 'meal', 'الإفطار'),
  S(6, '08:15', '09:45', 'study', 'مذاكرة اللغة العربية', 'ar'),
  S(6, '09:45', '10:15', 'break', 'استراحة'),
  S(6, '10:15', '11:30', 'study', 'مراجعة درس قديم'),
  S(6, '11:30', '12:15', 'break', 'راحة وتجهيز'),
  S(6, '12:15', '13:00', 'meal', 'وجبة خفيفة وتجهيز'),
  S(6, '13:30', '15:00', 'lesson', 'لغة عربية', 'ar'),
  S(6, '15:00', '16:00', 'meal', 'راحة وغداء عند الحاجة'),
  S(6, '16:00', '17:00', 'study', 'مراجعة العربية والواجبات المرتبطة', 'ar'),
  S(6, '17:00', '18:30', 'personal', 'وقت العائلة أو الترويح'),
  S(6, '18:30', '19:30', 'study', 'مراجعة أسبوعية خفيفة'),
  S(6, '19:30', '21:00', 'personal', 'وقت شخصي'),
  S(6, '21:00', '22:30', 'sleep', 'التحضير للسبت والنوم'),
];

export function seedEvents() {
  return SEED_EVENTS.map((e, i) => {
    const { optional = false, confirmed, ...rest } = e;
    const ev = {
      id: `seed-${e.day}-${String(i).padStart(3, '0')}`,
      recurring: true,
      status: 'confirmed',
      notes: '',
      ...rest,
      optional,
    };
    if (optional) { ev.confirmed = false; ev.status = 'tentative'; }
    ev.subject = ev.subject || null;
    return ev;
  });
}

export function defaultAlarms(settings = DEFAULT_SETTINGS) {
  return [
    {
      id: 'alarm-wake', category: 'wake', title: 'منبه الاستيقاظ',
      message: 'صباح الخير! حان وقت الاستيقاظ والتمرين لمدة نصف ساعة.',
      time: settings.wake, days: [0, 1, 2, 3, 4, 5, 6], enabled: true,
      sound: true, vibrate: true, snooze: settings.snooze, repeat: 'weekly', date: null,
    },
  ];
}

export function createDefaultState(now = new Date()) {
  const settings = { ...DEFAULT_SETTINGS, cats: { ...DEFAULT_SETTINGS.cats } };
  return {
    version: SCHEMA_VERSION,
    settings,
    subjects: SUBJECT_SEED.map((s) => ({
      archived: false, priority: 2, teacher: '', notes: '', progress: 0,
      tests: [], weakTopics: [], completedLessons: 0, ...s,
    })),
    events: seedEvents(),
    completions: {},          // { 'YYYY-MM-DD': { eventId: 'done'|'skipped'|'postponed' } }
    tasks: [],
    alarms: defaultAlarms(settings),
    snoozes: [],              // [{ id, alarmId, title, message, at, sound, vibrate, category }]
    history: [],              // [{ id, at, action, title, category }]
    sessions: [],             // [{ id, date, subjectId, plannedMin, actualMin, finishedPlanned, understanding, needMore, review, startedAt }]
    habits: [
      { id: 'h-exercise', name: 'الرياضة الصباحية', goal: 1, icon: '🏃' },
      { id: 'h-water', name: 'شرب الماء', goal: 8, icon: '💧' },
      { id: 'h-study', name: 'إكمال جلسات المذاكرة', goal: 2, icon: '📚' },
      { id: 'h-review', name: 'مراجعة الدروس', goal: 1, icon: '🔁' },
      { id: 'h-desk', name: 'ترتيب المكتب', goal: 1, icon: '🗂️' },
      { id: 'h-prep', name: 'التحضير للغد', goal: 1, icon: '🎒' },
      { id: 'h-bed', name: 'النوم في الموعد', goal: 1, icon: '🌙' },
    ],
    habitLog: {},            // { 'YYYY-MM-DD': { habitId: count } }
    checklists: {},          // { 'YYYY-MM-DD': { itemKey: true } }
    revisions: [],           // [{ id, subjectId, topic, learned, stage }]
    fired: {},               // { reminderKey: timestamp }
    meta: { createdAt: now.getTime(), lastTick: now.getTime(), notifPrompted: false },
  };
}

/* ---------------- الترحيل والتحقق ---------------- */

export class DataError extends Error {}

export function migrate(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object') return createDefaultState(now);
  let data = raw;
  const v = Number(data.version) || 0;
  if (v > SCHEMA_VERSION) throw new DataError('هذه البيانات من إصدار أحدث من التطبيق. حدّث التطبيق أولًا.');
  // هنا تُضاف خطوات الترحيل المستقبلية: if (v < 2) { ... }
  const base = createDefaultState(now);
  const out = { ...base, ...data, version: SCHEMA_VERSION };
  out.settings = { ...base.settings, ...(data.settings || {}), cats: { ...base.settings.cats, ...((data.settings || {}).cats || {}) } };
  for (const k of ['subjects', 'events', 'tasks', 'alarms', 'snoozes', 'history', 'sessions', 'habits', 'revisions']) {
    if (!Array.isArray(out[k])) out[k] = base[k];
  }
  for (const k of ['completions', 'habitLog', 'checklists', 'fired']) {
    if (!out[k] || typeof out[k] !== 'object') out[k] = {};
  }
  out.meta = { ...base.meta, ...(data.meta || {}) };
  out.events = out.events.filter(validEvent);
  out.alarms = out.alarms.filter(validAlarm);
  return out;
}

export function validEvent(e) {
  if (!e || typeof e !== 'object') return false;
  if (!e.id || typeof e.title !== 'string' || !e.title.trim()) return false;
  if (!isValidTime(e.start) || !isValidTime(e.end)) return false;
  if (toMin(e.end) <= toMin(e.start)) return false;
  if (!TYPES[e.type]) return false;
  if (e.recurring) return Number.isInteger(e.day) && e.day >= 0 && e.day <= 6;
  return isValidDate(e.date);
}

export function validAlarm(a) {
  return !!a && typeof a.id === 'string' && isValidTime(a.time) && Array.isArray(a.days) && typeof a.title === 'string';
}

/** التحقق من حدث قبل الحفظ: يعيد قائمة أخطاء بالعربية */
export function validateEventInput(input) {
  const errs = [];
  if (!input.title || !String(input.title).trim()) errs.push('اكتب عنوانًا للحدث.');
  if (String(input.title || '').length > 120) errs.push('العنوان طويل جدًا (الحد 120 حرفًا).');
  if (!isValidTime(input.start)) errs.push('وقت البداية غير صحيح.');
  if (!isValidTime(input.end)) errs.push('وقت النهاية غير صحيح.');
  if (isValidTime(input.start) && isValidTime(input.end) && toMin(input.end) <= toMin(input.start)) errs.push('وقت النهاية يجب أن يكون بعد البداية.');
  if (!TYPES[input.type]) errs.push('اختر نوع الحدث.');
  if (!input.recurring && !isValidDate(input.date)) errs.push('اختر تاريخ الحدث.');
  return errs;
}

/* ---------------- الجدول: تكرار الأحداث والتعارضات ---------------- */

export function isConfirmed(ev) {
  return !ev.optional || ev.confirmed === true;
}

/** أحداث يوم معيّن (بعد تطبيق التكرار والحالة) */
export function occurrencesOn(state, date) {
  const di = dayIdx(date);
  const out = [];
  for (const ev of state.events) {
    const onDay = ev.recurring ? ev.day === di : ev.date === date;
    if (!onDay) continue;
    if (ev.recurring && Array.isArray(ev.exceptions) && ev.exceptions.includes(date)) continue;
    const status = (state.completions[date] || {})[ev.id] || null;
    out.push({
      ...ev,
      occId: `${ev.id}@${date}`,
      date,
      startMin: toMin(ev.start),
      endMin: toMin(ev.end),
      status,
      confirmed: isConfirmed(ev),
      counts: isConfirmed(ev) && status !== 'skipped' && status !== 'postponed',
    });
  }
  return out.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

/** تعارضات أيام: أزواج أحداث متداخلة (المؤكدة فقط) */
export function findConflicts(state, date) {
  const occ = occurrencesOn(state, date).filter((o) => o.counts);
  const out = [];
  for (let i = 0; i < occ.length; i++) {
    for (let j = i + 1; j < occ.length; j++) {
      const a = occ[i], b = occ[j];
      if (a.startMin < b.endMin && b.startMin < a.endMin) {
        const overlap = Math.min(a.endMin, b.endMin) - Math.max(a.startMin, b.startMin);
        out.push({ a, b, overlap, severe: a.type === 'lesson' || b.type === 'lesson' });
      }
    }
  }
  return out;
}

/** الحصة التالية (أو الجارية الآن) خلال أسبوع */
export function nextLesson(state, now = new Date(), days = 8) {
  const today = dateKey(now);
  const nowMs = now.getTime();
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i);
    for (const o of occurrencesOn(state, d)) {
      if (o.type !== 'lesson' || !o.counts) continue;
      const startAt = dateAt(d, o.start);
      const endAt = dateAt(d, o.end);
      if (endAt > nowMs) return { ...o, startAt, endAt, inProgress: startAt <= nowMs };
    }
  }
  return null;
}

export function currentBlock(state, now = new Date()) {
  const today = dateKey(now);
  const m = now.getHours() * 60 + now.getMinutes();
  return occurrencesOn(state, today).find((o) => o.startMin <= m && m < o.endMin) || null;
}

/** أقرب موضع بعد الآن للمذاكرة أو التأجيل: بين الاستيقاظ ووقت الاستعداد للنوم */
export function findFreeSlot(state, fromDate, fromM, durationMin, maxDays = 3) {
  const wake = toMin(state.settings.wake);
  const limit = toMin(state.settings.windDown);
  for (let i = 0; i <= maxDays; i++) {
    const d = addDays(fromDate, i);
    const busy = occurrencesOn(state, d).filter((o) => o.counts);
    const lo = i === 0 ? Math.max(fromM, wake) : wake;
    for (let s = Math.ceil(lo / 5) * 5; s + durationMin <= limit; s += 5) {
      const e = s + durationMin;
      if (!busy.some((o) => s < o.endMin && o.startMin < e)) {
        return { date: d, start: fromMin(s), end: fromMin(e) };
      }
    }
  }
  return null;
}

/** الدقائق الحرة في يوم معيّن ضمن نافذة النهار (الاستيقاظ → الاستعداد للنوم) */
export function freeMinutes(state, date) {
  const from = toMin(state.settings.wake);
  const to = toMin(state.settings.windDown);
  const busy = occurrencesOn(state, date).filter((o) => o.counts && o.type !== 'sleep');
  let free = 0;
  for (let m = from; m < to; m++) {
    if (!busy.some((o) => o.startMin <= m && m < o.endMin)) free++;
  }
  return free;
}

/* ---------------- المراجعة المتباعدة ---------------- */

export function revisionDueDate(rev, intervals) {
  if (rev.stage >= intervals.length) return null;
  return addDays(rev.learned, intervals[rev.stage]);
}
export function revisionsDue(state, date) {
  return state.revisions.filter((r) => {
    const due = revisionDueDate(r, state.settings.revisionIntervals);
    return due && due <= date;
  });
}

/* ---------------- المهام ---------------- */

export function taskState(task, now = new Date()) {
  if (task.done) return 'done';
  if (!task.due) return 'open';
  const dueMs = new Date(task.due).getTime();
  if (isNaN(dueMs)) return 'open';
  if (dueMs < now.getTime()) return 'overdue';
  if (dueMs - now.getTime() < 24 * 3600e3) return 'soon';
  return 'open';
}

/* ---------------- التذكيرات والمنبهات ---------------- */

const LESSON_LEAD_TEXT = (lead) => `الحصة بعد ${lead} دقيقة — جهّز الكتب والأدوات`;

/** كل عناصر التذكير (من مجموعة أيام) — بعضها مشتق من الجدول وبعضها منبهات المستخدم */
export function buildReminders(state, fromDate, days = 3) {
  const items = [];
  const lessonWindows = [];
  const cats = state.settings.cats;

  for (let i = 0; i < days; i++) {
    const d = addDays(fromDate, i);
    const occ = occurrencesOn(state, d);
    for (const o of occ) {
      if (!o.counts || o.status) continue;
      if (o.type === 'lesson') {
        lessonWindows.push({ occId: o.occId, a: dateAt(d, o.start), b: dateAt(d, o.end) });
      }
    }
    for (const o of occ) {
      if (!o.counts || o.status) continue;
      const base = { occId: o.occId, date: d, eventId: o.id, title: o.title };
      const startAt = dateAt(d, o.start);
      if (o.type === 'lesson') {
        for (const lead of state.settings.leads) {
          items.push({ ...base, key: `${o.occId}|lead${lead}`, at: startAt - lead * 60e3, cat: 'lesson', kind: 'lesson', title: `تجهيز: ${o.title}`, body: LESSON_LEAD_TEXT(lead) });
        }
        if (state.settings.travelMin > 0) {
          items.push({ ...base, key: `${o.occId}|travel`, at: startAt - state.settings.travelMin * 60e3, cat: 'travel', kind: 'travel', title: 'موعد التحرك', body: `ابدأ الآن للوصول إلى ${o.title} في ${fmt12(o.start)}` });
        }
        items.push({ ...base, key: `${o.occId}|start`, at: startAt, cat: 'lesson', kind: 'lesson', title: `بدأت الحصة: ${o.title}`, body: `الآن ${fmt12(o.start)} — حان وقت الحصة` });
      } else if (o.type === 'study') {
        items.push({ ...base, key: `${o.occId}|start`, at: startAt, cat: 'study', kind: 'study', title: 'وقت المذاكرة', body: `${o.title} — ابدأ جلسة تركيز الآن` });
      } else if (o.type === 'exercise') {
        items.push({ ...base, key: `${o.occId}|start`, at: startAt, cat: 'exercise', kind: 'exercise', title: 'وقت الرياضة', body: 'ابدأ تمرين الصباح، ولو خفيفًا.' });
      } else if (o.type === 'meal') {
        items.push({ ...base, key: `${o.occId}|start`, at: startAt, cat: 'meal', kind: 'meal', title: 'وقت الوجبة والماء', body: `${o.title} — واشرب كوبًا من الماء.` });
      }
    }
    // النوم: بداية الاستعداد وموعد النوم
    items.push({ key: `sleep|${d}|wind`, date: d, at: dateAt(d, state.settings.windDown), cat: 'sleep', kind: 'sleep', title: 'بداية الاستعداد للنوم', body: 'ضع الهاتف جانبًا وجهّز كتب الغد وأدواتك.' });
    items.push({ key: `sleep|${d}|bed`, date: d, at: dateAt(d, state.settings.bedtime), cat: 'sleep', kind: 'sleep', title: 'موعد النوم', body: 'وقت النوم المستهدف. نوم كافٍ يساعد على التركيز غدًا.' });
  }

  // المهام: قبل الموعد بساعة
  for (const t of state.tasks) {
    if (t.done || !t.due) continue;
    const dueMs = new Date(t.due).getTime();
    if (isNaN(dueMs)) continue;
    items.push({ key: `task|${t.id}|${t.due}`, date: t.due.slice(0, 10), at: dueMs - 3600e3, cat: 'homework', kind: 'task', title: 'موعد تسليم قريب', body: `${t.title} — الموعد خلال ساعة.` });
  }
  // المراجعة المتباعدة: 6 مساءً في يوم الاستحقاق
  for (let i = 0; i < days; i++) {
    const d = addDays(fromDate, i);
    for (const r of revisionsDue(state, d)) {
      items.push({ key: `rev|${r.id}|${d}`, date: d, at: dateAt(d, '18:00'), cat: 'revision', kind: 'revision', title: 'موعد مراجعة', body: `راجع: ${r.topic}` });
    }
  }

  // تصفية: الفئات المعطّلة، ووضع "المهم فقط"، وعدم إرسال تذكيرات تقع داخل حصة أخرى مؤكدة
  const important = new Set(['lesson', 'travel', 'wake', 'homework', 'custom']);
  const out = [];
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.key)) continue;
    seen.add(it.key);
    if (it.cat !== 'custom' && cats[it.cat] === false) continue;
    if (state.settings.reminderMode === 'important' && !important.has(it.cat)) continue;
    const isLessonStart = it.kind === 'lesson' && it.key.endsWith('|start');
    if (it.occId && !isLessonStart) {
      const inside = lessonWindows.some((w) => w.occId !== it.occId && w.a <= it.at && it.at < w.b);
      if (inside) continue;
    }
    out.push(it);
  }
  return out;
}

/** منبهات المستخدم في نافذة أيام: كل تكرار كوحدة مفتاحها ثابت */
export function alarmOccurrences(state, fromDate, days = 3) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(fromDate, i);
    const di = dayIdx(d);
    for (const a of state.alarms) {
      if (!a.enabled) continue;
      const hit = a.repeat === 'once' ? a.date === d : a.days.includes(di);
      if (!hit) continue;
      out.push({
        key: `alarm|${a.id}|${d}|${a.time}`,
        date: d, at: dateAt(d, a.time), cat: a.category, kind: 'alarm', alarmId: a.id,
        title: a.title, body: a.message, sound: a.sound !== false, vibrate: a.vibrate !== false, snooze: a.snooze || 10,
      });
    }
  }
  for (const s of state.snoozes) {
    out.push({ key: `snz|${s.id}`, date: dateKey(new Date(s.at)), at: s.at, cat: s.category || 'custom', kind: 'alarm', alarmId: s.alarmId, title: s.title, body: s.message, sound: s.sound !== false, vibrate: s.vibrate !== false, snooze: s.snooze || 10 });
  }
  return out;
}

/** المنبه القادم (من المنبهات المفعّلة والغفوات) */
export function nextAlarm(state, now = new Date()) {
  const nowMs = now.getTime();
  const all = alarmOccurrences(state, dateKey(now), 8).filter((x) => x.at > nowMs && !state.fired[x.key]);
  all.sort((a, b) => a.at - b.at);
  return all[0] || null;
}

/** العناصر المستحقة الآن: تُرجع {fire: [...], missed: [...]} دون تعديل الحالة */
export function dueReminders(state, nowMs) {
  const d = dateKey(new Date(nowMs));
  const yest = addDays(d, -1);
  const pool = [...buildReminders(state, yest, 3), ...alarmOccurrences(state, yest, 3)];
  const lastTick = state.meta.lastTick || nowMs;
  const start = Math.min(lastTick, nowMs - ALARM_WINDOW_MS);
  const fire = [];
  const missed = [];
  const seen = new Set();
  for (const it of pool) {
    if (seen.has(it.key) || state.fired[it.key]) continue;
    seen.add(it.key);
    if (it.at <= start || it.at > nowMs) continue;
    if (nowMs - it.at <= ALARM_WINDOW_MS) fire.push(it);
    else missed.push(it);
  }
  fire.sort((a, b) => a.at - b.at);
  return { fire, missed };
}

/** الساعات الهادئة: تشمل منتصف الليل */
export function inQuietHours(settings, nowDate) {
  if (!settings.quietEnabled) return false;
  const m = nowDate.getHours() * 60 + nowDate.getMinutes();
  const s = toMin(settings.quietStart), e = toMin(settings.quietEnd);
  return s <= e ? m >= s && m < e : m >= s || m < e;
}

/* ---------------- الدراسة ---------------- */

export function studyStats(state, date) {
  const week = startOfWeek(date);
  const weekEnd = addDays(week, 6);
  const today = state.sessions.filter((s) => s.date === date);
  const weekS = state.sessions.filter((s) => s.date >= week && s.date <= weekEnd);
  const bySubject = {};
  for (const s of weekS) bySubject[s.subjectId || 'none'] = (bySubject[s.subjectId || 'none'] || 0) + s.actualMin;
  return {
    todayMin: today.reduce((a, s) => a + s.actualMin, 0),
    todayCount: today.length,
    weekMin: weekS.reduce((a, s) => a + s.actualMin, 0),
    weekCount: weekS.length,
    bySubject,
  };
}

/* ---------------- المساعد القائم على القواعد ---------------- */

/**
 * يرد على طلب بالعربية باستخدام بيانات الجدول والمهام الحقيقية فقط.
 * لا يحذف أو ينقل حصة مؤكدة؛ أي تعديل يُعاد كاقتراح يحتاج تأكيدًا.
 */
export function assistantReply(state, text, now = new Date()) {
  const q = String(text || '').trim();
  const today = dateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const has = (...words) => words.some((w) => q.includes(w));

  if (!q) return { text: 'اكتب سؤالك أو اختر أحد الاقتراحات.' };

  if (has('حر', 'فاضي', 'فراغ')) {
    const f = freeMinutes(state, today);
    return { text: `لديك حوالي ${Math.floor(f / 60)} ساعة و${f % 60} دقيقة حرة اليوم بين الاستيقاظ والاستعداد للنوم (دون احتساب النوم).` };
  }

  if (has('امتحان', 'اختبار') && !has('تدريبي')) {
    const subj = state.subjects.filter((s) => !s.archived);
    const plan = [];
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, i);
      const sub = subj[(i - 1) % subj.length];
      plan.push(`• ${arDate(d)}: ${sub.name} — مراجعة ${i <= 2 ? '٣٠–٤٥' : '٤٥–٦٠'} دقيقة`);
    }
    return {
      text: 'اقتراح مراجعة لأسبوع الامتحان (يتجنب الحصص المؤكدة والنوم):\n' + plan.join('\n') + '\nلم أُضف شيئًا بعد — اضغط "تطبيق الاقتراح" لإضافة الجلسات كأحداث مستقلة.',
      proposal: { label: 'تطبيق الاقتراح', events: plan.length ? buildRevisionEvents(state, today, subj) : [] },
    };
  }

  if (has('فاتني', 'فاتتني', 'رتّب', 'رتب', 'أعد ترتيب', 'اعادة ترتيب', 'إعادة ترتيب')) {
    const missed = occurrencesOn(state, today).filter((o) => o.type === 'study' && (o.status === 'skipped' || o.status === 'postponed' || (!o.status && o.endMin <= nowMin)) && o.counts);
    if (!missed.length) return { text: 'لا توجد جلسات مذاكرة فائتة اليوم. أحسنت!' };
    const events = [];
    let cursorDate = today, cursorMin = nowMin;
    for (const m of missed) {
      const dur = m.endMin - m.startMin;
      const slot = findFreeSlot(state, cursorDate, cursorMin, dur, 2);
      if (!slot) continue;
      events.push({ title: m.title, type: 'study', subject: m.subject, date: slot.date, start: slot.start, end: slot.end, recurring: false });
      cursorDate = slot.date; cursorMin = toMin(slot.end);
    }
    if (!events.length) return { text: 'لم أجد فترة حرة مناسبة في الأيام القريبة دون المساس بالحصص المؤكدة أو النوم.' };
    return {
      text: `وجدت ${events.length} جلسة فائتة. اقتراحي نقلها إلى أوقات حرة دون المساس بالحصص المؤكدة أو النوم:\n` + events.map((e) => `• ${e.title}: ${arDate(e.date)} ${fmt12(e.start)}`).join('\n'),
      proposal: { label: 'نقل الجلسات بعد موافقتي', events },
    };
  }

  if (has('مهام', 'واجب', 'غير مكتمل', 'متأخر', 'ناقص')) {
    const open = state.tasks.filter((t) => !t.done).sort((a, b) => (a.due || '').localeCompare(b.due || ''));
    if (!open.length) return { text: 'لا توجد مهام غير مكتملة. ✅' };
    return { text: `لديك ${open.length} مهمة غير مكتملة:\n` + open.slice(0, 12).map((t) => `• ${t.title}${t.due ? ' — ' + t.due.replace('T', ' ') : ' (بدون موعد)'}${taskState(t, now) === 'overdue' ? ' — متأخرة' : ''}`).join('\n') };
  }

  if (has('ذكّرني', 'ذكرني', 'تذكير', 'تذكرني')) {
    const subj = state.subjects.find((s) => !s.archived && q.includes(s.name));
    const tomorrow = addDays(today, 1);
    const title = subj ? `مراجعة ${subj.name}` : 'مراجعة';
    return {
      text: `أضفت مهمة "${title}" بموعد ${arDate(tomorrow)} الساعة ٦:٠٠ مساءً، وسيذكّرك التطبيق قبلها بساعة.`,
      createTask: { title, subjectId: subj ? subj.id : null, due: `${tomorrow}T18:00`, duration: 45, priority: 2 },
    };
  }

  if (has('ماذا أذاكر', 'ماذا اذاكر', 'أذاكر', 'اذاكر', 'ادرس', 'أدرس', 'مذاكرة اليوم')) {
    const next = occurrencesOn(state, today).find((o) => o.startMin >= nowMin && o.type === 'study' && o.counts && !o.status);
    const cur = currentBlock(state, now);
    const tasks = state.tasks.filter((t) => !t.done).sort((a, b) => (a.due || 'z').localeCompare(b.due || 'z'));
    const weak = state.subjects.filter((s) => !s.archived && s.weakTopics?.length).map((s) => `${s.name}: ${s.weakTopics.slice(0, 2).join('، ')}`);
    let t = '';
    if (cur && cur.type === 'study') t += `أنت الآن في: ${cur.title}.\n`;
    else if (next) t += `الجلسة التالية: ${next.title} الساعة ${fmt12(next.start)}.\n`;
    else t += 'لا توجد جلسة مذاكرة مجدولة متبقية اليوم.\n';
    if (tasks[0]) t += `أقرب مهمة مفتوحة: ${tasks[0].title}.\n`;
    if (weak.length) t += `نقاط تحتاج مراجعة: ${weak.slice(0, 2).join(' | ')}.`;
    return { text: t.trim() };
  }

  if (has('الخميس')) {
    return {
      text: 'اقتراح "يوم الخميس للتعويض": تبقى حصة الخميس الشرعية الاختيارية غير مؤكدة حتى تؤكدها، ويمكنني تحويل كتلة الخميس الصباحية إلى مذاكرة للمواد المتأخرة. هذا تغيير جوهري، لذلك لن أطبقه إلا بعد موافقتك الصريحة. (استخدم شاشة الجدول لتعديل كتل الخميس.)',
    };
  }

  if (has('تدريب', 'راجع') && has('الفلسفة', 'فلسفة')) {
    return { text: 'اقتراح مراجعة الفلسفة: ١٥ دقيقة تلخيص من الذاكرة، ثم ١٥ دقيقة أسئلة، ثم مراجعة أخطائك بعد يومين ويوم أسبوع. أضف الموضوعات الضعيفة من شاشة المواد لتُدرج تلقائيًا.' };
  }

  return {
    text: 'أستطيع مساعدتك في: ماذا أذاكر اليوم؟ · كم وقتًا حرًا لدي؟ · اعِد ترتيب الجلسات الفائتة · اعرض المهام غير المكتملة · ذكّرني بمراجعة مادة · خطة امتحان.',
  };
}

function buildRevisionEvents(state, today, subjects) {
  const events = [];
  let cursorDate = addDays(today, 1);
  for (let i = 0; i < 7; i++) {
    const sub = subjects[i % subjects.length];
    const slot = findFreeSlot(state, cursorDate, toMin(state.settings.wake), 45, 2);
    if (!slot) break;
    events.push({ title: `مراجعة ${sub.name}`, type: 'study', subject: sub.id, date: slot.date, start: slot.start, end: slot.end, recurring: false });
    cursorDate = slot.date;
  }
  return events;
}
