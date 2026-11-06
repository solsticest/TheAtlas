import { useEffect, useRef, useState } from 'react';
import { Box, Button, Divider, Stack, Typography } from '@mui/material';
import { assetUrl } from '../atlas/geometry';

type Props={
  value:string;
  onChange:(html:string)=>void;
  onUploadImage?:(file:File)=>Promise<string>;
  disabled?:boolean;
};

function editorHtml(value:string){
  const wrapper=document.createElement('div');
  wrapper.innerHTML=value;
  for(const image of wrapper.querySelectorAll('img[data-asset]')){
    const name=image.getAttribute('data-asset');
    if(name&&!name.includes('..'))image.setAttribute('src',assetUrl('media',name));
  }
  return wrapper.innerHTML;
}
function storedHtml(element:HTMLElement){
  const clone=element.cloneNode(true) as HTMLElement;
  for(const image of clone.querySelectorAll('img[data-asset]')){
    const src=image.getAttribute('src')??'';
    if(src.startsWith('/api/assets/media/'))image.removeAttribute('src');
  }
  return clone.innerHTML;
}
function toolbarButton(label:string,title:string,onClick:()=>void,disabled=false){
  return <Button key={title} size="small" variant="outlined" title={title} disabled={disabled}
    onMouseDown={event=>event.preventDefault()} onClick={onClick}
    sx={{minWidth:34,px:1,textTransform:'none'}}>{label}</Button>;
}

export function RichTextEditor({value,onChange,onUploadImage,disabled=false}:Props){
  const editor=useRef<HTMLDivElement|null>(null);
  const [uploading,setUploading]=useState(false);

  useEffect(()=>{
    const node=editor.current;if(!node)return;
    const rendered=editorHtml(value);
    if(storedHtml(node)!==value)node.innerHTML=rendered;
  },[value]);

  function sync(){
    const node=editor.current;if(node)onChange(storedHtml(node));
  }
  function command(name:string,arg?:string){
    const node=editor.current;if(!node||disabled)return;
    node.focus();
    document.execCommand(name,false,arg);
    sync();
  }
  function block(tag:'p'|'h2'|'h3'|'blockquote'){
    command('formatBlock','<'+tag+'>');
  }
  function link(){
    const node=editor.current;if(!node||disabled)return;
    node.focus();
    const selection=window.getSelection();
    const selected=selection?.toString()??'';
    const url=window.prompt('Ссылка (https://...)',selected.startsWith('http')?selected:'https://');
    if(!url)return;
    if(!/^https?:\/\//i.test(url)){
      window.alert('Разрешены ссылки http:// и https://');
      return;
    }
    if(selection?.isCollapsed){
      document.execCommand('insertHTML',false,
        '<a href="'+url.replace(/"/g,'&quot;')+'">'+url.replace(/</g,'&lt;')+'</a>');
    }else document.execCommand('createLink',false,url);
    sync();
  }
  async function image(file:File){
    if(!onUploadImage||disabled)return;
    setUploading(true);
    try{
      const filename=await onUploadImage(file);
      const safe=filename.replace(/"/g,'&quot;');
      const src=assetUrl('media',filename).replace(/"/g,'&quot;');
      editor.current?.focus();
      document.execCommand('insertHTML',false,
        '<figure><img data-asset="'+safe+'" src="'+src+'" alt=""><figcaption>Подпись к изображению</figcaption></figure><p><br></p>');
      sync();
    }finally{setUploading(false);}
  }

  return <Box className="atlas-rich-editor">
    <Stack className="atlas-rich-toolbar" direction="row" gap={.6} flexWrap="wrap" alignItems="center">
      {toolbarButton('¶','Обычный текст',()=>block('p'),disabled)}
      {toolbarButton('H2','Заголовок',()=>block('h2'),disabled)}
      {toolbarButton('H3','Подзаголовок',()=>block('h3'),disabled)}
      <Divider orientation="vertical" flexItem/>
      {toolbarButton('B','Жирный',()=>command('bold'),disabled)}
      {toolbarButton('I','Курсив',()=>command('italic'),disabled)}
      {toolbarButton('U','Подчёркивание',()=>command('underline'),disabled)}
      {toolbarButton('S','Зачёркивание',()=>command('strikeThrough'),disabled)}
      <Divider orientation="vertical" flexItem/>
      {toolbarButton('•','Маркированный список',()=>command('insertUnorderedList'),disabled)}
      {toolbarButton('1.','Нумерованный список',()=>command('insertOrderedList'),disabled)}
      {toolbarButton('❝','Цитата',()=>block('blockquote'),disabled)}
      {toolbarButton('—','Разделитель',()=>command('insertHorizontalRule'),disabled)}
      <Divider orientation="vertical" flexItem/>
      {toolbarButton('🔗','Вставить ссылку',link,disabled)}
      <Button component="label" size="small" variant="outlined" disabled={disabled||uploading}
        sx={{textTransform:'none'}}>
        {uploading?'Загрузка…':'🖼 Изображение'}
        <input hidden type="file" accept="image/png,image/webp,image/jpeg" onChange={event=>{
          const file=event.target.files?.[0];
          if(file)void image(file);
          event.target.value='';
        }}/>
      </Button>
      {toolbarButton('Tx','Очистить форматирование',()=>command('removeFormat'),disabled)}
    </Stack>
    <Typography className="atlas-rich-hint" variant="caption" color="text.secondary">
      Визуальный редактор · Ctrl+S сохраняет · Ctrl+Z / Ctrl+Y работают через историю Atlas
    </Typography>
    <Box ref={editor} className="atlas-rich-surface" contentEditable={!disabled}
      suppressContentEditableWarning role="textbox" aria-multiline="true"
      data-placeholder="Начни писать подробную статью…"
      onInput={sync} onBlur={sync}/>
  </Box>;
}
