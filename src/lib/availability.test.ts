import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { distributeOnlineCapacity, minutesToTime, slotStartTimes, timeToMinutes } from './availability';

describe('slotStartTimes', () => {
  it('divides a session into whole slots', () => {
    assert.deepEqual(slotStartTimes('09:00:00', '10:00:00', 20), [
      '09:00:00',
      '09:20:00',
      '09:40:00',
    ]);
  });

  it('drops a trailing gap too short for a full slot', () => {
    // 09:00-10:10 in 30-minute slots is two slots, not two and a stub.
    assert.deepEqual(slotStartTimes('09:00:00', '10:10:00', 30), ['09:00:00', '09:30:00']);
  });

  it('returns nothing when the session is shorter than one slot', () => {
    assert.deepEqual(slotStartTimes('09:00:00', '09:10:00', 30), []);
  });

  it('handles an afternoon session without drifting', () => {
    const starts = slotStartTimes('13:00:00', '17:00:00', 20);
    assert.equal(starts.length, 12);
    assert.equal(starts[0], '13:00:00');
    assert.equal(starts.at(-1), '16:40:00');
  });

  it('round-trips minutes and wall-clock strings', () => {
    assert.equal(timeToMinutes('07:15:00'), 435);
    assert.equal(minutesToTime(435), '07:15:00');
  });
});

describe('distributeOnlineCapacity', () => {
  it('always sums to the session total', () => {
    for (const [total, slots] of [
      [6, 9],
      [16, 16],
      [32, 16],
      [4, 6],
      [12, 12],
      [1, 8],
      [20, 16],
      [0, 9],
    ] as const) {
      const spread = distributeOnlineCapacity(total, slots);
      assert.equal(spread.length, slots);
      assert.equal(
        spread.reduce((a, b) => a + b, 0),
        total,
        `total ${total} over ${slots} slots`,
      );
    }
  });

  it('spreads walk-in gaps through the session rather than bunching them at the end', () => {
    // Dra. Reyes: 9 slots, 6 online. Walk-ins must not have to wait until 11am.
    assert.deepEqual(distributeOnlineCapacity(6, 9), [1, 1, 0, 1, 1, 0, 1, 1, 0]);
  });

  it('offers the first slot of a session online', () => {
    // Patients look for the opening time; it should not be permanently walk-in only.
    for (const [total, slots] of [[6, 9], [4, 6], [1, 8], [16, 16]] as const) {
      assert.ok(
        distributeOnlineCapacity(total, slots)[0]! >= 1,
        `first slot bookable for ${total}/${slots}`,
      );
    }
  });

  it('gives every slot a place when online capacity matches the slot count', () => {
    assert.deepEqual(distributeOnlineCapacity(16, 16), Array(16).fill(1));
  });

  it('gives every slot two places when capacity is double the slot count', () => {
    assert.deepEqual(distributeOnlineCapacity(32, 16), Array(16).fill(2));
  });

  it('offers nothing when the session holds everything back for walk-ins', () => {
    assert.deepEqual(distributeOnlineCapacity(0, 5), [0, 0, 0, 0, 0]);
  });

  it('never returns a negative place count', () => {
    assert.ok(distributeOnlineCapacity(-3, 4).every((n) => n >= 0));
  });
});
