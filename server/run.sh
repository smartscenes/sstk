#!/bin/bash

# Runs the following command with variables defined in ../env.sh
#NODE_BASE_URL="" HTTP_SERVER_PORT=8010 USE_LOCAL=0 npm start

# To use a local version of libsg, execute run.sh with USE_LOCAL_LIBSG=1

OLD_PATH="`pwd`"
MY_PATH="`dirname \"$0\"`"
cd $MY_PATH

ENV='../env.sh'
if [ -e $ENV ]
then
  source $ENV
fi

if [ ! -d logs ]
then
  mkdir logs
fi

npm install
npm start

cd $OLD_PATH


