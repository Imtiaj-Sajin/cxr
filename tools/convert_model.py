#!/usr/bin/env python3
"""
Convert a (Bangla fine-tuned) Whisper model into the browser format Kotha uses.

The output folder follows the transformers.js layout:

    <output>/
      config.json, generation_config.json, tokenizer files, preprocessor_config.json
      onnx/encoder_model.onnx                   (fp32, used with WebGPU)
      onnx/encoder_model_quantized.onnx         (int8, used on CPU / WASM)
      onnx/decoder_model_merged_q4.onnx         (4-bit, used with WebGPU)
      onnx/decoder_model_merged_quantized.onnx  (int8, used on CPU / WASM)

Example (about 10 minutes on a normal laptop or a free Colab/Kaggle CPU):

    pip install -r tools/requirements.txt
    python tools/convert_model.py \\
        --model bangla-speech-processing/BanglaASR \\
        --output out/bangla-asr-onnx \\
        --push your-hf-username/bangla-asr-onnx

Then open the app with ?model=your-hf-username/bangla-asr-onnx, or build it with
VITE_BANGLA_MODEL_ID=your-hf-username/bangla-asr-onnx to make it the default.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

# Generation settings transformers.js needs to force the language and task. Many
# fine-tuned checkpoints were saved with older libraries and are missing some of them.
GENERATION_KEYS_FROM_BASE = [
    "lang_to_id",
    "task_to_id",
    "is_multilingual",
    "no_timestamps_token_id",
    "alignment_heads",
    "begin_suppress_tokens",
    "suppress_tokens",
    "max_initial_timestamp_index",
    "decoder_start_token_id",
    "bos_token_id",
    "eos_token_id",
    "pad_token_id",
]

MODEL_CARD = """---
library_name: transformers.js
base_model: {source}
pipeline_tag: automatic-speech-recognition
language:
- bn
tags:
- whisper
- bangla
- onnx
---

# {name}

