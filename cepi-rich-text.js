(() => {
  'use strict';

  const marker = '<!--cepi-rich-v1-->';
  const bucket = 'cepi-question-images';
  const tags = new Set(['DIV','P','BR','B','STRONG','I','EM','U','S','SUP','SUB','UL','OL','LI','BLOCKQUOTE','H2','H3','TABLE','THEAD','TBODY','TR','TH','TD','SPAN','IMG']);
  const imageTypes = new Set(['image/png','image/jpeg','image/webp']);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const imageWidth = value => { const width=Number(value); return Number.isInteger(width) && width>=10 && width<=100 ? width : null; };
  const imageAlign = value => ['left','center','right'].includes(value) ? value : 'center';
  const imageRotation = value => [0,90,180,270].includes(Number(value)) ? Number(value) : 0;
  const styleImage = image => {
    const width=imageWidth(image.dataset.cepiWidth);
    const align=imageAlign(image.dataset.cepiAlign);
    const sideways=imageRotation(image.dataset.cepiRotation)%180!==0;
    image.style.width=width ? `${width}%` : '';
    image.style.maxWidth=sideways?'70%':'';
    image.style.marginTop=sideways?'15%':'';
    image.style.marginBottom=sideways?'15%':'';
    image.style.marginLeft=align==='right' ? 'auto' : align==='center' ? 'auto' : '0';
    image.style.marginRight=align==='left' ? 'auto' : align==='center' ? 'auto' : '0';
    image.style.transform=`rotate(${imageRotation(image.dataset.cepiRotation)}deg)`;
    image.style.transformOrigin='center center';
  };

  function safeStyle(value) {
    const allowed = [];
    for (const part of String(value || '').split(';')) {
      const [rawName,...rest] = part.split(':');
      const name = rawName?.trim().toLowerCase(), content = rest.join(':').trim().toLowerCase();
      if (name === 'text-align' && /^(left|right|center|justify)$/.test(content)) allowed.push(`${name}:${content}`);
      if (name === 'font-weight' && /^(bold|[6-9]00)$/.test(content)) allowed.push('font-weight:bold');
      if (name === 'font-style' && content === 'italic') allowed.push('font-style:italic');
      if (name === 'text-decoration' && /^(underline|line-through)$/.test(content)) allowed.push(`${name}:${content}`);
      if (name === 'font-size' && /^(10|11|12|14|16|18)pt$/.test(content)) allowed.push(`${name}:${content}`);
      if (['color','background-color'].includes(name)) {
        let color=/^#[0-9a-f]{6}$/.test(content) ? content : null;
        const rgb=content.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/);
        if(!color && rgb && rgb.slice(1).every(part=>Number(part)<=255))color='#'+rgb.slice(1).map(part=>Number(part).toString(16).padStart(2,'0')).join('');
        if(color)allowed.push(`${name}:${color}`);
      }
      if (name === 'width' && /^(?:[1-9][0-9]?|100)%$/.test(content)) allowed.push(`${name}:${content}`);
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
      const width=imageWidth(node.getAttribute('data-cepi-width'));
      if(width)image.dataset.cepiWidth=String(width);
      image.dataset.cepiAlign=imageAlign(node.getAttribute('data-cepi-align'));
      image.dataset.cepiRotation=String(imageRotation(node.getAttribute('data-cepi-rotation')));
      styleImage(image);
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

  async function hydrate(root, db, schoolId, imageBucket=bucket) {
    const images = [...root.querySelectorAll('img[data-cepi-path]')];
    await Promise.all(images.map(async image => {
      const path = image.dataset.cepiPath;
      if (!path.startsWith(`${schoolId}/`)) return;
      const {data,error} = await db.storage.from(imageBucket).createSignedUrl(path,900);
      if (!error && data?.signedUrl) image.src = data.signedUrl;
      else image.replaceWith(document.createTextNode('[Imagem indisponível]'));
    }));
  }

  const toolbar = (id,klass='cepi-rich-toolbar') => `<div class="${klass} rich-toolbar-modern" data-editor="${escape(id)}" aria-label="Formatação da questão">
    <div class="rich-tool-group" aria-label="Histórico e estilo">
      <button type="button" class="rich-tool" data-command="undo" title="Desfazer" aria-label="Desfazer">↶</button><button type="button" class="rich-tool" data-command="redo" title="Refazer" aria-label="Refazer">↷</button>
      <button type="button" class="rich-tool" data-command="bold" title="Negrito" aria-label="Negrito"><b>B</b></button><button type="button" class="rich-tool" data-command="italic" title="Itálico" aria-label="Itálico"><i>I</i></button><button type="button" class="rich-tool" data-command="underline" title="Sublinhado" aria-label="Sublinhado"><u>S</u></button>
    </div><div class="rich-tool-group" aria-label="Aparência do trecho selecionado">
      <label class="rich-tool-label">Tamanho <select data-text-size aria-label="Tamanho do texto selecionado"><option value="">Escolher</option><option value="10pt">10 pt</option><option value="11pt">11 pt</option><option value="12pt">12 pt</option><option value="14pt">14 pt</option><option value="16pt">16 pt</option><option value="18pt">18 pt</option></select></label>
      <label class="rich-tool-label">Letra <input type="color" data-text-color value="#17233a" aria-label="Cor da letra selecionada"></label>
      <label class="rich-tool-label">Marca-texto <input type="color" data-text-highlight value="#fff2a8" aria-label="Cor de fundo do texto selecionado"></label>
      <button type="button" class="rich-tool rich-tool-wide" data-clear-format title="Retirar a formatação do trecho selecionado">Limpar</button>
    </div><div class="rich-tool-group" aria-label="Parágrafo e listas">
      <button type="button" class="rich-tool" data-command="justifyLeft" title="Alinhar à esquerda" aria-label="Alinhar à esquerda">☰</button><button type="button" class="rich-tool" data-command="justifyCenter" title="Centralizar" aria-label="Centralizar">≡</button><button type="button" class="rich-tool" data-command="justifyRight" title="Alinhar à direita" aria-label="Alinhar à direita">☷</button>
      <button type="button" class="rich-tool rich-tool-wide" data-command="insertUnorderedList" title="Lista com marcadores">• Lista</button><button type="button" class="rich-tool rich-tool-wide" data-command="insertOrderedList" title="Lista numerada">1. Lista</button>
    </div><div class="rich-tool-group" aria-label="Matemática">
      <button type="button" class="rich-tool" data-command="superscript" title="Sobrescrito, por exemplo x²" aria-label="Sobrescrito">x²</button><button type="button" class="rich-tool" data-command="subscript" title="Subscrito, por exemplo H₂O" aria-label="Subscrito">x₂</button>
      <select data-symbol aria-label="Inserir símbolo matemático"><option value="">Ω Símbolos</option>${['°','≤','≥','π','±','×','÷','√','∞','²','³','¼','½','¾','→','←','∑','Δ','α','β','μ'].map(symbol=>`<option value="${symbol}">${symbol}</option>`).join('')}</select>
    </div><div class="rich-tool-group" aria-label="Inserir objetos">
      <details class="rich-table-menu"><summary>▦ Tabela</summary><div class="rich-table-popover"><label>Linhas <input data-table-rows type="number" min="1" max="12" value="3"></label><label>Colunas <input data-table-columns type="number" min="1" max="8" value="3"></label><button type="button" data-table-insert>Inserir tabela</button></div></details>
      <button type="button" class="rich-tool rich-tool-wide" data-image>▧ Imagem</button><input type="file" accept="image/png,image/jpeg,image/webp" hidden>
    </div><div class="rich-object-tools rich-table-tools" hidden><strong>Tabela selecionada</strong><label>Largura <input type="range" data-table-width min="30" max="100" step="5" value="100"><output>100%</output></label><button type="button" data-table-action="row-above">+ Linha acima</button><button type="button" data-table-action="row-below">+ Linha abaixo</button><button type="button" data-table-action="column-left">+ Coluna antes</button><button type="button" data-table-action="column-right">+ Coluna depois</button><button type="button" data-table-action="merge-right">Mesclar à direita</button><button type="button" data-table-action="delete-row">− Linha</button><button type="button" data-table-action="delete-column">− Coluna</button></div>
    <div class="rich-object-tools cepi-image-tools cxe-image-tools" hidden><strong>Imagem selecionada</strong><label>Tamanho <input type="range" data-image-width min="10" max="100" step="5" aria-label="Tamanho da imagem"><output>100%</output></label><button type="button" data-image-align="left">Esquerda</button><button type="button" data-image-align="center">Centro</button><button type="button" data-image-align="right">Direita</button><button type="button" data-image-rotate="-90">↶ Girar 90°</button><button type="button" data-image-rotate="90">↷ Girar 90°</button><button type="button" data-image-move="-1">↑ Subir</button><button type="button" data-image-move="1">↓ Descer</button><button type="button" data-image-remove>Excluir imagem</button></div>
  </div>`;

  function bindToolbar(form,editor,{db,schoolId,imageBucket=bucket,onError}={}) {
    const tools=form.querySelector(`[data-editor="${editor.id}"]`),picker=tools.querySelector('input[type=file]');
    const imageTools=tools.querySelector('.rich-object-tools.cepi-image-tools'),tableTools=tools.querySelector('.rich-table-tools');
    const widthInput=imageTools.querySelector('[data-image-width]'),tableWidth=tableTools.querySelector('[data-table-width]');
    const control=mount(editor,{db,schoolId,imageBucket,onError,onImageSelection:image=>{
      imageTools.hidden=!image;if(!image)return;
      widthInput.value=String(image.width);imageTools.querySelector('output').textContent=`${image.width}%`;
      imageTools.querySelectorAll('[data-image-align]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.imageAlign===image.align)));
    },onTableSelection:table=>{
      tableTools.hidden=!table;if(!table)return;
      tableWidth.value=String(table.width);tableTools.querySelector('output').textContent=`${table.width}%`;
    }});
    tools.querySelectorAll('[data-command]').forEach(button=>{button.onmousedown=event=>event.preventDefault();button.onclick=()=>{editor.focus();document.execCommand(button.dataset.command,false,null);};});
    tools.querySelector('[data-text-size]').onchange=event=>{if(event.target.value)control.applyTextStyle('font-size',event.target.value);event.target.value='';};
    tools.querySelector('[data-text-color]').onchange=event=>control.applyTextStyle('color',event.target.value);
    tools.querySelector('[data-text-highlight]').onchange=event=>control.applyTextStyle('background-color',event.target.value);
    tools.querySelector('[data-clear-format]').onmousedown=event=>event.preventDefault();
    tools.querySelector('[data-clear-format]').onclick=()=>control.clearTextStyle();
    tools.querySelector('[data-symbol]').onchange=event=>{if(event.target.value)control.insertSymbol(event.target.value);event.target.value='';};
    tools.querySelector('[data-table-insert]').onclick=()=>{control.insertTable(tools.querySelector('[data-table-rows]').value,tools.querySelector('[data-table-columns]').value);tools.querySelector('.rich-table-menu').open=false;};
    tableTools.querySelectorAll('button').forEach(button=>{button.onmousedown=event=>event.preventDefault();button.onclick=()=>control.tableAction(button.dataset.tableAction);});
    tableWidth.oninput=()=>{control.setTableWidth(tableWidth.value);tableTools.querySelector('output').textContent=`${tableWidth.value}%`;};
    tools.querySelector('[data-image]').onclick=()=>picker.click();picker.onchange=async()=>{if(picker.files?.[0])await control.insertImage(picker.files[0]);picker.value='';};
    widthInput.oninput=()=>control.setImageWidth(Number(widthInput.value));
    imageTools.querySelectorAll('button').forEach(button=>button.onmousedown=event=>event.preventDefault());
    imageTools.querySelectorAll('[data-image-align]').forEach(button=>button.onclick=()=>control.setImageAlign(button.dataset.imageAlign));
    imageTools.querySelectorAll('[data-image-rotate]').forEach(button=>button.onclick=()=>control.rotateImage(button.dataset.imageRotate));
    imageTools.querySelectorAll('[data-image-move]').forEach(button=>button.onclick=()=>control.moveImage(Number(button.dataset.imageMove)));
    imageTools.querySelector('[data-image-remove]').onclick=()=>control.removeImage();
    return control;
  }

  function mount(editor, {db,schoolId,onError,onImageSelection,onTableSelection,imageBucket=bucket}) {
    const pending = new Map();
    const notify = error => onError?.(error.message || String(error));
    let lastRange = null;
    let selectedImage = null, selectedCell = null, draggedImage = null;
    const selectImage = image => {
      if(selectedImage)selectedImage.classList.remove('cepi-image-selected');
      selectedImage=image && editor.contains(image) ? image : null;
      if(selectedImage)selectedImage.classList.add('cepi-image-selected');
      onImageSelection?.(selectedImage ? {width:imageWidth(selectedImage.dataset.cepiWidth)||100,align:imageAlign(selectedImage.dataset.cepiAlign)} : null);
    };
    editor.addEventListener('click',event=>{
      selectImage(event.target.closest?.('img'));
      selectedCell=event.target.closest?.('td,th');
      onTableSelection?.(selectedCell ? {width:Number(selectedCell.closest('table')?.style.width.replace('%',''))||100} : null);
    });
    editor.addEventListener('dragstart',event=>{
      const image=event.target.closest?.('img');
      if(!image || !editor.contains(image))return;
      selectImage(image);draggedImage=image;
      event.dataTransfer.effectAllowed='move';
      event.dataTransfer.setData('text/plain','');
    });
    editor.addEventListener('dragover',event=>{if(draggedImage){event.preventDefault();event.dataTransfer.dropEffect='move';}});
    editor.addEventListener('dragend',()=>{draggedImage=null;});
    editor.addEventListener('drop',event=>{
      event.preventDefault();
      if(!draggedImage || !editor.contains(draggedImage))return;
      const range=document.caretRangeFromPoint?.(event.clientX,event.clientY);
      if(!range || !editor.contains(range.commonAncestorContainer) || range.commonAncestorContainer===draggedImage){draggedImage=null;return;}
      const image=draggedImage;draggedImage=null;
      range.insertNode(image);selectImage(image);
    });
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
    const selectedTextRange = () => {
      const {selection,range}=savedSelection();
      if (range.collapsed || !editor.contains(range.commonAncestorContainer)) { notify(new Error('Selecione primeiro uma palavra ou trecho da questão.')); return null; }
      const block = node => (node.nodeType===Node.ELEMENT_NODE ? node : node.parentElement)?.closest('p,div,li,td,th,blockquote') || editor;
      if (block(range.startContainer)!==block(range.endContainer)) { notify(new Error('Selecione um trecho dentro do mesmo parágrafo.')); return null; }
      selection.removeAllRanges();selection.addRange(range);
      return range;
    };
    const applyTextStyle = (property,value) => {
      const range=selectedTextRange();if(!range)return;
      const span=document.createElement('span');span.style.setProperty(property,value);
      span.appendChild(range.extractContents());range.insertNode(span);
      range.selectNodeContents(span);window.getSelection().removeAllRanges();window.getSelection().addRange(range);
      lastRange=range.cloneRange();editor.dispatchEvent(new Event('input',{bubbles:true}));
    };
    const tableAction = action => {
      const cell=selectedCell;if(!cell || !editor.contains(cell))return;
      const row=cell.closest('tr'),table=cell.closest('table');if(!row || !table)return;
      const index=[...row.cells].indexOf(cell);
      if(action==='row-below') { const next=row.cloneNode(false);for(const current of row.cells){const added=document.createElement(current.tagName.toLowerCase());added.appendChild(document.createElement('br'));next.appendChild(added);}row.after(next); }
      if(action==='row-above') { const next=row.cloneNode(false);for(const current of row.cells){const added=document.createElement(current.tagName.toLowerCase());added.appendChild(document.createElement('br'));next.appendChild(added);}row.before(next); }
      if(action==='column-right' || action==='column-left') {for(const currentRow of table.rows){const added=document.createElement('td');added.appendChild(document.createElement('br'));currentRow.insertBefore(added,currentRow.cells[index+(action==='column-right'?1:0)]||null);}}
      if(action==='delete-row' && table.rows.length>1) row.remove();
      if(action==='delete-column' && row.cells.length>1) for(const currentRow of table.rows) currentRow.cells[index]?.remove();
      if(action==='merge-right' && cell.nextElementSibling?.matches('td,th')) {const next=cell.nextElementSibling;cell.colSpan=(cell.colSpan||1)+(next.colSpan||1);while(next.firstChild)cell.appendChild(next.firstChild);next.remove();}
      if(!editor.contains(cell))selectedCell=null;
      onTableSelection?.(selectedCell ? {width:Number(table.style.width.replace('%',''))||100} : null);
      editor.dispatchEvent(new Event('input',{bubbles:true}));
    };
    const placeImageAtTop = image => {
      if(!imageWidth(image.dataset.cepiWidth))image.dataset.cepiWidth='60';
      image.dataset.cepiAlign=imageAlign(image.dataset.cepiAlign);
      styleImage(image);image.draggable=true;
      editor.insertBefore(image,editor.firstChild);
      selectImage(image);
      image.scrollIntoView({block:'nearest'});
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
      placeImageAtTop(image);
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
          const pastedImages=[...wrapper.querySelectorAll('img')];
          pastedImages.forEach(image=>{
            const parent=image.parentElement;image.remove();
            if(['P','DIV'].includes(parent?.tagName) && !parent.textContent.trim() && !parent.querySelector('img'))parent.remove();
          });
          if (wrapper.childNodes.length) { const fragment=document.createDocumentFragment(); while(wrapper.firstChild)fragment.appendChild(wrapper.firstChild); insert(fragment); }
          pastedImages.reverse().forEach(placeImageAtTop);
        } else if (clipboard.getData('text/plain')) insertText(clipboard.getData('text/plain'));
        for (const file of files) await addImage(file);
      } catch(error) { notify(error); }
    };
    editor.addEventListener('paste',onPaste);
    editor.querySelectorAll('img').forEach(image=>{image.draggable=true;styleImage(image);});
    return {
      applyTextStyle,
      clearTextStyle() {const range=selectedTextRange();if(range)document.execCommand('removeFormat',false,null);},
      insertSymbol(symbol) {if(/^[°≤≥π±×÷√∞²³¼½¾→←∑Δαβμ]+$/.test(symbol))insert(document.createTextNode(symbol));},
      insertTable(rows,columns) {
        rows=Number(rows);columns=Number(columns);
        if(!Number.isInteger(rows)||!Number.isInteger(columns)||rows<1||rows>12||columns<1||columns>8)return;
        const table=document.createElement('table');table.style.width='100%';const tbody=table.createTBody();
        for(let r=0;r<rows;r++){const row=tbody.insertRow();for(let c=0;c<columns;c++){const cell=row.insertCell();cell.appendChild(document.createElement('br'));}}
        insert(table);selectedCell=table.rows[0].cells[0];onTableSelection?.({width:100});
      },
      tableAction,
      setTableWidth(value) {const table=selectedCell?.closest('table');const width=Number(value);if(table && width>=30 && width<=100){table.style.width=`${width}%`;onTableSelection?.({width});}},
      insertImage:file=>addImage(file).catch(notify),
      setImageWidth(value) { if(!selectedImage)return;const width=imageWidth(value);if(!width)return;selectedImage.dataset.cepiWidth=String(width);styleImage(selectedImage);selectImage(selectedImage); },
      setImageAlign(value) { if(!selectedImage)return;selectedImage.dataset.cepiAlign=imageAlign(value);styleImage(selectedImage);selectImage(selectedImage); },
      rotateImage(direction) {if(!selectedImage || ![-90,90].includes(Number(direction)))return;selectedImage.dataset.cepiRotation=String((imageRotation(selectedImage.dataset.cepiRotation)+Number(direction)+360)%360);styleImage(selectedImage);selectImage(selectedImage);},
      moveImage(direction) {
        if(!selectedImage || ![-1,1].includes(direction))return;
        const image=selectedImage;
        let block=image;while(block.parentElement && block.parentElement!==editor)block=block.parentElement;
        let neighbour=direction<0 ? block.previousSibling : block.nextSibling;
        if(!neighbour)return;
        const inline=node=>node.nodeType===Node.TEXT_NODE || ['BR','SPAN','B','STRONG','I','EM','U','S'].includes(node.nodeName);
        if(direction<0 && inline(neighbour))while(neighbour.previousSibling && inline(neighbour.previousSibling) && neighbour.previousSibling.nodeName!=='BR')neighbour=neighbour.previousSibling;
        if(direction>0 && inline(neighbour))while(neighbour.nodeName!=='BR' && neighbour.nextSibling && inline(neighbour.nextSibling))neighbour=neighbour.nextSibling;
        const originalParent=image.parentElement;
        const wrapper=document.createElement('div');wrapper.appendChild(image);
        if(direction<0)editor.insertBefore(wrapper,neighbour);
        else editor.insertBefore(wrapper,neighbour.nextSibling);
        if(originalParent!==editor && originalParent!==wrapper && !originalParent.textContent.trim() && !originalParent.querySelector('img'))originalParent.remove();
        selectImage(image);
      },
      removeImage() {
        if(!selectedImage)return;
        const image=selectedImage, parent=image.parentElement, temp=image.dataset.cepiTemp;
        image.remove();
        if(parent!==editor && ['DIV','P'].includes(parent?.tagName) && !parent.textContent.trim() && !parent.querySelector('img'))parent.remove();
        if(temp && ![...editor.querySelectorAll('img[data-cepi-temp]')].some(item=>item.dataset.cepiTemp===temp)) {
          const entry=pending.get(temp);if(entry)URL.revokeObjectURL(entry.url);
          pending.delete(temp);
        }
        selectImage(null);
        editor.focus();
      },
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
            const {error} = await db.storage.from(imageBucket).upload(path,entry.file,{contentType:entry.file.type,upsert:false});
            if (error) throw error;
            uploaded.push(path); image.dataset.cepiPath=path; image.removeAttribute('data-cepi-temp'); image.removeAttribute('src');
          }
          const result = marker + sanitize(holder.innerHTML,{schoolId});
          if (result.length > 30000) throw new Error('A questão ultrapassou 30 mil caracteres. Reduza o texto.');
          return {value:result,uploaded};
        } catch(error) { if(uploaded.length)await db.storage.from(imageBucket).remove(uploaded); throw error; }
      },
      async rollback(paths) { if(paths?.length) await db.storage.from(imageBucket).remove(paths); },
      dispose() { for (const entry of pending.values()) URL.revokeObjectURL(entry.url); pending.clear(); }
    };
  }

  const toolbarStyle=document.createElement('style');
  toolbarStyle.textContent=`.rich-toolbar-modern{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px!important;background:linear-gradient(120deg,#f4f7ff,#eef3fb)!important;border:1px solid #cbd6eb!important;border-radius:12px 12px 0 0!important;box-shadow:0 5px 18px #243b6210}.rich-toolbar-modern .rich-tool-group{display:flex;align-items:center;flex-wrap:wrap;gap:5px;padding:4px 7px;border:1px solid #dce5f4;border-radius:9px;background:#ffffffb8}.rich-toolbar-modern button,.rich-toolbar-modern summary{min-height:34px;border:1px solid #d4deef;border-radius:7px;background:#fff;color:#26385d;font-size:13px;font-weight:700;cursor:pointer}.rich-toolbar-modern button:hover,.rich-toolbar-modern summary:hover{background:#e8efff;border-color:#a9bef0}.rich-toolbar-modern button:focus-visible,.rich-toolbar-modern select:focus-visible,.rich-toolbar-modern input:focus-visible,.rich-toolbar-modern summary:focus-visible{outline:2px solid #6255db;outline-offset:2px}.rich-toolbar-modern .rich-tool{min-width:34px;padding:5px 8px}.rich-toolbar-modern .rich-tool-wide{white-space:nowrap}.rich-toolbar-modern .rich-tool-group:nth-of-type(4){flex-wrap:nowrap}.rich-toolbar-modern [data-symbol]{width:112px!important;min-width:112px;max-width:112px}.rich-toolbar-modern .rich-tool-label,.rich-toolbar-modern .rich-object-tools label{display:flex;flex-direction:row;align-items:center;gap:5px;margin:0;color:#405273;font-size:12px;font-weight:750}.rich-toolbar-modern select{width:auto;min-width:85px;min-height:34px;padding:4px 7px;border:1px solid #d4deef;border-radius:7px;background:#fff;color:#26385d;font-size:13px}.rich-toolbar-modern input[type=color]{width:34px;height:32px;min-height:32px;padding:2px;border:1px solid #d4deef;border-radius:7px;background:#fff;cursor:pointer}.rich-toolbar-modern .rich-table-menu{position:relative}.rich-toolbar-modern .rich-table-menu summary{list-style:none;padding:7px 10px}.rich-toolbar-modern .rich-table-menu summary::-webkit-details-marker{display:none}.rich-toolbar-modern .rich-table-popover{position:absolute;z-index:15;left:0;top:38px;display:flex;align-items:end;gap:8px;padding:12px;border:1px solid #cbd6eb;border-radius:10px;background:#fff;box-shadow:0 12px 32px #17233a25}.rich-toolbar-modern .rich-table-popover label{display:grid;gap:4px;font-size:12px;font-weight:700}.rich-toolbar-modern .rich-table-popover input[type=number]{width:65px;min-height:34px;padding:4px}.rich-toolbar-modern .rich-table-popover button{white-space:nowrap;padding:7px 10px}.rich-toolbar-modern .rich-object-tools{display:flex;align-items:center;flex-wrap:wrap;gap:7px;width:100%;padding:9px;border:1px solid #dce5f4;border-radius:9px;background:#fff}.rich-toolbar-modern .rich-object-tools[hidden]{display:none!important}.rich-toolbar-modern .rich-object-tools strong{color:#30466f;font-size:12px}.rich-toolbar-modern .rich-object-tools input[type=range]{width:105px;min-height:0}.rich-toolbar-modern .rich-object-tools output{font-size:12px}.rich-toolbar-modern .rich-object-tools button{padding:5px 8px;font-size:12px}.rich-toolbar-modern [data-image-remove],.rich-toolbar-modern [data-table-action^=delete]{color:#a22631;border-color:#f0c8cc}.cepi-rich-content img[data-cepi-rotation],.cepi-rich-editor img[data-cepi-rotation],.cxe-rich-editor img[data-cepi-rotation]{transform-origin:center center}@media(max-width:650px){.rich-toolbar-modern{gap:6px;padding:7px!important}.rich-toolbar-modern .rich-tool-group{padding:4px}.rich-toolbar-modern .rich-table-popover{left:auto;right:0;flex-wrap:wrap;min-width:210px}}`;
  document.head.appendChild(toolbarStyle);
  window.CepiRichText = {marker,bucket,sanitize,plain,render,hydrate,mount,toolbar,bindToolbar};
})();
