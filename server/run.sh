#!/bin/bash

# Runs the following command with variables defined in ../env.sh
#NODE_BASE_URL="" HTTP_SERVER_PORT=9010 REVERSE_PROXY_PORT=8010 USE_LOCAL=0 npm start

OLD_PATH="`pwd`"
MY_PATH="`dirname \"$0\"`"
cd $MY_PATH

ENV='../env.sh'
if [ -e $ENV ]
then
  source $ENV
fi

npm install
npm start

cd $OLD_PATH


