/**
 * Demo seed for Veritas Clinic.
 *
 * Everything here is placeholder content chosen to be plausible for a private clinic
 * in the Philippines so the site can be demoed to the client. The clinic's real
 * address, phone numbers, doctors, session times and prices all need to be confirmed
 * and replaced before launch.
 *
 * Destructive: it clears the tables it owns and re-inserts. Run with --force if the
 * database already contains bookings.
 *
 *   npm run db:seed
 *   npm run db:seed -- --force
 */

import { config } from 'dotenv';

config({ path: ['.env.local', '.env'], quiet: true });

import { sql } from 'drizzle-orm';

import { createNodeDb } from './node-client';
import {
  bookingEvents,
  bookings,
  doctors,
  patients,
  promos,
  serviceDoctors,
  services,
  sessionBlackouts,
  sessions,
  siteSettings,
  staffSessions,
  staffUsers,
} from './schema';
import { hashPassword } from '../lib/password';
import { addDays, manilaDateString } from '../lib/time';

const force = process.argv.includes('--force');

/* -------------------------------------------------------------------------- */
/* Reference data                                                             */
/* -------------------------------------------------------------------------- */

const DOCTORS = [
  {
    key: 'reyes',
    fullName: 'Dra. Maria Elena Reyes',
    specialty: 'Family Medicine',
    bio: 'Family physician with 18 years in community practice. Handles adult and adolescent general consultations, hypertension and diabetes follow-up, and medical certificates.',
    sortOrder: 1,
  },
  {
    key: 'santos',
    fullName: 'Dr. Jose Antonio Santos',
    specialty: 'Internal Medicine',
    bio: 'Internist focused on diabetes, thyroid disease and adult preventive check-ups. Reads the clinic laboratory panels.',
    sortOrder: 2,
  },
  {
    key: 'villanueva',
    fullName: 'Dra. Carmela Villanueva',
    specialty: 'Cardiology',
    bio: 'Cardiologist. Reads the clinic ECG and 2D echocardiogram studies and sees patients for chest pain, palpitations and blood pressure management.',
    sortOrder: 3,
  },
  {
    key: 'lim',
    fullName: 'Dr. Ramon Lim',
    specialty: 'Pediatrics',
    bio: 'Pediatrician seeing newborns through adolescents for well-child visits, immunisation and acute illness.',
    sortOrder: 4,
  },
] as const;

type ServiceSeed = {
  key: string;
  name: string;
  category: 'consultation' | 'laboratory' | 'imaging';
  price: string;
  duration: number;
  bookable: boolean;
  listed: boolean;
  prep?: string;
};

const CONSULTATIONS: ServiceSeed[] = [
  { key: 'c-family', name: 'Family Medicine Consultation', category: 'consultation', price: '500.00', duration: 20, bookable: true, listed: false },
  { key: 'c-internal', name: 'Internal Medicine Consultation', category: 'consultation', price: '600.00', duration: 20, bookable: true, listed: false },
  { key: 'c-cardio', name: 'Cardiology Consultation', category: 'consultation', price: '800.00', duration: 30, bookable: true, listed: false },
  { key: 'c-pedia', name: 'Pediatric Consultation', category: 'consultation', price: '600.00', duration: 20, bookable: true, listed: false },
  { key: 'c-followup', name: 'Follow-up Consultation', category: 'consultation', price: '350.00', duration: 15, bookable: true, listed: false, prep: 'Please bring your previous prescription, laboratory results and any maintenance medicines you are taking.' },
];

