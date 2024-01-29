#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

source=$1
csv=$2
output_dir=${3:-${source}.support}

opts="--inputType id  --use_search_controller"
n=10

mkdir -p $output_dir
mkdir -p $output_dir/support-surfaces
mkdir -p $output_dir/logs
date
parallel --colsep=',' -j $n --eta --joblog $output_dir/support-surfaces.log "node --max-old-space-size=4000 $MY_PATH/../ssg/identify-support-surfaces.js c --output_dir $output_dir/support-surfaces/{1}  --render_dir $output_dir/support-surfaces/{1} --input $source.{1} $opts >& $output_dir/logs/{1}.support-surfaces.log" :::: $csv
date
