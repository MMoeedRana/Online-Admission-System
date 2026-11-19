/**
 * Simulated clock for the sample data only: the services run unchanged while `new Date()` and
 * `Date.now()` return the simulated moment, so timelines, receipts and deadlines look real.
 * Never used outside the seed command.
 */
const RealDate = Date;
let offset = 0;

class ClockDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...(args as [string | number | Date]));
  }
  static override now() {
    return RealDate.now() + offset;
  }
  /** Dates created before the clock was installed are still dates. */
  static override [Symbol.hasInstance](value: unknown) {
    return value instanceof RealDate;
  }
}

// Libraries recognise dates by the constructor name when they copy values.
Object.defineProperty(ClockDate, 'name', { value: 'Date' });

export const DAY = 24 * 60 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;

/** The real current time, whatever the simulated clock says. */
export const realNow = () => new RealDate(RealDate.now());

export function installClock() {
  globalThis.Date = ClockDate as unknown as DateConstructor;
}

export function uninstallClock() {
  offset = 0;
  globalThis.Date = RealDate;
}

/** Moves the simulated clock to `at`. */
export function setClock(at: Date | number) {
  offset = new RealDate(at).getTime() - RealDate.now();
}

/** Runs `fn` at the simulated moment `at`. */
export async function at<T>(when: Date | number, fn: () => Promise<T>): Promise<T> {
  setClock(when);
  return fn();
}
