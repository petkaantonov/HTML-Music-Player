#!/usr/bin/env bash

unset npm_node_execpath
unset npm_config_user_agent
unset BERRY_BIN_FOLDER
unset npm_execpath
unset NODE_OPTIONS
unset INIT_CWD
unset npm_lifecycle_event

SCRIPT_PATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"
PROJECT_PATH=`dirname "$SCRIPT_PATH"`

NODE_OPTIONS="--require $PROJECT_PATH/.pnp.cjs" node "$PROJECT_PATH/ui/esbuild.js" --development --workdir="$PROJECT_PATH/ui" &
NODE_OPTIONS="--require $PROJECT_PATH/.pnp.cjs" node "$PROJECT_PATH/backend/esbuild.js" --development --workdir="$PROJECT_PATH/backend" &

wait

docker-compose -f "$PROJECT_PATH/docker-compose.yml" up --build -d
