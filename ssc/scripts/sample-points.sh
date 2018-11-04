#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
output_dir=${2:-sample-points}
alignment_file=$3

prefix=3dw
nsamples=100000
alignments=""
if [ -n "${alignment_file}" ]; then
    alignments="--alignments ${alignment_file}"
    render_config="--config_file $MY_PATH/../config/render_shapenet_zfront.json"
else
    render_config="--config_file $MY_PATH/../config/render_shapenet_kmz.json"
fi
#sample_opts="--ignore_redundant --check_reverse_faces --restrict_redundant_white_materials"
#sample_opts="--limit_to_visible"
sample_opts=""
opts="--source $prefix --samples ${nsamples} --input_type id ${sample_opts}  ${alignments} --world_front '0,0,1'"
n=8

mkdir -p $output_dir
mkdir -p $output_dir/meshes
mkdir -p $output_dir/screenshots
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/../sample-points.js --output_dir $output_dir/meshes --input {1} $opts >& $output_dir/logs/{1}.sample.log" :::: $csv
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/../render-file.js  ${render_config} --width 500 --height 500 --compress_png --output_dir $output_dir/screenshots --input $output_dir/meshes/{1}.ply >& $output_dir/logs/{1}.render.log" :::: $csv