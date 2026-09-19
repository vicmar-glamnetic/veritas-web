import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/auth';
import { getSiteSettings } from '@/lib/queries';

import { saveSettings } from '../crud-actions';
import { Button, Field, Flash, Input, PageTitle, Panel, Textarea } from '../ui';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireAdmin();
  const { done, error } = await searchParams;
  const s = await getSiteSettings();

  return (
    <div className="space-y-6">
      <Flash done={done} error={error} />
      <PageTitle
        title="Settings"
        lead="These details appear across the website, in confirmation emails and on the printed reference a patient brings in."
      />

      <Panel>
        <form action={saveSettings} className="grid gap-4 sm:grid-cols-2">
          <Field label="Clinic name" className="sm:col-span-2">
            <Input name="clinicName" defaultValue={s.clinicName} required maxLength={200} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Textarea name="address" defaultValue={s.address} rows={2} required maxLength={500} />
          </Field>
          <Field label="Main phone number">
            <Input name="phonePrimary" defaultValue={s.phonePrimary} required maxLength={50} />
          </Field>
          <Field label="Second phone number" hint="Optional.">
            <Input name="phoneSecondary" defaultValue={s.phoneSecondary ?? ''} maxLength={50} />
          </Field>
          <Field label="Email address" hint="Where inquiries are sent.">
            <Input name="email" type="email" defaultValue={s.email} required maxLength={200} />
          </Field>
          <Field label="Facebook page URL" hint="Optional.">
            <Input name="facebookUrl" defaultValue={s.facebookUrl ?? ''} maxLength={300} />
          </Field>
          <Field
            label="Opening hours"
            hint="One line per day. Shown exactly as typed."
            className="sm:col-span-2"
          >
            <Textarea
              name="openingHoursText"
              defaultValue={s.openingHoursText}
              rows={4}
              required
              maxLength={1000}
            />
          </Field>
          <Field
            label="Google Maps embed URL"
            hint="Optional. The src from a Google Maps embed."
            className="sm:col-span-2"
          >
            <Input name="mapEmbedUrl" defaultValue={s.mapEmbedUrl ?? ''} maxLength={1000} />
          </Field>
          <Field
            label="How far ahead patients may book"
            hint="Days. 30 is a good default."
          >
            <Input
              name="bookingHorizonDays"
              type="number"
              min={1}
              max={180}
              defaultValue={s.bookingHorizonDays}
              required
            />
          </Field>
          <div className="flex items-end sm:col-span-2">
            <Button type="submit">Save settings</Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
