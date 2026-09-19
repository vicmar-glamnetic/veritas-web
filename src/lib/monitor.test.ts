import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildBoard, shortenName, type MonitorRow } from './monitor';

function row(over: Partial<MonitorRow> & { id: string }): MonitorRow {
  return {
    referenceCode: `VRT-${over.id}`,
    status: 'booked',
    scheduledStart: new Date('2026-03-02T01:00:00Z'),
    updatedAt: new Date('2026-03-02T01:00:00Z'),
    patientName: 'Juan Dela Cruz',
    serviceCategory: 'consultation',
    doctorName: null,
    ...over,
  };
}

test('shortenName keeps a first name and a surname initial', () => {
  assert.equal(shortenName('Juan Miguel Dela Cruz'), 'Juan C.');
  assert.equal(shortenName('Ana Reyes'), 'Ana R.');
});

test('shortenName leaves a single name whole', () => {
  assert.equal(shortenName('Madonna'), 'Madonna');
});

test('shortenName tolerates stray whitespace and empty input', () => {
  assert.equal(shortenName('  Ana   Reyes  '), 'Ana R.');
  assert.equal(shortenName('   '), '');
});

test('shortenName never returns a full surname', () => {
  assert.ok(!shortenName('Juan Dela Cruz').includes('Cruz'));
});

test('now serving is the most recently arrived patient in the category', () => {
  const board = buildBoard([
    row({ id: 'a', status: 'arrived', updatedAt: new Date('2026-03-02T02:00:00Z') }),
    row({ id: 'b', status: 'arrived', updatedAt: new Date('2026-03-02T03:00:00Z') }),
  ]);

  assert.equal(board.panels[0].serving?.id, 'b');
});

test('waiting lists only booked patients, earliest first', () => {
  const board = buildBoard([
    row({ id: 'late', scheduledStart: new Date('2026-03-02T04:00:00Z') }),
    row({ id: 'early', scheduledStart: new Date('2026-03-02T02:00:00Z') }),
    row({ id: 'seen', status: 'arrived' }),
  ]);

  assert.deepEqual(
    board.panels[0].waiting.map((r) => r.id),
    ['early', 'late'],
  );
});

test('each category gets its own panel and does not borrow another one', () => {
  const board = buildBoard([
    row({ id: 'c', status: 'arrived', serviceCategory: 'consultation' }),
    row({ id: 'l', status: 'arrived', serviceCategory: 'laboratory' }),
  ]);

  assert.deepEqual(
    board.panels.map((p) => [p.key, p.serving?.id ?? null]),
    [
      ['consultation', 'c'],
      ['laboratory', 'l'],
      ['imaging', null],
    ],
  );
});

test('the announcement line takes the most recent call across all categories', () => {
  const board = buildBoard([
    row({
      id: 'c',
      status: 'arrived',
      serviceCategory: 'consultation',
      updatedAt: new Date('2026-03-02T02:00:00Z'),
    }),
    row({
      id: 'i',
      status: 'arrived',
      serviceCategory: 'imaging',
      updatedAt: new Date('2026-03-02T05:00:00Z'),
    }),
  ]);

  assert.equal(board.lastCalled?.row.id, 'i');
  assert.equal(board.lastCalled?.category, 'imaging');
});

test('an empty day still renders three panels and announces nothing', () => {
  const board = buildBoard([]);

  assert.equal(board.panels.length, 3);
  assert.equal(board.lastCalled, null);
  assert.ok(board.panels.every((p) => p.serving === null && p.waiting.length === 0));
});

test('ties order the same way every time, so the board does not flicker', () => {
  const same = new Date('2026-03-02T02:00:00Z');
  const rows = [
    row({ id: 'a1', status: 'arrived', updatedAt: same }),
    row({ id: 'a2', status: 'arrived', updatedAt: same }),
  ];

  const first = buildBoard(rows).panels[0].serving?.id;
  const reversed = buildBoard([...rows].reverse()).panels[0].serving?.id;
  assert.equal(first, reversed);
});
