#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
opts='--input_type id --filter_empty --auto_align --collapse_nested --world_front 0,0,1 --use_search_controller --split_by_material --split_by_connectivity --keep_double_faces_together --export_materials --handle_material_side'
#opts='--input_type id --filter_empty --auto_align --collapse_nested --world_front 0,0,1 --use_search_controller --split_by_material --split_by_connectivity --keep_double_faces_together --export_materials'
output_dir=${2:-part-meshes}
prefix=3dw
n=10

mkdir -p $output_dir
mkdir -p $output_dir/meshes
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/../export-part-meshes.js --output_dir $output_dir/meshes --input $prefix.{1} $opts >& $output_dir/logs/{1}.export.log" :::: $csv
