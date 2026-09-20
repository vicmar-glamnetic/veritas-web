'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFormStatus } from 'react-dom';

import { nextAutoCategory, type QueueCategory } from '@/lib/queue';
import { formatManilaTime } from '@/lib/time';

import { callNext, issueWalkIn, recall } from './actions';

/**
 * The waiting-room board.
 *
 * Server-rendered in full, so the screen is correct before a single byte of JavaScript
 * runs and a browser with scripting off still shows the right patients — it just falls
 * back to the meta refresh at the bottom instead of the smooth one.
 *
 * What JavaScript adds: a refresh that repaints without the page flashing white, a
 * ticking clock, a brief dim when a number changes so the room notices, and an optional
 * spoken announcement.
 *
 * No web font is loaded here either. The reference codes use the system monospace stack
 * with tabular figures, which is what makes them line up and read across a room.
 */

const REFRESH_MS = 15_000;
const CLOCK_MS = 10_000;
const VOICE_KEY = 'veritas-monitor-voice';
const AUTO_KEY = 'veritas-monitor-auto';
const AUTO_SECONDS_KEY = 'veritas-monitor-auto-seconds';
const AUTO_CHOICES = [10, 30, 60, 120] as const;
const AUTO_DEFAULT = 30;

type Panel = {
  key: string;
  label: string;
  /** A walk-in may have no name yet; the number is what the room is waiting for. */
  serving: { ticket: string; name: string | null; detail: string | null } | null;
  waitingCount: number;
  next: { ticket: string; name: string | null }[];
};

type Announcement = { ticket: string; name: string | null; categoryLabel: string };

/**
 * Three categories, three colours already in the palette, so the board looks like the
 * rest of the clinic rather than a stock dashboard. Written out in full because Tailwind
 * cannot see a class name that was assembled from pieces at runtime.
 */
const ACCENT: Record<string, { text: string; bar: string; dot: string }> = {
  consultation: { text: 'text-brand-600', bar: 'bg-brand-600', dot: 'bg-brand-300' },
  laboratory: { text: 'text-accent-600', bar: 'bg-accent-600', dot: 'bg-accent-200' },
  imaging: { text: 'text-ink-700', bar: 'bg-ink-700', dot: 'bg-surface-sunken' },
};

/*
 * `bar` is for the panels, which sit on white; `dot` is the same hue picked light enough
 * to be seen on the dark control cards below them. The two are not interchangeable:
 * ink-700 on brand-800 is a dot nobody can find.
 */

/*
 * Reading the browser goes through useSyncExternalStore, not a setState inside an
 * effect. The server snapshot is the honest "not in a browser yet" answer, so the first
 * client render matches the HTML and React swaps in the real value itself: no cascading
 * render, and nothing to hydrate around.
 */
const neverChanges = () => () => {};
const onServer = () => false;
const inBrowser = () => true;

const voiceListeners = new Set<() => void>();

function subscribeVoice(onChange: () => void) {
  voiceListeners.add(onChange);
  return () => {
    voiceListeners.delete(onChange);
  };
}

function readVoice(): boolean {
  try {
    return window.localStorage.getItem(VOICE_KEY) === 'on';
  } catch {
    // Private browsing, or storage blocked. The toggle simply starts off.
    return false;
  }
}

function writeVoice(on: boolean) {
  try {
    window.localStorage.setItem(VOICE_KEY, on ? 'on' : 'off');
  } catch {
    // Not worth saying anything about: the toggle still works for this session.
  }
  for (const listener of voiceListeners) listener();
}

const autoListeners = new Set<() => void>();

function subscribeAuto(onChange: () => void) {
  autoListeners.add(onChange);
  return () => {
    autoListeners.delete(onChange);
  };
}

function readAuto(): boolean {
  try {
    return window.localStorage.getItem(AUTO_KEY) === 'on';
  } catch {
    return false;
  }
}

function readAutoSeconds(): number {
  try {
    const stored = Number(window.localStorage.getItem(AUTO_SECONDS_KEY));
    return AUTO_CHOICES.includes(stored as (typeof AUTO_CHOICES)[number]) ? stored : AUTO_DEFAULT;
  } catch {
    return AUTO_DEFAULT;
  }
}

