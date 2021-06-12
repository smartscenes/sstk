#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
source=${2:-shape2motion}

opts=""
n=10

output_dir=${source}

date
mkdir -p $output_dir/converted
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/save-articulations.js --source ${source} --id {1} --output_dir $output_dir/converted/{1} $opts >& $output_dir/logs/{1}.convert.log" :::: $csv
find ${output_dir}/converted -name '*.json' | wc
date