'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

test('Production Express serves Vite build and /admin while /api stays JSON',async()=>{
  const htmlFile=path.join(root,'apps/web/dist/index.html');
  assert.ok(fs.existsSync(htmlFile),'Run npm run build before production smoke test');
  const previous=process.env.NODE_ENV;
  process.env.NODE_ENV='production';
  let server;
  const {createApp}=await import('../apps/api/src/app.ts');
  try{
    const app=createApp();
    server=await new Promise(resolve=>{
      const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));
    });
    const base='http://127.0.0.1:'+server.address().port;
    for(const p of ['/','/admin']){
      const response=await fetch(base+p);
      assert.equal(response.status,200);
      assert.match(response.headers.get('content-type')??'',/text\/html/);
      assert.match(await response.text(),/id="root"/);
    }
    const html=fs.readFileSync(htmlFile,'utf8');
    const asset=html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    assert.ok(asset,'Bundled JS path missing in index.html');
    const assetResponse=await fetch(base+asset);
    assert.equal(assetResponse.status,200);
    const missing=await fetch(base+'/api/this-does-not-exist');
    assert.equal(missing.status,404);
    assert.equal((await missing.json()).error.code,'NOT_FOUND');
    assert.equal((await(await fetch(base+'/api/health')).json()).ok,true);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    if(previous===undefined)delete process.env.NODE_ENV;
    else process.env.NODE_ENV=previous;
  }
});
