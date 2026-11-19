'use strict';
// Export the normalized Atlas records back to a lossless legacy v4 JSON document.
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {database,exportAtlas,assertAssetIntegrity,root}=require('./legacy-db.cjs');
async function main(args){
  let output=null,compare=null;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--output' && args[i+1]) output=path.resolve(args[++i]);
    else if(args[i]==='--compare' && args[i+1]) compare=path.resolve(args[++i]);
    else if(args[i]==='--help') {
      console.log('node scripts/export-legacy-atlas.cjs [--compare data/atlas.json] [--output D:\\Projects\\atlas-export.json]');
      return;
    } else throw Error('Неизвестный аргумент экспорта: '+args[i]);
  }
  const db=database();
  try{
    const result=await exportAtlas(db);
    const count=await assertAssetIntegrity(db);
    if(compare){
      const expected=JSON.parse(await fs.readFile(compare,'utf8'));
      assert.deepStrictEqual(result,expected,'Исходный JSON отличается от экспортированного');
    }
    const json=JSON.stringify(result,null,2)+'\n';
    if(output){
      // Never silently overwrite a prior backup or source JSON.
      const handle=await fs.open(output,'wx');
      try {await handle.writeFile(json);}finally{await handle.close();}
      console.log('Экспорт создан: '+output);
    }else process.stdout.write(json);
    console.error('Round-trip export OK; assets verified: '+count);
  }finally{await db.$disconnect();}
}
if(require.main===module) main(process.argv.slice(2)).catch(e=>{console.error('EXPORT ERROR: '+e.message);process.exitCode=1;});
module.exports={main};
