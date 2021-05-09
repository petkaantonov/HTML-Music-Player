#!/usr/bin/env bash

function abs_path {
  (cd "$(dirname '$1')" &>/dev/null && printf "%s/%s" "$PWD" "${1##*/}")
}

SCRIPT_PATH=`abs_path "$0"`
PROJECT_PATH=`dirname \`dirname "$SCRIPT_PATH"\``

node "$PROJECT_PATH/ui/esbuild.js" --watch --workdir="$PROJECT_PATH/ui" &
node "$PROJECT_PATH/backend/esbuild.js" --watch --workdir="$PROJECT_PATH/backend" &

wait
