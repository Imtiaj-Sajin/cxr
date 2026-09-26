#!/usr/bin/env bash
# Regenerates the synthetic speech fixtures in tests/fixtures with espeak-ng + ffmpeg
# (e.g. `sudo apt install espeak-ng ffmpeg`). The committed files were made this way.
set -euo pipefail
cd "$(dirname "$0")/../tests/fixtures"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT

# Bangla: two sentences with a 1.5 s pause between them.
espeak-ng -v bn -s 140 -w "$T/a1.wav" "আসসালামু আলাইকুম। আজকে আমরা শিখব কিভাবে ভাত রান্না করতে হয়।"
espeak-ng -v bn -s 140 -w "$T/a2.wav" "প্রথমে চাল ভালো করে ধুয়ে নিন। তারপর পানি দিয়ে চুলায় বসান।"
ffmpeg -loglevel error -y -i "$T/a1.wav" -f lavfi -t 1.5 -i anullsrc=r=22050:cl=mono -i "$T/a2.wav" \
  -filter_complex "[0][1][2]concat=n=3:v=0:a=1,aresample=16000[a]" -map "[a]" speech-bn.wav
ffmpeg -loglevel error -y -f lavfi -i "color=c=0x224466:s=640x360:r=25" -i speech-bn.wav -shortest \
  -c:v libvpx -b:v 200k -c:a libopus speech-bn.webm

# English (the tiny test model can transcribe English, not Bangla).
espeak-ng -v en-us -s 150 -w "$T/e1.wav" "Hello everyone and welcome to the show. Today we are going to learn how to cook rice."
espeak-ng -v en-us -s 150 -w "$T/e2.wav" "Today we are going to learn how to cook rice."
ffmpeg -loglevel error -y -i "$T/e1.wav" -ar 16000 -ac 1 speech-en.wav
ffmpeg -loglevel error -y -f lavfi -t 1 -i anullsrc=r=22050:cl=mono -i "$T/e1.wav" -f lavfi -t 1.5 -i anullsrc=r=22050:cl=mono -i "$T/e2.wav" \
  -filter_complex "[0][1][2][3]concat=n=4:v=0:a=1,aresample=16000[a]" -map "[a]" "$T/en.wav"
ffmpeg -loglevel error -y -f lavfi -i "color=c=0x334422:s=320x180:r=15" -i "$T/en.wav" -shortest \
  -c:v libvpx -b:v 100k -c:a libopus speech-en.webm
echo "Fixtures written to tests/fixtures"
