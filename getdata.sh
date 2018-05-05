#!/bin/bash

# TODO(MS): Parse config file to specify versions of datasets to use

METADATA_VER='v0.5.1'
METADATA_DIR='./metadata'
METADATA_REPO='https://github.com/smartscenes/sstk-metadata.git'

OLD_PATH="`pwd`"
MY_PATH="`dirname \"$0\"`"
cd $MY_PATH

[ -e $METADATA_DIR ] && rm -rf $METADATA_DIR

git clone $METADATA_REPO --branch $METADATA_VER --single-branch $METADATA_DIR

for l in 'labels' 'matterport' 'nyuv2' 'shapenet' 'suncg'; do
  [ ! -e server/static/data/$l ] && ln -s ../../../metadata/data/$l server/static/data/$l
done

# Add symlink of suncg v1 models as default "full" model set
SUNCG_TGT_DIR='server/static/data/suncg'
SUNCG_MODELS_CSV="$SUNCG_TGT_DIR/suncg.planner5d.models.full.csv"
ln -s ../../../metadata/data/suncg/suncg.planner5d.models.v1.csv $SUNCG_MODELS_CSV

exit_code=$?
cd $OLD_PATH
exit "$exit_code"
