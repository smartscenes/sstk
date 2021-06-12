#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
source=${2:-3dw}
input_type=id
input_format=${3:-kmz}
n=2

opts="--input_type ${input_type} --input_format ${input_format} --auto_align --auto_scale --use_search_controller"
output_dir=$source
info_dir=$output_dir/info
logs_dir=$output_dir/logs

date
mkdir -p $info_dir
mkdir -p $logs_dir
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/../get-info.js --output_dir $info_dir --input $source.{1} $opts >& $logs_dir/{1}.info.log" :::: $csv
date