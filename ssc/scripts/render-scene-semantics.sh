#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

source=$1
csv=$2
model_category_mapping=fpModels.csv
semindex=fpObjectNav.category.csv
output_dir=$source.semrenders
view_index=4 # top down
n=10

opts="--source $source --output_dir $output_dir/renders"
opts="$opts --color_by objectType  --index ${semindex} --restrict_to_color_index"
#opts="$opts --use_subdir"
#opts="$opts --view_index $view_index"
opts="$opts --use_ambient_occlusion --ambient_occlusion_type edl"
#opts="$opts --use_lights --use_directional_lights"
if [ -n "$model_category_mapping" ]; then
  opts="$opts --model_category_mapping ${model_category_mapping}"
fi

mkdir -p $output_dir/renders
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=6000 $MY_PATH/../render.js --id {1} $opts  >& $output_dir/logs/{1}.render.log" :::: $csv
