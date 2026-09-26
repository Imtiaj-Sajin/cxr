# কথা · Kotha

**Free, unlimited, private Bangla subtitles, generated entirely in your browser.**

Drop a Bangla video or audio file and Kotha writes the subtitles. Fix them in the built-in
editor, then download SRT/VTT for YouTube and Facebook, or a video with the subtitles
burned in. The speech model runs on your own device (GPU via WebGPU, or CPU via
WebAssembly), so **the file is never uploaded** and there is **no server cost**. The
whole site is static files.

| | |
|---|---|
| **Free & unlimited** | No per-minute limits, no sign-up. Hosting is static, so a million users cost the same as ten. |
| **Private** | Audio is decoded and transcribed inside the browser tab. Nothing leaves the device. |
| **Bangla-first** | Bangla UI, Bangla-aware line breaking (grapheme clusters, দাঁড়ি), Bangla digits, and support for Bangla fine-tuned models. |
| **Works offline** | After the first visit, the app and the model are cached by the browser. |

## Features

- Video and audio input (MP4, WEBM, MOV, MP3, WAV, M4A…), decoded with the browser's own codecs
- Speech detection that cuts audio at pauses, so cue timing is right even for models that can't predict timestamps
- Live progress: subtitles appear while transcription runs, and you can edit them straight away
- Editor with live caption preview, click-to-play per line, split at cursor, merge, insert, delete, undo/redo, find & replace, shift all timings, Bangla/English digits, দাঁড়ি normalisation
- Export **SRT**, **VTT** and **TXT**; **burn subtitles into a video** (WebM, rendered in the browser)
- Import existing SRT/VTT files to edit them
- Autosave to the browser (text and timings only, never the media), with resume on the next visit
- Warns when a Bangla run comes back mostly in another script (a sign the model failed)
- Bangla and English interface

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Use Chrome or Edge on a laptop or desktop for WebGPU (fast). Other browsers fall back to
the CPU, which works but is slower.

To try the UI without downloading a model, open `http://localhost:5173/?engine=mock`.
This uses a fake engine that returns sample Bangla lines.

## Getting a good Bangla model (important)

General Whisper models are weak at Bangla. A September 2026 benchmark measured OpenAI's
Whisper large-v3 at about **31% character error rate** on Bangla, and the small models
the browser can run are worse. Models **fine-tuned on Bangla** fix most of that. For
example, [`bangla-speech-processing/BanglaASR`](https://huggingface.co/bangla-speech-processing/BanglaASR)
(whisper-small, reported 4.6% WER on Common Voice) is small enough to run in a browser.

Fine-tuned checkpoints are published in PyTorch format, so they have to be converted once:

1. Open [`tools/convert_bangla_model.ipynb`](tools/convert_bangla_model.ipynb) in Google Colab or Kaggle (a free CPU is enough, ~10–15 min).
2. Set `TARGET_REPO` to `your-hf-username/bangla-asr-onnx` and run all cells. The model is converted, quantized and uploaded to your Hugging Face account.
3. Use it:
   - right away: open the app with `?model=your-hf-username/bangla-asr-onnx`, or paste the id under **Advanced → Custom model**
   - as the default for everyone: build with `VITE_BANGLA_MODEL_ID=your-hf-username/bangla-asr-onnx npm run build`

Or run the converter locally:

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r tools/requirements.txt
huggingface-cli login
python tools/convert_model.py --model bangla-speech-processing/BanglaASR \
    --output out/bangla-asr-onnx --push your-hf-username/bangla-asr-onnx
```

The converter exports the encoder and the merged decoder with Optimum and writes int8
files (CPU) and a 4-bit decoder (WebGPU). It also fills in the multilingual generation
settings that older fine-tunes lack, which transformers.js needs to force the Bangla
language token. Check the licence of the model you convert before publishing it.

### Measuring accuracy

```bash
python tools/prepare_eval_data.py --out eval-data/fleurs-bn --count 100   # public FLEURS Bangla test clips
npx tsx scripts/evaluate.ts --model out/bangla-asr-onnx --data eval-data/fleurs-bn
npx tsx scripts/evaluate.ts --model onnx-community/whisper-small --data eval-data/fleurs-bn   # baseline
```

`evaluate.ts` runs the exact pipeline the website uses and prints CER/WER. Any folder of
`clip.wav` + `clip.txt` pairs works, and real YouTube-style clips are the most
meaningful test.

## Deploying (free)

`npm run build` produces a static site in `dist/`.

- **Vercel** or **Netlify**: import the repo; the build command is `npm run build` and the output folder is `dist`. `vercel.json` and `public/_headers` already set the cross-origin isolation headers that let the CPU backend use several threads.
- **GitHub Pages** also works, but it cannot set those headers, so CPU transcription runs single-threaded (slower). WebGPU is unaffected.
- **Cloudflare Pages** is not recommended: it limits files to 25 MiB, and the ONNX Runtime WASM file is ~26 MB.

Models download from the Hugging Face CDN straight into the user's browser, so hosting
bandwidth stays tiny.

## Development

```bash
npm run typecheck
npm test                      # unit + integration tests (vitest)
./scripts/fetch-test-model.sh # one-time: a real whisper-tiny model for integration/e2e tests
npm run test:e2e              # Playwright (Chromium), against the dev server
E2E_PREVIEW=1 npm run test:e2e   # same suite against the production build
```

The integration and real-model e2e tests are skipped until `fetch-test-model.sh` has
downloaded whisper-tiny. The script gets it from the npm registry, so it works even
where the Hugging Face Hub is blocked.

### How it works

```
file ─► decode (OfflineAudioContext, 16 kHz mono)
     ─► speech detection + piece planning (src/lib/segmentation.ts)
     ─► Web Worker: transformers.js Whisper (WebGPU → WASM fallback) per piece (src/worker)
     ─► cleanup + cue splitting, Bangla-aware (src/lib/postprocess.ts)
     ─► editor (src/components) ─► SRT / VTT / TXT / burned-in video
```

| Path | What it does |
|---|---|
| `src/lib/segmentation.ts` | Energy-based voice activity detection. Packs speech into ≤12 s pieces that end at pauses (Whisper spends ~2 tokens per Bangla character, and a window holds at most 448 tokens). |
| `src/worker/core.ts` | Loads the model (WebGPU first, WASM fallback) and transcribes piece by piece, streaming cues back. Shared by the browser worker, the Node tests and `evaluate.ts`. |
| `src/lib/postprocess.ts` | Removes repetition loops and stock hallucinations, splits text into readable cues with proportional timing, wraps lines by visible Bangla characters. |
| `src/lib/burn.ts` | Canvas + MediaRecorder renderer for burned-in subtitles. |
| `src/lib/models.ts` | Model list and precision settings per backend. |
| `tools/` | Model conversion and evaluation-data scripts (Python). |

## Roadmap ideas

- Publish a converted Bangla model and make it the default
- Silero VAD for more robust speech detection in noisy audio and music
- Word-level timestamps for karaoke-style captions
- MP4 export for burned-in video (WebCodecs)
- Translation to English subtitles (Whisper `translate` task)
- PWA install and an offline-ready service worker

## Credits

Built by Imtiaj Sajin. Speech recognition by [Transformers.js](https://github.com/huggingface/transformers.js)
and [ONNX Runtime Web](https://onnxruntime.ai/), models by OpenAI Whisper and the Bangla
open-source community. Font: Noto Sans Bengali.
