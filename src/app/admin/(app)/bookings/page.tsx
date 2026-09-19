import type { Metadata } from 'next';

import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { doctors, services } from '@/db/schema';
import { findBookings } from '@/lib/admin/queries';
import { requireStaff } from '@/lib/auth';
import { formatManilaDate } from '@/lib/time';

import { BookingRow } from '../booking-row';
import { Button, Field, Input, PageTitle, Panel, Select } from '../ui';

export const metadata: Metadata = { title: 'Bookings' };
export const dynamic = 'force-dynamic';

/**
 * The search screen. Filters live in the query string so a useful view can be
 * bookmarked, and so the form works as a plain GET with no JavaScript.
 */
export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff();
  const p = await searchParams;

  const [doctorList, serviceList, results] = await Promise.all([
    db.select().from(doctors).where(eq(doctors.isActive, true)).orderBy(asc(doctors.fullName)),
    db.select().from(services).where(and(eq(services.isActive, true))).orderBy(asc(services.name)),
    findBookings({
      from: p.from,
      to: p.to,
      doctorId: p.doctorId,
      serviceId: p.serviceId,
      status: p.status,
      q: p.q,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Bookings"
        lead="Search by reference code, mobile number or name, or filter by date, doctor, service and status."
      />

      <Panel>
        <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Search" hint="Reference code, mobile number or name." className="lg:col-span-3">
            <Input name="q" defaultValue={p.q ?? ''} placeholder="VRT-7K4Q, 0917…, or a name" />
          </Field>
          <Field label="From">
            <Input name="from" type="date" defaultValue={p.from ?? ''} />
          </Field>
          <Field label="To">
            <Input name="to" type="date" defaultValue={p.to ?? ''} />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={p.status ?? ''}>
              <option value="">Any status</option>
              <option value="live">Still live (booked, arrived, missed)</option>
              <option value="booked">Booked</option>
              <option value="arrived">Arrived</option>
              <option value="no_show">Did not come</option>
              <option value="cancelled_by_patient">Cancelled by patient</option>
              <option value="cancelled_by_clinic">Cancelled by clinic</option>
            </Select>
          </Field>
          <Field label="Doctor">
            <Select name="doctorId" defaultValue={p.doctorId ?? ''}>
              <option value="">Any doctor</option>
              {doctorList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Service">
            <Select name="serviceId" defaultValue={p.serviceId ?? ''}>
              <option value="">Any service</option>
              {serviceList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit">Search</Button>
            <a
              href="/admin/bookings"
              className="inline-flex min-h-[2.5rem] items-center rounded border border-line-strong bg-surface px-4 text-sm font-semibold text-ink-900 hover:bg-surface-sunken"
            >
              Clear
            </a>
          </div>
        </form>
      </Panel>

      <p className="text-sm text-ink-500">
        {results.length === 0
          ? 'Nothing matched.'
          : `${results.length} booking${results.length === 1 ? '' : 's'}${results.length === 200 ? ' (showing the most recent 200)' : ''}`}
      </p>

      {results.length > 0 ? (
        <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
          {results.map((booking) => (
            <BookingRow
              key={booking.id}
              booking={booking}
              showDate={formatManilaDate(booking.scheduledStart)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
