#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

source=$1
csv=$2
output_dir=${3:-${source}.scene_relations}
format=sceneState
n=8

mkdir -p $output_dir/relations
mkdir -p $output_dir/logs
date
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/compute-scene-relations.js --format $format --id {1} --output_dir $output_dir/relations >& $output_dir/logs/{1}.relations.log" :::: $csv
date