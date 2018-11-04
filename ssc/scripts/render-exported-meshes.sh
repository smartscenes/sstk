#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
input_dir=${2:-export-meshes}
output_dir=${3:-${input_dir}}
n=8

opts="--config_file $MY_PATH/../config/render_shapenetv2_obj.json --assetType model --width 512 --height 512  --compress_png"

mkdir -p $output_dir
mkdir -p $output_dir/screenshots
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/../render-file.js --output_dir $output_dir/screenshots/{1} --input $input_dir/meshes/{1}/{1}.obj $opts >& $output_dir/logs/3dw.{1}.render.log" :::: $csv