#!/usr/bin/env bash

realpath() {
    [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"
}

SCRIPT_PATH=`realpath "$0"`
PROJECT_PATH=`dirname \`dirname "$SCRIPT_PATH"\``

node "$PROJECT_PATH/ui/esbuild.js" --watch --workdir="$PROJECT_PATH/ui" &
node "$PROJECT_PATH/backend/esbuild.js" --watch --workdir="$PROJECT_PATH/backend" &

wait
