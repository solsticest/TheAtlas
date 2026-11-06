'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('Layer editor drag/resize is parent-relative and preserves valid bounds', async () => {
  const { moveHandle, handlePoint, moveBoundsBy, resizeHandleWithAspect } =
    await import('../apps/web/src/atlas/layerEditorMath.ts');
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
    x1:109,y1:20,x2:110,y2:21,
  });
  const clamped = moveHandle(b,'se',{x:-100,y:1000});
  assert.equal(clamped.x2 - clamped.x1, 1);
  assert.equal(clamped.y1, 219);
  assert.equal(clamped.y2, 220);
  assert.throws(()=>moveHandle({x1:1,x2:0,y1:1,y2:2},'center',{x:0,y:0}),/Некорректные/);
  assert.throws(()=>moveHandle(b,'center',{x:NaN,y:0}),/Некорректная/);

  assert.deepEqual(moveBoundsBy(b,15,-40),{x1:25,y1:-20,x2:125,y2:180});
  const ratio2 = resizeHandleWithAspect(b,'ne',{x:210,y:250},2);
  assert.equal(Number(((ratio2.x2-ratio2.x1)/(ratio2.y2-ratio2.y1)).toFixed(6)),2);
  assert.equal(ratio2.x1,10);
  assert.equal(ratio2.y1,20);
  const ratioHalf = resizeHandleWithAspect(b,'sw',{x:-90,y:-180},.5);
  assert.equal(Number(((ratioHalf.x2-ratioHalf.x1)/(ratioHalf.y2-ratioHalf.y1)).toFixed(6)),.5);
  assert.equal(ratioHalf.x2,110);
  assert.equal(ratioHalf.y2,220);
  assert.throws(()=>resizeHandleWithAspect(b,'se',{x:0,y:0},0),/соотношение/);
});


test('Ctrl layer drag never mutates Leaflet global pan state',()=>{
  const root=path.resolve(__dirname,'..');
  for(const relative of [
    'apps/web/src/atlas/LeafletAtlas.tsx',
    'apps/web/src/atlas/LayerGeometryDialog.tsx',
  ]){
    const source=fs.readFileSync(path.join(root,relative),'utf8');
    assert.equal(source.includes('map.dragging.disable()'),false,
      relative+' must intercept Ctrl+LMB without disabling Leaflet panning');
  }
});