const LABORATORY: ServiceSeed[] = [
  { key: 'l-cbc', name: 'Complete Blood Count (CBC)', category: 'laboratory', price: '250.00', duration: 15, bookable: true, listed: true },
  { key: 'l-ua', name: 'Urinalysis', category: 'laboratory', price: '150.00', duration: 15, bookable: true, listed: true, prep: 'Midstream urine sample. First-morning urine gives the clearest result.' },
  { key: 'l-fecal', name: 'Fecalysis', category: 'laboratory', price: '150.00', duration: 15, bookable: true, listed: true },
  { key: 'l-fbs', name: 'Fasting Blood Sugar (FBS)', category: 'laboratory', price: '150.00', duration: 15, bookable: true, listed: true, prep: 'Fasting for 8 hours is required. Water is allowed. Do not eat or drink anything else after 10 PM the night before.' },
  { key: 'l-rbs', name: 'Random Blood Sugar (RBS)', category: 'laboratory', price: '150.00', duration: 15, bookable: true, listed: true },
  { key: 'l-blood-type', name: 'Blood Typing (ABO + Rh)', category: 'laboratory', price: '200.00', duration: 15, bookable: true, listed: true },
  { key: 'l-lipid', name: 'Lipid Profile', category: 'laboratory', price: '750.00', duration: 15, bookable: true, listed: true, prep: 'Fasting for 10 to 12 hours is required. Water is allowed.' },
  { key: 'l-chol', name: 'Total Cholesterol', category: 'laboratory', price: '250.00', duration: 15, bookable: true, listed: true, prep: 'Fasting for 10 to 12 hours is required. Water is allowed.' },
  { key: 'l-trig', name: 'Triglycerides', category: 'laboratory', price: '280.00', duration: 15, bookable: true, listed: true, prep: 'Fasting for 10 to 12 hours is required. Water is allowed.' },
  { key: 'l-uric', name: 'Uric Acid', category: 'laboratory', price: '250.00', duration: 15, bookable: true, listed: true },
  { key: 'l-crea', name: 'Creatinine', category: 'laboratory', price: '250.00', duration: 15, bookable: true, listed: true },
  { key: 'l-bun', name: 'Blood Urea Nitrogen (BUN)', category: 'laboratory', price: '280.00', duration: 15, bookable: true, listed: true },
  { key: 'l-sgpt', name: 'SGPT / ALT', category: 'laboratory', price: '280.00', duration: 15, bookable: true, listed: true },
  { key: 'l-sgot', name: 'SGOT / AST', category: 'laboratory', price: '280.00', duration: 15, bookable: true, listed: true },
  { key: 'l-hba1c', name: 'HbA1c (Glycated Haemoglobin)', category: 'laboratory', price: '750.00', duration: 15, bookable: true, listed: true },
  { key: 'l-ogtt', name: 'Oral Glucose Tolerance Test (75g)', category: 'laboratory', price: '900.00', duration: 15, bookable: true, listed: true, prep: 'Fasting for 8 hours is required. Allow about 2 hours at the clinic — blood is drawn before and after the glucose drink.' },
  { key: 'l-lytes', name: 'Serum Electrolytes (Na, K, Cl)', category: 'laboratory', price: '700.00', duration: 15, bookable: true, listed: true },
  { key: 'l-hbsag', name: 'Hepatitis B Surface Antigen (HBsAg)', category: 'laboratory', price: '400.00', duration: 15, bookable: true, listed: true },
  { key: 'l-tsh', name: 'Thyroid Stimulating Hormone (TSH)', category: 'laboratory', price: '650.00', duration: 15, bookable: true, listed: true },
  { key: 'l-thyroid', name: 'Thyroid Panel (TSH, FT3, FT4)', category: 'laboratory', price: '1800.00', duration: 15, bookable: true, listed: true },
  { key: 'l-dengue', name: 'Dengue NS1 Antigen', category: 'laboratory', price: '1200.00', duration: 15, bookable: true, listed: true },
  { key: 'l-pt', name: 'Pregnancy Test (Serum)', category: 'laboratory', price: '350.00', duration: 15, bookable: true, listed: true },
  { key: 'l-pap', name: 'Pap Smear', category: 'laboratory', price: '800.00', duration: 15, bookable: false, listed: true, prep: 'Not done during your monthly period. Avoid intercourse, douching and vaginal medicines for 48 hours before the test.' },
];

