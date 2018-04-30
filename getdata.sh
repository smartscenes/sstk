#!/bin/bash

METADATA_VER='v0.5.0'
METADATA_DIR='./metadata'

[ -e $METADATA_DIR ] && rm -rf $METADATA_DIR

git clone https://github.com/smartscenes/sstk-metadata.git --branch $METADATA_VER --single-branch $METADATA_DIR

for l in 'labels' 'matterport' 'shapenet' 'suncg'; do
  ln -s ../../../metadata/data/$l server/static/data/$l
done
