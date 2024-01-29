#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
output_dir=${2:-color-voxels}
input_dir=${3:-.}
n=8
resolution=256
nsamples=1000000
opts="--input_type path --resolution $resolution --samples $nsamples" # --downsample 4 --voxels filename
input_pattern="$input_dir/{1}/{1}.obj"

mkdir -p $output_dir
mkdir -p $output_dir/voxels
mkdir -p $output_dir/screenshots
mkdir -p $output_dir/logs
date
parallel --colsep=',' -j $n --joblog $output_dir/color-voxels.log --eta "node --max-old-space-size=4000 $MY_PATH/../color-voxels-file.js --output_dir $output_dir/voxels --input $input_pattern $opts >& $output_dir/logs/{1}.color.log" :::: $csv
date
parallel --colsep=',' -j $n --joblog $output_dir/render.log --eta "node --max-old-space-size=4000 $MY_PATH/../render-voxels.js  ${render_config} --width 500 --height 500 --compress_png --output_dir $output_dir/screenshots --input $output_dir/voxels/{1}.nrrd >& $output_dir/logs/{1}.render.log" :::: $csv
date