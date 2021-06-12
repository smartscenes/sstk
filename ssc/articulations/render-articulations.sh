#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
source=${2:-shape2motion}

opts="--static_color neutral --moving_part_color highlight --attached_moving_part_color faded_highlight --iterations 10 --show_axis_radar --combine_all --static_opacity 0.3"
n=10

output_dir=${source}

date
mkdir -p $output_dir/render_articulations
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/render-articulations.js --source ${source} --id {1} --output_dir $output_dir/render_articulations/{1} $opts >& $output_dir/logs/{1}.render_art.log" :::: $csv
find ${output_dir}/render_articulations -name '*.gif' | wc
date