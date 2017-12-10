#!/usr/bin/env bash

# Converts matching sequence of .png files within passed directory and subdirectories recursively to a .gif file within each directory.
# NOTE: Requires ImageMagick's convert and GNU parallel to be installed

die () {
  echo >&2 "$@"
  exit 1
}

[ "$#" -eq 1 ] || die "Usage: dirgif dirWithPNGs "

dir=$1
imFirst=6
imLast=13

find "$dir" -type d -print0 | parallel -0 convert -resize 50% -delay 40 $(seq -f {}/{.}-%g.png $imFirst $imLast) -coalesce -layers OptimizePlus -loop 0 {}/{.}.gif
