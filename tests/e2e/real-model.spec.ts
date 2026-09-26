/**
 * End-to-end run of the real transcription worker in the browser (WASM backend) with a
 * tiny Whisper model served from /test-models/. Skipped when the model is not downloaded
 * (run `scripts/fetch-test-model.sh`).
 */
import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

const MODEL_FILE = path.resolve(
  import.meta.dirname,
  '../fixtures/models/Xenova/whisper-tiny/onnx/decoder_model_merged_quantized.onnx',
);
const VIDEO = path.resolve(import.meta.dirname, '../fixtures/speech-en.webm');

test.skip(!existsSync(MODEL_FILE), 'test model not downloaded');

test('real model transcribes speech in the browser worker', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?localModels=/test-models/&model=Xenova/whisper-tiny');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?localModels=/test-models/&model=Xenova/whisper-tiny');

  await page.getByTestId('file-input').setInputFiles(VIDEO);
  await expect(page.getByTestId('start')).toBeEnabled({ timeout: 30_000 });
  await page.locator('select').first().selectOption('english');
  await page.getByTestId('start').click();

  await expect(page.getByTestId('progress')).toBeVisible();
  await expect(page.getByTestId('outcome')).toContainText('হয়ে গেছে', { timeout: 200_000 });
  const texts = await page.getByTestId('segment').locator('textarea').evaluateAll((els) =>
    els.map((e) => (e as HTMLTextAreaElement).value),
  );
  expect(texts.join(' ').toLowerCase()).toContain('rice');
  expect(errors).toEqual([]);
});

test('warns when a weak model does not produce Bangla script', async ({ page }) => {
  test.setTimeout(240_000);
  const url = '/?localModels=/test-models/&model=Xenova/whisper-tiny';
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  // whisper-tiny cannot really transcribe Bangla; it answers in English, which the app detects.
  await page.getByTestId('file-input').setInputFiles(path.resolve(import.meta.dirname, '../fixtures/speech-bn.webm'));
  await expect(page.getByTestId('start')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('start').click();
  await expect(page.getByTestId('outcome')).toBeVisible({ timeout: 200_000 });
  await expect(page.getByTestId('wrong-script')).toBeVisible();
});
