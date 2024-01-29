#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

tsv=$1
parts_file=${2:-opdParts.csv}
source=${3:-partnetsim}

opts="--use_subdir --width 256 --height 256 --upsample_original 4"

# specify number of cores to use
n=10

output_dir=${source}

echo $output_dir

date
mkdir -p $output_dir/render_2dmotion
mkdir -p $output_dir/logs
#parallel --header --colsep='\t' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/render-2dmotion.js --source ${source} --id {model_id} --parts ${parts_file} --output_dir ${output_dir}/render_2dmotion $opts >& ${output_dir}/logs/{model_id}.render_art.log" :::: $tsv
parallel --header --colsep='\t' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/render-2dmotion.js --source ${source} --id {model_id} --num_motion_states 0 --num_viewpoints 10 --part_indexes {part_ids} --part_labels {part_labels}  --model_label {model_cat} --output_dir ${output_dir}/render_2dmotion $opts >& ${output_dir}/logs/{1}.render_art.log" :::: $tsv
date


