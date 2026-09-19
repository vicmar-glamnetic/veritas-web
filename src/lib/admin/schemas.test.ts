import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { doctorSchema, promoSchema, serviceSchema, staffSchema } from './schemas';

/**
 * An unticked checkbox sends no key at all. Every one of these schemas broke on that,
 * with a message no member of staff could act on, so the behaviour is pinned here.
 */
describe('admin form schemas: unticked checkboxes', () => {
  it('accepts a service with boxes unticked', () => {
    const r = serviceSchema.safeParse({
      name: 'Test Service',
      category: 'laboratory',
      pricePhp: '450',
      durationMinutes: '15',
      prepInstructions: '',
      sortOrder: '0',
      // isBookableOnline, isListedOnline and isActive all absent
    });
    assert.ok(r.success, r.success ? '' : r.error.issues.map((i) => i.message).join('; '));
    assert.equal(r.data.isBookableOnline, false);
    assert.equal(r.data.isListedOnline, false);
    assert.equal(r.data.isActive, false);
  });

  it('reads a ticked box as true', () => {
    const r = serviceSchema.safeParse({
      name: 'Test Service',
      category: 'laboratory',
      pricePhp: '450',
      durationMinutes: '15',
      sortOrder: '0',
      isActive: 'on',
    });
    assert.ok(r.success);
    assert.equal(r.data.isActive, true);
    assert.equal(r.data.isListedOnline, false);
  });

  it('accepts a doctor with Active unticked', () => {
    const r = doctorSchema.safeParse({
      fullName: 'Dra. Test',
      specialty: 'Family Medicine',
      sortOrder: '1',
    });
    assert.ok(r.success, r.success ? '' : r.error.issues.map((i) => i.message).join('; '));
    assert.equal(r.data.isActive, false);
  });

  it('accepts a promo with Active unticked', () => {
    const r = promoSchema.safeParse({
      title: 'Test promo',
      body: 'Something worth at least ten characters.',
      startsOn: '2027-01-01',
      endsOn: '2027-02-01',
      sortOrder: '1',
    });
    assert.ok(r.success, r.success ? '' : r.error.issues.map((i) => i.message).join('; '));
    assert.equal(r.data.isActive, false);
  });

  it('accepts a staff member with Active unticked', () => {
    const r = staffSchema.safeParse({
      name: 'Test Person',
      email: 'test@example.com',
      role: 'reception',
      password: '',
    });
    assert.ok(r.success, r.success ? '' : r.error.issues.map((i) => i.message).join('; '));
    assert.equal(r.data.isActive, false);
    assert.equal(r.data.password, null, 'a blank password means leave it alone');
  });

  it('still rejects genuinely bad input', () => {
    assert.equal(
      serviceSchema.safeParse({
        name: 'X',
        category: 'laboratory',
        pricePhp: 'four hundred',
        durationMinutes: '15',
        sortOrder: '0',
      }).success,
      false,
      'a non-numeric price must not pass',
    );
  });
});
