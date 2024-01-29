#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
output_dir=${2:-semantic-voxels}
input_dir=${3:-.}
n=8
voxel_size=0.05
nsamples=1000000
opts="--input_type path --use_fixed_voxel_size --voxel_size ${voxel_size} --samples ${nsamples} --color_by objectId --voxel_aggregate_mode majority --write_index"
input_pattern="$input_dir/{1}.json"

mkdir -p $output_dir
mkdir -p $output_dir/voxels
mkdir -p $output_dir/screenshots
mkdir -p $output_dir/logs
date
parallel --colsep=',' -j $n --joblog $output_dir/color-voxels.log --eta "node --max-old-space-size=4000 $MY_PATH/voxelize-scene.js --output_dir $output_dir/voxels --input $input_pattern $opts >& $output_dir/logs/{1}.color.log" :::: $csv
date
parallel --colsep=',' -j $n --joblog $output_dir/render.log --eta "node --max-old-space-size=4000 $MY_PATH/../render-voxels.js  ${render_config} --width 500 --height 500 --compress_png --output_dir $output_dir/screenshots --input $output_dir/voxels/{1}.nrrd >& $output_dir/logs/{1}.render.log" :::: $csv
date