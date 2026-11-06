'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname,'..');
const apiWorkspace = path.join(root,'apps','api');
const env = { ...process.env, ATLAS_ASSETS_DIR: '', ATLAS_BACKUP_DIR: '' };

for(const relative of ['src/paths.ts','dist/paths.js']) {
  test('API resolves project assets and .env from npm workspace: '+relative, ()=>{
    const moduleFile=path.join(apiWorkspace,relative);
    if(!fs.existsSync(moduleFile) && relative.startsWith('dist/')) return;
    const source=[
      'import { atlasRoot, atlasAssetsDir, atlasBackupDir, atlasEnvFile, atlasWebDist }',
      'from '+JSON.stringify(pathToFileURL(moduleFile).href)+';',
      'console.log(JSON.stringify({cwd:process.cwd(),root:atlasRoot,assets:atlasAssetsDir(),backups:atlasBackupDir(),envFile:atlasEnvFile,webDist:atlasWebDist}));',
    ].join(' ');
    const child=spawnSync(process.execPath,
      ['--import','tsx','--input-type=module','--eval',source],
      {cwd:apiWorkspace,env,encoding:'utf8',timeout:30000});
    assert.equal(child.status,0,child.stderr||child.stdout);
    const result=JSON.parse(child.stdout.trim());
    assert.equal(path.resolve(result.cwd),apiWorkspace);
    assert.equal(path.resolve(result.root),root);
    assert.equal(result.assets,path.join(root,'storage','assets'));
    assert.equal(result.backups,path.join(root,'storage','backups'));
    assert.equal(result.envFile,path.join(root,'.env'));
    assert.equal(result.webDist,path.join(root,'apps','web','dist'));
    assert.notEqual(result.assets,path.join(apiWorkspace,'storage','assets'));
  });
}
