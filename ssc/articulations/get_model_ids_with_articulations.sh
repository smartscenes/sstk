#!/bin/zsh

BASE_URL=${1:-http://ec2-18-188-96-100.us-east-2.compute.amazonaws.com/articulations/}

wget -O articulations.json ${BASE_URL}/articulation-annotations/list\?format\=json
jq '.[]["modelId"]' articulations.json | sed -e 's/"//g' | cut -d'.' -f2 > articulatedModelIds.txt