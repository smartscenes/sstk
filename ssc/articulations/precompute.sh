#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
source=${2:-shape2motion}

#opts="--force"
opts="--force --useRelativeDist --checkAABB --includeIntersectObbs"
opts="$opts --loadPrecomputed"
n=11

output_dir=${source}

date
mkdir -p $output_dir/precomputed
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/precompute.js --id ${source}.{1} --output $output_dir/precomputed/{1}.artpre.json $opts >& $output_dir/logs/{1}.artpre.log" :::: $csv
ls ${output_dir}/precomputed/*.artpre.json | wc
date