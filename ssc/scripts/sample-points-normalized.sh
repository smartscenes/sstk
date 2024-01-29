#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
output_dir=${2:-sample-points}
alignment_file=$3

prefix=3dw
nsamples=100000
alignments=""

render_config="--config_file $MY_PATH/../config/render_shapenetv2_obj.json"
sample_opts="--ignore_redundant --check_reverse_faces --restrict_redundant_white_materials"
#sample_opts="--limit_to_visible"
#sample_opts=""
opts="--source $prefix --samples ${nsamples} --input_type id ${sample_opts}  ${alignments}"
opts="$opts --world_front '0,0,-1' --normalize_size diagonal --normalize_size_to 100 --center true --use_search_controller  --auto_align true"
n=10

mkdir -p $output_dir
mkdir -p $output_dir/meshes
mkdir -p $output_dir/screenshots
mkdir -p $output_dir/logs
date
parallel --colsep=',' -j $n --eta --joblog $output_dir/sample-points.log "node --max-old-space-size=4000 $MY_PATH/../sample-points.js --output_dir $output_dir/meshes --input {1} $opts >& $output_dir/logs/{1}.sample.log" :::: $csv
date
parallel --colsep=',' -j $n --eta --joblog $output_dir/render.log "node --max-old-space-size=4000 $MY_PATH/../render-file.js  ${render_config} --width 500 --height 500 --compress_png --output_dir $output_dir/screenshots --input $output_dir/meshes/{1}.ply >& $output_dir/logs/{1}.render.log" :::: $csv
date
