#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

source=$1
csv=$2
format=$3
output_dir=$source.segment
n=10

opts=""
#opts="--segment_method connectivity --segment_format trimesh"

if [ -n "$format" ]; then
  opts="$opts --format $format"
fi

mkdir -p $output_dir/segmented
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=6000 $MY_PATH/../segment-mesh.js --input $source.{1}  --output_dir $output_dir/segmented $opts >&  $output_dir/logs/{1}.segmented.log" :::: $csv
