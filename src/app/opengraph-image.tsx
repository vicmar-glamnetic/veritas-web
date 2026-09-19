import { ImageResponse } from 'next/og';

import { getSiteSettings } from '@/lib/queries';

/**
 * The image Facebook shows when someone shares a link to the clinic. Most of our
 * traffic arrives from a Facebook post, so this is the first thing a patient sees.
 *
 * Drawn rather than photographed: it stays correct when the clinic's details change,
 * and there is no stock photo to license or keep up to date.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Veritas Clinic. Book an appointment online.';

export default async function OpengraphImage() {
  const settings = await getSiteSettings();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #0e6058 0%, #10786d 55%, #1f9686 100%)',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
          color: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 84,
              height: 84,
              borderRadius: 20,
              background: '#ffffff',
              color: '#0e6058',
              fontSize: 52,
              fontWeight: 700,
            }}
          >
            V
          </div>
          <div style={{ display: 'flex', marginLeft: 26, fontSize: 40, fontWeight: 700 }}>
            {settings.clinicName}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 66, fontWeight: 700, lineHeight: 1.1 }}>
            Book a slot, come at that time
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 22,
              fontSize: 31,
              lineHeight: 1.35,
              color: '#d3f2ea',
              maxWidth: 900,
            }}
          >
Consultations, blood tests, X-ray, ultrasound, ECG and 2D echo
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '2px solid rgba(255,255,255,0.28)',
            paddingTop: 26,
            fontSize: 26,
            color: '#eefaf7',
          }}
        >
          <div style={{ display: 'flex' }}>Nothing to pay online. You pay at the clinic.</div>
          {settings.phonePrimary ? (
            <div style={{ display: 'flex', fontWeight: 700 }}>{settings.phonePrimary}</div>
          ) : null}
        </div>
      </div>
    ),
    size,
  );
}
