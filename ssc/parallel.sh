#!/usr/bin/env bash

IDFILE=$1
NUMPROCS=$2
xargs --max-args=1 --max-procs=$NUMPROCS "${@:3}" < "$IDFILE"
