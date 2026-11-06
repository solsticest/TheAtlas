'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('Layer editor drag/resize is parent-relative and preserves valid bounds', async () => {
  const { moveHandle, handlePoint } = await import('../apps/web/src/atlas/layerEditorMath.ts');
  const b = { x1: 10, y1: 20, x2: 110, y2: 220 };
  assert.deepEqual(handlePoint(b, 'center'), {x: 60, y: 120});
  assert.deepEqual(moveHandle(b,'center',{x:80,y:180}), {
    x1:30,y1:80,x2:130,y2:280,
  });
  assert.deepEqual(moveHandle(b,'ne',{x:200,y:250}), {
    x1:10,y1:20,x2:200,y2:250,
  });
  assert.deepEqual(moveHandle(b,'sw',{x:-50,y:-30}), {
    x1:-50,y1:-30,x2:110,y2:220,
  });
  assert.deepEqual(moveHandle(b,'nw',{x:200,y:-50}), {
    x1:109,y1:20,x2:110,y2:220,
  });
  const clamped = moveHandle(b,'se',{x:-100,y:1000});
  assert.equal(clamped.x2 - clamped.x1, 1);
  assert.equal(clamped.y2, 1000);
  assert.throws(()=>moveHandle({x1:1,x2:0,y1:1,y2:2},'center',{x:0,y:0}),/Некорректные/);
  assert.throws(()=>moveHandle(b,'center',{x:NaN,y:0}),/Некорректная/);
});
