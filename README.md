
### Development

The project is a monorepo using yarn 3 workspaces with pnp enabled. 

#### VSCode

- Using VSCode you need to install the [ZipFS](https://marketplace.visualstudio.com/items?itemName=arcanis.vscode-zipfs) extension
- You also need to run `yarn dlx @yarnpkg/pnpify --sdk vscode`
- After installing SDK, press ctrl+shift+p while inside a .ts file, and search for "Select TypeScript version" and "Use Workspace Version"

#### Local dev env

- Run `yarn dev` if there is no server at localhost:8140 responding
- Run `yarn watch` to autocompile files as they change
