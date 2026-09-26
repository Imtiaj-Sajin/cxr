#!/usr/bin/env bash
# Downloads a small real Whisper model (whisper-tiny, transformers.js q8 format) for
# integration tests. It comes from the npm registry, so it works even where the
# Hugging Face Hub is blocked. Files go to tests/fixtures/models (git-ignored).
set -euo pipefail
cd "$(dirname "$0")/.."
DEST=tests/fixtures/models/Xenova/whisper-tiny
if [ -f "$DEST/onnx/decoder_model_merged_quantized.onnx" ]; then
  echo "Test model already present in $DEST"
  exit 0
fi
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
(cd "$TMP" && npm pack --silent sts-whisper-tiny@1.0.0 >/dev/null && tar xzf sts-whisper-tiny-1.0.0.tgz)
mkdir -p tests/fixtures/models/Xenova
rm -rf "$DEST"
mv "$TMP/package/models/Xenova/whisper-tiny" "$DEST"
echo "Test model ready in $DEST"
