#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
source=${2:-3dw}
input_type=id
input_format=${3:-kmz}
n=2

opts="--inputType ${input_type} --input_format ${input_format} --use_search_controller"
opts="$opts  --skip_existing true --check_ext $input_format"
output_dir=$source
download_dir=$output_dir/assets
logs_dir=$output_dir/logs

date
mkdir -p $download_dir
mkdir -p $logs_dir
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/../download-asset.js --output_dir $download_dir --input $source.{1} $opts >& $logs_dir/{1}.download.log" :::: $csv
date