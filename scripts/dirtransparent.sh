#!/usr/bin/env bash

# Run convert on all png files to convert to transparent
# Uses convert command from imagemagick https://imagemagick.org/index.php
# MaoOS: brew install imagemagick

die () {
  echo >&2 "$@"
  exit 1
}

[ "$#" -eq 1 ] || die "Usage: $0 dirWithPNGs "

dir=$1

find "$dir" -name '*.png' | parallel --eta  convert {} -fuzz 2% -transparent white {}
