#!/bin/zsh

MY_PATH="`dirname \"$0\"`"
STK_PATH=$MY_PATH/../..
#STK_PATH=~/code/scene-toolkit
RENDER="node --max-old-space-size=6000 ${STK_PATH}/ssc/render.js"

source=$1
csv=$2
format=$3
suffix=$4
output_dir=$source.renders
n=11

opts=""
opts="$opts --auto_align"
#opts="$opts --use_ambient_occlusion --ambient_occlusion_type edl"
opts="$opts --use_lights --use_directional_lights"
#opts="$opts  --color_by color --color '#fef9ed'"
#opts="$opts --use_subdir"
#opts="$opts --use_search_controller"

if [ -n "$suffix" ]; then
   opts="$opts --output_suffix $suffix"
fi

mkdir -p $output_dir/renders
mkdir -p $output_dir/logs
cut -f2 -d',' ${csv} | tail +2 | sort -u > subdirs.txt
parallel -j $n --eta "mkdir -p $output_dir/renders/{1}"  :::: subdirs.txt
parallel -j $n --eta "mkdir -p $output_dir/logs/{1}"  :::: subdirs.txt
date
if [ -n "$format" ]; then
  parallel -d "\r\n" --header : --colsep=',' -j $n --eta --joblog $output_dir/render.log "$RENDER --id {id}  --source $source --format $format --output_dir $output_dir/renders/{subdir} $opts >&  $output_dir/logs/{subdir}/{id}.render.$format.log" :::: $csv
else
  parallel -d "\r\n" --header : --colsep=',' -j $n --eta --joblog $output_dir/render.log "$RENDER --id {id}  --source $source --output_dir $output_dir/renders/{subdir}  $opts  >& $output_dir/logs/{subdir}/{id}.render.log" :::: $csv
fi
date
