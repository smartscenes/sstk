#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
source=${2:-shape2motion}

opts="--static_opacity 0.3 --base_part_color "
#opts="$opts --show_connected --show_obb"
n=10

output_dir=${source}

date
mkdir -p $output_dir/render_parts
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/render-parts.js --id ${source}.{1} --output $output_dir/render_parts/{1} $opts >& $output_dir/logs/{1}.render.log" :::: $csv
find ${output_dir}/render_parts -name '*.png' | wc
date