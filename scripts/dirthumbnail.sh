#!/usr/bin/env bash

# Converts pngs to thumbnails
# Uses convert command from imagemagick https://imagemagick.org/index.php
# MaoOS: brew install imagemagick

die () {
  echo >&2 "$@"
  exit 1
}

[ "$#" -eq 1 ] || die "Usage: $0 dirWithPNGs "

dir=$1
OUT_SIZE=128x128

find "$dir" -name '*.png' | grep -v '_thumb.png' | parallel --eta convert {} -resize ${OUT_SIZE} ${thumb} {.}_thumb.png