const IMAGING: ServiceSeed[] = [
  { key: 'i-cxr-pa', name: 'Chest X-ray (PA view)', category: 'imaging', price: '450.00', duration: 30, bookable: true, listed: true, prep: 'Please wear a top without metal buttons, zips or underwire.' },
  { key: 'i-cxr-pal', name: 'Chest X-ray (PA and Lateral)', category: 'imaging', price: '700.00', duration: 30, bookable: true, listed: true, prep: 'Please wear a top without metal buttons, zips or underwire.' },
  { key: 'i-uts-abdomen', name: 'Whole Abdomen Ultrasound', category: 'imaging', price: '1500.00', duration: 30, bookable: true, listed: true, prep: 'Fasting for 8 hours is required. Drink 4 glasses of water an hour before your appointment and do not urinate — a full bladder is needed.' },
  { key: 'i-uts-kub', name: 'Kidney, Ureter and Bladder (KUB) Ultrasound', category: 'imaging', price: '1200.00', duration: 30, bookable: true, listed: true, prep: 'Drink 4 glasses of water an hour before your appointment and do not urinate — a full bladder is needed.' },
  { key: 'i-uts-pelvic', name: 'Pelvic Ultrasound', category: 'imaging', price: '1200.00', duration: 30, bookable: true, listed: true, prep: 'Drink 4 glasses of water an hour before your appointment and do not urinate — a full bladder is needed.' },
  { key: 'i-uts-tvs', name: 'Transvaginal Ultrasound', category: 'imaging', price: '1600.00', duration: 30, bookable: true, listed: true, prep: 'Please empty your bladder just before the scan.' },
  { key: 'i-uts-thyroid', name: 'Thyroid Ultrasound', category: 'imaging', price: '1400.00', duration: 30, bookable: true, listed: true },
  { key: 'i-uts-breast', name: 'Breast Ultrasound', category: 'imaging', price: '1600.00', duration: 30, bookable: true, listed: true, prep: 'Please do not wear talcum powder, lotion or deodorant on the day of the scan.' },
  { key: 'i-ecg', name: 'Electrocardiogram (12-lead ECG)', category: 'imaging', price: '500.00', duration: 30, bookable: true, listed: true },
  { key: 'i-2decho', name: '2D Echocardiogram with Doppler', category: 'imaging', price: '3500.00', duration: 30, bookable: true, listed: true, prep: 'No special preparation. Allow about 45 minutes at the clinic. Please wear a two-piece outfit if possible.' },
];

const ALL_SERVICES = [...CONSULTATIONS, ...LABORATORY, ...IMAGING];

/** Which doctors deliver which consultation service. */
const SERVICE_DOCTORS: Record<string, readonly string[]> = {
  'c-family': ['reyes'],
  'c-internal': ['santos'],
  'c-cardio': ['villanueva'],
  'c-pedia': ['lim'],
  'c-followup': ['reyes', 'santos', 'villanueva', 'lim'],
};

const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6;

type SessionSeed = {
  doctorKey: string | null;
  category: 'consultation' | 'laboratory' | 'imaging';
  days: readonly number[];
  start: string;
  end: string;
  slotMinutes: number;
  capacity: number;
  onlineCapacity: number;
  cutoffHours: number;
};

