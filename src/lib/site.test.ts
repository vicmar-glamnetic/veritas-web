import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveSiteUrl } from './site';

/**
 * These exist because a blank environment variable once failed an entire deployment
 * during prerender. Resolving the site URL must never throw, whatever it is handed.
 */
describe('resolveSiteUrl', () => {
  it('uses an explicit value', () => {
    assert.equal(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://veritasclinic.ph' }),
      'https://veritasclinic.ph',
    );
  });

  it('falls back to localhost when nothing is set', () => {
    assert.equal(resolveSiteUrl({}), 'http://localhost:3000');
  });

  it('treats a blank value as unset rather than throwing', () => {
    // The exact case that broke the build: the variable exists but is empty.
    assert.equal(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: '' }), 'http://localhost:3000');
    assert.equal(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: '   ' }), 'http://localhost:3000');
  });

  it('falls through a blank explicit value to the Vercel domain', () => {
    assert.equal(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: '',
        VERCEL_PROJECT_PRODUCTION_URL: 'veritas-web.vercel.app',
      }),
      'https://veritas-web.vercel.app',
    );
  });

  it("adds https to Vercel's scheme-less domain", () => {
    assert.equal(
      resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'veritasclinic.ph' }),
      'https://veritasclinic.ph',
    );
  });

  it('accepts a bare host pasted into a dashboard field', () => {
    assert.equal(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'veritasclinic.ph' }),
      'https://veritasclinic.ph',
    );
  });

  it('strips a trailing slash and any path', () => {
    assert.equal(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://veritasclinic.ph/' }),
      'https://veritasclinic.ph',
    );
    assert.equal(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://veritasclinic.ph/book' }),
      'https://veritasclinic.ph',
    );
  });

  it('keeps an explicit port, which local development needs', () => {
    assert.equal(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'http://localhost:4000' }),
      'http://localhost:4000',
    );
  });

  it('never throws on rubbish, it falls back', () => {
    for (const bad of ['://', 'http://', 'not a url at all', '%%%']) {
      assert.doesNotThrow(() => resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: bad }), `input ${bad}`);
    }
  });

  it('produces something new URL() can always parse', () => {
    for (const value of ['', '  ', 'veritasclinic.ph', 'https://x.test/', 'http://', undefined]) {
      const resolved = resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: value });
      assert.doesNotThrow(() => new URL(resolved), `resolved from ${JSON.stringify(value)}`);
    }
  });
});
