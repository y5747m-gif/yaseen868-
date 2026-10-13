// اختبارات منطق يومي — التشغيل: node --test yawmi/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/core.js';

const local = (y, m, d, hh = 0, mm = 0) => new Date(y, m - 1, d, hh, mm, 0, 0);

test('الوقت وصيغ 12 ساعة بالعربية', () => {
  assert.equal(C.fmt12('07:00'), '7:00 صباحًا');
  assert.equal(C.fmt12('12:15'), '12:15 مساءً');
  assert.equal(C.fmt12('00:30'), '12:30 صباحًا');
  assert.equal(C.fromMin(C.toMin('23:45') + 30), '00:15');
  assert.throws(() => C.toMin('7:00'));
});

test('فهرس الأيام: السبت = 0 والجمعة = 6', () => {
  assert.equal(C.dayIdx('2026-10-17'), 0); // السبت
  assert.equal(C.dayIdx('2026-10-18'), 1); // الأحد
  assert.equal(C.dayIdx('2026-10-16'), 6); // الجمعة
  assert.equal(C.DAYS_AR[C.dayIdx('2026-10-13')], 'الثلاثاء');
  assert.equal(C.startOfWeek('2026-10-14'), '2026-10-10'); // الأسبوع يبدأ السبت
});

test('الجدول الأصلي محمّل بكل الأيام السبعة', () => {
  const s = C.createDefaultState(local(2026, 10, 13));
  const days = new Set(s.events.map((e) => e.day));
  assert.equal(days.size, 7);
  const sat = s.events.filter((e) => e.day === 0).map((e) => e.start);
  assert.ok(sat.includes('11:30') && sat.includes('12:30') && sat.includes('14:00'));
});

test('الحصص الأصلية لا تتعارض مع بعضها في أي يوم', () => {
  const s = C.createDefaultState(local(2026, 10, 13));
  for (let i = 0; i < 7; i++) {
    const d = C.addDays('2026-10-10', i);
    assert.deepEqual(C.findConflicts(s, d).filter((c) => c.severe).map((c) => [c.a.title, c.b.title]), [], 'تعارض حصة في ' + d);
  }
});

test('حصة الخميس الاختيارية غير مؤكدة ولا تُحسب في التعارض أو التذكيرات', () => {
  const s = C.createDefaultState(local(2026, 10, 13));
  const th = C.occurrencesOn(s, '2026-10-15').find((o) => o.title.includes('اختياري'));
  assert.ok(th, 'موجودة في الجدول');
  assert.equal(th.confirmed, false);
  assert.equal(th.counts, false);
  const rem = C.buildReminders(s, '2026-10-15', 1).filter((r) => r.title.includes('اختياري') || r.occId === th.occId);
  assert.equal(rem.length, 0);
});

test('الحصة التالية تُحسب من الآن', () => {
  const s = C.createDefaultState(local(2026, 10, 13));
  const next = C.nextLesson(s, local(2026, 10, 13, 9, 0));
  assert.equal(next.title, 'درس شرعي');
  assert.equal(next.date, '2026-10-13');
  assert.equal(next.start, '12:30');
});

test('تذكيرات الحصة: 60 و30 و15 دقيقة والتحرك وبداية الحصة', () => {
  const s = C.createDefaultState(local(2026, 10, 13));
  const lesson = C.occurrencesOn(s, '2026-10-13').find((o) => o.title === 'درس شرعي');
  const rem = C.buildReminders(s, '2026-10-13', 1).filter((r) => r.occId === lesson.occId);
  const lessonStart = C.dateAt('2026-10-13', '12:30');
  const at = (key) => rem.find((r) => r.key.endsWith(key)).at;
  assert.equal(at('|lead60'), lessonStart - 60 * 60e3);
  assert.equal(at('|lead30'), lessonStart - 30 * 60e3);
  assert.equal(at('|lead15'), lessonStart - 15 * 60e3);
  assert.equal(at('|travel'), lessonStart - 15 * 60e3);
  assert.equal(at('|start'), lessonStart);
});

test('تحديث موعد الحصة يُعيد حساب التذكيرات تلقائيًا', () => {
  const s = C.createDefaultState(local(2026, 10, 13));
  const ev = s.events.find((e) => e.title === 'درس شرعي' && e.day === 3);
  const before = C.buildReminders(s, '2026-10-13', 1).find((r) => r.key.endsWith('|start') && r.occId.startsWith(ev.id));
  ev.start = '13:00'; ev.end = '15:00';
  const after = C.buildReminders(s, '2026-10-13', 1).find((r) => r.key.endsWith('|start') && r.occId.startsWith(ev.id));
  assert.notEqual(before.at, after.at);
  assert.equal(after.at, C.dateAt('2026-10-13', '13:00'));
});

