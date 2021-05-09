#!/usr/bin/env bash

SCRIPT_PATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"
PROJECT_PATH=`dirname "$SCRIPT_PATH"`

node "$PROJECT_PATH/ui/esbuild.js" --watch --workdir="$PROJECT_PATH/ui" &
node "$PROJECT_PATH/backend/esbuild.js" --watch --workdir="$PROJECT_PATH/backend" &

wait
