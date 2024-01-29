#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

source=$1
csv=$2
format=$3
suffix=$4
output_dir=$source.renders
n=10

opts=""
opts="$opts --auto_align"
opts="$opts --use_ambient_occlusion --ambient_occlusion_type edl"
opts="$opts --use_lights --use_directional_lights"
#opts="$opts  --color_by color --color '#fef9ed'"
#opts="$opts --use_subdir"
#opts="$opts --use_search_controller"

#opts="$opts --envmap venice_sunset_1k.hdr"

if [ -n "$suffix" ]; then
   opts="$opts --output_suffix $suffix"
fi

mkdir -p $output_dir/renders
mkdir -p $output_dir/logs
if [ -n "$format" ]; then
  parallel --colsep=',' -j $n --eta "node --max-old-space-size=6000 $MY_PATH/../render.js --id {1}  --source $source --format $format --output_dir $output_dir/renders $opts >&  $output_dir/logs/{1}.render.$format.log" :::: $csv
else
  parallel --colsep=',' -j $n --eta "node --max-old-space-size=6000 $MY_PATH/../render.js --id {1}  --source $source --output_dir $output_dir/renders  $opts  >& $output_dir/logs/{1}.render.log" :::: $csv
fi