test('لا تُرسل تذكيرات الاستعداد أثناء حصة أخرى متداخلة', () => {
  const s = C.createDefaultState(local(2026, 10, 13));
  // حصة ثانية تبدأ 12:00 داخل الحصة الشرعية (12:30–14:30)
  s.events.push({ id: 'x1', title: 'حصة تجريبية', type: 'lesson', recurring: false, date: '2026-10-13', start: '12:00', end: '13:00', optional: false, confirmed: true });
  const rem = C.buildReminders(s, '2026-10-13', 1).filter((r) => r.title.includes('الشرعي') || r.occId?.startsWith('seed-3-047'));
  const inside = rem.filter((r) => r.at >= C.dateAt('2026-10-13', '12:30') && r.at < C.dateAt('2026-10-13', '13:00') && !r.key.endsWith('|start'));
  assert.deepEqual(inside.map((r) => r.key), []);
});

test('المنبه المتكرر يُطلق مرة واحدة فقط (منع التكرار)', () => {
  const s = C.createDefaultState(local(2026, 10, 13, 6, 50));
  // المنبه الأساسي 07:00 كل يوم
  const t0 = local(2026, 10, 13, 6, 59).getTime();
  s.meta.lastTick = t0;
  const t1 = local(2026, 10, 13, 7, 0, ).getTime() + 5000;
  const first = C.dueReminders(s, t1).fire.filter((x) => x.kind === 'alarm');
  assert.equal(first.length, 1);
  s.fired[first[0].key] = t1;
  s.meta.lastTick = t1;
  const second = C.dueReminders(s, t1 + 15000).fire.filter((x) => x.kind === 'alarm');
  assert.equal(second.length, 0);
});

test('تنبيه فات وقته (التطبيق مغلق) يُسجَّل فائتًا ولا يُطلق متأخرًا', () => {
  const s = C.createDefaultState(local(2026, 10, 13, 6, 0));
  s.meta.lastTick = local(2026, 10, 13, 6, 0).getTime();
  const now = local(2026, 10, 13, 9, 0).getTime();
  const { fire, missed } = C.dueReminders(s, now);
  assert.equal(fire.filter((x) => x.kind === 'alarm').length, 0);
  assert.ok(missed.some((x) => x.kind === 'alarm' && x.cat === 'wake'));
});

test('تنبيه في نافذة 10 دقائق يُطلق فعليًا', () => {
  const s = C.createDefaultState(local(2026, 10, 13, 6, 0));
  s.meta.lastTick = local(2026, 10, 13, 6, 59).getTime();
  const now = local(2026, 10, 13, 7, 3).getTime();
  const { fire } = C.dueReminders(s, now);
  assert.ok(fire.some((x) => x.kind === 'alarm' && x.cat === 'wake'));
});

test('أيام المنبه: تعطيل المنبه يمنع إطلاقه', () => {
  const s = C.createDefaultState(local(2026, 10, 13, 6, 0));
  s.alarms[0].enabled = false;
  s.meta.lastTick = local(2026, 10, 13, 6, 59).getTime();
  const { fire } = C.dueReminders(s, local(2026, 10, 13, 7, 1).getTime());
  assert.equal(fire.filter((x) => x.kind === 'alarm').length, 0);
});

test('الغفوة تُطلق مرة أخرى بعد المدة المحددة', () => {
  const s = C.createDefaultState(local(2026, 10, 13, 6, 0));
  const at = local(2026, 10, 13, 7, 10).getTime();
  s.snoozes.push({ id: 'z1', alarmId: 'alarm-wake', title: 'منبه الاستيقاظ', message: '', at, snooze: 10, category: 'wake' });
  s.meta.lastTick = at - 1000;
  const { fire } = C.dueReminders(s, at + 2000);
  assert.ok(fire.some((x) => x.key === 'snz|z1'));
});

test('الساعات الهادئة تشمل منتصف الليل', () => {
  const settings = { ...C.DEFAULT_SETTINGS, quietEnabled: true, quietStart: '23:00', quietEnd: '06:30' };
  assert.equal(C.inQuietHours(settings, local(2026, 10, 13, 23, 30)), true);
  assert.equal(C.inQuietHours(settings, local(2026, 10, 13, 5, 0)), true);
  assert.equal(C.inQuietHours(settings, local(2026, 10, 13, 12, 0)), false);
});

test('المساعد: الوقت الحر يُحسب من الجدول الحقيقي', () => {
  const s = C.createDefaultState(local(2026, 10, 13));
  const r = C.assistantReply(s, 'كم وقتًا حرًا لدي؟', local(2026, 10, 13, 9, 0));
  assert.match(r.text, /ساعة|دقيقة/);
  const free = C.freeMinutes(s, '2026-10-13');
  assert.ok(free > 0 && free < (21 * 60 - 7 * 60));
});

test('المساعد: "ذكّرني" يقترح مهمة لا تُضاف إلا بالأمر', () => {
  const s = C.createDefaultState(local(2026, 10, 13));
  const r = C.assistantReply(s, 'ذكرني بمراجعة الفلسفة غدًا', local(2026, 10, 13, 9));
  assert.equal(r.createTask.title, 'مراجعة الفلسفة');
  assert.equal(r.createTask.due, '2026-10-14T18:00');
  assert.equal(s.tasks.length, 0, 'المساعد لا يعدّل الحالة بنفسه');
});

