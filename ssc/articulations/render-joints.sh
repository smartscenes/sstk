#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
source=${2:-shape2motion}
jointsfile=${3:-joints.tsv}

opts="--base_part_color basepart_highlight --moving_part_color highlight --static_color neutral --static_opacity 0.3 --joints ${jointsfile}"
opts="$opts --attached_moving_part_color '#dbdb8d'"
#opts="$opts --attached_moving_part_color faded_highlight"
n=10

output_dir=${source}

date
mkdir -p $output_dir/render_joints
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/render-joints.js --id ${source}.{1} --output_dir $output_dir/render_joints/{1} $opts >& $output_dir/logs/{1}.render.log" :::: $csv
find ${output_dir}/render_parts -name '*.png' | wc
date