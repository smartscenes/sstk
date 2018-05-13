#!/bin/bash

EXAMPLES_DIR='./examples'
EXAMPLES_REPO='https://github.com/smartscenes/sstk-examples.git'

OLD_PATH="`pwd`"
MY_PATH="`dirname \"$0\"`"
cd $MY_PATH

if [ -e $EXAMPLES_DIR ]; then
  git -C $EXAMPLES_DIR pull
else
  git clone $EXAMPLES_REPO $EXAMPLES_DIR
fi

NYUV2_DIR='server/static/data/nyuv2'
ln -s ../../../$EXAMPLES_DIR/data/nyuv2/scans $NYUV2_DIR
ln -s ../../../$EXAMPLES_DIR/data/nyuv2/nyuv2.csv $NYUV2_DIR/nyuv2.example.csv

exit_code=$?
cd $OLD_PATH
exit "$exit_code"
