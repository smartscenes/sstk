#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

source=$1
csv=$2
format=$3
suffix=${4:-$format}
output_dir=$source.renders
view_index=4 # top down
n=4

if [ -n $format ]; then
  parallel --colsep=',' -j $n --eta "node --max-old-space-size=6000 $MY_PATH/../render.js --id {1}  --source $source --format $format --output_dir $output_dir --view_index $view_index --use_subdir --output_suffix $suffix --auto_align >& logs/{1}.render.$format.log" :::: $csv
else
  parallel --colsep=',' -j $n --eta "node --max-old-space-size=6000 $MY_PATH/../render.js --id {1}  --source $source --output_dir $output_dir --view_index $view_index --use_subdir --auto_align >& logs/{1}.render.log" :::: $csv
fi