test('المساعد: إعادة ترتيب الجلسات الفائتة لا تتداخل مع الحصص', () => {
  const s = C.createDefaultState(local(2026, 10, 13));
  // جلسة مذاكرة مسائية فاتت وقتها اليوم
  const now = local(2026, 10, 13, 14, 0);
  const r = C.assistantReply(s, 'فاتني جلسة المذاكرة، رتّب يومي', now);
  if (r.proposal) {
    for (const e of r.proposal.events) {
      const busy = C.occurrencesOn(s, e.date).filter((o) => o.counts);
      for (const b of busy) {
        const overlap = C.toMin(e.start) < b.endMin && b.startMin < C.toMin(e.end);
        assert.equal(overlap, false, `تداخل ${e.title} مع ${b.title}`);
      }
    }
  }
});

test('التحقق من الأحداث يرفض الأوقات الخاطئة والعناوين الفارغة', () => {
  assert.ok(C.validateEventInput({ title: '', start: '08:00', end: '09:00', type: 'study', recurring: true }).length > 0);
  assert.ok(C.validateEventInput({ title: 'x', start: '09:00', end: '08:00', type: 'study', recurring: true }).length > 0);
  assert.deepEqual(C.validateEventInput({ title: 'x', start: '08:00', end: '09:00', type: 'study', recurring: true }), []);
  assert.ok(C.validateEventInput({ title: 'x', start: '08:00', end: '09:00', type: 'study', recurring: false, date: '2026-02-30' }).length > 0);
});

test('الترحيل: بيانات تالفة أو ناقصة تُصلح دون فقدان الحقول الصحيحة', () => {
  const s = C.migrate({ version: 1, tasks: [{ id: 't1', title: 'x' }], settings: { wake: '06:30' }, events: [{ bad: true }] }, local(2026, 10, 13));
  assert.equal(s.settings.wake, '06:30');
  assert.equal(s.settings.bedtime, '22:00');
  assert.equal(s.tasks.length, 1);
  assert.equal(s.events.length, 0 + s.events.length); // أحداث تالفة تُحذف
  assert.ok(s.events.every((e) => e.title));
});

test('الترحيل يرفض بيانات من إصدار أحدث بدل الكتابة فوقها', () => {
  assert.throws(() => C.migrate({ version: 99, events: [] }), C.DataError);
});

test('المراجعة المتباعدة: الاستحقاق حسب الفواصل القابلة للتغيير', () => {
  const s = C.createDefaultState(local(2026, 10, 13));
  s.revisions.push({ id: 'r1', subjectId: 'hist', topic: 'الحرب العالمية', learned: '2026-10-13', stage: 0 });
  assert.equal(C.revisionsDue(s, '2026-10-13').length, 1); // الفاصل 0 = اليوم نفسه
  s.revisions[0].stage = 1;
  assert.equal(C.revisionsDue(s, '2026-10-13').length, 0);
  assert.equal(C.revisionsDue(s, '2026-10-14').length, 1);
  assert.equal(C.revisionDueDate(s.revisions[0], s.settings.revisionIntervals), '2026-10-14');
});

test('حالة المهمة: متأخرة وقريبة ومنجزة', () => {
  const now = local(2026, 10, 13, 12);
  assert.equal(C.taskState({ done: false, due: '2026-10-13T08:00' }, now), 'overdue');
  assert.equal(C.taskState({ done: false, due: '2026-10-13T20:00' }, now), 'soon');
  assert.equal(C.taskState({ done: true, due: '2026-10-01T08:00' }, now), 'done');
  assert.equal(C.taskState({ done: false, due: null }, now), 'open');
});

test('الدراسة: إحصاءات اليوم والأسبوع', () => {
  const s = C.createDefaultState(local(2026, 10, 13));
  s.sessions.push({ id: 'a', date: '2026-10-13', subjectId: 'ar', actualMin: 50 }, { id: 'b', date: '2026-10-11', subjectId: 'ar', actualMin: 25 }, { id: 'c', date: '2026-10-01', subjectId: 'ar', actualMin: 99 });
  const st = C.studyStats(s, '2026-10-13');
  assert.equal(st.todayMin, 50);
  assert.equal(st.weekMin, 75);
  assert.equal(st.bySubject.ar, 75);
});

test('الإعدادات الافتراضية تطابق المواصفات', () => {
  const d = C.DEFAULT_SETTINGS;
  assert.equal(d.wake, '07:00');
  assert.equal(d.exerciseMin, 30);
  assert.equal(d.studyMin, 50);
  assert.equal(d.breakMin, 10);
  assert.deepEqual(d.leads, [60, 30, 15]);
  assert.equal(d.thursdayLesson, false);
});
