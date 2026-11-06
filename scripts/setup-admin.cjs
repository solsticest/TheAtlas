'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const bcrypt=require('bcryptjs');

// The password is NEVER put in a command line, shell history, Git or stdout.
// Interactive console masks it; --password-stdin can be used by automation.
const root=path.resolve(__dirname,'..');
const target=path.join(root,'.env');
const rotate=process.argv.includes('--rotate');
const pipeMode=process.argv.includes('--password-stdin');
function hiddenPassword(){
  return new Promise((resolve,reject)=>{
    if(!process.stdin.isTTY||typeof process.stdin.setRawMode!=='function')
      return reject(Error('Для ручной настройки открой PowerShell. Автоматизация: --password-stdin.'));
    process.stdout.write('Придумай пароль администратора (не менее 12 символов): ');
    let result='';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const listener=key=>{
      if(key==='\u0003') {process.stdin.setRawMode(false);process.stdout.write('\n');process.exit(130);}
      if(key==='\r'||key==='\n'){
        process.stdin.setRawMode(false);process.stdin.pause();
        process.stdin.removeListener('data',listener);process.stdout.write('\n');resolve(result);return;
      }
      if(key==='\u007f'||key==='\b'){result=result.slice(0,-1);return;}
      if(key>=' '&&key!=='\u007f') result+=key;
    };
    process.stdin.on('data',listener);
  });
}
function pipedPassword(){
  return new Promise(resolve=>{
    let result='';process.stdin.setEncoding('utf8');
    process.stdin.on('data',chunk=>result+=chunk);
    process.stdin.on('end',()=>resolve(result.trimEnd()));
  });
}
function upsert(text,key,value){
  const line=key+'='+value;
  const re=new RegExp('^'+key+'=.*$','m');
  return re.test(text)?text.replace(re,line):text.trimEnd()+'\n'+line+'\n';
}
async function main(){
  const current=fs.existsSync(target)?fs.readFileSync(target,'utf8'):fs.readFileSync(path.join(root,'.env.example'),'utf8');
  if(!rotate && /^ADMIN_PASSWORD_HASH=\S+/m.test(current))throw Error('Администратор уже настроен. Для замены пароля запусти с --rotate (старые сессии станут недействительны).');
  const pass=pipeMode?await pipedPassword():await hiddenPassword();
  if(pass.length<12||pass.length>200)throw Error('Длина пароля должна быть 12–200 символов.');
  const hash=await bcrypt.hash(pass,12);
  const secret=crypto.randomBytes(48).toString('base64url');
  let config=upsert(current,'ADMIN_PASSWORD_HASH',JSON.stringify(hash));
  config=upsert(config,'SESSION_SECRET',JSON.stringify(secret));
  const staging=target+'.tmp-'+process.pid;
  try{
    fs.writeFileSync(staging,config,{mode:0o600,flag:'wx'});
    fs.renameSync(staging,target);
  }finally{if(fs.existsSync(staging))fs.rmSync(staging,{force:true});}
  console.log('Администратор настроен. Пароль не выводился и не записывался в историю команд.');
  console.log('Файл: '+target+' (исключён из Git).');
  if(rotate) console.log('Смени пароль — и выполните logout со всех ранее открытых браузеров; ранее созданные сессии также должны быть отозваны в БД.');
}
main().catch(e=>{console.error('ADMIN SETUP ERROR: '+e.message);process.exitCode=1;});
