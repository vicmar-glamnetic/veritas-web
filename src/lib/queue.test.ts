import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildQueueBoard, formatTicket, shortenName, type QueueTicketRow } from './queue';

function ticket(over: Partial<QueueTicketRow> & { id: string }): QueueTicketRow {
  return {
    category: 'consultation',
    number: 1,
    status: 'waiting',
    patientName: 'Juan Dela Cruz',
    doctorName: null,
    ...over,
  };
}

test('a ticket reads C-001, L-001, I-001', () => {
  assert.equal(formatTicket('consultation', 1), 'C-001');
  assert.equal(formatTicket('laboratory', 14), 'L-014');
  assert.equal(formatTicket('imaging', 203), 'I-203');
});

test('a number past three digits grows rather than being cut short', () => {
  assert.equal(formatTicket('consultation', 1000), 'C-1000');
});

test('now serving is the called ticket, not the newest arrival', () => {
  const board = buildQueueBoard([
    ticket({ id: 'a', number: 1, status: 'done' }),
    ticket({ id: 'b', number: 2, status: 'called' }),
    ticket({ id: 'c', number: 3, status: 'waiting' }),
  ]);

  assert.equal(board.panels[0].serving?.id, 'b');
  assert.deepEqual(
    board.panels[0].waiting.map((t) => t.id),
    ['c'],
  );
});

test('waiting is in issue order, so the queue cannot jump', () => {
  const board = buildQueueBoard([
    ticket({ id: 'third', number: 3 }),
    ticket({ id: 'first', number: 1 }),
    ticket({ id: 'second', number: 2 }),
  ]);

  assert.deepEqual(
    board.panels[0].waiting.map((t) => t.id),
    ['first', 'second', 'third'],
  );
});

test('the board never goes backwards if two were left called at once', () => {
  const board = buildQueueBoard([
    ticket({ id: 'older', number: 7, status: 'called' }),
    ticket({ id: 'newer', number: 8, status: 'called' }),
  ]);

  assert.equal(board.panels[0].serving?.id, 'newer');
});

test('each category keeps its own queue', () => {
  const board = buildQueueBoard([
    ticket({ id: 'c', number: 4, status: 'called', category: 'consultation' }),
    ticket({ id: 'l', number: 1, status: 'called', category: 'laboratory' }),
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

test('an empty day renders three panels and announces nothing', () => {
  const board = buildQueueBoard([]);

  assert.equal(board.panels.length, 3);
  assert.equal(board.lastCalled, null);
});

test('done and skipped tickets leave the board entirely', () => {
  const board = buildQueueBoard([
    ticket({ id: 'done', number: 1, status: 'done' }),
    ticket({ id: 'skipped', number: 2, status: 'skipped' }),
  ]);

  assert.equal(board.panels[0].serving, null);
  assert.equal(board.panels[0].waiting.length, 0);
});

test('a walk-in with no name still holds its place', () => {
  const board = buildQueueBoard([
    ticket({ id: 'walkin', number: 5, status: 'called', patientName: null }),
  ]);

  assert.equal(board.panels[0].serving?.id, 'walkin');
  assert.equal(board.panels[0].serving?.patientName, null);
});

test('shortenName keeps a first name and a surname initial', () => {
  assert.equal(shortenName('Juan Miguel Dela Cruz'), 'Juan C.');
  assert.equal(shortenName('Ana Reyes'), 'Ana R.');
});

test('shortenName leaves a single name whole and tolerates rubbish', () => {
  assert.equal(shortenName('Madonna'), 'Madonna');
  assert.equal(shortenName('  Ana   Reyes  '), 'Ana R.');
  assert.equal(shortenName('   '), '');
});

test('shortenName never returns a full surname', () => {
  assert.ok(!shortenName('Juan Dela Cruz').includes('Cruz'));
});
