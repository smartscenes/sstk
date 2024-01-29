#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

source=$1
csv=$2
output_dir=${3:-${source}.doors}
n=8

opts="--use_search_controller --envmap venice_sunset_1k.hdr --view_doors"

mkdir -p $output_dir/exterior_doors
mkdir -p $output_dir/logs
date
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/identify-exterior-doors.js ${opts} --input ${source}.{1} --output_dir $output_dir/exterior_doors --render_dir $output_dir/exterior_doors >& $output_dir/logs/{1}.exterior_doors.log" :::: $csv
date