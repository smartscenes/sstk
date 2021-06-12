#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
source=${2:-shape2motion}

opts=""
n=10

output_dir=${source}

date
mkdir -p $output_dir/parts_gltf
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/export-parts-gltf.js --id ${source}.{1} --output $output_dir/parts_gltf/{1} $opts >& $output_dir/logs/{1}.parts_gltf.log" :::: $csv
find ${output_dir}/parts_gltf -name '*.glb' | wc
date