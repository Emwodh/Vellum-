import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConnectorPath,
  buildPressureOutlinePath,
  computeCameraToFocusObject,
  computeZoomToFit,
  findNearestAnchor,
  screenToWorld,
  smoothStrokePoints,
  snapPoint,
  zoomCameraAtPoint,
} from './geometry';
import { getBoardFrames, getObjectsInsideFrame, searchCanvasObjects } from './search';
import { computeAlignmentGuides } from './alignment';
import {
  parseVellumBoard,
  serializeVellumBoard,
  supportsDirectoryPicker,
  supportsFileSystemAccess,
  toVellumFilename,
} from './fileSync';
import { compileFormula, parseChartCsv } from './mathParser';
import {
  cloneObjectsWithOffset,
  createHistory,
  expandSelectionWithGroups,
  groupObjects,
  pushHistory,
  redoHistory,
  reorderObjectsLayer,
  undoHistory,
  ungroupObjects,
} from './history';
import type { CanvasObject, ConnectorObject, ShapeObject } from '../types/canvas';

test('zoomCameraAtPoint keeps world coordinate under cursor invariant', () => {
  const cam = { x: 120, y: -45, zoom: 1.0 };
  const cursor = { x: 480, y: 310 };
  const before = screenToWorld(cursor.x, cursor.y, cam);
  const zoomed = zoomCameraAtPoint(cam, cursor.x, cursor.y, 2.25);
  const after = screenToWorld(cursor.x, cursor.y, zoomed);
  assert.ok(Math.abs(before.x - after.x) < 1e-6);
  assert.ok(Math.abs(before.y - after.y) < 1e-6);
});

test('snapPoint snaps to 24px grid only when enabled', () => {
  assert.deepEqual(snapPoint({ x: 37, y: -11 }, true, 24), { x: 48, y: -0 });
  assert.deepEqual(snapPoint({ x: 37, y: -11 }, false, 24), { x: 37, y: -11 });
});

test('connector path follows attached shape movement across straight, curved, and elbow styles', () => {
  const shapeA: ShapeObject = {
    id: 'a',
    type: 'shape',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    rotation: 0,
    shapeKind: 'rectangle',
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 2,
  };
  const shapeB: ShapeObject = {
    id: 'b',
    type: 'shape',
    x: 300,
    y: 100,
    width: 100,
    height: 60,
    rotation: 0,
    shapeKind: 'rectangle',
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 2,
  };
  const conn: ConnectorObject = {
    id: 'c1',
    type: 'connector',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    style: 'elbow',
    stroke: '#2563EB',
    strokeWidth: 2,
    start: { objectId: 'a', side: 'right', x: 0, y: 0 },
    end: { objectId: 'b', side: 'left', x: 0, y: 0 },
  };

  const geo1 = buildConnectorPath(conn, [shapeA, shapeB, conn]);
  assert.deepEqual(geo1.start, { x: 100, y: 30 });
  assert.deepEqual(geo1.end, { x: 300, y: 130 });
  assert.ok(geo1.d.startsWith('M 100.0 30.0'));

  const movedB = { ...shapeB, x: 500, y: 200 };
  const geo2 = buildConnectorPath({ ...conn, style: 'curved' }, [shapeA, movedB, conn]);
  assert.deepEqual(geo2.end, { x: 500, y: 230 });
  assert.ok(geo2.d.includes('C '));

  const nearest = findNearestAnchor({ x: 96, y: 32 }, [shapeA, movedB], 20);
  assert.equal(nearest?.objectId, 'a');
  assert.equal(nearest?.side, 'right');
});

