#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
opts='--input_type id --export_materials --input_format obj-modified --use_search_controller --merge_fixed_parts'
output_dir=${2:-part-meshes}
prefix=3dw
n=4

mkdir -p $output_dir
mkdir -p $output_dir/meshes
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/export-articulated-part-meshes.js --output_dir $output_dir/meshes --input $prefix.{1} $opts >& $output_dir/logs/{1}.export.log" :::: $csv