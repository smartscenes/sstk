#!/bin/bash

OLD_PATH="`pwd`"
MY_PATH="`dirname \"$0\"`"
cd $MY_PATH

ENV='./env.sh'
if [ -e $ENV ]
then
  source $ENV
fi

npm install

cd $OLD_PATH
