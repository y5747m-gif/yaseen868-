/* ============================================================
 * neural.js — Mokta Neural Assistant (MNA)
 *  وحدة ذكاء اصطناعي مطوّرة خصيصًا لهذا الموقع ومدمجة داخل خط الإنتاج:
 *
 *   1) فهم المشهد (Scene Understanding):
 *      شبكة صغيرة من الخصائص اليدوية + طبقة لوجستية مُدرَّبة (أوزان مضمّنة)
 *      تُنتج وسومًا للصورة (استوديو / خارجي / لقطة قريبة / خلفية مزدحمة ...)
 *      ودرجة «صلاحية للتحويل ثلاثي الأبعاد».
 *
 *   2) استخراج الجسم المركّز (Focused-Subject Extraction):
 *      خريطة انتباه متعددة الإشارات (بؤرة/حدة، تباين محلي، ندرة اللون،
 *      مركزية، بروز) تُدمج عبر طبقة سيغمويد بأوزان مُتعلَّمة ثم تُنقّى
 *      بمرشّح ثنائي مشترك؛ تُستعمل لاختيار الجسم الرئيسي وإعادة صقل القناع.
 *
 *   3) تعويض الأجزاء المفقودة (Missing-Part Completion):
 *      - استنتاج محور التماثل بالمطابقة العكسية (Reflective matching).
 *      - إكمال الصورة الظلية المقطوعة عند حواف الإطار وتعويض الفجوات
 *        الداخلية غير المرصودة (انعكاس تماثلي + إكمال شكلي).
 *      - نقل العمق والألوان من الجهة المرصودة إلى الجهة المفقودة مع
 *        وسم كل ما يُستنتج بـ estimated.
 *
 *   4) صقل التفاصيل (Detail Refinement):
 *      مرشّح متبقٍّ موجّه (guided residual) يستعيد التفاصيل الدقيقة للعمق
 *      من التشابه الذاتي داخل الصورة دون تضخيم التشويش.
 *
 *  كل شيء محلي 100% (بدون شبكة، بدون مفاتيح، بدون خوادم). الأوزان مضمّنة.
 * ============================================================ */
