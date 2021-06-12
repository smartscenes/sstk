#!/bin/zsh

MY_PATH="`dirname \"$0\"`"
GEN_GRAPH_VIZ=~/code/articulations/articulations/scripts/generate_connectivity_graph_viz.py

csv=$1
output_dir=${2:-articulations}

export_opts=""
graphviz_opts="--fieldname reducedConnectivityGraph -o $output_dir/graphviz_reduced"
n=10

date
mkdir -p $output_dir/annotations
mkdir -p $output_dir/graphviz_reduced
mkdir -p $output_dir/logs
parallel --colsep=',' -j $n --eta "node --max-old-space-size=4000 $MY_PATH/export-articulations.js --id {1} --output $output_dir/annotations/{1} $export_opts >& $output_dir/logs/{1}.exportann.log" :::: $csv
ls ${output_dir}/annotations/*.articulations.json | wc
parallel --colsep=',' -j $n --eta "python $GEN_GRAPH_VIZ -i ${output_dir}/annotations/{1}.artpost.json  $graphviz_opts >& $output_dir/logs/{1}.graphviz_reduced.log" :::: $csv
ls ${output_dir}/graphviz_reduced/*.png | wc
date