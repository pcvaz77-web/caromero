(() => {
  'use strict';

  const marker = '<!--cepi-rich-v1-->';
  const bucket = 'cepi-question-images';
  const tags = new Set(['DIV','P','BR','B','STRONG','I','EM','U','S','UL','OL','LI','BLOCKQUOTE','H2','H3','TABLE','THEAD','TBODY','TR','TH','TD','SPAN','IMG']);
  const imageTypes = new Set(['image/png','image/jpeg','image/webp']);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

  function safeStyle(value) {
    const allowed = [];
    for (const part of String(value || '').split(';')) {
      const [rawName,...rest] = part.split(':');
      const name = rawName?.trim().toLowerCase(), content = rest.join(':').trim().toLowerCase();
      if (name === 'text-align' && /^(left|right|center|justify)$/.test(content)) allowed.push(`${name}:${content}`);
      if (name === 'font-weight' && /^(bold|[6-9]00)$/.test(content)) allowed.push('font-weight:bold');
      if (name === 'font-style' && content === 'italic') allowed.push('font-style:italic');
      if (name === 'text-decoration' && /^(underline|line-through)$/.test(content)) allowed.push(`${name}:${content}`);
    }
    return allowed.join(';');
  }

  function cleanNode(node, destination, options) {
    if (node.nodeType === Node.TEXT_NODE) { destination.appendChild(document.createTextNode(node.textContent)); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if (['SCRIPT','STYLE','IFRAME','OBJECT','SVG','FORM','INPUT','BUTTON','META','LINK'].includes(tag)) return;
    if (!tags.has(tag)) { for (const child of [...node.childNodes]) cleanNode(child,destination,options); return; }
    if (tag === 'IMG') {
      const path = node.getAttribute('data-cepi-path');
      const temp = node.getAttribute('data-cepi-temp');
      const image = document.createElement('img');
      if (path && options.schoolId && path.startsWith(`${options.schoolId}/`) && /^[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f-]+\.(png|jpg|webp)$/.test(path)) image.dataset.cepiPath = path;
      else if (temp && options.pending?.has(temp)) { image.dataset.cepiTemp = temp; image.src = options.pending.get(temp).url; }
      else return;
      image.alt = (node.getAttribute('alt') || 'Imagem da questão').slice(0,160);
      destination.appendChild(image);
      return;
    }
    const element = document.createElement(tag.toLowerCase());
    const style = safeStyle(node.getAttribute('style'));
    if (style) element.setAttribute('style',style);
    if (tag === 'TD' || tag === 'TH') {
      for (const attr of ['colspan','rowspan']) {
        const value = Number(node.getAttribute(attr));
        if (Number.isInteger(value) && value >= 2 && value <= 10) element.setAttribute(attr,String(value));
      }
    }
    for (const child of [...node.childNodes]) cleanNode(child,element,options);
    destination.appendChild(element);
  }

  function sanitize(html, options={}) {
    const source = new DOMParser().parseFromString(String(html || ''),'text/html');
    const output = document.createElement('div');
    for (const child of [...source.body.childNodes]) cleanNode(child,output,options);
    return output.innerHTML;
  }

  function plain(value) {
    const text = String(value || '');
    if (!text.startsWith(marker)) return text;
    const source = new DOMParser().parseFromString(text.slice(marker.length),'text/html');
    return source.body.textContent || '';
  }

  function render(value, schoolId) {
    const text = String(value || '');
    return text.startsWith(marker)
      ? `<div class="cepi-rich-content">${sanitize(text.slice(marker.length),{schoolId})}</div>`
      : `<div class="cepi-rich-content cepi-rich-plain">${escape(text)}</div>`;
  }

  async function hydrate(root, db, schoolId) {
    const images = [...root.querySelectorAll('img[data-cepi-path]')];
    await Promise.all(images.map(async image => {
      const path = image.dataset.cepiPath;
      if (!path.startsWith(`${schoolId}/`)) return;
      const {data,error} = await db.storage.from(bucket).createSignedUrl(path,900);
      if (!error && data?.signedUrl) image.src = data.signedUrl;
      else image.replaceWith(document.createTextNode('[Imagem indisponível]'));
    }));
  }

  function mount(editor, {db,schoolId,onError}) {
    const pending = new Map();
    const notify = error => onError?.(error.message || String(error));
    let lastRange = null;
    const rememberSelection = () => { const selection=window.getSelection(); if(selection.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer)) lastRange=selection.getRangeAt(0).cloneRange(); };
    editor.addEventListener('keyup',rememberSelection);
    editor.addEventListener('mouseup',rememberSelection);
    const savedSelection = () => {
      editor.focus();
      const selection = window.getSelection();
      let range = selection.rangeCount ? selection.getRangeAt(0) : null;
      if (!range || !editor.contains(range.commonAncestorContainer)) {
        range = lastRange && editor.contains(lastRange.commonAncestorContainer) ? lastRange : document.createRange();
        if (range !== lastRange) { range.selectNodeContents(editor); range.collapse(false); }
      }
      return {selection,range};
    };
    const insert = node => {
      const {selection,range} = savedSelection();
      const lastNode = node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? node.lastChild : node;
      range.deleteContents(); range.insertNode(node); range.setStartAfter(lastNode); range.collapse(true);
      selection.removeAllRanges(); selection.addRange(range);
      lastRange=range.cloneRange();
    };
    const optimize = async file => {
      if(file.size<=2000000)return file;
      const url=URL.createObjectURL(file);
      try {
        const image=new Image(); image.src=url; await image.decode();
        const factor=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
        const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*factor);canvas.height=Math.round(image.naturalHeight*factor);
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
        for(const quality of [0.86,0.72,0.58]) {
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
          if(blob?.size<=2000000)return blob;
        }
        throw new Error('Não foi possível reduzir a imagem para 2 MB.');
      } finally {URL.revokeObjectURL(url);}
    };
    const addImage = async file => {
      if (!file || !imageTypes.has(file.type)) throw new Error('Use imagem PNG, JPG ou WebP.');
      if (file.size > 10000000) throw new Error('A imagem original deve ter até 10 MB.');
      file=await optimize(file);
      const id = crypto.randomUUID(), url = URL.createObjectURL(file);
      pending.set(id,{file,url});
      const image = document.createElement('img'); image.dataset.cepiTemp = id; image.src = url; image.alt = 'Imagem da questão';
      insert(image);
    };
    const insertText = text => {
      const parts = String(text || '').split(/\r?\n/), fragment = document.createDocumentFragment();
      parts.forEach((part,index) => { if (index) fragment.appendChild(document.createElement('br')); fragment.appendChild(document.createTextNode(part)); });
      if (fragment.childNodes.length) insert(fragment);
    };
    const onPaste = async event => {
      event.preventDefault();
      try {
        const clipboard = event.clipboardData;
        const files = [...(clipboard?.items||[])].filter(item=>item.kind==='file' && imageTypes.has(item.type)).map(item=>item.getAsFile()).filter(Boolean);
        const html = clipboard.getData('text/html');
        if (html) {
          const source = new DOMParser().parseFromString(html,'text/html');
          for (const image of [...source.body.querySelectorAll('img')]) {
            const src = image.getAttribute('src') || '';
            let file = null;
            if (/^data:image\/(png|jpeg|webp);base64,/i.test(src)) {
              const [meta,base64] = src.split(',',2);
              if (base64.length > 14000000) throw new Error('Imagem colada muito grande.');
              const bytes = Uint8Array.from(atob(base64),character=>character.charCodeAt(0));
              file = new Blob([bytes],{type:meta.slice(5,-7).toLowerCase()});
            } else file = files.shift();
            if (!file) { image.replaceWith(source.createTextNode('[Imagem não copiada; cole a imagem separadamente.]')); continue; }
            if (file.size > 10000000) throw new Error('A imagem original deve ter até 10 MB.');
            file=await optimize(file);
            const id = crypto.randomUUID(),url = URL.createObjectURL(file);
            pending.set(id,{file,url}); image.removeAttribute('src'); image.dataset.cepiTemp = id;
          }
          const wrapper = document.createElement('div'); wrapper.innerHTML = sanitize(source.body.innerHTML,{schoolId,pending});
          if (wrapper.childNodes.length) { const fragment=document.createDocumentFragment(); while(wrapper.firstChild)fragment.appendChild(wrapper.firstChild); insert(fragment); }
        } else if (clipboard.getData('text/plain')) insertText(clipboard.getData('text/plain'));
        for (const file of files) await addImage(file);
      } catch(error) { notify(error); }
    };
    editor.addEventListener('paste',onPaste);
    editor.addEventListener('drop',event=>event.preventDefault());
    return {
      insertImage:file=>addImage(file).catch(notify),
      async serialize() {
        const html = sanitize(editor.innerHTML,{schoolId,pending});
        const holder = document.createElement('div'); holder.innerHTML = html;
        if (!(holder.textContent || '').trim() && !holder.querySelector('img')) throw new Error('Escreva o enunciado da questão.');
        const uploaded=[];
        try {
          for (const image of holder.querySelectorAll('img[data-cepi-temp]')) {
            const entry = pending.get(image.dataset.cepiTemp);
            if (!entry) throw new Error('Uma imagem colada não está disponível. Cole novamente.');
            const auth=await db.auth.getUser();
            if(auth.error || !auth.data.user?.id)throw new Error('Entre novamente para salvar a imagem.');
            const path = `${schoolId}/${auth.data.user.id}/${crypto.randomUUID()}.${entry.file.type==='image/jpeg'?'jpg':entry.file.type.split('/')[1]}`;
            const {error} = await db.storage.from(bucket).upload(path,entry.file,{contentType:entry.file.type,upsert:false});
            if (error) throw error;
            uploaded.push(path); image.dataset.cepiPath=path; image.removeAttribute('data-cepi-temp'); image.removeAttribute('src');
          }
          const result = marker + sanitize(holder.innerHTML,{schoolId});
          if (result.length > 30000) throw new Error('A questão ultrapassou 30 mil caracteres. Reduza o texto.');
          return {value:result,uploaded};
        } catch(error) { if(uploaded.length)await db.storage.from(bucket).remove(uploaded); throw error; }
      },
      async rollback(paths) { if(paths?.length) await db.storage.from(bucket).remove(paths); },
      dispose() { for (const entry of pending.values()) URL.revokeObjectURL(entry.url); pending.clear(); }
    };
  }

  window.CepiRichText = {marker,bucket,sanitize,plain,render,hydrate,mount};
})();
