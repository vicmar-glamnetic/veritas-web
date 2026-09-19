import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/** Browser tab and bookmark icon: the clinic's mark on brand green. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0e6058',
          color: '#ffffff',
          fontSize: 22,
          fontWeight: 700,
          fontFamily: 'sans-serif',
          borderRadius: 7,
        }}
      >
        V
      </div>
    ),
    size,
  );
}
