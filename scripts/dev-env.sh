#!/usr/bin/env bash

unset npm_node_execpath
unset npm_config_user_agent
unset BERRY_BIN_FOLDER
unset npm_execpath
unset NODE_OPTIONS
unset INIT_CWD
unset npm_lifecycle_event
yarn workspaces foreach -ptvi run build-dev
docker-compose up --build -d
