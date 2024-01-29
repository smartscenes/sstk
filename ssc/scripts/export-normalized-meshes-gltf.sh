#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
output_dir=${2:-export-meshes-gltf}
input_type=id
input_format=kmz
output_format=gltf
n=8

common_opts="--assetType model --require_faces --use_search_controller "
align_opts="--auto_align true"
normalize_opts="--normalize_size diagonal --center"
format_opts="--embed_images --export_textures none"
opts="${common_opts} ${align_opts} ${normalize_opts} ${format_opts}"
opts="--input_type ${input_type} --input_format ${input_format} --output_format ${output_format} $opts"

date
mkdir -p $output_dir
mkdir -p $output_dir/meshes
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/../export-mesh.js --output_dir $output_dir/meshes --input {1} $opts >& $output_dir/logs/{1}.export.log" :::: $csv
date