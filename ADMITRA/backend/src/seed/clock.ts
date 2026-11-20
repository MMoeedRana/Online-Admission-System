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
  static override [Symbol.hasInstance](value: unknown) {
    return value instanceof RealDate;
  }
}

Object.defineProperty(ClockDate, 'name', { value: 'Date' });

export const DAY = 24 * 60 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;

export const realNow = () => new RealDate(RealDate.now());

export function installClock() {
  globalThis.Date = ClockDate as unknown as DateConstructor;
}

export function uninstallClock() {
  offset = 0;
  globalThis.Date = RealDate;
}

export function setClock(at: Date | number) {
  offset = new RealDate(at).getTime() - RealDate.now();
}

export async function at<T>(when: Date | number, fn: () => Promise<T>): Promise<T> {
  setClock(when);
  return fn();
}
