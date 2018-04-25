#!/bin/bash

OLD_PATH="`pwd`"
MY_PATH="`dirname \"$0\"`"
cd $MY_PATH

ENV='./env.sh'
if [ -e $ENV ]
then
  source $ENV
fi

METADATA_VER='v0.5.0'
[ ! -e './metadata' ] && git clone https://github.com/smartscenes/sstk-metadata.git --branch $METADATA_VER --single-branch metadata

npm install

cd $OLD_PATH
