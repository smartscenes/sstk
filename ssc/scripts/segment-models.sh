#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

source=$1
csv=$2
format=$3
segment_config_file=$4
output_dir=$source.segment
n=10

#opts=""
opts="--segmentator_method connectivity --segmentator_format trimesh"
if [ -n "$segment_config_file" ]; then
  if [ -f "$segment_config_file" ]; then
    opts="$opts --config_file $segment_config_file"
  else
    echo "Ignore missing segment_config_file $segment_config_file"
  fi
fi

echo "Using opts: $opts"

if [ -n "$format" ]; then
  opts="$opts --format $format"
fi

mkdir -p $output_dir/segmented
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=6000 $MY_PATH/../segment-mesh.js --input $source.{1}  --output_dir $output_dir/segmented $opts >&  $output_dir/logs/{1}.segmented.log" :::: $csv
