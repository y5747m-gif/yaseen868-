/* ============================================================
 * pipeline.js — منسّق المحرك (مواصفة 39 + 56)
 *  IMAGE → ANALYSIS → DETECTION → SEGMENTATION → DEPTH →
 *  POINT CLOUD → TSDF/MESH → CLEANUP → UV → TEXTURE →
 *  MATERIAL → OPTIMIZATION → VIEWER → EXPORT
 *  كل مرحلة قابلة للاستبدال عبر AI3D.Models.register(...)
 * ============================================================ */
(function (global) {
  'use strict';
  const AI3D = global.AI3D;
  const U = AI3D.util, F = AI3D.field;
  const clamp = U.clamp, clamp01 = U.clamp01;

  const STAGES = [
    { id: 'uploading', ar: 'رفع الصورة', en: 'Uploading' },
    { id: 'analyzing', ar: 'تحليل الصورة', en: 'Analyzing Image' },
    { id: 'detecting', ar: 'اكتشاف الأجسام', en: 'Detecting Objects' },
    { id: 'neural', ar: 'المساعد العصبي: فهم المشهد واستخراج الجسم المركّز', en: 'Neural Assistant: Scene & Focus' },
    { id: 'segmenting', ar: 'عزل الجسم', en: 'Segmenting' },
    { id: 'completion', ar: 'تعويض الأجزاء المفقودة', en: 'Completing Missing Parts' },
    { id: 'depth', ar: 'توليد خريطة العمق', en: 'Generating Depth Map' },
    { id: 'cloud', ar: 'توليد السحابة النقطية', en: 'Building Point Cloud' },
    { id: 'geometry', ar: 'إعادة بناء الهندسة', en: 'Reconstructing Geometry' },
    { id: 'mesh', ar: 'توليد الـ Mesh', en: 'Generating Mesh' },
    { id: 'texture', ar: 'توليد الـ Texture', en: 'Generating Texture' },
    { id: 'material', ar: 'تحليل الخامات', en: 'Estimating Materials' },
    { id: 'optimizing', ar: 'تحسين النموذج', en: 'Optimizing Model' },
    { id: 'finalizing', ar: 'تجهيز المشهد ثلاثي الأبعاد', en: 'Finalizing 3D Scene' },
    { id: 'complete', ar: 'اكتمل', en: 'Complete' }
  ];

  const QUALITY_WORK = { low: 256, medium: 448, high: 640, ultra: 800 };

  function frameImage(frame, maxSide) {
    if (frame.img) return frame.img;
    const img = U.getImageData(frame.canvas);
    const m = maxSide || 1400;
    if (Math.max(img.width, img.height) <= m) return img;
    const s = m / Math.max(img.width, img.height);
    return U.resizeImage(img, Math.round(img.width * s), Math.round(img.height * s));
  }

  const call = (name, fallback, ...args) => {
    const fn = AI3D.Models.get(name) || fallback;
    return fn(...args);
  };

  async function runPipeline(frames, options, onProgress) {
    const t0 = U.now();
    options = Object.assign({
      mode: 'single', quality: 'high', texture: 'high', geometry: 'detailed',
      output: 'glb', enhance: false, perspective: false, selection: 'auto',
      depthScale: 0.55, refWidthCm: null, refObject: null, refObjectCm: null,
      keepParts: true, targetHeightCm: null,
      neural: true, completeMissing: true, focusExtract: true, neuralDetail: true
    }, options || {});
    const NN = options.neural && AI3D.Neural ? AI3D.Neural : null;
    const neural = { enabled: !!NN };

    const emit = async (stage, pct) => {
      if (onProgress) onProgress(stage, pct);
      await U.tick(8);
    };

    /* 0) الرفع والتحضير */
    await emit('uploading', 3);
    const maxSide = options.quality === 'ultra' ? 1600 : 1280;
    const prepared = [];
    for (const f of frames) {
      let img = frameImage(f, maxSide);
      if (options.enhance) img = call('enhance', AI3D.Analysis.enhanceImage, img, { amount: 0.65 });
      prepared.push({ img, w: img.width, h: img.height, name: f.name || 'image', src: f });
      await U.tick(0);
    }
    let ref = prepared[0];

    /* 1) التحليل */
    await emit('analyzing', 10);
    let analysis = call('analysis', AI3D.Analysis.analyzeImage, ref.img, ref.w, ref.h, { quality: options.quality });
    if (options.perspective && Math.abs(analysis.perspective.skew) > 0.03) {
      const fixed = AI3D.Analysis.correctPerspective(ref.img, analysis.perspective.skew, 0.65);
      ref.img = fixed; ref.w = fixed.width; ref.h = fixed.height;
      analysis = call('analysis', AI3D.Analysis.analyzeImage, ref.img, ref.w, ref.h, { quality: options.quality });
      analysis.perspectiveCorrected = true;
    }
    // صورة العمل للحقول
    const workMax = QUALITY_WORK[options.quality] || 384;
    const ws = Math.min(1, workMax / Math.max(ref.w, ref.h));
    let workImg = U.resizeImage(ref.img, Math.max(64, Math.round(ref.w * ws)), Math.max(64, Math.round(ref.h * ws)));
    let ww = workImg.width, wh = workImg.height;
    let aspect = ref.w / ref.h;

    /* 2) الاكتشاف */
    await emit('detecting', 20);
    const detection = call('detection', AI3D.Detection.detectObjects, workImg, ww, wh, analysis, { quality: options.quality });

    /* 2b) المساعد العصبي: فهم المشهد + خريطة الانتباه + اختيار الجسم المركّز */
    let focus = null;
    if (NN) {
      await emit('neural', 25);
      try {
        neural.scene = NN.understandScene(workImg, ww, wh, analysis, detection);
        focus = NN.focusMap(workImg, ww, wh, { saliency: detection.saliency, saliencyW: detection.saliencyW, saliencyH: detection.saliencyH });
        neural.focus = { attention: focus.attention, ms: focus.ms, map: focus.map, w: ww, h: wh };
        if (options.focusExtract && options.selection === 'auto' && detection.objects.length > 1) {
          const pick = NN.pickFocusedObject(detection.objects, focus);
          neural.pick = pick;
          if (pick.index > 0) {
            // ضع الجسم المركّز أولًا ليكون هو الهدف الافتراضي
            const arr = detection.objects.slice();
            const [chosen] = arr.splice(pick.index, 1);
            arr.unshift(chosen);
            detection.objects = arr;
          }
        }
      } catch (e) { neural.error = String(e && e.message || e); }
      await U.tick(0);
    }

    // اختيار الهدف
    let targetBox = null, objectType = 'object', objectLabel = 'جسم', selected = null;
    if (options.selection === 'all' && detection.objects.length > 1) {
      targetBox = AI3D.Detection.unionBoxes(detection.objects);
      objectLabel = 'كل الأجسام (' + detection.objects.length + ')';
      objectType = detection.objects[0] ? detection.objects[0].type : 'object';
    } else if (typeof options.selection === 'number' && detection.objects[options.selection]) {
      selected = detection.objects[options.selection];
      targetBox = selected.bbox; objectType = selected.type; objectLabel = selected.typeAr;
    } else if (detection.objects.length) {
      selected = detection.objects[0];
      targetBox = selected.bbox; objectType = selected.type; objectLabel = selected.typeAr;
    } else {
      targetBox = { x0: 0.08, y0: 0.08, x1: 0.92, y1: 0.92 };
    }
    const typeConfidence = selected ? selected.confidence : 0.5;

    /* 3) العزل */
    await emit('segmenting', 30);
    // أقنعة الاكتشاف بدقة الاكتشاف (dw×dh) وقد تختلف عن دقة العمل (ww×wh)
    const dw = detection.workW || ww, dh = detection.workH || wh;
    let seed;
    if (options.selection === 'all' && detection.objects.length > 1) {
      seed = new Float32Array(dw * dh);
      for (const o of detection.objects) for (let i = 0; i < seed.length; i++) seed[i] = Math.max(seed[i], o.mask[i]);
    } else if (selected) {
      seed = selected.mask;
    } else {
      seed = new Float32Array(dw * dh);
      for (let i = 0; i < seed.length; i++) seed[i] = detection.saliency[i] > detection.threshold ? 1 : 0;
    }
    if (seed.length !== ww * wh) seed = F.resampleField(seed, dw, dh, ww, wh);
    const detail = options.quality === 'low' ? 'fast' : (options.quality === 'ultra' ? 'ultra' : 'high');
    let seg = call('segmentation', AI3D.Segmentation.refineMask, workImg, ww, wh, seed,
      { detail, keepParts: options.keepParts, minPartRatio: 0.003, seedW: dw, seedH: dh });
    if (seg.coverage < 0.004) {
      // احتياطي: استخدم بذرة الاكتشاف مباشرة
      const fb = new Float32Array(ww * wh);
      for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) {
        const u = x / (ww - 1), v = y / (wh - 1);
        fb[y * ww + x] = (u >= targetBox.x0 && u <= targetBox.x1 && v >= targetBox.y0 && v <= targetBox.y1) ? 1 : 0;
      }
      seg = { mask: fb, hard: fb, w: ww, h: wh, bbox: targetBox, coverage: (targetBox.x1 - targetBox.x0) * (targetBox.y1 - targetBox.y0), confidence: 0.35, method: 'bbox-fallback' };
    }
    let mask = seg.hard || seg.mask;
    await U.tick(0);

    /* 3b) صقل القناع بخريطة الانتباه (استخراج الجسم المركّز بدقة) */
    if (NN && focus && options.focusExtract && seg.method !== 'bbox-fallback') {
      try {
        const rf = NN.refineMaskWithFocus(mask, ww, wh, focus, { keepParts: options.keepParts });
        neural.maskRefine = { note: rf.note, changed: rf.changed, changedRatio: rf.changedRatio };
        if (rf.changed) { mask = rf.mask; seg.hard = rf.mask; seg.bbox = AI3D.Segmentation.bboxOf(rf.mask, ww, wh); seg.neuralRefined = true; }
      } catch (e) { neural.maskRefineError = String(e && e.message || e); }
    }

    /* 3c) تعويض الأجزاء المفقودة (تماثل + إكمال الصورة الظلية) */
    let completion = null, symAxis = null, addedMask = null, extended = null;
    if (NN && options.completeMissing) {
      await emit('completion', 38);
      try {
        symAxis = NN.detectSymmetryAxis(workImg, ww, wh, mask, seg.bbox);
        neural.sym = symAxis;
        // توسيع اللوحة إذا كان الجسم مقطوعًا عند حافة الإطار
        const ext = options.mode === 'multi' ? null : NN.extendCanvas(workImg, ww, wh, mask, seg.bbox, { ratio: 0.6 });
        if (ext) {
          extended = ext;
          // وسّع الصورة المرجعية بنفس النسب (للخبز بدقة كاملة)
          const sx = ref.w / ww, sy = ref.h / wh;
          const rl = Math.round(ext.offset.left * sx), rt = Math.round(ext.offset.top * sy);
          const rr = Math.round(ext.offset.right * sx), rb = Math.round(ext.offset.bottom * sy);
          const refExt = U.imageLike(ref.w + rl + rr, ref.h + rt + rb);
          const upPad = U.resizeImage(ext.img, refExt.width, refExt.height);
          refExt.data.set(upPad.data);
          for (let y = 0; y < ref.h; y++) {
            const so = y * ref.w * 4, doff = ((y + rt) * refExt.width + rl) * 4;
            refExt.data.set(ref.img.data.subarray(so, so + ref.w * 4), doff);
          }
          ref = { img: refExt, w: refExt.width, h: refExt.height, name: ref.name, src: ref.src };
          workImg = ext.img; ww = ext.w; wh = ext.h; aspect = ref.w / ref.h;
          mask = ext.mask;
          seg = Object.assign({}, seg, { mask: ext.mask, hard: ext.mask, w: ww, h: wh, bbox: AI3D.Segmentation.bboxOf(ext.mask, ww, wh) });
          symAxis = NN.detectSymmetryAxis(workImg, ww, wh, mask, seg.bbox, {
            pad: ext.pad, truncated: { left: ext.offset.left > 0, right: ext.offset.right > 0 } });
          neural.sym = symAxis;
          neural.extended = { offset: ext.offset, w: ww, h: wh };
        }
        completion = NN.completeMask(mask, ww, wh, seg.bbox, symAxis, { pad: ext ? ext.pad : null });
        neural.completion = { addedCount: completion.addedCount, addedRatio: completion.addedRatio, truncated: completion.truncated };
        if (completion.addedCount > 0) {
          mask = completion.mask; seg.hard = completion.mask; addedMask = completion.added;
          seg.bbox = AI3D.Segmentation.bboxOf(mask, ww, wh);
          seg.completed = true;
        }
      } catch (e) { neural.completionError = String(e && e.message || e); }
      await U.tick(0);
    }

    /* 4) العمق (مع دمج متعدد الصور) */
    await emit('depth', 42);
    const depthFrames = [];
    const framesToUse = options.mode === 'multi' ? prepared : [ref];
    const geoMode = options.geometry || 'balanced';
    const depthRangeScale = depthScaleFor(objectType, options.depthScale);
    for (const fr of framesToUse) {
      const fImg = U.resizeImage(fr.img, ww, wh);
      let m = mask;
      if (fr !== ref) {
        const s2 = call('segmentation', AI3D.Segmentation.refineMask, fImg, ww, wh, seed, { detail: 'fast', keepParts: true });
        m = s2.hard || s2.mask;
      }
      const est = call('depth', AI3D.Depth.estimateDepth, fImg, ww, wh, m,
        { saliency: detection.saliency, saliencyW: detection.saliencyW, saliencyH: detection.saliencyH, analysis, objectType },
        { geometry: geoMode, objectType, depthScale: depthRangeScale,
          px2worldX: aspect / ww, px2worldY: 1 / wh });
      depthFrames.push({ depth: est.depth, mask: m, confidence: est.confidence, w: ww, h: wh, normals: est.normals, geometry: est.geometry, detail: est.detail || null, method: est.method });
      await U.tick(0);
    }
    let depthRes = depthFrames[0];
    if (depthFrames.length > 1) {
      const fused = AI3D.Depth.fuseDepths(depthFrames);
      depthRes = Object.assign({}, depthFrames[0], { depth: fused.depth, confidence: fused.confidence, fused: fused.views });
    }
    let depth = depthRes.depth, confidence = depthRes.confidence;
    let workImgTex = workImg;
    if (NN && addedMask) {
      try {
        const cd = NN.completeDepthAndColor(depth, workImg, mask, addedMask, ww, wh, symAxis);
        depth = cd.depth; workImgTex = cd.img;
        confidence = Float32Array.from(confidence);
        for (let i = 0; i < confidence.length; i++) if (addedMask[i]) confidence[i] = Math.min(confidence[i], cd.confidence[i]);
        neural.completion.transferred = cd.transferred;
        depthRes = Object.assign({}, depthRes, { depth, confidence });
      } catch (e) { neural.completionDepthError = String(e && e.message || e); }
    }
    if (NN && options.neuralDetail && geoMode !== 'fast') {
      try {
        const rd = NN.refineDepthDetails(depth, workImg, mask, ww, wh, { amount: geoMode === 'detailed' ? 0.7 : 0.4 });
        depth = rd.depth; neural.detail = { changeEnergy: rd.changeEnergy };
        depthRes = Object.assign({}, depthRes, { depth });
      } catch (e) { neural.detailError = String(e && e.message || e); }
    }
    const depthStats = depthStatsOf(depth, mask, ww, wh);

    /* 5) السحابة النقطية */
    await emit('cloud', 52);
    const cloud = AI3D.Geometry.buildPointCloud({
      depth, mask, w: ww, h: wh, img: workImg, bbox: seg.bbox, confidence,
      aspect, depthRange: depthRangeScale * Math.max((seg.bbox.x1 - seg.bbox.x0) * aspect, (seg.bbox.y1 - seg.bbox.y0)) * 2,
      maxPoints: AI3D.Geometry.QUALITY[options.quality].cloud
    });

    /* 6) إعادة البناء + 7) الـ Mesh */
    await emit('geometry', 62);
    await U.tick(0);
    let mesh = call('reconstruction', AI3D.Geometry.reconstruct, {
      depth, mask, confidence, w: ww, h: wh, bbox: seg.bbox,
      quality: options.quality, depthScale: depthRangeScale, objectType, aspect,
      geometry: geoMode
    });
    await emit('mesh', 72);

    /* 8) الـ Texture + الأطلس */
    await emit('texture', 80);
    let texSize = AI3D.Texture.safeTexSize(AI3D.Texture.TEX_SIZE[options.texture] || 1024);
    const cavity = AI3D.Texture.buildCavityMap(depth, ww, wh);
    const material = call('material', AI3D.Texture.estimateMaterial, workImg, ww, wh, mask, analysis, objectType);
    let atlas = null, maps = null;
    // صورة الخبز: الأصلية، أو نسخة بها الألوان المُعوَّضة إن حدث تعويض
    let bakeImg = ref.img;
    if (addedMask && workImgTex !== workImg) {
      bakeImg = U.cloneImage(ref.img);
      const up = U.resizeImage(workImgTex, ref.w, ref.h);
      const am = F.resampleField(addedMask, ww, wh, ref.w, ref.h);
      for (let i = 0; i < ref.w * ref.h; i++) if (am[i] > 0.4) { const o = i * 4; bakeImg.data[o] = up.data[o]; bakeImg.data[o + 1] = up.data[o + 1]; bakeImg.data[o + 2] = up.data[o + 2]; }
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        atlas = AI3D.Texture.buildUVAtlas(mesh, texSize);
        let symHint = null;
        if (NN && symAxis && symAxis.confident && options.completeMissing) {
          try {
            // محور التماثل في فضاء العالم: X = (u − مركز الصندوق) × aspect
            const axisX = (symAxis.axis - (seg.bbox.x0 + seg.bbox.x1) / 2) * aspect;
            const th = NN.symmetricTextureHints(atlas.mesh, axisX);
            if (th && th.hits > 0) { symHint = th.hint; neural.texHints = { hits: th.hits, ratio: th.ratio }; }
          } catch (e) { neural.texHintError = String(e && e.message || e); }
        }
        maps = AI3D.Texture.bakeMaps(atlas, bakeImg, {
          light: analysis.light, material, cavity, cavityW: ww, cavityH: wh,
          detailStrength: geoMode === 'fast' ? 0.3 : (geoMode === 'detailed' ? 0.9 : 0.6),
          symHint
        });
        break;
      } catch (e) {
        // نفاد ذاكرة محتمل: أعد المحاولة بدقة أطلس أصغر
        if (attempt === 2) throw e;
        texSize = Math.max(512, Math.round(texSize / 2));
      }
    }
    // الشبكة النهائية للعرض/التصدير هي شبكة الأطلس (UV صحيحة لكل مخطط)
    mesh = atlas.mesh;
    mesh.stats = AI3D.Geometry.meshStats(mesh);

    /* 9) الخامات */
    await emit('material', 86);

    /* 10) التحسين والقياس */
    await emit('optimizing', 90);
    AI3D.Geometry.centerMesh(mesh);
    const scaleInfo = applyScale(mesh, options, analysis, detection, aspect);
    mesh.normals = AI3D.Geometry.computeNormals(mesh.positions, mesh.indices);
    const stats = AI3D.Geometry.meshStats(mesh);
    const procMs = U.now() - t0;

    /* 11) النتيجة والتقييم */
    await emit('finalizing', 96);
    const scores = computeScores({
      analysis, stats, seg, mesh, depthStats, maps, coverage: maps.coverageStats,
      chartAreaRatio: atlas.chartAreaRatio,
      objectType, views: depthFrames.length
    });
    const info = buildInfo({
      stats, maps, procMs, objectLabel, objectType, options, ref, scaleInfo,
      cloud, atlas, material, depthStats
    });
    await emit('complete', 100);

    if (NN) { neural.report = NN.buildReport(neural); neural.name = NN.name; neural.version = NN.version; }

    return {
      neural,
      mesh, maps, atlas, material, analysis, detection, segmentation: seg,
      depth: depthRes, depthStats, cloud, scores, info, stats, scaleInfo,
      options: Object.assign({}, options), objectType, objectLabel, typeConfidence,
      refCanvas: ref.src && ref.src.canvas ? ref.src.canvas : null,
      refImg: ref.img, refW: ref.w, refH: ref.h,
      workImg, workW: ww, workH: wh,
      procMs, stages: STAGES
    };
  }

  function depthScaleFor(type, base) {
    const k = { vehicle: 0.85, human: 0.6, animal: 0.62, furniture: 0.7, building: 0.45, product: 0.7, electronics: 0.4, clothing: 0.5, plant: 0.6, object: 0.62 };
    return (base || 0.55) * ((k[type] || 0.62) / 0.62);
  }
  function depthStatsOf(depth, mask, w, h) {
    let sum = 0, n = 0, mn = 1, mx = 0;
    for (let i = 0; i < depth.length; i++) {
      if (mask[i] < 0.5) continue;
      sum += depth[i]; n++;
      if (depth[i] < mn) mn = depth[i];
      if (depth[i] > mx) mx = depth[i];
    }
    const mean = sum / Math.max(1, n);
    let varc = 0;
    for (let i = 0; i < depth.length; i++) if (mask[i] > 0.5) varc += (depth[i] - mean) * (depth[i] - mean);
    return { mean, min: mn, max: mx, range: mx - mn, std: Math.sqrt(varc / Math.max(1, n)), coverage: n / (w * h) };
  }

  /* تحجيم اختياري بالجسم المرجعي (مواصفة 41 + 42) */
  function applyScale(mesh, options, analysis, detection, aspect) {
    const stats = AI3D.Geometry.meshStats(mesh);
    const size = stats.bounds.size;
    let k = 1, unit = 'وحدة (نسبية)', source = 'بدون مرجع — الأبعاد نسبية';
    if (options.refWidthCm && options.refWidthCm > 0) {
      k = options.refWidthCm / Math.max(1e-6, size[0]);
      unit = 'سم';
      source = 'العرض الحقيقي المدخل (' + options.refWidthCm + ' سم)';
    } else if (options.refObjectCm && options.refObjectCm > 0 && detection.objects[options.refObject]) {
      const o = detection.objects[options.refObject];
      const objPxW = Math.max(1e-6, (o.bbox.x1 - o.bbox.x0) * analysis.width);
      const cmPerPx = options.refObjectCm / objPxW;
      const worldPerPx = aspect / analysis.width;
      k = cmPerPx / worldPerPx;
      unit = 'سم';
      source = 'جسم مرجعي (' + options.refObjectCm + ' سم) — ' + (o.typeAr || 'جسم');
    } else if (options.targetHeightCm && options.targetHeightCm > 0) {
      k = options.targetHeightCm / Math.max(1e-6, size[1]);
      unit = 'سم';
      source = 'الارتفاع المطلوب (' + options.targetHeightCm + ' سم)';
    }
    if (Math.abs(k - 1) > 1e-6) AI3D.Geometry.transformMesh(mesh, { scale: [k, k, k] });
    return { factor: k, unit, source, sizeCm: size.map(v => +(v * k).toFixed(3)) };
  }

  /* ---------------- التقييم (مواصفة 27) ---------------- */
  function computeScores(ctx) {
    const { analysis, stats, seg, depthStats, coverage } = ctx;
    const imgQ = analysis.quality;
    // الهندسة: تغطية + تنوّع العمق + سلامة + دقة الصورة
    const coverageQ = clamp01(seg.coverage * 5);
    const reliefQ = clamp01(depthStats.range * 1.6 + depthStats.std * 2.2);
    const manifoldQ = clamp01((stats.watertight ? 1 : 0.55) - stats.nonManifoldEdges / Math.max(1, stats.faces) * 3);
    const geometry = clamp01(0.3 * coverageQ + 0.22 * reliefQ + 0.2 * manifoldQ + 0.18 * imgQ.sharpness + 0.1 * imgQ.resolution);
    // الـ Texture: كفاءة ملء الأطلس + نسبة المرصود + جودة المصدر
    const chartFill = clamp01(coverage.coverage / Math.max(0.08, (ctx.chartAreaRatio || 0.5) * 0.8));
    const observedQ = clamp01(0.45 + 0.55 * coverage.observedRatio); // صورة واحدة لا تغطي الظهر
    const texture = clamp01(0.34 * chartFill + 0.28 * observedQ + 0.2 * imgQ.resolution + 0.18 * (1 - analysis.noise));
    // سلامة الشبكة
    const integrity = clamp01(
      (stats.watertight ? 0.55 : 0.28) +
      0.2 * (stats.nonManifoldEdges === 0 ? 1 : 0.2) +
      0.15 * (stats.components <= 2 ? 1 : clamp01(1 / stats.components)) +
      0.1 * (stats.degenerateFaces === 0 ? 1 : 0.3)
    );
    // ثقة العمق
    const depth = clamp01(0.55 * stats.avgConfidence + 0.25 * reliefQ + 0.2 * (ctx.views > 1 ? 1 : 0.72));
    const overall = clamp01(0.32 * geometry + 0.24 * texture + 0.2 * integrity + 0.24 * depth);
    const pct = v => Math.round(clamp01(v) * 100);
    return {
      geometry: pct(geometry), texture: pct(texture), integrity: pct(integrity),
      depth: pct(depth), overall: pct(overall),
      parts: {
        coverage: pct(coverageQ), relief: pct(reliefQ), atlas: pct(chartFill),
        observed: pct(coverage.observedRatio), manifold: pct(manifoldQ)
      },
      disclaimer: 'تقييمات داخلية تقديرية (محسوبة من تغطية العزل وتنوّع العمق وسلامة الشبكة وجودة الصورة) — ليست ضمانًا لدقة هندسية حقيقية.'
    };
  }

  function buildInfo(ctx) {
    const { stats, maps, procMs, objectLabel, objectType, options, ref, scaleInfo, cloud, atlas, material, depthStats } = ctx;
    const b = stats.bounds.size;
    const s = scaleInfo ? scaleInfo.factor : 1;
    return {
      objectType, objectLabel,
      vertices: stats.vertices, faces: stats.faces, triangles: stats.triangles,
      pointCloudPoints: cloud.count,
      textureResolution: maps.size + '×' + maps.size,
      atlasCharts: atlas.charts.length,
      processingTime: U.fmtTime(procMs), processingMs: Math.round(procMs),
      dimensions: {
        x: +(b[0] * s).toFixed(3), y: +(b[1] * s).toFixed(3), z: +(b[2] * s).toFixed(3),
        unit: scaleInfo ? scaleInfo.unit : 'وحدة (نسبية)'
      },
      scaleSource: scaleInfo ? scaleInfo.source : '—',
      sourceResolution: ref.w + '×' + ref.h,
      workResolution: atlas.texSize + 'px atlas',
      quality: options.quality, geometry: options.geometry, mode: options.mode,
      materialAr: material.materialAr,
      depthRange: +depthStats.range.toFixed(3),
      observedRatio: +stats.observedRatio.toFixed(3),
      watertight: stats.watertight,
      estimatedNotice: 'الأجزاء الخلفية والجوانب غير المرئية هي هندسة مُستنتَجة (AI Estimated) وليست مقيسة من الصورة.'
    };
  }

  /* ---------------- إعادة محاولة/تحسين (مواصفة 46) ---------------- */
  function suggestImprovements(result) {
    const s = result.scores;
    const opts = Object.assign({}, result.options);
    const tips = [];
    if (s.geometry < 78) { opts.geometry = 'detailed'; opts.quality = bump(result.options.quality); tips.push('رفع دقة الهندسة وجودة الشبكة'); }
    if (s.texture < 80) { opts.texture = bumpTex(result.options.texture); tips.push('رفع دقة الـ Texture'); }
    if (s.depth < 75) { opts.enhance = true; tips.push('تحسين الصورة قبل تقدير العمق'); }
    if (s.integrity < 85) { opts.keepParts = false; tips.push('تنظيف الأجزاء المنفصلة'); }
    if (!tips.length) tips.push('النتيجة جيدة — إعادة البناء ستستخدم إعدادات أعلى قليلًا');
    return { options: opts, tips };
  }
  function bump(q) { return { low: 'medium', medium: 'high', high: 'ultra', ultra: 'ultra' }[q] || 'high'; }
  function bumpTex(t) { return { standard: 'high', high: 'ultra', ultra: 'ultra' }[t] || 'high'; }

  /* ---------------- إعادة بناء منطقة محددة (مواصفة 49) ---------------- */
  async function reconstructRegion(result, region, onProgress) {
    // region: {u0,v0,u1,v1} بإحداثيات الصورة الأصلية [0..1]
    const opts = Object.assign({}, result.options);
    opts.quality = bump(opts.quality);
    opts.geometry = 'detailed';
    const ww = result.workW, wh = result.workH;
    const mask = result.segmentation.hard || result.segmentation.mask;
    const regionMask = new Float32Array(ww * wh);
    for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) {
      const u = x / (ww - 1), v = y / (wh - 1);
      const inside = u >= region.u0 && u <= region.u1 && v >= region.v0 && v <= region.v1;
      regionMask[y * ww + x] = inside && mask[y * ww + x] > 0.5 ? 1 : 0;
    }
    let area = 0;
    for (let i = 0; i < regionMask.length; i++) area += regionMask[i];
    if (area < 40) throw new Error('المنطقة المحددة صغيرة جدًا');
    if (onProgress) onProgress('depth', 20);
    await U.tick(10);
    // تعزيز التفاصيل داخل المنطقة: عمق بتكرارات أعلى على الصورة العاملة
    const est = AI3D.Depth.estimateDepth(result.workImg, ww, wh, regionMask,
      { saliency: result.detection.saliency, saliencyW: result.detection.saliencyW, saliencyH: result.detection.saliencyH,
        analysis: result.analysis, objectType: result.objectType },
      { geometry: 'detailed', objectType: result.objectType, depthScale: result.options.depthScale,
        px2worldX: (result.refW / result.refH) / ww, px2worldY: 1 / wh });
    // ادمج العمق الجديد داخل المنطقة فقط
    const blended = Float32Array.from(result.depth.depth);
    for (let i = 0; i < blended.length; i++) if (regionMask[i] > 0.5) blended[i] = est.depth[i];
    if (onProgress) onProgress('geometry', 60);
    await U.tick(10);
    const regionMesh = AI3D.Geometry.reconstruct({
      depth: blended, mask, confidence: result.depth.confidence, w: ww, h: wh,
      bbox: result.segmentation.bbox, quality: opts.quality,
      depthScale: result.options.depthScale, objectType: result.objectType,
      aspect: result.refW / result.refH, geometry: opts.geometry || 'detailed'
    });
    if (onProgress) onProgress('mesh', 85);
    await U.tick(10);
    const merged = AI3D.Geometry.mergeMeshes(result.mesh, regionMesh);
    merged.stats = AI3D.Geometry.meshStats(merged);
    if (onProgress) onProgress('complete', 100);
    return { mesh: merged, region: regionMask, options: opts };
  }

  AI3D.Pipeline = { runPipeline, STAGES, suggestImprovements, reconstructRegion, depthScaleFor };
})(typeof window !== 'undefined' ? window : globalThis);