function writeAuto(on: boolean, seconds?: number) {
  try {
    window.localStorage.setItem(AUTO_KEY, on ? 'on' : 'off');
    if (seconds !== undefined) window.localStorage.setItem(AUTO_SECONDS_KEY, String(seconds));
  } catch {
    // Storage blocked. The toggle still works for this session.
  }
  for (const listener of autoListeners) listener();
}

const autoSecondsOnServer = () => AUTO_DEFAULT;

const DIGIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** "VRT-7K4Q" read out as letters and whole digits, not attempted as a word. */
function speakableCode(code: string): string {
  return [...code]
    .map((char) => {
      if (char === '-') return ',';
      if (char >= '0' && char <= '9') return DIGIT_WORDS[Number(char)];
      return char;
    })
    .join(' ');
}

export function MonitorBoard({
  clinicName,
  dateLabel,
  initialTime,
  panels,
  announcement,
  showControls,
}: {
  clinicName: string;
  dateLabel: string;
  initialTime: string;
  panels: Panel[];
  announcement: Announcement | null;
  /** False on the wall screen (`?display=1`), which has nobody to press anything. */
  showControls: boolean;
}) {
  const router = useRouter();
  const [clock, setClock] = useState(initialTime);
  const [flashing, setFlashing] = useState<string[]>([]);
  const inClient = useSyncExternalStore(neverChanges, inBrowser, onServer);
  const voice = useSyncExternalStore(subscribeVoice, readVoice, onServer);
  const canSpeak = inClient && 'speechSynthesis' in window;
  const auto = useSyncExternalStore(subscribeAuto, readAuto, onServer);
  const autoSeconds = useSyncExternalStore(subscribeAuto, readAutoSeconds, autoSecondsOnServer);

  // Pull fresh data rather than reloading the document, so the board never blinks white
  // in front of the room. The <noscript> meta refresh below covers the other case.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => {
    const id = setInterval(() => setClock(formatManilaTime(new Date())), CLOCK_MS);
    return () => clearInterval(id);
  }, []);

  // Dim the number for a moment when it changes. The ref starts null so a fresh page
  // load, where every number is "new", does not set the whole board flashing.
  const previous = useRef<Record<string, string | null> | null>(null);
  useEffect(() => {
    const current: Record<string, string | null> = {};
    for (const panel of panels) current[panel.key] = panel.serving?.ticket ?? null;

    const before = previous.current;
    previous.current = current;
    if (!before) return;

    const changed = Object.keys(current).filter(
      (key) => current[key] && current[key] !== before[key],
    );
    if (changed.length === 0) return;

    setFlashing(changed);
    const id = setTimeout(() => setFlashing([]), 900);
    return () => clearTimeout(id);
  }, [panels]);

  /*
   * Announce a genuinely new call only.
   *
   * `undefined` means "nothing observed yet", and a plain null would not do: on a quiet
   * morning the board opens with no call at all, and the day's first patient would then
   * look like the load-time value and never be announced. The other way round, without
   * the guard entirely, every refresh of the page would shout at the room.
   */
  const lastAnnounced = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const code = announcement?.ticket ?? null;
    const previousCode = lastAnnounced.current;
    lastAnnounced.current = code;

    if (previousCode === undefined) return;
    if (!voice || !canSpeak || !code || code === previousCode) return;

    try {
      const utterance = new SpeechSynthesisUtterance(
        `Reference ${speakableCode(code)}. Please proceed to ${announcement!.categoryLabel}.`,
      );
      utterance.rate = 0.85;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      // A browser that refuses to speak should not take the board down with it.
    }
  }, [announcement, voice, canSpeak]);

  /*
   * Auto mode.
   *
   * Off by default, and deliberately not on the wall screen: `showControls` is false
   * there, and two screens both advancing the same queue on their own timers would
   * double-call every patient.
   *
   * It rotates one category per tick rather than advancing all three at once, so a
   * single number changes at a time. When nobody is waiting anywhere the timer is not
   * armed at all, so an empty clinic is quiet rather than firing into the void.
   */
  const autoPrevious = useRef<QueueCategory | null>(null);
  const autoBusy = useRef(false);
  const anyoneWaiting = panels.some((panel) => panel.waitingCount > 0);

  /*
   * The timer reads the panels through a ref rather than taking them as a dependency.
   *
   * `panels` is a fresh array on every server render, and the board pulls a fresh render
   * every 15 seconds, so depending on it tore the interval down and re-armed it four
   * times a minute. The timer then fired on whatever was left of 15 seconds instead of
   * the chosen gap — and at the default of 30 seconds it never fired at all, because it
   * was reset before it ever got there. `anyoneWaiting` is a boolean for the same
   * reason: it changes when the clinic empties, not on every refresh.
   */
  const latestPanels = useRef(panels);
  useEffect(() => {
    latestPanels.current = panels;
  });

  useEffect(() => {
    if (!auto || !showControls || !anyoneWaiting) return;

    const id = setInterval(() => {
      // A slow round trip must not stack up calls and empty the queue in one go.
      if (autoBusy.current) return;

      const target = nextAutoCategory(
        latestPanels.current.map((panel) => ({
          key: panel.key as QueueCategory,
          waitingCount: panel.waitingCount,
        })),
        autoPrevious.current,
      );
      if (!target) return;

      autoBusy.current = true;
      autoPrevious.current = target;

      const body = new FormData();
      body.set('category', target);
      void callNext(body).finally(() => {
        autoBusy.current = false;
      });
    }, autoSeconds * 1000);

    return () => clearInterval(id);
  }, [auto, autoSeconds, showControls, anyoneWaiting]);

  function toggleVoice() {
    const next = !voice;
    writeVoice(next);
    if (!next && canSpeak) window.speechSynthesis.cancel();
  }

  function toggleAuto() {
    autoPrevious.current = null;
    writeAuto(!auto);
  }

  return (
    <div className="flex min-h-screen flex-col bg-brand-900 p-[clamp(0.875rem,2vw,1.75rem)] text-white">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-brand-700 pb-[clamp(0.625rem,1.4vw,1.125rem)]">
        <h1 className="font-serif text-[clamp(1.25rem,3vw,2.125rem)] leading-tight">
          {clinicName}
          <span className="ml-3 align-middle text-[clamp(0.625rem,1.1vw,0.8125rem)] font-semibold tracking-[0.18em] text-brand-200 uppercase">
            Now serving
          </span>
        </h1>
        <p className="text-[clamp(0.9375rem,2vw,1.5rem)] font-medium text-brand-200 tabular-nums">
          <span suppressHydrationWarning>{clock}</span>
          <span className="ml-3 text-[0.72em] font-normal text-brand-300">{dateLabel}</span>
        </p>
      </header>

      {/*
       * The panels size to their content and the row is centred, rather than the grid
       * stretching down a 1080p screen. Stretching left each panel two thirds empty and,
       * because the queues are different lengths, put the three rules at three different
       * heights.
       */}
      <div className="flex flex-1 items-center py-[clamp(0.875rem,1.8vw,1.5rem)]">
        <div className="grid w-full grid-cols-1 gap-[clamp(0.75rem,1.4vw,1.25rem)] md:grid-cols-3">
          {panels.map((panel) => {
            const accent = ACCENT[panel.key] ?? ACCENT.imaging;
            const isFlashing = flashing.includes(panel.key);

            return (
              <section
                key={panel.key}
                aria-label={panel.label}
                className="flex min-h-[clamp(9rem,22vh,15rem)] flex-col rounded-xl bg-surface p-[clamp(1rem,2vw,1.625rem)] text-ink-900"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2
                    className={`text-[clamp(0.6875rem,1.2vw,0.9375rem)] font-semibold tracking-[0.14em] uppercase ${accent.text}`}
                  >
                    {panel.label}
                  </h2>
                  <p className="text-[clamp(0.6875rem,1vw,0.8125rem)] text-ink-500 tabular-nums">
                    {panel.waitingCount} waiting
                  </p>
                </div>

                {/* Fixed padding, not flex-1: this is what keeps the rule below at the
                    same height in all three panels. */}
                <div className="py-[clamp(1rem,3.2vw,2.75rem)]">
                  {panel.serving ? (
                    <>
                      <p
                        className={`font-mono text-[clamp(1.75rem,5.5vw,6rem)] leading-none font-semibold tracking-tight tabular-nums transition-opacity duration-200 ${
                          isFlashing ? 'opacity-25' : 'opacity-100'
                        }`}
                      >
                        {panel.serving.ticket}
                      </p>
                      <p className="mt-2 min-h-[1.5em] text-[clamp(0.875rem,1.6vw,1.25rem)] text-ink-700">
                        {panel.serving.name}
                        {panel.serving.detail && (
                          <span className="text-ink-500">
                            {panel.serving.name ? ' · ' : ''}
                            {panel.serving.detail}
                          </span>
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-mono text-[clamp(1.75rem,5.5vw,6rem)] leading-none font-semibold text-line-strong">
                        &mdash;
                      </p>
                      <p className="mt-2 text-[clamp(0.875rem,1.6vw,1.25rem)] text-ink-500">
                        No one called yet
                      </p>
                    </>
                  )}
                </div>

                {/*
                 * The queue reads down, not across. A waiting room wants to know how many
                 * are in front of it, and a single wrapped line of codes answered that
                 * badly while leaving most of a 1080p panel empty.
                 */}
                <div className="border-t border-line pt-[clamp(0.625rem,1.2vw,1rem)]">
                  <p className="flex items-center gap-2 text-[clamp(0.625rem,0.9vw,0.75rem)] font-semibold tracking-[0.14em] text-ink-500 uppercase">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${accent.bar}`}
                      aria-hidden
                    />
                    Next
                  </p>

                  {panel.next.length > 0 ? (
                    <ul className="mt-[clamp(0.5rem,0.9vw,0.75rem)] space-y-[clamp(0.25rem,0.6vw,0.5rem)]">
                      {panel.next.map((item) => (
                        <li
                          key={item.ticket}
                          className="flex items-baseline justify-between gap-3 text-[clamp(0.8125rem,1.15vw,1.0625rem)]"
                        >
                          <span className="font-mono text-ink-700 tabular-nums">{item.ticket}</span>
                          {item.name && <span className="text-ink-500">{item.name}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-[clamp(0.5rem,0.9vw,0.75rem)] text-[clamp(0.8125rem,1.15vw,1.0625rem)] text-ink-500">
                      Nobody else expected today
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <p
        aria-live="polite"
        className="flex min-h-[3rem] items-center rounded-lg bg-brand-800 px-[clamp(0.875rem,1.6vw,1.375rem)] py-3 text-[clamp(0.8125rem,1.4vw,1.0625rem)] text-brand-100"
      >
        {announcement ? (
          <span>
            <span className="font-mono font-semibold text-white tabular-nums">
              {announcement.ticket}
            </span>
            {' — '}
            {announcement.name ? `${announcement.name}, ` : ''}please proceed to{' '}
            {announcement.categoryLabel}.
          </span>
        ) : (
          <span>
            Please wait for your reference code to appear. It is on your booking confirmation.
          </span>
        )}
      </p>

      {showControls && (
        <section
          aria-label="Reception controls"
          className="mt-[clamp(0.625rem,1.2vw,1rem)] border-t border-brand-700 pt-[clamp(0.625rem,1.2vw,1rem)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h2 className="text-xs font-semibold tracking-[0.14em] text-brand-300 uppercase">
              Reception controls
            </h2>

            {/* Screen settings, kept away from the buttons that move the queue: pressing
                one of these changes what this screen does, never who is called next. */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleAuto}
                aria-pressed={auto}
                className={`min-h-9 rounded border px-3 py-1.5 text-xs font-medium ${
                  auto
                    ? 'border-brand-400 bg-brand-600 text-white'
                    : 'border-brand-400 text-brand-100 hover:bg-brand-800'
                }`}
              >
                Auto call: {auto ? 'on' : 'off'}
              </button>

              {/* The interval only appears once auto is on. A dropdown that governs a
                  switched-off feature is a question the desk cannot answer. */}
              {auto && (
                <label className="flex items-center gap-1.5 text-xs">
                  <span className="sr-only">Seconds between automatic calls</span>
                  <select
                    value={autoSeconds}
                    onChange={(event) => writeAuto(auto, Number(event.target.value))}
                    className="min-h-9 rounded border border-brand-400 bg-brand-800 px-2 py-1.5 text-xs text-brand-100"
                  >
                    {AUTO_CHOICES.map((seconds) => (
                      <option key={seconds} value={seconds}>
                        every {seconds}s
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {canSpeak && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  aria-pressed={voice}
                  className={`min-h-9 rounded border px-3 py-1.5 text-xs font-medium ${
                    voice
                      ? 'border-brand-400 bg-brand-600 text-white'
                      : 'border-brand-400 text-brand-100 hover:bg-brand-800'
                  }`}
                >
                  Speak numbers: {voice ? 'on' : 'off'}
                </button>
              )}

              <FullscreenButton />

              {/* A new tab, because the wall version replaces these controls and the desk
                  would otherwise have to find its way back. */}
              <Link
                href="/admin/monitor?display=1"
                target="_blank"
                rel="noopener"
                className="min-h-9 rounded border border-brand-400 px-3 py-1.5 text-xs font-medium text-brand-100 hover:bg-brand-800"
              >
                Open wall version<span className="sr-only"> in a new tab</span>
              </Link>

              <Link
                href="/admin"
                className="min-h-9 rounded border border-brand-400 px-3 py-1.5 text-xs font-medium text-brand-100 hover:bg-brand-800"
              >
                Back to admin
              </Link>
            </div>
          </div>

          {/*
           * One block per category, in the same order and colour as the panels above.
           *
           * The previous version was grouped the other way round — a row of call buttons,
           * a row of walk-in buttons, a row of undo links — which put the word
           * "Consultation" on three buttons that did three different things, told apart
           * only by a small caption at the left of each row that moved away on wrap.
           */}
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            {panels.map((panel) => (
              <CategoryControls
                key={panel.key}
                panel={panel}
                accent={ACCENT[panel.key] ?? ACCENT.imaging}
              />
            ))}
          </div>

          <p className="mt-3 text-xs text-brand-300">
            {auto && (
              <span className="text-brand-100">
                Auto call is on: the next number goes up every {autoSeconds} seconds, one
                category at a time. Turn it off to call patients yourself.{' '}
              </span>
            )}
            Numbers are handed out at reception when a patient is marked Arrived on Today.
          </p>
        </section>
      )}

      {/*
       * With JavaScript off there is no router.refresh(), so the board would freeze at
       * whatever it showed when the page opened. React 19 hoists a bare <meta> into
       * <head>, where it would reload the page for everyone, so it goes in as raw HTML.
       */}
      <noscript dangerouslySetInnerHTML={{ __html: '<meta http-equiv="refresh" content="30">' }} />
    </div>
  );
}

/**
 * Everything the desk can do to one category, in one place.
 *
 * The three actions sit under a heading carrying that category's name and accent, so the
 * block reads as "Consultation: call, walk-in, undo" rather than as three anonymous
 * buttons that happen to share a row with two other categories' buttons.
 *
 * All three are plain form posts, so they still work with JavaScript off.
 */
function CategoryControls({
  panel,
  accent,
}: {
  panel: Panel;
  accent: { text: string; bar: string; dot: string };
}) {
  const upNext = panel.next[0]?.ticket ?? null;
  const serving = panel.serving?.ticket ?? null;

  return (
    <div className="rounded-lg border border-brand-700 bg-brand-800 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-brand-100 uppercase">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${accent.dot}`} aria-hidden />
          {panel.label}
        </h3>
        <p className="text-xs text-brand-300 tabular-nums">
          {panel.waitingCount} waiting
          {serving && <span className="ml-2">on screen {serving}</span>}
        </p>
      </div>

      <form action={callNext} className="mt-2.5">
        <input type="hidden" name="category" value={panel.key} />
        <CallButton label={panel.label} waitingCount={panel.waitingCount} upNext={upNext} />
      </form>

      <div className="mt-2 flex gap-2">
        <form action={issueWalkIn} className="flex-1">
          <input type="hidden" name="category" value={panel.key} />
          <WalkInButton label={panel.label} />
        </form>
        <form action={recall} className="flex-1">
          <input type="hidden" name="category" value={panel.key} />
          <UndoButton label={panel.label} serving={serving} />
        </form>
      </div>
    </div>
  );
}

/*
 * The three buttons below each read useFormStatus, which is why they are components
 * rather than markup inside CategoryControls: the hook reports on the nearest enclosing
 * form, and only from inside it.
 *
 * Disabling while the post is in flight is the point. Without it a second tap on a slow
 * connection calls a second patient, and the room sees a number that nobody in it was
 * ready for.
 */

const SECONDARY =
  'min-h-9 w-full rounded border border-brand-400 px-2 py-1.5 text-xs font-medium text-brand-100 hover:bg-brand-700 disabled:cursor-not-allowed disabled:border-brand-700 disabled:text-brand-300/50 disabled:hover:bg-transparent';

/**
 * Named with the number it is about to call, so the desk can see what will land on the
 * wall before pressing, and an empty queue says so instead of offering a dead button
 * with no explanation.
 */
function CallButton({
  label,
  waitingCount,
  upNext,
}: {
  label: string;
  waitingCount: number;
  upNext: string | null;
}) {
  const { pending } = useFormStatus();
  const empty = waitingCount === 0;

  return (
    <button
      type="submit"
      disabled={empty || pending}
      // The accessible name contains the visible text, so somebody driving the screen by
      // voice can say what they can read.
      aria-label={
        empty
          ? `No one waiting for ${label}`
          : `Call ${upNext ?? 'next'}, the next ${label} number, ${waitingCount} waiting`
      }
      className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded border border-brand-400 bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:cursor-not-allowed disabled:border-brand-700 disabled:bg-transparent disabled:text-brand-300"
    >
      {pending ? (
        'Calling…'
      ) : empty ? (
        'No one waiting'
      ) : upNext ? (
        <>
          Call <span className="font-mono tabular-nums">{upNext}</span>
        </>
      ) : (
        'Call next'
      )}
    </button>
  );
}

/** A patient at the desk with no appointment still needs a place in the queue. */
function WalkInButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Walk-in: issue a new ${label} number for somebody at the desk`}
      className={SECONDARY}
    >
      {pending ? 'Adding…' : '+ Walk-in'}
    </button>
  );
}

/**
 * Undo names the number it will take back off the wall. "Undo" on its own is the kind of
 * button somebody presses to find out what it does.
 */
function UndoButton({ label, serving }: { label: string; serving: string | null }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={!serving || pending}
      aria-label={
        serving
          ? `Undo ${serving}: put it back at the front of the ${label} queue`
          : `Nothing to undo for ${label}`
      }
      className={SECONDARY}
    >
      {pending ? (
        'Undoing…'
      ) : serving ? (
        <>
          Undo <span className="font-mono tabular-nums">{serving}</span>
        </>
      ) : (
        'Undo'
      )}
    </button>
  );
}

/**
 * Hidden until it is known to work, because a dead button on a wall screen is worse.
 *
 * The label follows the actual state rather than staying on "Full screen" once the
 * screen is already full, so the way back out is the button you just pressed. Escape
 * also leaves full screen without going through here, which is why the state is read
 * from a `fullscreenchange` listener and not from what this button last did.
 */
function FullscreenButton() {
  const inClient = useSyncExternalStore(neverChanges, inBrowser, onServer);
  const [isFull, setIsFull] = useState(false);

  // Declared before the early return below, so the hook order never changes.
  useEffect(() => {
    const update = () => setIsFull(Boolean(document.fullscreenElement));
    update();
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  if (!inClient || !document.fullscreenEnabled) return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => {});
      }}
      className="min-h-9 rounded border border-brand-400 px-3 py-1.5 text-xs font-medium text-brand-100 hover:bg-brand-800"
    >
      {isFull ? 'Exit full screen' : 'Full screen'}
    </button>
  );
}