const SESSIONS: SessionSeed[] = [
  // Consultation clinics
  { doctorKey: 'reyes', category: 'consultation', days: [MON, WED, FRI], start: '09:00:00', end: '12:00:00', slotMinutes: 20, capacity: 9, onlineCapacity: 6, cutoffHours: 2 },
  { doctorKey: 'reyes', category: 'consultation', days: [TUE, THU], start: '13:00:00', end: '16:00:00', slotMinutes: 20, capacity: 9, onlineCapacity: 6, cutoffHours: 2 },
  { doctorKey: 'santos', category: 'consultation', days: [TUE, THU], start: '13:00:00', end: '17:00:00', slotMinutes: 20, capacity: 12, onlineCapacity: 8, cutoffHours: 2 },
  { doctorKey: 'santos', category: 'consultation', days: [SAT], start: '09:00:00', end: '12:00:00', slotMinutes: 20, capacity: 9, onlineCapacity: 6, cutoffHours: 4 },
  { doctorKey: 'villanueva', category: 'consultation', days: [WED, SAT], start: '09:00:00', end: '12:00:00', slotMinutes: 30, capacity: 6, onlineCapacity: 4, cutoffHours: 4 },
  { doctorKey: 'lim', category: 'consultation', days: [MON, WED, FRI], start: '14:00:00', end: '17:00:00', slotMinutes: 20, capacity: 9, onlineCapacity: 6, cutoffHours: 2 },

  // Laboratory — extractions run early, cut-off is long because most panels need fasting.
  { doctorKey: null, category: 'laboratory', days: [MON, TUE, WED, THU, FRI], start: '07:00:00', end: '11:00:00', slotMinutes: 15, capacity: 4, onlineCapacity: 2, cutoffHours: 12 },
  { doctorKey: null, category: 'laboratory', days: [SAT], start: '07:00:00', end: '10:00:00', slotMinutes: 15, capacity: 4, onlineCapacity: 2, cutoffHours: 12 },

  // Imaging — one machine, one patient at a time, plus a walk-in seat held back.
  { doctorKey: null, category: 'imaging', days: [MON, TUE, WED, THU, FRI], start: '08:00:00', end: '12:00:00', slotMinutes: 30, capacity: 2, onlineCapacity: 1, cutoffHours: 6 },
  { doctorKey: null, category: 'imaging', days: [MON, TUE, WED, THU, FRI], start: '13:00:00', end: '16:00:00', slotMinutes: 30, capacity: 2, onlineCapacity: 1, cutoffHours: 6 },
  { doctorKey: null, category: 'imaging', days: [SAT], start: '08:00:00', end: '12:00:00', slotMinutes: 30, capacity: 2, onlineCapacity: 1, cutoffHours: 6 },
];

/* -------------------------------------------------------------------------- */
/* Seed                                                                       */
/* -------------------------------------------------------------------------- */

