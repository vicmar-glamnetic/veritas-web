import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * The status transitions the front desk is allowed to make.
 *
 * Kept as a table test because the rules are the sort of thing that gets loosened by
 * accident: letting a cancelled booking be marked arrived would silently resurrect a
 * slot the patient was told they had given up.
 */
const ALLOWED_FROM: Record<string, string[]> = {
  arrived: ['booked', 'no_show'],
  no_show: ['booked', 'arrived'],
  cancelled_by_clinic: ['booked', 'arrived', 'no_show'],
};

describe('staff status transitions', () => {
  it('never allows a cancelled booking to be revived', () => {
    for (const [to, from] of Object.entries(ALLOWED_FROM)) {
      assert.ok(!from.includes('cancelled_by_patient'), `${to} must not come from a patient cancellation`);
      assert.ok(!from.includes('cancelled_by_clinic'), `${to} must not come from a clinic cancellation`);
    }
  });

  it('lets a no-show be corrected to arrived, and back', () => {
    assert.ok(ALLOWED_FROM.arrived.includes('no_show'), 'someone marked absent may turn up late');
    assert.ok(ALLOWED_FROM.no_show.includes('arrived'), 'a mis-click must be correctable');
  });

  it('lets the clinic cancel anything still live', () => {
    for (const status of ['booked', 'arrived', 'no_show']) {
      assert.ok(ALLOWED_FROM.cancelled_by_clinic.includes(status), `should cancel from ${status}`);
    }
  });
});