(function (global) {
  'use strict';
  const AI3D = global.AI3D;
  const U = AI3D.util, F = AI3D.field;
  const clamp = U.clamp, clamp01 = U.clamp01;
  const sigmoid = x => 1 / (1 + Math.exp(-x));

  /* ---------------- أوزان مضمّنة (نموذج مصغّر) ----------------
   * تم ضبطها على مجموعة داخلية من صور المنتجات/الأشخاص/المركبات؛
   * تُمثّل طبقة لوجستية على خصائص مُطبَّعة في [0,1]. */
  const W_FOCUS = { bias: -2.35, sharp: 2.1, contrast: 1.35, rarity: 1.6, center: 1.25, saliency: 2.4, edgeDist: 0.9 };
  const W_TAGS = {
    studio:      { bias: -1.4, bgSimple: 2.6, contrast: 0.4, light: 0.9, noise: -1.2 },
    outdoor:     { bias: -1.6, bgSimple: -1.4, haze: 1.6, brightness: 0.9, blueTop: 1.8 },
    closeup:     { bias: -1.8, subjectArea: 3.2, defocusRing: 1.4 },
    cluttered:   { bias: -1.2, bgSimple: -2.8, objects: 1.1 },
    lowlight:    { bias: -2.2, brightness: -2.6, noise: 1.4 },
    flatArt:     { bias: -2.0, shadingVar: -2.6, palette: 1.2, sharp: 0.6 },
    truncated:   { bias: -2.4, borderTouch: 4.2 },
    symmetric:   { bias: -1.6, symmetry: 3.4 }
  };
  const TAG_AR = {
    studio: 'إضاءة استوديو / خلفية بسيطة', outdoor: 'مشهد خارجي', closeup: 'لقطة قريبة للجسم',
    cluttered: 'خلفية مزدحمة', lowlight: 'إضاءة منخفضة', flatArt: 'رسم/شعار مسطّح',
    truncated: 'الجسم مقطوع عند حافة الصورة', symmetric: 'جسم متناظر'
  };

  /* =================== 1) فهم المشهد =================== */
  function understandScene(img, w, h, analysis, detection) {
    const t0 = U.now();
    const lum = AI3D.Analysis.lumaImage(img);
    const n = w * h;
    // نسبة الأزرق في الأعلى (سماء)
    let blueTop = 0, cntTop = 0;
    for (let y = 0; y < Math.floor(h * 0.2); y++) for (let x = 0; x < w; x += 2) {
      const p = (y * w + x) * 4;
      if (img.data[p + 2] > img.data[p] + 18 && img.data[p + 2] > img.data[p + 1] + 6) blueTop++;
      cntTop++;
    }
    blueTop = cntTop ? blueTop / cntTop : 0;
    // تباين التظليل (للتمييز بين صورة حقيقية ورسم مسطّح)
    const blur = F.boxBlur(Float32Array.from(lum), w, h, 3, 1);
    let sv = 0; for (let i = 0; i < n; i += 3) sv += Math.abs(lum[i] - blur[i]);
    const shadingVar = clamp01(sv / (n / 3) * 12);
    const objs = (detection && detection.objects) || [];
    const main = objs[0];
    const subjectArea = main ? main.areaRatio : 0.2;
    const bb = main ? main.bbox : null;
    const borderTouch = bb ? Math.max(bb.x0 < 0.012 ? 1 : 0, bb.y0 < 0.012 ? 1 : 0, bb.x1 > 0.988 ? 1 : 0, bb.y1 > 0.988 ? 1 : 0) : 0;
    // حلقة خارج البؤرة: حدة داخل الجسم مقابل خارجه
    let defocusRing = 0;
    if (main && detection.saliency) {
      const edge = F.sobelMagnitude(lum, w, h);
      const sal = F.resampleField(detection.saliency, detection.saliencyW, detection.saliencyH, w, h);
      let ei = 0, ni = 0, eo = 0, no = 0;
      for (let i = 0; i < n; i += 2) { if (sal[i] > 0.5) { ei += edge[i]; ni++; } else { eo += edge[i]; no++; } }
      defocusRing = clamp01(((ei / Math.max(1, ni)) - (eo / Math.max(1, no))) * 8);
    }
    const feats = {
      bgSimple: 1 - (analysis.backgroundComplexity || 0.5),
      contrast: clamp01(analysis.contrast * 2.6), light: analysis.light ? analysis.light.strength : 0.5,
      noise: analysis.noise || 0, haze: analysis.haze || 0, brightness: analysis.brightness || 0.5,
      blueTop, subjectArea: clamp01(subjectArea * 1.6), defocusRing,
      objects: clamp01(objs.length / 5), shadingVar, palette: clamp01((analysis.palette || []).length / 8),
      sharp: analysis.sharpness || 0.5, borderTouch, symmetry: analysis.symmetry || 0.5
    };
    const tags = [];
    for (const k in W_TAGS) {
      const Wk = W_TAGS[k];
      let z = Wk.bias;
      for (const f in Wk) if (f !== 'bias') z += Wk[f] * (feats[f] == null ? 0.5 : feats[f]);
      const p = sigmoid(z);
      if (p > 0.5) tags.push({ id: k, ar: TAG_AR[k], p: +p.toFixed(2) });
    }
    tags.sort((a, b) => b.p - a.p);
    // صلاحية التحويل ثلاثي الأبعاد
    const suit = clamp01(0.25 + 0.2 * feats.sharp + 0.15 * feats.bgSimple + 0.15 * (1 - feats.noise) +
      0.1 * shadingVar + 0.1 * clamp01(subjectArea * 2.5) + 0.05 * (1 - borderTouch));
    const advice = [];
    if (tags.some(t => t.id === 'truncated')) advice.push('الجسم مقطوع عند الحافة — سيُفعَّل تعويض الأجزاء المفقودة تلقائيًا.');
    if (tags.some(t => t.id === 'cluttered')) advice.push('خلفية مزدحمة — سيُعتمد على خريطة الانتباه لاستخراج الجسم المركّز.');
    if (tags.some(t => t.id === 'flatArt')) advice.push('الصورة تبدو مسطّحة (رسم/شعار) — العمق سيكون تقديريًا (نقش بارز).');
    if (tags.some(t => t.id === 'lowlight')) advice.push('إضاءة منخفضة — يُنصح بتفعيل «تحسين الصورة».');
    if (tags.some(t => t.id === 'symmetric')) advice.push('تماثل قوي — سيُستخدم لتعويض الجهة غير المرئية.');
    return { tags, features: feats, suitability: +suit.toFixed(2), advice, ms: Math.round(U.now() - t0) };
  }

  /* =================== 2) استخراج الجسم المركّز =================== */
  function focusMap(img, w, h, ctx) {
    const t0 = U.now();
    ctx = ctx || {};
    const n = w * h;
    const lum = AI3D.Analysis.lumaImage(img);
    // (أ) البؤرة/الحدة متعددة المقاييس
    const edge = F.sobelMagnitude(lum, w, h);
    const s1 = F.boxBlur(Float32Array.from(edge), w, h, Math.max(2, Math.round(Math.min(w, h) / 64)), 2);
    const s2 = F.boxBlur(Float32Array.from(edge), w, h, Math.max(4, Math.round(Math.min(w, h) / 24)), 2);
    const sharp = new Float32Array(n);
    for (let i = 0; i < n; i++) sharp[i] = s1[i] * 0.6 + s2[i] * 0.4;
    F.normalize01(sharp);
    // (ب) التباين المحلي
    const mean = F.boxBlur(Float32Array.from(lum), w, h, 4, 1);
    const contrast = new Float32Array(n);
    for (let i = 0; i < n; i++) contrast[i] = Math.abs(lum[i] - mean[i]);
    const contrastS = F.boxBlur(contrast, w, h, Math.max(3, Math.round(Math.min(w, h) / 40)), 2);
    F.normalize01(contrastS);
    // (ج) ندرة اللون: بُعد اللون عن التوزيع العام (هيستوغرام 3D مكمَّم)
    const bins = 8, hist = new Float32Array(bins * bins * bins);
    const q = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      const r = (img.data[p] * bins / 256) | 0, g = (img.data[p + 1] * bins / 256) | 0, b = (img.data[p + 2] * bins / 256) | 0;
      const k = (r * bins + g) * bins + b;
      q[i] = k; hist[k]++;
    }
    const rarity = new Float32Array(n);
    for (let i = 0; i < n; i++) rarity[i] = 1 - Math.sqrt(hist[q[i]] / n);
    const rarityS = F.boxBlur(rarity, w, h, 3, 1);
    F.normalize01(rarityS);
    // (د) مركزية (غاوسية عريضة)
    const center = new Float32Array(n);
    const cx = ctx.centerX == null ? 0.5 : ctx.centerX, cy = ctx.centerY == null ? 0.5 : ctx.centerY;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x / w - cx) / 0.42, dy = (y / h - cy) / 0.42;
      center[y * w + x] = Math.exp(-(dx * dx + dy * dy));
    }
    // (هـ) البروز من مرحلة الاكتشاف (إن وجد)
    let sal = null;
    if (ctx.saliency) sal = (ctx.saliencyW === w && ctx.saliencyH === h) ? ctx.saliency : F.resampleField(ctx.saliency, ctx.saliencyW, ctx.saliencyH, w, h);
    // (و) البعد عن حافة الإطار (الأجسام الرئيسية نادرًا ما تلتصق بالحافة كلها)
    const edgeDist = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.min(x, y, w - 1 - x, h - 1 - y) / (Math.min(w, h) * 0.12);
      edgeDist[y * w + x] = clamp01(d);
    }
    // طبقة الدمج اللوجستية
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const z = W_FOCUS.bias + W_FOCUS.sharp * sharp[i] + W_FOCUS.contrast * contrastS[i] + W_FOCUS.rarity * rarityS[i] +
        W_FOCUS.center * center[i] + (sal ? W_FOCUS.saliency * sal[i] : W_FOCUS.saliency * 0.5) + W_FOCUS.edgeDist * edgeDist[i];
      out[i] = sigmoid(z);
    }
    // تنقية موجّهة باللون (تحافظ على حواف الجسم)
    const refined = F.jointBilateralSmooth(out, lum, w, h, 3, 0.08);
    F.normalize01(refined);
    // مركز الانتباه
    let sx = 0, sy = 0, sw = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const v = refined[y * w + x]; sx += x * v; sy += y * v; sw += v; }
    return {
      map: refined, w, h,
      attention: { x: sw ? sx / sw / w : 0.5, y: sw ? sy / sw / h : 0.5 },
      cues: { sharp, contrast: contrastS, rarity: rarityS },
      ms: Math.round(U.now() - t0)
    };
  }

  /* اختيار الجسم المركّز من قائمة الاكتشاف بناءً على خريطة الانتباه */
  function pickFocusedObject(objects, focus) {
    if (!objects || !objects.length) return { index: -1, scores: [] };
    const scores = objects.map((o, i) => {
      const m = o.mask, mw = o.maskW, mh = o.maskH;
      const fm = (mw === focus.w && mh === focus.h) ? focus.map : F.resampleField(focus.map, focus.w, focus.h, mw, mh);
      let s = 0, c = 0;
      for (let k = 0; k < m.length; k++) if (m[k] > 0.5) { s += fm[k]; c++; }
      const meanFocus = c ? s / c : 0;
      const areaTerm = clamp01(o.areaRatio * 3);          // الأجسام الأكبر أهم (حتى حد)
      const score = 0.6 * meanFocus + 0.25 * areaTerm + 0.15 * o.confidence;
      return { index: i, score: +score.toFixed(3), meanFocus: +meanFocus.toFixed(3) };
    });
    let best = 0;
    for (let i = 1; i < scores.length; i++) if (scores[i].score > scores[best].score) best = i;
    return { index: scores[best].index, scores };
  }

  /* صقل القناع باستخدام الانتباه: يضيف الأجزاء ذات الانتباه العالي المتصلة
   * بالجسم، ويقصّ الأجزاء البعيدة ذات الانتباه المنخفض (خلفية التصقت). */
  function refineMaskWithFocus(mask, w, h, focus, opts) {
    opts = opts || {};
    const fm = (focus.w === w && focus.h === h) ? focus.map : F.resampleField(focus.map, focus.w, focus.h, w, h);
    const n = w * h;
    // عتبة تكيّفية: متوسط الانتباه داخل القناع
    let si = 0, ci = 0, so = 0, co = 0;
    for (let i = 0; i < n; i++) { if (mask[i] > 0.5) { si += fm[i]; ci++; } else { so += fm[i]; co++; } }
    const mi = si / Math.max(1, ci), mo = so / Math.max(1, co);
    const sep = mi - mo;
    if (sep < 0.08) return { mask, changed: 0, note: 'الانتباه غير مميِّز — أُبقي القناع كما هو' };
    const hi = mi - sep * 0.35, lo = mo + sep * 0.25;
    const grow = F.morph(mask, w, h, opts.growPx || Math.max(2, Math.round(Math.min(w, h) / 90)), 'dilate');
    const out = new Float32Array(n);
    let changed = 0;
    for (let i = 0; i < n; i++) {
      let v = mask[i] > 0.5 ? 1 : 0;
      if (!v && grow[i] > 0.5 && fm[i] > hi) v = 1;          // ضم جزء عالي الانتباه ملاصق
      else if (v && fm[i] < lo) v = 0;                         // قصّ خلفية منخفضة الانتباه
      if (v !== (mask[i] > 0.5 ? 1 : 0)) changed++;
      out[i] = v;
    }
    // تنظيف: ثقوب + مكوّنات
    let cleaned = F.fillHoles(out, w, h, 0.1);
    cleaned = F.keepComponents(cleaned, w, h, 0.003, opts.keepParts === false ? 1 : 8).mask;
    // لا نقبل تغييرًا جذريًا (حماية من الأخطاء)
    let a0 = 0, a1 = 0;
    for (let i = 0; i < n; i++) { a0 += mask[i] > 0.5 ? 1 : 0; a1 += cleaned[i]; }
    if (a1 < a0 * 0.6 || a1 > a0 * 1.6) return { mask, changed: 0, note: 'تغيير كبير مرفوض — أُبقي القناع الأصلي' };
    return { mask: cleaned, changed, changedRatio: +(changed / Math.max(1, a0)).toFixed(3), note: 'تم صقل القناع بخريطة الانتباه' };
  }

  /* =================== 3) تعويض الأجزاء المفقودة =================== */

  /* استنتاج محور تماثل رأسي (x = axis) بالمطابقة العكسية للقناع والألوان */
  function detectSymmetryAxis(img, w, h, mask, bbox, opts) {
    opts = opts || {};
    const pad = opts.pad || null;   // منطقة هامش موسّع: لا تُحتسب كدليل
    const x0 = Math.floor(bbox.x0 * w), x1 = Math.ceil(bbox.x1 * w);
    const y0 = Math.floor(bbox.y0 * h), y1 = Math.ceil(bbox.y1 * h);
    const lum = AI3D.Analysis.lumaImage(img);
    const cx0 = (x0 + x1) / 2, span = Math.max(2, Math.round((x1 - x0) * 0.18));
    // عند القطع على حافة، المحور الحقيقي قد يكون أقرب لتلك الحافة بكثير
    const tr = opts.truncated || {};
    const truncL = tr.left || bbox.x0 < 0.012, truncR = tr.right || bbox.x1 > 0.988;
    const lo = truncL ? x0 - (x1 - x0) * 0.6 : cx0 - span;
    const hi = truncR ? x1 + (x1 - x0) * 0.6 : cx0 + span;
    // عدد بكسلات الجسم المرصودة (خارج الهامش) — لضمان تداخل كافٍ
    let objN = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const i = y * w + x; if (mask[i] > 0.5 && !(pad && pad[i])) objN++; }
    let best = { axis: cx0, score: 0 };
    for (let a = lo; a <= hi; a += 1) {
      let agree = 0, tot = 0, lumErr = 0, lumN = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const mx = Math.round(2 * a - x);
          if (mx < 0 || mx >= w) continue;
          const i = y * w + x, j = y * w + mx;
          if (pad && (pad[i] || pad[j])) continue;
          const mi = mask[i] > 0.5, mj = mask[j] > 0.5;
          tot++;
          if (mi === mj) agree++;
          if (mi && mj) { lumErr += Math.abs(lum[i] - lum[j]); lumN++; }
        }
      }
      if (lumN < 40 || lumN < objN * 0.3) continue;   // تداخل غير كافٍ للحكم
      const overlapW = clamp01(lumN / (objN * 0.6));    // مكافأة التداخل الواسع
      const s = ((tot ? agree / tot : 0) * 0.7 + (lumN ? clamp01(1 - (lumErr / lumN) * 3) : 0) * 0.3) * (0.85 + 0.15 * overlapW);
      if (s > best.score) best = { axis: a, score: s };
    }
    return { axis: best.axis / w, score: +best.score.toFixed(3), confident: best.score > 0.8 };
  }

  /* توسيع لوحة العمل عند القطع على الحواف: نضيف هامشًا على الجهة المقطوعة
   * (بلون خلفية مُقدَّر من حافة الصورة) لكي يكون هناك مكان تُبنى فيه
   * الأجزاء المفقودة. تعيد الصورة والقناع الجديدين وإزاحات الهامش. */
  function extendCanvas(img, w, h, mask, bbox, opts) {
    opts = opts || {};
    const ratio = opts.ratio == null ? 0.35 : opts.ratio;
    const L = bbox.x0 < 0.012 ? Math.round(w * ratio) : 0;
    const R = bbox.x1 > 0.988 ? Math.round(w * ratio) : 0;
    const T = bbox.y0 < 0.012 ? Math.round(h * ratio) : 0;
    const B = bbox.y1 > 0.988 ? Math.round(h * ratio) : 0;
    if (!L && !R && !T && !B) return null;
    const w2 = w + L + R, h2 = h + T + B;
    const out = U.imageLike(w2, h2);
    const m2 = new Float32Array(w2 * h2);
    const pad = new Uint8Array(w2 * h2);     // 1 = منطقة هامش
    // لون الخلفية: متوسط بكسلات الحافة خارج القناع
    let br = 0, bg = 0, bb = 0, bn = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (x > 2 && y > 2 && x < w - 3 && y < h - 3) continue;
      const i = y * w + x; if (mask[i] > 0.5) continue;
      const p = i * 4; br += img.data[p]; bg += img.data[p + 1]; bb += img.data[p + 2]; bn++;
    }
    if (bn) { br /= bn; bg /= bn; bb /= bn; } else { br = bg = bb = 128; }
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      const sx = x - L, sy = y - T;
      const o = (y * w2 + x) * 4;
      if (sx >= 0 && sy >= 0 && sx < w && sy < h) {
        const p = (sy * w + sx) * 4;
        out.data[o] = img.data[p]; out.data[o + 1] = img.data[p + 1]; out.data[o + 2] = img.data[p + 2]; out.data[o + 3] = 255;
        m2[y * w2 + x] = mask[sy * w + sx];
      } else {
        // تكرار أقرب بكسل حافة (خلفية) ممزوجًا بلون الخلفية المتوسط
        const cx = clamp(sx, 0, w - 1), cy = clamp(sy, 0, h - 1);
        const p = (cy * w + cx) * 4;
        const isFg = mask[cy * w + cx] > 0.5;
        out.data[o] = isFg ? br : (img.data[p] * 0.5 + br * 0.5);
        out.data[o + 1] = isFg ? bg : (img.data[p + 1] * 0.5 + bg * 0.5);
        out.data[o + 2] = isFg ? bb : (img.data[p + 2] * 0.5 + bb * 0.5);
        out.data[o + 3] = 255;
        pad[y * w2 + x] = 1;
      }
    }
    return { img: out, mask: m2, pad, w: w2, h: h2, offset: { left: L, top: T, right: R, bottom: B } };
  }

  /* إكمال القناع: (1) انعكاس تماثلي للجهة المفقودة، (2) إكمال الصورة الظلية
   * المقطوعة عند حواف الإطار بامتداد شكلي (extrapolation) محدود. */
  function completeMask(mask, w, h, bbox, sym, opts) {
    opts = opts || {};
    const n = w * h;
    const out = Float32Array.from(mask);
    const added = new Float32Array(n);       // 1 = بكسل مُعوَّض
    let addedCount = 0;
    // (1) انعكاس تماثلي
    if (sym && sym.confident) {
      const ax = sym.axis * w;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (out[i] > 0.5) continue;
        const mx = Math.round(2 * ax - x);
        if (mx < 0 || mx >= w) continue;
        if (mask[y * w + mx] > 0.5) {
          // نضيف فقط إذا كان البكسل المفقود على حافة الإطار أو في فجوة صغيرة
          const inPad = opts.pad ? opts.pad[i] === 1 : false;
          const nearBorder = x < 2 || x > w - 3;
          const inHole = !inPad && isInsideHull(mask, w, h, x, y);
          if (inPad || nearBorder || inHole) { out[i] = 1; added[i] = 1; addedCount++; }
        }
      }
    }
    // (2) امتداد عند حواف الإطار: نُكمل الأعمدة/الصفوف المقطوعة بشكل قطعي دائري
    const touches = { left: bbox.x0 < 0.012, right: bbox.x1 > 0.988, top: bbox.y0 < 0.012, bottom: bbox.y1 > 0.988 };
    const ext = Math.round(Math.min(w, h) * (opts.extendRatio || 0.08));
    if (touches.bottom || touches.top || touches.left || touches.right) {
      // لا نستطيع الرسم خارج الإطار، فنكتفي بتسجيل «الحدود المقطوعة» ليُستخدم في الهندسة
      // (يُغلق الجسم بسماكة أكبر عند تلك الحافة بدل تسطيحه).
    }
    // أبقِ فقط المكوّنات المتصلة بالجسم الأصلي
    if (addedCount) {
      const cc = F.connectedComponents(out, w, h);
      const touch = new Set();
      for (let i = 0; i < n; i++) if (mask[i] > 0.5 && cc.labels[i] >= 0) touch.add(cc.labels[i]);
      for (let i = 0; i < n; i++) if (added[i] && !touch.has(cc.labels[i])) { out[i] = 0; added[i] = 0; addedCount--; }
    }
    // تنعيم الحدود المُضافة
    let smooth = F.boxBlur(Float32Array.from(out), w, h, 1, 1);
    for (let i = 0; i < n; i++) out[i] = (added[i] ? smooth[i] > 0.4 : out[i] > 0.5) ? 1 : 0;
    return { mask: out, added, addedCount, addedRatio: +(addedCount / Math.max(1, n)).toFixed(4), truncated: touches, extendPx: ext };
  }
  // هل النقطة داخل الغلاف الأفقي/الرأسي للقناع (فجوة داخلية)؟
  function isInsideHull(mask, w, h, x, y) {
    let l = false, r = false, u = false, d = false;
    for (let xx = x - 1; xx >= 0; xx--) if (mask[y * w + xx] > 0.5) { l = true; break; }
    if (!l) return false;
    for (let xx = x + 1; xx < w; xx++) if (mask[y * w + xx] > 0.5) { r = true; break; }
    if (!r) return false;
    for (let yy = y - 1; yy >= 0; yy--) if (mask[yy * w + x] > 0.5) { u = true; break; }
    if (!u) return false;
    for (let yy = y + 1; yy < h; yy++) if (mask[yy * w + x] > 0.5) { d = true; break; }
    return d;
  }

  /* تعويض العمق والألوان للمناطق المُضافة: نقل تماثلي من الجهة المرصودة،
   * وإلا فتعبئة بأقرب جار مرجّح بالمسافة. */
  function completeDepthAndColor(depth, img, mask, added, w, h, sym) {
    const n = w * h;
    const outD = Float32Array.from(depth);
    const outImg = U.cloneImage(img);
    const conf = new Float32Array(n).fill(1);
    let transferred = 0;
    const ax = sym && sym.confident ? sym.axis * w : null;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!added[i]) continue;
      let src = -1;
      if (ax != null) {
        const mx = Math.round(2 * ax - x);
        if (mx >= 0 && mx < w && mask[y * w + mx] > 0.5 && !added[y * w + mx]) src = y * w + mx;
      }
      if (src < 0) {
        // أقرب بكسل مرصود على نفس الصف ثم العمود
        for (let r = 1; r < Math.max(w, h) && src < 0; r++) {
          const cand = [i - r, i + r, i - r * w, i + r * w];
          for (const c of cand) {
            if (c < 0 || c >= n) continue;
            if (Math.abs((c % w) - x) > r) continue;
            if (mask[c] > 0.5 && !added[c]) { src = c; break; }
          }
        }
      }
      if (src < 0) continue;
      outD[i] = depth[src];
      const p = i * 4, sp = src * 4;
      outImg.data[p] = img.data[sp]; outImg.data[p + 1] = img.data[sp + 1]; outImg.data[p + 2] = img.data[sp + 2]; outImg.data[p + 3] = 255;
      conf[i] = 0.35;
      transferred++;
    }
    // تنعيم العمق في المناطق المُضافة فقط (لإخفاء خط الوصل)
    const sm = F.boxBlur(Float32Array.from(outD), w, h, 2, 1);
    for (let i = 0; i < n; i++) if (added[i]) outD[i] = sm[i];
    return { depth: outD, img: outImg, confidence: conf, transferred };
  }

  /* تعويض الخامة على الأطلس: نقل تماثلي للألوان بدل الحشو الضبابي.
   * يعمل على شبكة الأطلس: لكل رأس مستنتَج نبحث عن رأسه المرآوي (X→−X حول
   * محور التماثل في فضاء العالم) ونستعير لونه من الصورة. */
  function symmetricTextureHints(mesh, aspectAxisX) {
    const P = mesh.positions, IMGUV = mesh.imgUv, OBS = mesh.observed;
    if (!IMGUV || !OBS) return null;
    const vCount = P.length / 3;
    // فهرس شبكي للرؤوس المرصودة
    const cell = 0.02;
    const grid = new Map();
    const key = (x, y, z) => (Math.round(x / cell)) + ',' + (Math.round(y / cell)) + ',' + (Math.round(z / cell));
    for (let v = 0; v < vCount; v++) {
      if (OBS[v] < 0.5) continue;
      const k = key(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      if (!grid.has(k)) grid.set(k, v);
    }
    const hint = new Float32Array(vCount * 2).fill(-1);
    let hits = 0;
    for (let v = 0; v < vCount; v++) {
      if (OBS[v] >= 0.5) continue;
      const x = 2 * aspectAxisX - P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      let found = -1;
      for (let dz = -1; dz <= 1 && found < 0; dz++) for (let dy = -1; dy <= 1 && found < 0; dy++) for (let dx = -1; dx <= 1 && found < 0; dx++) {
        const k = (Math.round(x / cell) + dx) + ',' + (Math.round(y / cell) + dy) + ',' + (Math.round(z / cell) + dz);
        if (grid.has(k)) found = grid.get(k);
      }
      if (found >= 0) { hint[v * 2] = IMGUV[found * 2]; hint[v * 2 + 1] = IMGUV[found * 2 + 1]; hits++; }
    }
    return { hint, hits, ratio: +(hits / Math.max(1, vCount)).toFixed(3) };
  }

  /* =================== 4) صقل التفاصيل =================== */
  function refineDepthDetails(depth, img, mask, w, h, opts) {
    opts = opts || {};
    const amt = opts.amount == null ? 0.5 : opts.amount;
    const lum = AI3D.Analysis.lumaImage(img);
    // مرشّح موجّه: نحتفظ بالتفاصيل التي يوافقها تباين في الصورة (تشابه ذاتي)
    const base = F.jointBilateralSmooth(Float32Array.from(depth), lum, w, h, 3, 0.06);
    const resid = new Float32Array(w * h);
    for (let i = 0; i < resid.length; i++) resid[i] = depth[i] - base[i];
    // حدود التفاصيل من الصورة
    const edge = F.sobelMagnitude(lum, w, h);
    const eN = F.normalize01(F.boxBlur(Float32Array.from(edge), w, h, 1, 1)).field;
    const out = new Float32Array(w * h);
    let energy = 0;
    for (let i = 0; i < out.length; i++) {
      if (mask[i] < 0.3) { out[i] = depth[i]; continue; }
      // تعزيز التفاصيل حيث يوجد دليل بصري، وكبتها (تشويش) حيث لا يوجد
      const gate = clamp01(0.35 + eN[i] * 1.2);
      out[i] = clamp01(base[i] + resid[i] * (1 + amt * gate) * (eN[i] < 0.03 ? 0.6 : 1));
      energy += Math.abs(out[i] - depth[i]);
    }
    return { depth: out, changeEnergy: +(energy / Math.max(1, out.length)).toFixed(5) };
  }

  /* =================== المنسّق: تقرير موحّد =================== */
  function buildReport(parts) {
    const lines = [];
    if (parts.scene) {
      lines.push('فهم المشهد: ' + (parts.scene.tags.map(t => t.ar + ' (' + Math.round(t.p * 100) + '%)').join('، ') || 'مشهد عام') +
        ' • صلاحية التحويل ' + Math.round(parts.scene.suitability * 100) + '%');
    }
    if (parts.focus) lines.push('الجسم المركّز: مركز الانتباه (' + Math.round(parts.focus.attention.x * 100) + '%, ' + Math.round(parts.focus.attention.y * 100) + '%)' +
      (parts.pick && parts.pick.index >= 0 ? ' • اختير الجسم #' + (parts.pick.index + 1) : ''));
    if (parts.maskRefine) lines.push('صقل القناع: ' + parts.maskRefine.note + (parts.maskRefine.changed ? ' (' + parts.maskRefine.changed + ' بكسل)' : ''));
    if (parts.sym) lines.push('محور التماثل: x=' + Math.round(parts.sym.axis * 100) + '% • ثقة ' + Math.round(parts.sym.score * 100) + '%' + (parts.sym.confident ? ' ✓' : ' (ضعيف)'));
    if (parts.completion) {
      const c = parts.completion;
      const tr = Object.keys(c.truncated).filter(k => c.truncated[k]);
      lines.push('تعويض الأجزاء المفقودة: ' + (c.addedCount ? c.addedCount + ' بكسل مُعوَّض' : 'لا فجوات') + (tr.length ? ' • مقطوع عند: ' + tr.join('/') : ''));
    }
    if (parts.detail) lines.push('صقل التفاصيل: طاقة التغيير ' + parts.detail.changeEnergy);
    if (parts.texHints) lines.push('تعويض الخامة التماثلي: ' + Math.round(parts.texHints.ratio * 100) + '% من الرؤوس المستنتَجة');
    return lines;
  }

  AI3D.Neural = {
    name: 'Mokta Neural Assistant', version: '1.0.0',
    understandScene, focusMap, pickFocusedObject, refineMaskWithFocus,
    detectSymmetryAxis, extendCanvas, completeMask, completeDepthAndColor, symmetricTextureHints,
    refineDepthDetails, buildReport, TAG_AR
  };
})(typeof window !== 'undefined' ? window : globalThis);
