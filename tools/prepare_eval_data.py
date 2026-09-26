#!/usr/bin/env python3
"""
Create an evaluation folder (clip.wav + clip.txt pairs) from the public FLEURS Bangla
test set, for use with `npx tsx scripts/evaluate.ts`.

    pip install -r tools/requirements.txt
    python tools/prepare_eval_data.py --out eval-data/fleurs-bn --count 100

FLEURS is clean read speech. Also test on real YouTube-style clips (music, noise,
casual speech): put your own clip.wav + clip.txt files in a folder and evaluate that too.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def iter_fleurs(split: str):
    from datasets import Audio, load_dataset

    last_error: Exception | None = None
    # Newer `datasets` releases cannot run loading scripts; the auto-converted Parquet
    # branch works with every version.
    for kwargs in ({"revision": "refs/convert/parquet"}, {}):
        try:
            ds = load_dataset("google/fleurs", "bn_in", split=split, streaming=True, **kwargs)
            ds = ds.cast_column("audio", Audio(sampling_rate=16000))
            yield from ds
            return
        except Exception as err:  # noqa: BLE001 - try the next way of loading
            last_error = err
    raise SystemExit(f"Could not load FLEURS: {last_error}")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", default="eval-data/fleurs-bn")
    p.add_argument("--count", type=int, default=100)
    p.add_argument("--split", default="test")
    args = p.parse_args()

    import numpy as np
    import soundfile as sf

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    n = 0
    for row in iter_fleurs(args.split):
        text = (row.get("transcription") or row.get("raw_transcription") or "").strip()
        audio = row["audio"]
        if not text:
            continue
        name = f"fleurs_{n:04d}"
        sf.write(out / f"{name}.wav", np.asarray(audio["array"], dtype=np.float32), 16000, subtype="PCM_16")
        (out / f"{name}.txt").write_text((row.get("raw_transcription") or text).strip() + "\n", encoding="utf-8")
        n += 1
        if n >= args.count:
            break
    print(f"Wrote {n} clips to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
