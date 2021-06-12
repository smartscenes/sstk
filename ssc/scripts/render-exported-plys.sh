#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
input_dir=${2:-mpr3d.annotated}
output_dir=${3:-${input_dir}}
n=8

opts="--config_file $MY_PATH/../config/render_scan.json --assetType model --width 1000 --height 1000  --compress_png --to_nonindexed"

mesh_dir=$input_dir/plys
logs_dir=$output_dir/logs
image_dir=$output_dir/plys
ply_types=('-' 'categories' 'instances' 'mpr40' 'nyu40')

mkdir -p $output_dir
mkdir -p $logs_dir
mkdir -p $image_dir
for t in ${ply_types[@]}; do
  if [ ${t} = '-' ]; then
    ext='annotated.ply'
    logext='log'
  else
    ext=${t}.annotated.ply
    logext=${t}.log
  fi
  echo "Processing $ext log $logext"
  parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/../render-file.js --output_dir $image_dir/{1} --input $mesh_dir/{1}/{1}.$ext $opts >& $logs_dir/3dw.{1}.render.$logext" :::: $csv
done