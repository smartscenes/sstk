#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

source=$1
csv=$2
output_dir=$source.annotated
n=4

parallel --colsep=',' -j $n --eta "node --max-old-space-size=6000 $MY_PATH/../export-annotated-ply.js --id {1}  --source $source --output_dir $output_dir >& logs/{1}.export.log" :::: $csv
