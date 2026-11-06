'use strict';
// Windows-friendly Prisma migrations without a global Prisma installation.
// Work from the repository root; SQLite location is relative to schema.prisma.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
require('dotenv').config({path:path.join(root,'.env'),quiet:true});
const schema = path.join(root,'apps','api','prisma','schema.prisma');
const url = process.env.DATABASE_URL || 'file:../../../storage/atlas.db';
if (!url.startsWith('file:')) throw Error('This stage supports only file: SQLite URLs');
const defaultUrl='file:../../../storage/atlas.db';
if (url===defaultUrl) fs.mkdirSync(path.join(root,'storage'),{recursive:true});
const cli=path.join(root,'node_modules','prisma','build','index.js');
if (!fs.existsSync(cli)) throw Error('Install dependencies first: npm.cmd install');
const env={...process.env,DATABASE_URL:url};
function run(args) {
  const cmd=spawnSync(process.execPath,[cli,...args,'--schema',schema],{cwd:root,env,stdio:'inherit'});
  if (cmd.error) throw cmd.error;
  if (cmd.status!==0) process.exit(cmd.status ?? 1);
}
if (process.argv.includes('--validate-only')) run(['validate']);
else if (process.argv.includes('--generate-only')) run(['generate']);
else {
  run(['migrate','deploy']);
  run(['generate']);
  console.log('SQLite ready. Original data/atlas.json was not changed.');
}
