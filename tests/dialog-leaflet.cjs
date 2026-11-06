'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

test('Map picker initializes Leaflet inside the mounted MUI dialog portal, including reopen', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: 'http://localhost:5173/',
    pretendToBeVisual: true,
  });
  const window = dom.window;
  const bindings = {
    window, document: window.document, navigator: window.navigator,
    HTMLElement: window.HTMLElement, HTMLDivElement: window.HTMLDivElement,
    Element: window.Element, SVGElement: window.SVGElement,
    Node: window.Node, DocumentFragment: window.DocumentFragment,
    ShadowRoot: window.ShadowRoot, MouseEvent: window.MouseEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
    MutationObserver: window.MutationObserver,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(bindings)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  // Leaflet's SVG renderer requires createSVGRect, absent in jsdom.
  window.SVGElement.prototype.createSVGRect = function () { return {}; };
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
    configurable: true, get() { return 750; },
  });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', {
    configurable: true, get() { return 430; },
  });

  const React = await import('react');
  // Direct Node TSX tests compile JSX in classic mode; Vite uses react-jsx.
  // Supply the classic runtime in jsdom without changing production components.
  globalThis.React = React;
  const { createRoot } = await import('react-dom/client');
  const { MapPointPicker } = await import('../apps/web/src/atlas/MapPointPicker.tsx');
  const { LayerGeometryDialog } = await import('../apps/web/src/atlas/LayerGeometryDialog.tsx');
  const root = createRoot(window.document.querySelector('#app'));
  const world = {
    id: 'demo-world', name: 'Test world', image: 'demo-world.svg',
    width: 1600, height: 1000, kmPerPixel: null,
  };
  const image = { image: 'demo-world.svg', name: 'Test', width: 1600, height: 1000 };
  const pointProps = {
    world, layers: [], x: null, y: null, onChoose() {}, onClose() {},
  };
  async function inAct(work) {
    try {
      await React.act(work);
    } catch (error) {
      const reasons = error instanceof AggregateError ? error.errors : [error];
      throw new Error('React portal test errors:\n' + reasons.map(reason =>
        reason && reason.stack ? reason.stack : String(reason)).join('\n---\n'));
    }
  }
  async function mount(component) {
    await inAct(async () => { root.render(component); });
  }
  try {
    await mount(React.createElement(MapPointPicker, { ...pointProps, open: false }));
    assert.equal(window.document.querySelector('[data-testid="atlas-point-picker-map"]'), null);
    await mount(React.createElement(MapPointPicker, { ...pointProps, open: true }));
    let picker = window.document.querySelector('[data-testid="atlas-point-picker-map"]');
    assert.ok(picker, 'point picker should mount inside the dialog portal');
    assert.ok(picker.classList.contains('leaflet-container'),
      'Leaflet must initialize even though Dialog content was not in the initial DOM');
    assert.ok(picker.querySelector('img.leaflet-image-layer'), 'world image should be inside the map');

    await mount(React.createElement(MapPointPicker, { ...pointProps, open: false }));
    await mount(React.createElement(MapPointPicker, { ...pointProps, open: true }));
    picker = window.document.querySelector('[data-testid="atlas-point-picker-map"]');
    assert.ok(picker?.classList.contains('leaflet-container'),
      'Leaflet must not fail with an already initialized container after reopening');

    await mount(React.createElement(LayerGeometryDialog, {
      open: true, parent: image, child: image,
      bounds: { x1: 100, y1: 100, x2: 600, y2: 550 }, rotation: 0,
      onApply() {}, onClose() {},
    }));
    const geometry = window.document.querySelector('[data-testid="atlas-layer-geometry-map"]');
    assert.ok(geometry?.classList.contains('leaflet-container'),
      'layer geometry editor must also wait for its dialog portal');
  } finally {
    await inAct(async () => { root.unmount(); });
    dom.window.close();
  }
});
