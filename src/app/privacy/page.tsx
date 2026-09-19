import type { Metadata } from 'next';
import Link from 'next/link';

import { Container, PageHeader, Prose } from '@/components/ui';
import { getSiteSettings } from '@/lib/queries';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Privacy notice',
  description:
    'How Veritas Clinic collects, uses and protects your personal data under the Philippine Data Privacy Act of 2012 (RA 10173).',
};

/**
 * NOTE FOR THE CLINIC: this notice is written to cover what the website actually does,
 * but it must be reviewed by the clinic's Data Protection Officer before launch, and
 * the DPO's real name and contact details filled in below. The National Privacy
 * Commission requires a registered DPO for organisations processing sensitive personal
 * information, which includes health data.
 */
const LAST_UPDATED = '19 September 2026';

export default async function PrivacyPage() {
  const settings = await getSiteSettings();

  return (
    <>
      <PageHeader
        title="Privacy notice"
        lead={`How ${settings.clinicName} handles your personal data under the Data Privacy Act of 2012 (Republic Act No. 10173).`}
      />

      <Container className="py-10">
        <Prose>
          <p className="text-sm text-ink-500">Last updated: {LAST_UPDATED}</p>

          <p>
            {settings.clinicName} is the personal information controller for the data
            described here. We ask for as little as we can, we use it only for the
            reasons set out below, and we do not sell it or share it for advertising.
          </p>

          <h2>What we collect, and why</h2>

          <h3>When you book an appointment</h3>
          <ul>
            <li>Your full name, so we know who is coming and can find you at the desk.</li>
            <li>
              Your mobile number, so we can reach you if the doctor is called away or the
              clinic has to close, and so you can look up your own booking later.
            </li>
            <li>Your email address, so we can send your confirmation and reference code.</li>
            <li>
              Anything you type into the notes box. Please keep this brief — it is not a
              medical record.
            </li>
            <li>
              The service, doctor and time you chose, and the date and time you gave your
              consent.
            </li>
          </ul>

          <h3>When you use the inquiry form</h3>
          <ul>
            <li>Your name, email address, optional mobile number, and your message.</li>
          </ul>

          <p>
            We do not ask for your medical history, test results or diagnosis through
            this website. Please do not send those to us through the inquiry form.
          </p>

          <h2>Our legal basis</h2>
          <p>
            For bookings, we rely on your consent, which you give by ticking the box on
            the booking form, and on the fact that the information is necessary for us to
            provide the service you asked for. For inquiries, we rely on your consent in
            sending us the message. You may withdraw consent at any time by contacting
            us, though we may not be able to keep your appointment if you do.
          </p>

          <h2>Who else sees it</h2>
          <p>
            Clinic staff who need it to do their work — reception and the doctor you are
            seeing. Beyond that, your data is held by service providers who process it
            only on our instructions:
          </p>
          <ul>
            <li>Our website and database hosting providers, who store the records.</li>
            <li>
              Our email provider, which delivers your confirmation and cancellation
              emails.
            </li>
          </ul>
          <p>
            We do not sell your data, and we do not share it with advertisers. We will
            only disclose it otherwise where the law requires it.
          </p>

          <h2>How long we keep it</h2>
          <p>
            Booking records are kept as part of the clinic&rsquo;s patient records, in
            line with the retention periods that apply to medical records in the
            Philippines. Messages sent through the inquiry form are kept only as long as
            needed to answer you and are then deleted.
          </p>

          <h2>How we protect it</h2>
          <p>
            Data is sent over an encrypted connection and stored on access-controlled
            servers. Staff accounts are individual and password-protected, and every
            change to a booking is logged against the member of staff who made it. We
            never put your name, number or any other personal detail into a web address,
            so your details do not end up in browser history, shared links or server logs.
          </p>

          <h2>Your rights</h2>
          <p>Under the Data Privacy Act you have the right to:</p>
          <ul>
            <li>Be told how your data is being used — which is what this notice is for.</li>
            <li>Ask for a copy of the data we hold about you.</li>
            <li>Have anything inaccurate corrected.</li>
            <li>Object to how we process it, or ask us to block or erase it.</li>
            <li>Ask for your data in a portable form.</li>
            <li>Be compensated for damage caused by misuse of your data.</li>
            <li>
              Complain to the National Privacy Commission if you believe your rights have
              been breached.
            </li>
          </ul>

          <h2>Cookies</h2>
          <p>
            This website sets no advertising or tracking cookies. Staff who log in to the
            clinic&rsquo;s admin area receive a single session cookie, which does nothing
            but keep them logged in and is deleted when they log out.
          </p>

          <h2>Cancelling and removing a booking</h2>
          <p>
            You can cancel your own booking using the link in your confirmation email, or
            with your reference code and the mobile number you booked with. Cancelling
            frees the slot for someone else. If you would like the record removed
            entirely, contact us and we will explain what we can delete and what we are
            required to keep.
          </p>

          <h2>Contact us about your data</h2>
          <p>
            Write to our Data Protection Officer at{' '}
            {settings.email ? (
              <a href={`mailto:${settings.email}`}>{settings.email}</a>
            ) : (
              'the clinic email address'
            )}
            , call {settings.phonePrimary || 'the clinic'}, or visit us at{' '}
            {settings.address || 'the clinic'}.
          </p>

          <h2>Changes to this notice</h2>
          <p>
            If we change how we handle your data we will update this page and change the
            date at the top.
          </p>

          <p className="text-sm">
            <Link href="/contact">Contact page</Link> ·{' '}
            <Link href="/book">Book an appointment</Link>
          </p>
        </Prose>
      </Container>
    </>
  );
}
