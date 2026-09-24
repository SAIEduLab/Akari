function runDesignResize09Tests() {
    const results = [],
      test = (id, fn) => {
        try {
          fn();
          results.push({ id: 'T09-DESIGN-RESIZE-' + id, pass: true, detail: 'PASS' });
        } catch (e) {
          results.push({ id: 'T09-DESIGN-RESIZE-' + id, pass: false, detail: e.message });
        }
      },
      near = (a, b) => {
        if (Math.abs(a - b) > 1e-7) throw new Error(`${a} != ${b}`);
      },
      assert = (v) => {
        if (!v) throw new Error('assertion failed');
      };
    const box = { type: 'label', x: 150, y: 140, w: 120, h: 60, direction: 0, scalePercent: 100 },
      image = {
        ...box,
        type: 'sprite',
        costumeId: 'image',
        costumes: [{ id: 'image', kind: 'image' }],
      },
      text = {
        ...box,
        type: 'sprite',
        costumeId: 'text',
        costumes: [{ id: 'text', kind: 'text' }],
      };
    test('MODE-PARTS', () => {
      for (const type of ['label', 'button', 'input', 'box'])
        assert(designResizeMode({ ...box, type }) === 'box');
    });
    test('MODE-IMAGE', () => assert(designResizeMode(image) === 'box'));
    test('MODE-TEXT', () => assert(designResizeMode(text) === 'scale'));
    test('MODE-COSTUME-SWITCH', () =>
      assert(
        designResizeMode({
          ...image,
          costumeId: 'text',
          costumes: [...image.costumes, ...text.costumes],
        }) === 'scale',
      ));
    test('NOOP', () =>
      assert(
        JSON.stringify(designResizeGeometry(box, 'se', 0, 0)) ===
          JSON.stringify({ x: 150, y: 140, w: 120, h: 60, scalePercent: 100 }),
      ));
    test('RIGHT', () => {
      const n = designResizeGeometry(box, 'e', 40, 90);
      near(n.w, 160);
      near(n.h, 60);
      near(n.x, 150);
      near(n.y, 140);
    });
    test('BOTTOM', () => {
      const n = designResizeGeometry(box, 's', 90, 20);
      near(n.w, 120);
      near(n.h, 80);
      near(n.x, 150);
      near(n.y, 140);
    });
    test('IMAGE-FREE', () => {
      const n = designResizeGeometry(image, 'se', 80, 10);
      near(n.w, 200);
      near(n.h, 70);
      near(n.scalePercent, 100);
    });
    test('TEXT-SCALE', () => {
      const n = designResizeGeometry(text, 'se', 60, 30);
      near(n.scalePercent, 200);
      near(n.w, 120);
      near(n.h, 60);
      near(n.x, 150);
      near(n.y, 140);
    });
    for (const direction of Object.keys(DESIGN_RESIZE_DIRECTIONS))
      test('ANCHOR-' + direction.toUpperCase(), () => {
        const opposite = { nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e' }[
          direction
        ];
        for (const rotation of [0, 30, 90, 210, 315])
          for (const scalePercent of [50, 100, 175]) {
            const c = { ...box, direction: rotation, scalePercent },
              n = { ...c, ...designResizeGeometry(c, direction, 11, 9) },
              a = designResizePoint(c, opposite),
              b = designResizePoint(n, opposite);
            near(a.x, b.x);
            near(a.y, b.y);
          }
      });
    test('SHIFT-RATIO', () => {
      const n = designResizeGeometry(image, 'se', 120, 10, true);
      near(n.w / n.h, 2);
    });
    test('SHIFT-LIMITS', () => {
      for (const d of [-100000, 100000]) {
        const n = designResizeGeometry(image, 'se', d, d, true);
        near(n.w / n.h, 2);
        assert(n.w >= 8 && n.w <= 1200 && n.h >= 8 && n.h <= 1200);
      }
    });
    test('BOX-LIMITS', () => {
      const low = designResizeGeometry(box, 'se', -10000, -10000),
        high = designResizeGeometry(box, 'se', 10000, 10000);
      near(low.w, 8);
      near(low.h, 8);
      near(high.w, 1200);
      near(high.h, 1200);
    });
    test('SCALE-LIMITS', () => {
      near(designResizeGeometry(text, 'se', 100000, 100000).scalePercent, 1000);
      near(designResizeGeometry(text, 'se', -60, -30).scalePercent, 1);
    });
    test('IMMUTABLE', () => {
      const old = JSON.stringify(box);
      designResizeGeometry(box, 'nw', 12, 24);
      assert(JSON.stringify(box) === old);
    });
    test('NONFINITE', () => {
      const zero = designResizeGeometry(box, 'se', 0, 0);
      for (const v of [NaN, Infinity, -Infinity])
        assert(JSON.stringify(designResizeGeometry(box, 'se', v, 10)) === JSON.stringify(zero));
    });
    return {
      total: results.length,
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      results,
    };
  }
