import { expect, test } from '@playwright/test';

test.skip(!process.env.E2E_PROD, 'PERF-1 is measured against the production build (E2E_PROD=1).');

for (const path of ['/', '/programs', '/directory', '/advisor', '/merit-lists', '/status', '/login']) {
  test(`PERF-1 ${path} shows content within 2 s on 4G`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Network throttling needs Chromium.');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 60,
      downloadThroughput: (9 * 1024 * 1024) / 8,
      uploadThroughput: (1.5 * 1024 * 1024) / 8,
    });
    await page.goto(path, { waitUntil: 'load' });
    const fcp = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const e = performance.getEntriesByName('first-contentful-paint')[0];
          if (e) return resolve(e.startTime);
          new PerformanceObserver((l) => resolve(l.getEntries()[0]!.startTime)).observe({
            type: 'paint',
            buffered: true,
          });
        }),
    );
    test.info().annotations.push({ type: 'first-contentful-paint', description: `${Math.round(fcp)} ms` });
    console.log(`PERF-1 ${path}: first contentful paint ${Math.round(fcp)} ms`);
    expect(fcp).toBeLessThan(2000);
  });
}
