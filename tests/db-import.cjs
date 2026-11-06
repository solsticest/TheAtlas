'use strict';
// Full import integration is executed on an isolated SQLite file and asset directory.
// Source atlas.json/maps are read only. No writes to production storage.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('SQLite import: backup, round-trip, assets, idempotence and refusal to overwrite',()=>{
  const storage=path.join(root,'storage');
  fs.mkdirSync(storage,{recursive:true});
  const temp=fs.mkdtempSync(path.join(storage,'test-import-'));
  const backups=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-test-backups-'));
  const file=path.join(temp,'atlas.db');
  const atlas=path.join(root,'data','atlas.json');
  const unchanged=fs.readFileSync(atlas);
  const relative=path.relative(path.join(root,'apps','api','prisma'),file).split(path.sep).join('/');
  const env={...process.env,DATABASE_URL:'file:'+relative,ATLAS_ASSETS_DIR:path.join(temp,'assets')};
  const run=(command,args=[])=>{
    const p=spawnSync(process.execPath,[path.join(root,command),...args],{
      cwd:root,env,encoding:'utf8',maxBuffer:8*1024*1024,timeout:120000
    });
    assert.equal(p.status,0,[command,p.stdout,p.stderr].join('\n'));
    return p.stdout;
  };
  const fail=(command,args=[])=>{
    const p=spawnSync(process.execPath,[path.join(root,command),...args],{
      cwd:root,env,encoding:'utf8',maxBuffer:8*1024*1024,timeout:120000
    });
    assert.notEqual(p.status,0,command+' should fail');
    return p.stderr;
  };
  try{
    run('scripts/db-setup.cjs');
    assert.ok(fs.existsSync(file),'SQLite file should exist after migrate deploy');
    const first=JSON.parse(run('scripts/import-legacy-atlas.cjs',['--apply','--backup-dir',backups]));
    assert.equal(first.status,'imported');
    assert.equal(first.count,5);
    assert.ok(fs.existsSync(path.join(first.backup,'data','atlas.json')),'original JSON must be backed up');
    assert.ok(fs.existsSync(path.join(first.backup,'maps')),'all maps must be backed up');
    const second=JSON.parse(run('scripts/import-legacy-atlas.cjs',['--apply','--backup-dir',backups]));
    assert.equal(second.status,'already-imported');
    const verified=JSON.parse(run('scripts/import-legacy-atlas.cjs',['--verify']));
    assert.equal(verified.status,'verified');
    run('scripts/export-legacy-atlas.cjs',['--compare',atlas,'--output',path.join(backups,'atlas-roundtrip.json')]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(backups,'atlas-roundtrip.json'),'utf8')),JSON.parse(unchanged.toString()));
    const modified=path.join(temp,'modified.json');
    const changed=JSON.parse(unchanged.toString());
    changed.worlds[1].name='Неизвестная версия мира';
    fs.writeFileSync(modified,JSON.stringify(changed));
    assert.match(fail('scripts/import-legacy-atlas.cjs',['--apply','--backup-dir',backups,'--input',modified,'--assets-dir',path.join(root,'maps')]),/другого JSON/);
    assert.match(fail('scripts/import-legacy-atlas.cjs',['--apply']),/backup-dir/);
    assert.deepEqual(fs.readFileSync(atlas),unchanged,'original atlas.json must not be modified');
  }finally{
    fs.rmSync(temp,{recursive:true,force:true});
    fs.rmSync(backups,{recursive:true,force:true});
  }
});
