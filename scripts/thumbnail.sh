#!/usr/bin/env bash
#
# Reduces image sizes as well as optimizes PNGs
# Prerequisites for resize:
# http://imagemagick.org/
#
# Prerequisites for optimization:
# https://pngquant.org/
# http://optipng.sourceforge.net/
# 
# Both pngquant and optipng must be on the PATH

OUT_SIZE=128x128
OPTIMIZE=true

function run {
    echo "Resizing to ${OUT_SIZE}..."
    find ${DIR} -name "*[0-9].png" | while read img; do
        thumb=${img/\.png/_thumb\.png}
        convert ${img} -resize ${OUT_SIZE} ${thumb}
        if [ "$OPTIMIZE" = true ]; then
            pngquant 256 --ext .png --force ${thumb} && optipng -clobber ${thumb} 
        fi
    done
    echo "Done."
}

case "$1" in
    -h)
        echo $"Usage: $0 [-h] [-d] <dir> [size]"
        echo "Resizes images and optionally reduces image size in a lossy manner"
        echo "[-h] prints this help message and quits"
        echo "[-d] is optional and disables optimization. pngquant and optipng must be on the PATH"
        echo "[size] is optional and must be in XxY format: 128x128"
        echo "All parameters are positional"
        exit 1
        ;;
    -d)
        OPTIMIZE=false
        shift
        DIR="$1"
        shift
        ;;
    *)
        DIR="$1"
        shift
esac

if [ -n "$1" ]; then
    OUT_SIZE="$1"
fi

run