test('connector midpointOffset bends curved and elbow paths and endpoint re-attachment tracks new target', () => {
  const shapeA: ShapeObject = {
    id: 'a',
    type: 'shape',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    rotation: 0,
    shapeKind: 'rectangle',
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 2,
  };
  const shapeB: ShapeObject = {
    id: 'b',
    type: 'shape',
    x: 300,
    y: 0,
    width: 100,
    height: 60,
    rotation: 0,
    shapeKind: 'rectangle',
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 2,
  };
  const shapeC: ShapeObject = {
    id: 'c',
    type: 'shape',
    x: 300,
    y: 200,
    width: 100,
    height: 60,
    rotation: 0,
    shapeKind: 'rectangle',
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 2,
  };

  const curvedConn: ConnectorObject = {
    id: 'c_bend',
    type: 'connector',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    style: 'curved',
    stroke: '#2563EB',
    strokeWidth: 2,
    start: { objectId: 'a', side: 'right', x: 100, y: 30 },
    end: { objectId: 'b', side: 'left', x: 300, y: 30 },
    midpointOffset: { x: 0, y: -60 },
  };
  const curvedGeo = buildConnectorPath(curvedConn, [shapeA, shapeB, shapeC, curvedConn]);
  assert.equal(curvedGeo.mid.x, 200);
  assert.equal(curvedGeo.mid.y, -30);
  assert.ok(curvedGeo.d.includes('Q '));

  const elbowConn: ConnectorObject = {
    ...curvedConn,
    style: 'elbow',
    midpointOffset: { x: 40, y: 0 },
  };
  const elbowGeo = buildConnectorPath(elbowConn, [shapeA, shapeB, shapeC, elbowConn]);
  assert.equal(elbowGeo.mid.x, 240);

  // Re-attach end from shapeB to shapeC top port
  const reattached: ConnectorObject = {
    ...curvedConn,
    end: { objectId: 'c', side: 'top', x: 350, y: 200 },
  };
  const movedC = { ...shapeC, x: 420, y: 260 };
  const geoAfterMove = buildConnectorPath(reattached, [shapeA, shapeB, movedC, reattached]);
  assert.deepEqual(geoAfterMove.end, { x: 470, y: 260 });
});

test('pen stroke smoothing preserves endpoints and builds pressure outline', () => {
  const raw = [
    { x: 0, y: 0, p: 0.4 },
    { x: 10, y: 20, p: 0.7 },
    { x: 20, y: 0, p: 0.9 },
    { x: 30, y: 20, p: 0.5 },
  ];
  const smoothed = smoothStrokePoints(raw, 2);
  assert.equal(smoothed.length, raw.length);
  assert.deepEqual(smoothed[0], raw[0]);
  assert.deepEqual(smoothed[smoothed.length - 1], raw[raw.length - 1]);
  const outline = buildPressureOutlinePath(smoothed, 4);
  assert.ok(outline.startsWith('M ') && outline.endsWith('Z'));
});

test('computeZoomToFit frames all objects inside viewport', () => {
  const objs: CanvasObject[] = [
    {
      id: 's1',
      type: 'shape',
      x: 100,
      y: 100,
      width: 400,
      height: 200,
      rotation: 0,
      shapeKind: 'rectangle',
      fill: '#fff',
      stroke: '#000',
      strokeWidth: 2,
    },
  ];
  const cam = computeZoomToFit(objs, 1440, 900);
  assert.ok(cam.zoom > 0.5 && cam.zoom <= 1.25);
  const centerScreenX = 300 * cam.zoom + cam.x;
  const centerScreenY = 200 * cam.zoom + cam.y;
  assert.ok(Math.abs(centerScreenX - 720) < 1);
  assert.ok(Math.abs(centerScreenY - 450) < 1);
});

test('mathParser evaluates formulas safely including implicit multiplication and functions', () => {
  const res1 = compileFormula('y = sin(pi / 2) + 2x^2');
  assert.equal(res1.error, null);
  assert.ok(Math.abs(res1.fn!(3) - 19) < 1e-9);

  const res2 = compileFormula('f(x) = -cos(0) * 4 + sqrt(16)');
  assert.equal(res2.error, null);
  assert.ok(Math.abs(res2.fn!(0) - 0) < 1e-9);

  const bad = compileFormula('y = sin(');
  assert.equal(bad.fn, null);
  assert.ok(bad.error !== null);
});

