#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
opts='--use_ids --filter_empty --auto_align --collapse_nested --world_front 0,0,1 --use_search_controller'
output_dir=part-meshes
prefix=3dw
n=4

mkdir -p $output_dir
mkdir -p $output_dir/meshes
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/../export-part-meshes.js --output_dir $output_dir/meshes --input $prefix.{1} $opts >& $output_dir/logs/{1}.export.log" :::: $csv
