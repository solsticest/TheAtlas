'use strict';
// Browser-local preference only: atlas data stays in the chosen project folder.
// Permission requests run only inside explicit button clicks, never on startup.
const AtlasMainFolder=(()=>{
  const database='faraway-atlas-preferences',store='folders';
  const key='main-folder:'+(window.location?.pathname||'index.html');
  let handle=null,busy=false;
  const chooseButton=$('setMainFolder'),connectButton=$('reconnectMainFolder'),forgetButton=$('forgetMainFolder');

  function preference(operation,value){
    return new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(Error('Браузер не предоставляет хранилище IndexedDB.'));return;}
      let request,settled=false;
      const fail=error=>{if(!settled){settled=true;reject(error||Error('Не удалось сохранить настройку папки.'));}};
      try{request=window.indexedDB.open(database,1);}catch(e){fail(e);return;}
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(store))db.createObjectStore(store);};
      request.onerror=()=>fail(request.error);
      request.onblocked=()=>fail(Error('Хранилище занято. Закрой другие окна атласа и повтори.'));
      request.onsuccess=()=>{
        const db=request.result;if(settled){db.close();return;}
        db.onversionchange=()=>db.close();
        let transaction,result;
        try{
          transaction=db.transaction(store,operation==='get'?'readonly':'readwrite');
          transaction.oncomplete=()=>{db.close();if(!settled){settled=true;resolve(result);}};
          transaction.onabort=transaction.onerror=()=>{db.close();fail(transaction.error);};
          const entries=transaction.objectStore(store);
          const entry=operation==='get'?entries.get(key):operation==='put'?entries.put(value,key):entries.delete(key);
          entry.onsuccess=()=>{result=entry.result;};
        }catch(e){try{transaction?.abort();}catch(_){}db.close();fail(e);}
      };
    });
  }
  function updateButtons(){
    chooseButton.disabled=busy;connectButton.disabled=busy;forgetButton.disabled=busy;
    forgetButton.hidden=!handle;
    chooseButton.title=handle?'Основная папка: '+handle.name+'. Нажми, чтобы заменить её.':'Запомнить папку для следующих запусков';
    forgetButton.title='Забыть папку «'+(handle?.name||'')+'». Файлы не удаляются.';
  }
  function canStart(){
    if(busy||savingProject){status('Дождись завершения текущей операции.');return false;}
    syncArticle();return !dirty||confirm('Несохранённые изменения будут потеряны. Открыть основную папку?');
  }
  async function choose(){
    if(!canStart())return;
    if(!window.showDirectoryPicker){alert('Выбор папки недоступен в этом браузере.');return;}
    const generation=++folderOpenGeneration;busy=true;updateButtons();
    try{
      const selected=await window.showDirectoryPicker({mode:'readwrite',id:'atlas-main-folder'});
      const connected=await connectAtlasProject(selected,{requireJSON:true,isCurrent:()=>generation===folderOpenGeneration&&!savingProject});
      if(!connected)return;
      try{
        await preference('put',selected);handle=selected;connectButton.hidden=true;
        status('Основная папка «'+handle.name+'» задана. При следующем запуске атлас попробует открыть её автоматически.');
      }catch(e){status('Папка открыта, но запомнить её не удалось: '+e.message+' Используй «Открыть папку проекта».');}
    }catch(e){if(e.name!=='AbortError')alert('Не удалось задать основную папку: '+e.message);}
    finally{busy=false;updateButtons();}
  }
  async function reconnect(){
    if(!handle||!canStart())return;
    const selected=handle,generation=++folderOpenGeneration;busy=true;updateButtons();
    try{
      // Call directly from the click: awaiting IndexedDB first can lose activation.
      if(await selected.requestPermission({mode:'readwrite'})!=='granted'){
        status('Доступ к основной папке не разрешён. Можно повторить подключение или выбрать другую папку.');return;
      }
      if(await connectAtlasProject(selected,{requireJSON:true,isCurrent:()=>generation===folderOpenGeneration&&!savingProject}))connectButton.hidden=true;
    }catch(e){status('Не удалось подключить основную папку: '+e.message+' При необходимости задай её заново.');}
    finally{busy=false;updateButtons();}
  }
  async function forget(){
    if(busy||savingProject)return;
    ++folderOpenGeneration;busy=true;updateButtons();
    try{await preference('delete');handle=null;connectButton.hidden=true;status('Основная папка забыта. Открытый проект и его файлы не изменены.');}
    catch(e){status('Не удалось забыть основную папку: '+e.message);}
    finally{busy=false;updateButtons();}
  }
  async function restore(){
    const generation=folderOpenGeneration;
    const canRestore=()=>generation===folderOpenGeneration&&!folder&&!dirty&&!savingProject&&!imageJobs&&!busy;
    try{
      const saved=await preference('get');if(!canRestore())return;
      if(!saved)return;
      if(saved.kind!=='directory'||typeof saved.queryPermission!=='function')throw Error('Сохранённая папка недоступна. Задай основную папку заново.');
      handle=saved;updateButtons();
      const permission=await saved.queryPermission({mode:'readwrite'});if(!canRestore())return;
      if(permission!=='granted'){
        connectButton.hidden=false;status('Основная папка «'+saved.name+'» запомнена. Нажми «Подключить основную папку», чтобы разрешить доступ.');return;
      }
      if(!await connectAtlasProject(saved,{requireJSON:true,isCurrent:canRestore})&&canRestore())connectButton.hidden=false;
    }catch(e){
      if(!canRestore())return;
      if(handle){connectButton.hidden=false;status('Не удалось автоматически открыть основную папку: '+e.message);}
      else chooseButton.title='Запоминание папки недоступно: '+e.message;
    }
  }
  chooseButton.onclick=choose;connectButton.onclick=reconnect;forgetButton.onclick=forget;
  updateButtons();return {ready:restore()};
})();
