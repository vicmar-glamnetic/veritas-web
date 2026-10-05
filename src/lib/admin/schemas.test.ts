import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  doctorSchema,
  promoSchema,
  roomSchema,
  serviceSchema,
  staffSchema,
  walkInSchema,
} from './schemas';

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

const DOCTOR_ID = '6f1d2c4e-8a3b-4c5d-9e7f-0a1b2c3d4e5f';

describe('staff roles and the doctor link', () => {
  const base = { name: 'Dra. Reyes', email: 'reyes@example.com', password: 'long-enough-1', isActive: 'on' };

  it('refuses a doctor account with no doctor to call for', () => {
    const r = staffSchema.safeParse({ ...base, role: 'doctor', doctorId: '' });
    assert.equal(r.success, false);
  });

  it('keeps the link on a doctor account', () => {
    const r = staffSchema.safeParse({ ...base, role: 'doctor', doctorId: DOCTOR_ID });
    assert.ok(r.success);
    assert.equal(r.data.doctorId, DOCTOR_ID);
  });

  it('drops a leftover link when the role is not doctor', () => {
    // The select still shows the old doctor after someone changes the role.
    const r = staffSchema.safeParse({ ...base, role: 'laboratory', doctorId: DOCTOR_ID });
    assert.ok(r.success);
    assert.equal(r.data.doctorId, null);
  });
});

describe('room accounts', () => {
  const base = { name: 'Phlebotomy PC', email: 'phlebotomy@example.com', password: 'long-enough-1', isActive: 'on' };

  it('refuses a room account with no room', () => {
    assert.equal(staffSchema.safeParse({ ...base, role: 'room', roomId: '' }).success, false);
  });

  it('keeps the room on a room account and drops it from any other role', () => {
    const room = staffSchema.safeParse({ ...base, role: 'room', roomId: DOCTOR_ID });
    assert.ok(room.success);
    assert.equal(room.data.roomId, DOCTOR_ID);

    const reception = staffSchema.safeParse({ ...base, role: 'reception', roomId: DOCTOR_ID });
    assert.ok(reception.success);
    assert.equal(reception.data.roomId, null);
  });
});

describe('rooms and walk-ins', () => {
  it('accepts a room with Active unticked', () => {
    const r = roomSchema.safeParse({ name: 'X-ray Room', category: 'imaging', sortOrder: '1' });
    assert.ok(r.success);
    assert.equal(r.data.isActive, false);
  });

  it('reads a blank walk-in doctor as first available, and normalises the mobile', () => {
    const r = walkInSchema.safeParse({
      fullName: 'Ana Reyes',
      mobile: '0917 123 4567',
      category: 'consultation',
      doctorId: '',
    });
    assert.ok(r.success, r.success ? '' : r.error.issues.map((i) => i.message).join('; '));
    assert.equal(r.data.doctorId, null);
    assert.equal(r.data.mobile, '+639171234567');
  });

  it('refuses a walk-in without a usable mobile', () => {
    const r = walkInSchema.safeParse({ fullName: 'Ana Reyes', mobile: '12', category: 'laboratory', doctorId: '' });
    assert.equal(r.success, false);
  });
});