test('parseChartCsv handles headers and multiple numeric columns', () => {
  const csv = 'Quarter,Revenue,Cost\nQ1,120,80\nQ2,155,95\nQ3,190,110';
  const parsed = parseChartCsv(csv);
  assert.deepEqual(parsed.labels, ['Q1', 'Q2', 'Q3']);
  assert.equal(parsed.series.length, 2);
  assert.equal(parsed.series[0].name, 'Revenue');
  assert.deepEqual(parsed.series[0].values, [120, 155, 190]);
});

test('history undo/redo, layer reordering, grouping, and cloning work predictably', () => {
  let hist = createHistory<string[]>(['a']);
  hist = pushHistory(hist, ['a', 'b']);
  hist = pushHistory(hist, ['a', 'b', 'c']);
  hist = undoHistory(hist);
  assert.deepEqual(hist.present, ['a', 'b']);
  hist = redoHistory(hist);
  assert.deepEqual(hist.present, ['a', 'b', 'c']);

  const objs: CanvasObject[] = ['1', '2', '3'].map((id, i) => ({
    id,
    type: 'text',
    x: i * 100,
    y: 0,
    width: 80,
    height: 30,
    rotation: 0,
    text: id,
    fontSize: 16,
    fontWeight: '400',
    color: '#000',
  }));

  const front = reorderObjectsLayer(objs, new Set(['1']), 'front');
  assert.deepEqual(
    front.map((o) => o.id),
    ['2', '3', '1']
  );

  const grouped = groupObjects(objs, new Set(['1', '2']));
  const expanded = expandSelectionWithGroups(grouped, ['1']);
  assert.ok(expanded.has('1') && expanded.has('2') && !expanded.has('3'));

  const ungrouped = ungroupObjects(grouped, new Set(['1']));
  assert.equal(ungrouped[0].groupId, null);
  assert.equal(ungrouped[1].groupId, null);

  const cloned = cloneObjectsWithOffset(grouped.slice(0, 2), 20, 20);
  assert.equal(cloned.length, 2);
  assert.notEqual(cloned[0].id, '1');
  assert.equal(cloned[0].groupId, cloned[1].groupId);
  assert.equal(cloned[0].x, 20);
});

test('searchCanvasObjects finds text across notes, frames, checklists, kanban, charts, and shapes', () => {
  const objs: CanvasObject[] = [
    {
      id: 'f1',
      type: 'frame',
      x: 0,
      y: 0,
      width: 500,
      height: 400,
      rotation: 0,
      title: 'Architecture Zone',
      background: 'rgba(148,163,184,0.06)',
      borderColor: '#94A3B8',
    },
    {
      id: 'st1',
      type: 'sticky',
      x: 40,
      y: 50,
      width: 200,
      height: 120,
      rotation: 0,
      text: 'Verify offline cache strategy',
      color: 'butter',
    },
    {
      id: 'chk1',
      type: 'checklist',
      x: 600,
      y: 40,
      width: 240,
      height: 180,
      rotation: 0,
      title: 'Release Checklist',
      items: [{ id: 'i1', text: 'Run offline font check', done: false }],
    },
    {
      id: 'kb1',
      type: 'kanban',
      x: 100,
      y: 600,
      width: 540,
      height: 240,
      rotation: 0,
      title: 'Sprint Board',
      columns: [
        {
          id: 'c1',
          title: 'Doing',
          cards: [{ id: 'card1', title: 'Offline PWA sync' }],
        },
      ],
    },
  ];

  const matches = searchCanvasObjects(objs, 'offline');
  assert.equal(matches.length, 3);
  assert.deepEqual(
    matches.map((m) => m.objectId),
    ['st1', 'chk1', 'kb1']
  );

  const frames = getBoardFrames(objs);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].title, 'Architecture Zone');

  // st1 center (140, 110) is inside f1 (0..500, 0..400); chk1 (720, 130) is outside
  const insideIds = getObjectsInsideFrame(frames[0], objs);
  assert.deepEqual(insideIds, ['st1']);

  const cam = computeCameraToFocusObject(frames[0], objs, 1440, 900);
  const centerScreenX = 250 * cam.zoom + cam.x;
  const centerScreenY = 200 * cam.zoom + cam.y;
  assert.ok(Math.abs(centerScreenX - 720) < 1);
  assert.ok(Math.abs(centerScreenY - 450) < 1);
});