ONNX version of [{source}](https://huggingface.co/{source}) for in-browser speech
recognition with [Transformers.js](https://huggingface.co/docs/transformers.js), converted
with the Kotha converter (`tools/convert_model.py`).

| File | Precision | Used for |
|---|---|---|
| `onnx/encoder_model.onnx` | fp32 | WebGPU |
| `onnx/encoder_model_quantized.onnx` | int8 | CPU (WASM) |
| `onnx/decoder_model_merged_q4.onnx` | 4-bit | WebGPU |
| `onnx/decoder_model_merged_quantized.onnx` | int8 | CPU (WASM) |

All credit for the trained weights goes to the authors of the original model. The license
of the original model applies to these files.
"""


def log(msg: str) -> None:
    print(f"[convert] {msg}", flush=True)


def export_onnx(model: str, workdir: Path) -> Path:
    """Export encoder + merged decoder (with KV cache) using Hugging Face Optimum."""
    from optimum.exporters.onnx import main_export

    out = workdir / "export"
    log(f"Exporting {model} to ONNX (this downloads the model the first time)...")
    main_export(
        model_name_or_path=model,
        output=out,
        task="automatic-speech-recognition-with-past",
        do_validation=False,
    )
    if not (out / "decoder_model_merged.onnx").exists():
        raise SystemExit(
            "Optimum did not produce decoder_model_merged.onnx. Please update optimum-onnx "
            "(pip install -U 'optimum-onnx[onnxruntime]')."
        )
    return out


def quantize_int8(src: Path, dst: Path) -> None:
    from onnxruntime.quantization import QuantType, quantize_dynamic

    log(f"int8: {src.name} -> {dst.name}")
    quantize_dynamic(
        model_input=str(src),
        model_output=str(dst),
        weight_type=QuantType.QUInt8,
        op_types_to_quantize=["MatMul", "Gemm", "Gather"],
        extra_options={"EnableSubgraph": True},  # the merged decoder keeps its graphs in If branches
    )


def quantize_q4(src: Path, dst: Path, block_size: int = 32) -> None:
    import onnx

    try:
        from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer as Quantizer
    except ImportError:  # older onnxruntime
        from onnxruntime.quantization.matmul_4bits_quantizer import MatMul4BitsQuantizer as Quantizer

    from onnxruntime.quantization import QuantType, quantize_dynamic

    log(f"4-bit: {src.name} -> {dst.name}")
    model = onnx.load(str(src))
    quantizer = Quantizer(model, block_size=block_size, is_symmetric=True)
    quantizer.process()
    with tempfile.TemporaryDirectory() as tmp:
        q4_only = Path(tmp) / "q4.onnx"
        onnx.save_model(quantizer.model.model, str(q4_only))
        # MatMulNBits only covers matrix multiplications. The token embedding table (a Gather)
        # is the single largest tensor, so store it as 8-bit as well.
        quantize_dynamic(
            model_input=str(q4_only),
            model_output=str(dst),
            weight_type=QuantType.QUInt8,
            op_types_to_quantize=["Gather"],
            extra_options={"EnableSubgraph": True},
        )


def patch_generation_config(output: Path, base: str) -> None:
    """Fill in multilingual generation settings from the base Whisper model."""
    from transformers import GenerationConfig

    path = output / "generation_config.json"
    current = json.loads(path.read_text()) if path.exists() else {}
    base_cfg = GenerationConfig.from_pretrained(base).to_dict()
    added = []
    for key in GENERATION_KEYS_FROM_BASE:
        if current.get(key) in (None, [], {}) and base_cfg.get(key) not in (None, [], {}):
            current[key] = base_cfg[key]
            added.append(key)
    # A fine-tune that hard-codes forced_decoder_ids would fight with the language we pass.
    if current.get("forced_decoder_ids"):
        current["forced_decoder_ids"] = None
        added.append("forced_decoder_ids=None")
    if "<|bn|>" not in (current.get("lang_to_id") or {}):
        raise SystemExit("The generation config has no <|bn|> language token; is this a multilingual Whisper model?")
    path.write_text(json.dumps(current, indent=2, ensure_ascii=False) + "\n")
    log(f"generation_config.json: filled {', '.join(added) if added else 'nothing (already complete)'}")


def check_tokenizer(output: Path, base: str) -> None:
    from transformers import AutoTokenizer

    tok = AutoTokenizer.from_pretrained(str(output))
    base_tok = AutoTokenizer.from_pretrained(base)
    if len(tok) != len(base_tok):
        log(f"WARNING: vocabulary size {len(tok)} differs from base {len(base_tok)}")
    sample = "আমার সোনার বাংলা"
    if tok.decode(tok.encode(sample, add_special_tokens=False)) != sample:
        raise SystemExit("Tokenizer does not round-trip Bangla text")
    if not (output / "tokenizer.json").exists():
        # transformers.js needs the fast tokenizer file.
        tok.save_pretrained(str(output))
    log("tokenizer OK")


def convert(args: argparse.Namespace) -> Path:
    output = Path(args.output).resolve()
    if output.exists() and any(output.iterdir()) and not args.overwrite:
        raise SystemExit(f"{output} is not empty (use --overwrite)")
    shutil.rmtree(output, ignore_errors=True)
    (output / "onnx").mkdir(parents=True)

    with tempfile.TemporaryDirectory() as tmp:
        exported = export_onnx(args.model, Path(tmp))
        onnx_dir = output / "onnx"
        for f in exported.iterdir():
            if f.suffix in (".onnx", ".onnx_data") or f.name.endswith(".onnx_data"):
                continue
            if f.is_file():
                shutil.copy2(f, output / f.name)

        enc = exported / "encoder_model.onnx"
        dec = exported / "decoder_model_merged.onnx"
        shutil.copy2(enc, onnx_dir / "encoder_model.onnx")
        if args.keep_fp32_decoder:
            shutil.copy2(dec, onnx_dir / "decoder_model_merged.onnx")
        quantize_int8(enc, onnx_dir / "encoder_model_quantized.onnx")
        quantize_int8(dec, onnx_dir / "decoder_model_merged_quantized.onnx")
        if not args.skip_q4:
            quantize_q4(dec, onnx_dir / "decoder_model_merged_q4.onnx")

    patch_generation_config(output, args.base)
    check_tokenizer(output, args.base)
    name = args.push.split("/")[-1] if args.push else output.name
    (output / "README.md").write_text(MODEL_CARD.format(source=args.model, name=name))

    sizes = {p.name: p.stat().st_size / 1e6 for p in sorted((output / "onnx").glob("*.onnx"))}
    for n, mb in sizes.items():
        log(f"  onnx/{n}: {mb:.0f} MB")
    return output


def push(output: Path, repo: str, private: bool) -> None:
    from huggingface_hub import HfApi

    api = HfApi()
    log(f"Uploading to https://huggingface.co/{repo} ...")
    api.create_repo(repo, repo_type="model", private=private, exist_ok=True)
    api.upload_folder(folder_path=str(output), repo_id=repo, repo_type="model")
    log(f"Done: https://huggingface.co/{repo}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model", required=True, help="Hugging Face id or local folder of a Whisper model")
    p.add_argument("--output", required=True, help="Output folder")
    p.add_argument("--base", default="openai/whisper-small", help="Original Whisper model the fine-tune started from")
    p.add_argument("--push", help="Upload to this Hugging Face repo (run `huggingface-cli login` first)")
    p.add_argument("--private", action="store_true", help="Create the Hugging Face repo as private")
    p.add_argument("--skip-q4", action="store_true", help="Skip the 4-bit decoder (WebGPU will not be available)")
    p.add_argument("--keep-fp32-decoder", action="store_true", help="Also keep the full-precision decoder")
    p.add_argument("--overwrite", action="store_true", help="Replace the output folder if it exists")
    args = p.parse_args(argv)

    output = convert(args)
    log(f"Converted model written to {output}")
    if args.push:
        push(output, args.push, args.private)
    else:
        log("Tip: add --push your-username/model-name to upload it to Hugging Face.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
