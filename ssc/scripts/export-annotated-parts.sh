#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

source=$1
csv=$2
output_dir=$source.annotated.parts
n=8

mkdir -p $output_dir
mkdir -p $output_dir/parts
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/../export-annotated-parts.js --id {1}  --source $source --output_dir $output_dir/parts >& $output_dir/logs/{1}.export.log" :::: $csv
