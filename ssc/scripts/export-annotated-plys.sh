#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

source=$1
csv=$2
output_dir=$source.annotated
ann_type='latest'
n=4

mkdir -p $output_dir/plys
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=6000 $MY_PATH/../export-annotated-ply.js --id {1}  --source $source --ann_type $ann_type --output_dir $output_dir/plys >& $output_dir/logs/{1}.export.log" :::: $csv
