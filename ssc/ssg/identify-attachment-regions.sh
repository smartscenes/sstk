#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

source=$1
csv=$2
output_dir=${3:-${source}.attachment}

opts="--inputType id --render_dir $output_dir/screenshots --use_search_controller"
n=10

mkdir -p $output_dir
mkdir -p $output_dir/attachments
mkdir -p $output_dir/screenshots
mkdir -p $output_dir/logs
date
parallel --colsep=',' -j $n --eta --joblog $output_dir/attachment-regions.log "node --max-old-space-size=4000 $MY_PATH/../ssg/identify-attachment-regions.js --output_dir $output_dir/attachments --render_dir $output_dir/screenshots --input $source.{1} $opts >& $output_dir/logs/{1}.attachments.log" :::: $csv
date
