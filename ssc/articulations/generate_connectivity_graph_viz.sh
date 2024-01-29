#!/bin/zsh

MY_PATH="`dirname \"$0\"`"

csv=$1
input_dir=$2
output_dir=${3:-graph_viz}
n=8


opts="-o ${output_dir}/viz"

date
mkdir -p $output_dir
mkdir -p $output_dir/viz
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "python3 ${MY_PATH}/generate_connectivity_graph_viz.py ${opts} --input_connectivity ${input_dir}/precomputed/{1}.artpre.json" :::: $csv
ls ${output_dir}/viz/*.png | wc
date
