#!/bin/bash

OLD_PATH="`pwd`"
MY_PATH="`dirname \"$0\"`"
cd $MY_PATH

ENV='./env.sh'
if [ -e $ENV ]
then
  source $ENV
fi

REBUILD_GL=false
while true; do
  case "$1" in
    -r | --rebuild-gl ) REBUILD_GL=true; shift ;;
    * ) break ;;
  esac
done

npm install
exit_code=$?

if [ $REBUILD_GL = true ] && [ "$exit_code" -eq 0 ]; then
	echo "Rebuilding GL..."
	npm run rebuild-gl
fi

cd $OLD_PATH

exit "$exit_code"
