'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const legacy = require('../js/atlas-math.js');

test('React alignment is bit-for-bit compatible with legacy v4 alignment', async () => {
  const modern = await import('../apps/web/src/atlas/atlasMath.ts');
  const examples = [
    [[[2, 2], [8, 6]], [[100, 110], [240, 210]], 9600, 5400],
    [[[1, 7], [20, 30]], [[800, 2000], [900, 1230]], 4653, 2040],
    [[[32.5, 20.25], [88.125, 900.5]], [[1.252, 4.998], [5.5, 9.8]], 3840, 2160],
    [[[0, 0], [3, 2]], [[-100, 11], [-130, -90]], 1600, 1000],
  ];
  for (const [sources, targets, width, height] of examples) {
    const s = sources.map(([x, y]) => ({ x, y }));
    const t = targets.map(([x, y]) => ({ x, y }));
    const a = legacy.alignTwoPoints(s, t, width, height);
    const b = modern.alignTwoPoints(s, t, width, height);
    assert.deepEqual(b, a);
  }
  const p = [{ x: 1, y: 3 }, { x: 4, y: 7 }, { x: 12, y: 2 }];
  assert.equal(modern.routeLength(p), legacy.routeLength(p));
  assert.throws(() => modern.alignTwoPoints([p[0], p[0]], [p[1], p[2]], 100, 100), /Ориентиры/);
});