const { db, pool } = createNodeDb();

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Seed inconsistency: ${what} was not inserted.`);
  return value;
}

async function main() {
  const existingBookings = await db.select({ n: sql<number>`count(*)::int` }).from(bookings);
  if ((existingBookings[0]?.n ?? 0) > 0 && !force) {
    throw new Error(
      `Refusing to seed: ${existingBookings[0].n} booking(s) already exist. ` +
        'Re-run with --force if you are sure this is a throwaway database.',
    );
  }

  console.log('Clearing existing data…');
  await db.delete(bookingEvents);
  await db.delete(bookings);
  await db.delete(sessionBlackouts);
  await db.delete(sessions);
  await db.delete(serviceDoctors);
  await db.delete(services);
  await db.delete(doctors);
  await db.delete(patients);
  await db.delete(promos);
  await db.delete(staffSessions);
  await db.delete(staffUsers);
  await db.delete(siteSettings);

  console.log('Inserting site settings…');
  await db.insert(siteSettings).values({
    id: 1,
    clinicName: 'Veritas Clinic',
    address: '2nd Floor, Veritas Building, 118 Rizal Avenue, Poblacion, Tanauan City, Batangas 4232',
    phonePrimary: '(043) 702 1234',
    phoneSecondary: '0917 800 1234',
    email: 'frontdesk@veritasclinic.ph',
    facebookUrl: 'https://www.facebook.com/veritasclinicph',
    openingHoursText:
      'Monday to Friday, 7:00 AM to 5:00 PM\nSaturday, 7:00 AM to 12:00 NN\nSunday and public holidays, closed',
    mapEmbedUrl: null,
    bookingHorizonDays: 30,
  });

  console.log('Inserting doctors…');
  const doctorRows = await db
    .insert(doctors)
    .values(
      DOCTORS.map((d) => ({
        fullName: d.fullName,
        specialty: d.specialty,
        bio: d.bio,
        sortOrder: d.sortOrder,
        isActive: true,
        photoUrl: null,
      })),
    )
    .returning({ id: doctors.id, fullName: doctors.fullName });

  // Map by name, not by array position: multi-row INSERT ... RETURNING is not
  // guaranteed to hand rows back in the order they were supplied.
  const doctorIdByName = new Map(doctorRows.map((r) => [r.fullName, r.id]));
  const doctorIdByKey = new Map<string, string>(
    DOCTORS.map((d) => [d.key, required(doctorIdByName.get(d.fullName), `doctor ${d.fullName}`)]),
  );

  console.log(`Inserting ${ALL_SERVICES.length} services…`);
  const serviceRows = await db
    .insert(services)
    .values(
      ALL_SERVICES.map((s, i) => ({
        name: s.name,
        category: s.category,
        pricePhp: s.price,
        durationMinutes: s.duration,
        isBookableOnline: s.bookable,
        isListedOnline: s.listed,
        prepInstructions: s.prep ?? null,
        sortOrder: i,
        isActive: true,
      })),
    )
    .returning({ id: services.id, name: services.name });

  const serviceIdByName = new Map(serviceRows.map((r) => [r.name, r.id]));
  const serviceIdByKey = new Map<string, string>(
    ALL_SERVICES.map((s) => [s.key, required(serviceIdByName.get(s.name), `service ${s.name}`)]),
  );

  console.log('Linking doctors to consultation services…');
  const links = Object.entries(SERVICE_DOCTORS).flatMap(([serviceKey, doctorKeys]) =>
    doctorKeys.map((doctorKey) => ({
      serviceId: required(serviceIdByKey.get(serviceKey), `service key ${serviceKey}`),
      doctorId: required(doctorIdByKey.get(doctorKey), `doctor key ${doctorKey}`),
    })),
  );
  await db.insert(serviceDoctors).values(links);

  console.log('Inserting weekly sessions…');
  const sessionValues = SESSIONS.flatMap((s) =>
    s.days.map((day) => ({
      doctorId: s.doctorKey ? required(doctorIdByKey.get(s.doctorKey), `doctor key ${s.doctorKey}`) : null,
      serviceCategory: s.category,
      dayOfWeek: day,
      startTime: s.start,
      endTime: s.end,
      slotMinutes: s.slotMinutes,
      capacity: s.capacity,
      onlineCapacity: s.onlineCapacity,
      bookingCutoffHours: s.cutoffHours,
      isActive: true,
    })),
  );
  const sessionRows = await db.insert(sessions).values(sessionValues).returning({ id: sessions.id });
  console.log(`  ${sessionRows.length} session rows`);

  console.log('Inserting a sample blackout…');
  const today = manilaDateString();
  await db.insert(sessionBlackouts).values({
    sessionId: null,
    doctorId: null,
    date: addDays(today, 14),
    reason: 'Clinic closed — annual deep cleaning and equipment servicing',
  });

  console.log('Inserting promos…');
  await db.insert(promos).values([
    {
      title: 'Free blood pressure and blood sugar check every Wednesday',
      body:
        'Walk in any Wednesday between 8:00 AM and 11:00 AM for a free blood pressure reading and random blood sugar check. No appointment needed, no purchase required. Especially for patients aged 40 and above.',
      imageUrl: null,
      startsOn: addDays(today, -7),
      endsOn: addDays(today, 60),
      isActive: true,
      sortOrder: 1,
    },
    {
      title: 'Executive Check-up Package — ₱2,499',
      body:
        'Complete Blood Count, Urinalysis, Fasting Blood Sugar, Lipid Profile, Creatinine, SGPT, Uric Acid, Chest X-ray and 12-lead ECG, with a follow-up consultation to go through the results. Normally ₱4,160. Fasting for 10 hours is required.',
      imageUrl: null,
      startsOn: addDays(today, -3),
      endsOn: addDays(today, 45),
      isActive: true,
      sortOrder: 2,
    },
  ]);

  console.log('Inserting admin user…');
  const adminEmail = (process.env.ADMIN_SEED_EMAIL ?? '').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? '';
  if (!adminEmail || !adminPassword) {
    throw new Error('ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set to seed the admin user.');
  }
  await db.insert(staffUsers).values({
    name: 'Clinic Administrator',
    email: adminEmail,
    passwordHash: await hashPassword(adminPassword),
    role: 'admin',
    isActive: true,
  });

  console.log('\nSeed complete.');
  console.log(`  doctors:  ${doctorRows.length}`);
  console.log(`  services: ${serviceRows.length} (${CONSULTATIONS.length} consultation, ${LABORATORY.length} laboratory, ${IMAGING.length} imaging)`);
  console.log(`  sessions: ${sessionRows.length}`);
  console.log(`  admin:    ${adminEmail}`);
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\nSeed failed:', error);
    await pool.end().catch(() => {});
    process.exit(1);
  });
