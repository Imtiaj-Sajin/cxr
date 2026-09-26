import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');
const VIDEO = path.join(FIXTURES, 'speech-bn.webm');
const SRT = path.join(FIXTURES, 'sample.srt');

async function freshPage(page: Page, query = '?engine=mock&mockDelay=60') {
  await page.goto(`/${query}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/${query}`);
}

test('landing page is in Bangla by default and can switch to English', async ({ page }) => {
  await freshPage(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('বাংলা সাবটাইটেল');
  await page.getByTestId('lang-toggle').click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bangla subtitles in minutes');
  // The choice is remembered.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bangla subtitles in minutes');
});

test('full flow: upload video, transcribe, edit, preview caption, export SRT', async ({ page }) => {
  await freshPage(page);
  await page.getByTestId('file-input').setInputFiles(VIDEO);

  // Setup screen shows the decoded duration (0:14) once the audio is read.
  await expect(page.getByText('speech-bn.webm')).toBeVisible();
  await expect(page.getByTestId('start')).toBeEnabled({ timeout: 20_000 });
  await expect(page.locator('.file-meta')).toContainText('০:১৪');
  await page.getByTestId('start').click();

  await expect(page.getByTestId('progress')).toBeVisible();
  await expect(page.getByTestId('outcome')).toContainText('হয়ে গেছে', { timeout: 20_000 });
  const rows = page.getByTestId('segment');
  const count = await rows.count();
  // Two sentences separated by a 1.5 s pause become at least two cues.
  expect(count).toBeGreaterThanOrEqual(2);

  // Edit the first cue.
  const first = rows.first().locator('textarea');
  await first.fill('এটা আমার এডিট করা লাইন');

  // Seek into the first cue: the caption overlay shows the edited text.
  const start = await rows.first().locator('input.time').first().inputValue();
  expect(start).toMatch(/^0:0\d\.\d$/);
  await page.evaluate(() => {
    const v = document.querySelector('video')!;
    v.currentTime = 1.5;
  });
  await expect(page.getByTestId('caption')).toHaveText('এটা আমার এডিট করা লাইন');

  // Export SRT and check the content.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-srt').click()]);
  expect(download.suggestedFilename()).toBe('speech-bn.srt');
  const srt = await readFile(await download.path(), 'utf8');
  expect(srt.replace(/^﻿/, '')).toMatch(/^1\n00:00:0\d,\d{3} --> 00:00:0\d,\d{3}\nএটা আমার এডিট করা লাইন\n/);
  expect(srt).toContain(`\n${count}\n`);
});

test('import SRT, delete and undo, find & replace, export VTT', async ({ page }) => {
  await freshPage(page);
  await page.getByTestId('srt-input').setInputFiles(SRT);
  const rows = page.getByTestId('segment');
  await expect(rows).toHaveCount(3);
  await expect(page.getByText('এডিট দেখতে')).toHaveCount(0);

  await rows.nth(1).getByRole('button', { name: 'মুছে ফেলুন' }).click();
  await expect(rows).toHaveCount(2);
  await page.getByRole('button', { name: 'আনডু' }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1).locator('textarea')).toHaveValue('আজকে আমরা শিখব কিভাবে ভাত রান্না করতে হয়।');

  await page.getByRole('button', { name: 'খুঁজুন ও বদলান' }).click();
  await page.getByLabel('খুঁজুন', { exact: true }).fill('ভাত');
  await page.getByLabel('বদলে দিন').fill('পোলাও');
  await page.getByRole('button', { name: 'সব বদলান' }).click();
  await expect(page.getByText('১টি বদলানো হয়েছে')).toBeVisible();
  await expect(rows.nth(1).locator('textarea')).toHaveValue('আজকে আমরা শিখব কিভাবে পোলাও রান্না করতে হয়।');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-vtt').click()]);
  expect(download.suggestedFilename()).toBe('sample.vtt');
  const vtt = await readFile(await download.path(), 'utf8');
  expect(vtt.startsWith('WEBVTT\n\n00:00:00.500 --> 00:00:03.000\nআসসালামু আলাইকুম।')).toBe(true);
  expect(vtt).toContain('পোলাও');
});

test('split and merge cues, shift timing', async ({ page }) => {
  await freshPage(page);
  await page.getByTestId('srt-input').setInputFiles(SRT);
  const rows = page.getByTestId('segment');
  await expect(rows).toHaveCount(3);

  // Put the cursor after the first word of cue 2 and split.
  const ta = rows.nth(1).locator('textarea');
  await ta.click();
  await ta.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(4, 4));
  await rows.nth(1).getByRole('button', { name: 'কার্সরের জায়গায় ভাগ করুন' }).click();
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1).locator('textarea')).toHaveValue('আজকে');

  await rows.nth(1).getByRole('button', { name: 'পরেরটার সাথে জুড়ে দিন' }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1).locator('textarea')).toHaveValue('আজকে আমরা শিখব কিভাবে ভাত রান্না করতে হয়।');

  await page.getByRole('button', { name: 'সময় সরান' }).click();
  await page.getByLabel('সময় সরান', { exact: true }).last().fill('1');
  await page.getByRole('button', { name: 'প্রয়োগ করুন' }).click();
  await expect(rows.first().locator('input.time').first()).toHaveValue('0:01.5');
});

test('work is autosaved and can be resumed after reload', async ({ page }) => {
  await freshPage(page);
  await page.getByTestId('srt-input').setInputFiles(SRT);
  await page.getByTestId('segment').first().locator('textarea').fill('সেভ হওয়া লাইন');
  // Reload right away: the pagehide flush must save the edit even before the debounce.
  await page.reload();
  await expect(page.getByText('আগের কাজটা চালিয়ে যাবেন?')).toBeVisible();
  await page.getByRole('button', { name: 'খুলুন' }).click();
  await expect(page.getByTestId('segment').first().locator('textarea')).toHaveValue('সেভ হওয়া লাইন');
  await expect(page.getByText('সাবটাইটেল প্রিভিউ দেখতে')).toBeVisible();
});

test('stopping a transcription keeps the finished lines', async ({ page }) => {
  await freshPage(page, '?engine=mock&mockDelay=400');
  await page.getByTestId('file-input').setInputFiles(VIDEO);
  await expect(page.getByTestId('start')).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId('start').click();
  await expect(page.getByTestId('progress')).toBeVisible();
  await page.getByRole('button', { name: 'থামান' }).click();
  await expect(page.getByTestId('outcome')).toContainText('থামানো হয়েছে');
  await expect(page.getByTestId('progress')).toHaveCount(0);
});

test('burn subtitles into a video', async ({ page }) => {
  await freshPage(page);
  await page.getByTestId('file-input').setInputFiles(VIDEO);
  await expect(page.getByTestId('start')).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId('start').click();
  await expect(page.getByTestId('outcome')).toBeVisible({ timeout: 20_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByTestId('burn').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^speech-bn\.subtitled\.(webm|mp4)$/);
  const bytes = await readFile(await download.path());
  expect(bytes.length).toBeGreaterThan(20_000);
});

test('cancelling a burn stops it without downloading', async ({ page }) => {
  await freshPage(page);
  await page.getByTestId('file-input').setInputFiles(VIDEO);
  await expect(page.getByTestId('start')).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId('start').click();
  await expect(page.getByTestId('outcome')).toBeVisible({ timeout: 20_000 });
  let downloaded = false;
  page.on('download', () => (downloaded = true));
  await page.getByTestId('burn').click();
  await page.getByRole('button', { name: 'বাতিল' }).click();
  await expect(page.getByTestId('burn')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(downloaded).toBe(false);
});
