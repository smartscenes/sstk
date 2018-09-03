#!/usr/bin/env bash

# Runs pngquant on all png files

die () {
  echo >&2 "$@"
  exit 1
}

[ "$#" -eq 1 ] || die "Usage: dirpngquant dirWithPNGs "

dir=$1

find "$dir" -name '*.png' | parallel --eta pngquant -f --ext .png {}
