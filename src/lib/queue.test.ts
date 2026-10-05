import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildQueueBoard,
  canRecall,
  compareInLine,
  formatTicket,
  isInLine,
  shortenName,
  type QueueTicketRow,
} from './queue';

function ticket(over: Partial<QueueTicketRow> & { id: string }): QueueTicketRow {
  return {
    category: 'consultation',
    number: 1,
    status: 'waiting',
    patientName: 'Juan Dela Cruz',
    doctorId: null,
    doctorName: null,
    roomName: null,
    calledAt: null,
    recalledAt: null,
    ...over,
  };
}

const at = (iso: string) => new Date(iso);

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

  assert.deepEqual(board.panels[0].serving.map((t) => t.id), ['b']);
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

test('two rooms in one category both show, in room order', () => {
  const board = buildQueueBoard([
    ticket({ id: 'r10', number: 7, status: 'called', roomName: 'Consultation Room 10' }),
    ticket({ id: 'r2', number: 8, status: 'called', roomName: 'Consultation Room 2' }),
  ]);

  // Numeric-aware, so Room 2 sits before Room 10 and neither jumps about on refresh.
  assert.deepEqual(board.panels[0].serving.map((t) => t.id), ['r2', 'r10']);
});

test('each category keeps its own queue', () => {
  const board = buildQueueBoard([
    ticket({ id: 'c', number: 4, status: 'called', category: 'consultation' }),
    ticket({ id: 'l', number: 1, status: 'called', category: 'laboratory' }),
  ]);

  assert.deepEqual(
    board.panels.map((p) => [p.key, p.serving.map((t) => t.id)]),
    [
      ['consultation', ['c']],
      ['laboratory', ['l']],
      ['imaging', []],
    ],
  );
});

/*
 * The announcement line, and with it the spoken announcement, used to take the first
 * category that had anything on its board. That is consultation whenever consultation is
 * busy, so calling a laboratory or imaging number announced nothing at all.
 */
test('the announcement follows the most recent call, in any category', () => {
  const board = buildQueueBoard([
    ticket({ id: 'c', category: 'consultation', number: 4, status: 'called', calledAt: at('2027-01-05T01:00:00Z') }),
    ticket({ id: 'l', category: 'laboratory', number: 2, status: 'called', calledAt: at('2027-01-05T02:00:00Z') }),
  ]);

  assert.equal(board.lastCalled?.id, 'l');
});

test('imaging gets announced even while consultation is busy', () => {
  const board = buildQueueBoard([
    ticket({ id: 'c', category: 'consultation', number: 9, status: 'called', calledAt: at('2027-01-05T01:00:00Z') }),
    ticket({ id: 'i', category: 'imaging', number: 1, status: 'called', calledAt: at('2027-01-05T03:00:00Z') }),
  ]);

  assert.equal(board.lastCalled?.id, 'i');
  assert.equal(board.lastCalled?.category, 'imaging');
});

test('calling consultation again takes the announcement back', () => {
  const board = buildQueueBoard([
    ticket({ id: 'c', category: 'consultation', number: 10, status: 'called', calledAt: at('2027-01-05T04:00:00Z') }),
    ticket({ id: 'l', category: 'laboratory', number: 2, status: 'called', calledAt: at('2027-01-05T02:00:00Z') }),
    ticket({ id: 'i', category: 'imaging', number: 1, status: 'called', calledAt: at('2027-01-05T03:00:00Z') }),
  ]);

  assert.equal(board.lastCalled?.id, 'c');
});

test('the announcement does not flicker when two calls share a timestamp', () => {
  const same = at('2027-01-05T05:00:00Z');
  const rows = [
    ticket({ id: 'a1', category: 'consultation', status: 'called', calledAt: same }),
    ticket({ id: 'a2', category: 'laboratory', status: 'called', calledAt: same }),
  ];

  assert.equal(buildQueueBoard(rows).lastCalled?.id, buildQueueBoard([...rows].reverse()).lastCalled?.id);
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

  assert.equal(board.panels[0].serving.length, 0);
  assert.equal(board.panels[0].waiting.length, 0);
});

test('a walk-in with no name still holds its place', () => {
  const board = buildQueueBoard([
    ticket({ id: 'walkin', number: 5, status: 'called', patientName: null }),
  ]);

  assert.equal(board.panels[0].serving[0]?.id, 'walkin');
  assert.equal(board.panels[0].serving[0]?.patientName, null);
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

/* Lines: who is in whose queue, and in what order. */

test('a booked consultation is only in its own doctor’s line', () => {
  const booked = { category: 'consultation' as const, doctorId: 'reyes' };

  assert.equal(isInLine(booked, { category: 'consultation', doctorId: 'reyes' }), true);
  assert.equal(isInLine(booked, { category: 'consultation', doctorId: 'santos' }), false);
});

test('a first-available walk-in is in every doctor’s line', () => {
  const walkIn = { category: 'consultation' as const, doctorId: null };

  assert.equal(isInLine(walkIn, { category: 'consultation', doctorId: 'reyes' }), true);
  assert.equal(isInLine(walkIn, { category: 'consultation', doctorId: 'santos' }), true);
});

test('laboratory and imaging are one line each, whatever the room', () => {
  assert.equal(isInLine({ category: 'laboratory', doctorId: null }, { category: 'laboratory', doctorId: null }), true);
  assert.equal(isInLine({ category: 'laboratory', doctorId: null }, { category: 'imaging', doctorId: null }), false);
});

test('a recalled patient goes to the front of the line', () => {
  const line = [
    ticket({ id: 'n4', number: 4 }),
    ticket({ id: 'n2', number: 2, recalledAt: at('2027-01-05T03:00:00Z') }),
    ticket({ id: 'n5', number: 5 }),
  ].sort(compareInLine);

  assert.deepEqual(line.map((t) => t.id), ['n2', 'n4', 'n5']);
});

test('two recalled patients go in the order they came back, not by number', () => {
  const line = [
    ticket({ id: 'later', number: 1, recalledAt: at('2027-01-05T04:00:00Z') }),
    ticket({ id: 'sooner', number: 3, recalledAt: at('2027-01-05T03:00:00Z') }),
    ticket({ id: 'plain', number: 2 }),
  ].sort(compareInLine);

  assert.deepEqual(line.map((t) => t.id), ['sooner', 'later', 'plain']);
});

test('the board lists the waiting in calling order, recalled first', () => {
  const board = buildQueueBoard([
    ticket({ id: 'n6', number: 6 }),
    ticket({ id: 'n3', number: 3, recalledAt: at('2027-01-05T03:00:00Z') }),
  ]);

  assert.deepEqual(board.panels[0].waiting.map((t) => t.id), ['n3', 'n6']);
});

test('a skipped patient can be recalled once, and only once', () => {
  assert.equal(canRecall({ status: 'skipped', recalledAt: null }), true);
  assert.equal(canRecall({ status: 'skipped', recalledAt: at('2027-01-05T03:00:00Z') }), false);
  assert.equal(canRecall({ status: 'waiting', recalledAt: null }), false);
});
