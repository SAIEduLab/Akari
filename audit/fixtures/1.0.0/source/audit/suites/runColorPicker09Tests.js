function runColorPicker09Tests() {
    const results = [],
      test = (id, fn) => {
        try {
          fn();
          results.push({ id: 'T09-COLOR ' + id, pass: true, detail: 'PASS' });
        } catch (e) {
          results.push({ id: 'T09-COLOR ' + id, pass: false, detail: e.message });
        }
      },
      eq = (a, b) => {
        if (JSON.stringify(a) !== JSON.stringify(b))
          throw Error(JSON.stringify(a) + ' != ' + JSON.stringify(b));
      };
    test('PRESETS-SHARED-12', () => {
      eq(COLOR_PRESETS09.length, 12);
      eq(new Set(COLOR_PRESETS09.map((p) => p.value)).size, 12);
      for (const p of COLOR_PRESETS09) eq(p.value, COLOR_NAMES[p.name]);
    });
    test('WHITE-BLACK-PRESENT', () => {
      eq(
        COLOR_PRESETS09.some((p) => p.value === '#ffffff'),
        true,
      );
      eq(
        COLOR_PRESETS09.some((p) => p.value === '#000000'),
        true,
      );
    });
    test('HEX-NORMALIZE', () => eq(pickerHex09('  #Ab12EF  '), '#ab12ef'));
    test('HEX-INVALID', () => {
      for (const v of [
        '',
        null,
        12,
        '#fff',
        '#12345678',
        'red',
        'transparent',
        '#12345g',
        'url(x)',
      ])
        eq(pickerHex09(v), null);
    });
    for (const [name, h, s, v, hex] of [
      ['RED', 0, 1, 1, '#ff0000'],
      ['GREEN', 120, 1, 1, '#00ff00'],
      ['BLUE', 240, 1, 1, '#0000ff'],
      ['WHITE', 27, 0, 1, '#ffffff'],
      ['BLACK', 200, 1, 0, '#000000'],
      ['GRAY', 0, 0, 0.5, '#808080'],
      ['HUE-WRAP', 420, 1, 1, '#ffff00'],
    ])
      test('HSV-' + name, () => eq(pickerHsvToHex09(h, s, v), hex));
    test('RGB-ROUNDTRIP', () => {
      for (let r = 0; r <= 255; r += 17)
        for (let g = 0; g <= 255; g += 17)
          for (let b = 0; b <= 255; b += 17) {
            const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join(''),
              hsv = pickerHexToHsv09(hex);
            eq(pickerHsvToHex09(hsv.h, hsv.s, hsv.v), hex);
          }
    });
    test('WHEEL-RIGHT', () => eq(pickerWheelHS09(1, 0), { h: 0, s: 1 }));
    test('WHEEL-TOP', () => eq(pickerWheelHS09(0, -1), { h: 90, s: 1 }));
    test('WHEEL-OUTSIDE', () => eq(pickerWheelHS09(10, 0), { h: 0, s: 1 }));
    test('WHEEL-CENTER', () => eq(pickerWheelHS09(0, 0, 200), { h: 200, s: 0 }));
    test('NONFINITE-REJECT', () => {
      for (const fn of [
        () => pickerRgb09(NaN, 1, 1),
        () => pickerWheelHS09(Infinity, 1),
        () => pickerHexToHsv09('#oops'),
      ]) {
        let threw = false;
        try {
          fn();
        } catch (_) {
          threw = true;
        }
        eq(threw, true);
      }
    });
    return {
      total: results.length,
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      results,
    };
  }