test('computeAlignmentGuides snaps edges/centers and detects equal horizontal and vertical spacing', () => {
  const mkBox = (id: string, x: number, y: number, w = 100, h = 80): ShapeObject => ({
    id,
    type: 'shape',
    x,
    y,
    width: w,
    height: h,
    rotation: 0,
    shapeKind: 'rectangle',
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 2,
  });

  // Left edge + top edge snap
  const a = mkBox('a', 100, 100);
  const b = mkBox('b', 380, 100);
  const moving = mkBox('m', 103, 250);
  const edgeSnap = computeAlignmentGuides(
    { x: moving.x, y: moving.y, width: moving.width, height: moving.height },
    [a, b, moving],
    new Set(['m']),
    6
  );
  assert.equal(edgeSnap.dx, -3);
  assert.ok(edgeSnap.lines.some((l) => l.orientation === 'v' && l.pos === 100));

  // Equal spacing centered between a (right=200) and b (left=380): span=180, width=100 -> equal gap=40 -> target x=240
  const centered = computeAlignmentGuides(
    { x: 243, y: 102, width: 100, height: 80 },
    [a, b, moving],
    new Set(['m']),
    6
  );
  assert.equal(centered.dx, -3);
  assert.equal(centered.dy, -2);
  assert.equal(centered.spacings.length, 2);
  assert.equal(centered.spacings[0].gap, 40);
  assert.equal(centered.spacings[1].gap, 40);

  // Continuing vertical sequence: v1 (y=0..80), v2 (y=120..200, gap=40) -> target y=240
  const v1 = mkBox('v1', 0, 0);
  const v2 = mkBox('v2', 0, 120);
  const v3 = mkBox('v3', 0, 244);
  const vSeq = computeAlignmentGuides(
    { x: v3.x, y: v3.y, width: v3.width, height: v3.height },
    [v1, v2, v3],
    new Set(['v3']),
    6
  );
  assert.equal(vSeq.dy, -4);
  assert.equal(vSeq.spacings.length, 2);
  assert.equal(vSeq.spacings[0].orientation, 'v');
  assert.equal(vSeq.spacings[0].gap, 40);
});

test('fileSync generates .vellum.json filenames, round-trips boards, and detects API support', () => {
  assert.equal(toVellumFilename('Q3 Architecture & Notes!'), 'q3-architecture-notes.vellum.json');
  assert.equal(toVellumFilename('   '), 'vellum-board.vellum.json');

  const board = {
    id: 'b_sync_1',
    name: 'Local Folder Board',
    createdAt: 1000,
    updatedAt: 2000,
    camera: { x: 40, y: -20, zoom: 1.1 },
    objects: [],
  };
  const serialized = serializeVellumBoard(board);
  assert.ok(serialized.includes('"format": "vellum-board"'));
  const parsed = parseVellumBoard(serialized);
  assert.equal(parsed.error, null);
  assert.equal(parsed.board?.name, 'Local Folder Board');
  assert.deepEqual(parsed.board?.camera, board.camera);

  assert.equal(supportsFileSystemAccess({}), false);
  assert.equal(
    supportsFileSystemAccess({
      showOpenFilePicker: () => {},
      showSaveFilePicker: () => {},
    }),
    true
  );
  assert.equal(supportsDirectoryPicker({}), false);
  assert.equal(supportsDirectoryPicker({ showDirectoryPicker: () => {} }), true);
});



