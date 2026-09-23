(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.hash.slice(1));
  const session = params.get('session'), token = params.get('token');
  // The capability stays in this tab's memory, never in URLs sent to a server or analytics.
  history.replaceState(null, '', location.pathname);
  let stream, pendingImage = '', active = false, keyReady = false, uploading = false, stopped = false, opening = false, connectedOnce = false, cameraAttempt = 0;
  let scanWorker=null,scanTimer=null,assessment=null;
  const outbox = []; let capturedStudentId = '', mobileWorkflow = false, currentKey = null, roster = [], keyDraftId = '', resultItem = null, focusedCapture = '', dismissed = new Set(); let capturedKind = '', sessionKnown = false, studentAutoSend = false, lastRemote = [];
  const tell = message => { $('notice').textContent = message; };
  const canCapture = () => sessionKnown && !stopped;
  const setEnabled = () => {
    const disabled = !canCapture();
    const needsStudent = mobileWorkflow && $('kind').value==='student' && !roster.some(r=>r.id===$('student-select').value);
    $('send').disabled = disabled || uploading; $('send').textContent = active ? 'Enviar esta foto' : 'Guardar foto e aguardar conexão';
    $('snap').disabled = disabled || needsStudent || document.body.classList.contains('camera-complete') || (mobileWorkflow && outbox.some(i=>i.id===focusedCapture && ['waiting','sending','received','queued','processing'].includes(i.status))); $('camera').disabled = disabled || needsStudent || opening;
    for (const id of ['file','native-file','native-camera','gallery']) $(id).disabled = disabled || needsStudent;
    $('students').disabled = disabled || !keyReady || !!pendingImage; $('students').hidden = !keyReady || $('kind').value === 'student';
    $('kind').disabled = !!pendingImage;
  };
  async function api(action, body = {}) {
    const response = await fetch(`/api/${session}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Exam-Token': token }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const data = await response.json();
    if (!response.ok) { if ([401, 410].includes(response.status)) { stopped = true; active = false; stopCamera(); setEnabled(); } throw new Error(data.error || 'Não foi possível enviar.'); }
    return data;
  }
  function showCamera(show) { $('camera-view').hidden = !show; document.body.classList.toggle('camera-open', show); }
  function stopCamera() { clearTimeout(scanTimer);scanWorker?.terminate();scanWorker=null; cameraAttempt++; opening = false; stream?.getTracks().forEach(t => t.stop()); stream = null; $('video').srcObject = null; $('video').hidden = true; $('snap').hidden = true; showCamera(false); document.body.classList.remove('camera-complete');$('camera-result').hidden=true;$('camera-photo').hidden=true;$('camera-photo').removeAttribute('src');$('camera-summary').textContent='';setEnabled(); }
  async function deadline(promise) {
    let timer;
    try { return await Promise.race([promise, new Promise((_,reject) => { timer = setTimeout(function cameraDeadline() { reject(Object.assign(new Error(), { name: 'CameraTimeout' })); }, 15000); })]); }
    finally { clearTimeout(timer); }
  }
  async function camera() {
    if (!canCapture() || opening) return;
    if(mobileWorkflow && $('kind').value==='student' && !$('student-select').value){tell('Escolha o aluno antes de abrir a câmera.');$('student-select').focus();return;}
    stopCamera(); const attempt = cameraAttempt; opening = true; setEnabled();
    $('native-camera').hidden = true; $('camera-status').textContent = 'Abrindo câmera… Autorize o acesso se solicitado.'; showCamera(true);
    tell('Aguardando a câmera. Se aparecer um pedido de permissão, toque em Permitir.');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(), { name: 'UnsupportedCamera' });
      const opened = await deadline(navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(result => {
        if (attempt !== cameraAttempt || !canCapture()) { result.getTracks().forEach(t => t.stop()); return null; }
        return result;
      }));
      if (!opened) return;
      if (attempt !== cameraAttempt || !canCapture()) { opened.getTracks().forEach(t => t.stop()); return; }
      stream = opened; const video = $('video'); video.srcObject = stream; video.muted = true; video.playsInline = true; video.hidden = false;
      await deadline(video.play());
      if (!video.videoWidth) {
        let onReady;
        try { await deadline(new Promise(resolve => { onReady = () => { if(video.videoWidth) resolve(); }; video.addEventListener('loadeddata', onReady); video.addEventListener('resize', onReady); onReady(); })); }
        finally { video.removeEventListener('loadeddata', onReady); video.removeEventListener('resize', onReady); }
      }
      if (attempt !== cameraAttempt) return;
      $('camera-status').textContent = mobileWorkflow?'Enquadre as marcações e mantenha o celular parado. A leitura começará automaticamente.':'Câmera pronta';startAutomaticScan(); $('snap').hidden = false; tell(mobileWorkflow?'Enquadre as marcações. A captura é automática quando o cartão estiver estável.':'Câmera aberta. Enquadre a folha e toque em Fotografar folha.');
    } catch (error) {
      if (attempt !== cameraAttempt) return;
      stopCamera();
      const reason = { NotAllowedError: 'O navegador bloqueou a câmera. Permita o acesso à câmera nas configurações deste site.', NotFoundError: 'O navegador não encontrou uma câmera.', NotReadableError: 'A câmera está ocupada. Feche outros aplicativos que usam a câmera.', UnsupportedCamera: 'Este navegador não oferece câmera dentro da página. Abra o QR no Chrome ou Safari.' }[error.name] || 'Não foi possível iniciar a câmera neste navegador.';
      $('native-camera').hidden = false;
      tell((error.name === 'CameraTimeout' ? 'A câmera não apresentou imagem. Feche outros aplicativos ou vídeos que estejam usando a câmera e tente novamente.' : reason) + ' Se continuar, toque em “Tentar pelo aplicativo de câmera”.');
    } finally { if (attempt === cameraAttempt) opening = false; setEnabled(); }
  }
  function startAutomaticScan(){
    if(!mobileWorkflow||!window.Worker)return;
    scanWorker?.terminate();scanWorker=new Worker('card-detector.js');
    const takeFrame=()=>{if(!stream||$('camera-view').hidden||!$('camera-photo').hidden||$('snap').disabled)return;
      const video=$('video'),scale=Math.min(640/video.videoWidth,960/video.videoHeight),canvas=document.createElement('canvas');canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(video,0,0,canvas.width,canvas.height);const pixels=context.getImageData(0,0,canvas.width,canvas.height);
      scanWorker?.postMessage({buffer:pixels.data.buffer,width:canvas.width,height:canvas.height,expected:currentKey?.answers.length||assessment?.total||0},[pixels.data.buffer]);
    };
    scanWorker.onmessage=({data})=>{if(!stream||!$('camera-photo').hidden)return;$('camera-status').textContent=data.reason;
      if(data.capture&&!$('snap').disabled){clearTimeout(scanTimer);$('snap').click();return;}scanTimer=setTimeout(takeFrame,450);
    };
    scanTimer=setTimeout(takeFrame,450);
  }
  function resize(source, width, height) {
    const canvas = document.createElement('canvas'), scale = Math.min(1, 2200 / Math.max(width, height));
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    let quality = .88, image = canvas.toDataURL('image/jpeg', quality);
    while (image.length > 1400000 && quality > .5) { quality -= .08; image = canvas.toDataURL('image/jpeg', quality); }
    if (image.length > 1400000) throw new Error('Foto muito grande. Aproxime e fotografe novamente.');
    return image;
  }
  function preview(image) {
    if(mobileWorkflow && $('kind').value==='student' && !$('student-select').value){tell('Escolha o aluno antes de fotografar.');return;}
    if (outbox.filter(i => i.image).length >= 5) { tell('Há cinco fotos aguardando envio. Aguarde a conexão antes da próxima foto.'); $('camera-status').textContent = 'Fila cheia — aguarde o envio'; return; }
    pendingImage = image; capturedKind = $('kind').value; capturedStudentId = $('student-select').value;
    if (mobileWorkflow) { $('camera-photo').src=image;$('camera-photo').hidden=false;enqueue(); return; }
    if (capturedKind === 'student' && studentAutoSend) { enqueue(); return; }
    showCamera(false); $('preview').src = image; $('preview').hidden = false; $('confirm').hidden = false; $('snap').hidden = true; setEnabled(); $('confirm').scrollIntoView?.({block:'center',behavior:'smooth'});
  }
  function reset() { pendingImage = ''; capturedKind = ''; capturedStudentId = ''; $('preview').removeAttribute('src'); $('preview').hidden = true; $('confirm').hidden = true; $('snap').hidden = !stream; showCamera(!!stream); $('file').value = ''; $('native-file').value = ''; updateStep(); setEnabled(); }
  function updateStep() {
    const student = $('kind').value === 'student';
    if(mobileWorkflow) {
      $('step').textContent=student?'Primeiro, selecione o aluno':'Comece pelo gabarito oficial';
      $('help').textContent=student?'Escolha o aluno e enquadre somente as questões da disciplina aberta.':`Enquadre somente o gabarito de ${assessment?.subject||'sua disciplina'}${assessment?' — '+assessment.total+' questões':''}.`;
      $('snap').textContent='Ler agora';
      $('camera').textContent=student?'Fotografar prova do aluno':'Fotografar gabarito oficial';
      $('camera-student').textContent=student?(roster.find(r=>r.id===$('student-select').value)?.name||'Escolha o aluno'):`Gabarito oficial${assessment?' · '+assessment.subject+' · '+assessment.total+' questões':''}`;
      $('stage-key').classList.toggle('active',!keyReady); $('stage-students').classList.toggle('active',keyReady);
      return;
    }
    $('step').textContent = student ? '2. Provas dos alunos' : '1. Gabarito oficial';
    $('help').textContent = student ? 'Fotografe uma prova por vez, incluindo o nome do aluno. Envie e fotografe o próximo aluno.' : keyReady ? 'Gabarito confirmado. Toque em Fotografar provas dos alunos para continuar.' : 'Envie o gabarito e confirme a leitura no computador para liberar as provas dos alunos.';
    $('snap').textContent = student ? (studentAutoSend ? 'Fotografar próxima e enviar' : 'Fotografar primeira prova') : 'Fotografar gabarito oficial';
  }
  async function flush() {
    if (uploading || !active) return;
    const item = outbox.find(i => i.status === 'waiting'); if (!item) return;
    uploading = true; const uploadStarted=Date.now(); setEnabled(); item.status = 'sending'; render();
    try { await api('upload', { id: item.id, kind: item.kind, image: item.image, studentId: item.studentId || '' }); item.uploadMs=Date.now()-uploadStarted; item.status = 'received'; item.image = ''; tell(mobileWorkflow ? 'Foto enviada. Lendo a folha… O resultado aparecerá neste celular.' : item.kind === 'official' ? 'Gabarito recebido. Confirme a leitura no computador e depois toque em Fotografar provas dos alunos.' : 'Foto recebida no computador. Pode fotografar a próxima.'); }
    catch (error) { item.status = 'failed'; tell(error.message + ' A foto continua nesta aba para tentar novamente.'); }
    finally { uploading = false; setEnabled(); render(); if (outbox.some(i => i.status === 'waiting')) flush(); }
  }
  function render(remote = lastRemote) {
    lastRemote = remote;
    for (const item of remote) if (!outbox.some(i=>i.id===item.id)) outbox.push({id:item.id,kind:item.kind,status:item.status,image:''});
    $('queue').replaceChildren();
    const labels = { waiting: 'aguardando envio', sending: 'enviando', received: 'recebida', queued: 'na fila de leitura', processing: 'lendo', ready: mobileWorkflow ? 'leitura concluída no celular' : 'disponível para revisão no computador', error: mobileWorkflow ? 'não foi possível ler — tente outra foto' : 'revisão necessária no computador', failed: 'falha no envio', discarded: 'descartada pelo professor' };
    for (const [index, item] of outbox.entries()) {
      const server = remote.find(r => r.id === item.id), li = document.createElement('li');
      if (server) { item.status = server.status; item.image = ''; }
      li.textContent = `${item.kind === 'official' ? 'Gabarito' : 'Prova '+outbox.slice(0,index+1).filter(i=>i.kind==='student').length} — ${labels[item.status] || item.status}`;
      if (item.status === 'failed') { const b = document.createElement('button'); b.textContent = 'Tentar enviar novamente'; b.onclick = () => { item.status = 'waiting'; flush(); }; li.append(b); }
      if(mobileWorkflow && item.status==='error') {
        for(const [label,action] of [['Tentar ler novamente','mobile-retry'],['Descartar esta foto','mobile-discard']]) {
          const button=document.createElement('button');button.textContent=label;button.className='secondary';button.onclick=async()=>{button.disabled=true;try{await api(action,{id:item.id});tell(action==='mobile-retry'?'Nova leitura solicitada.':'Foto descartada. Você pode fotografar outra.');}catch(e){tell(e.message);}finally{button.disabled=false;}};li.append(button);
        }
      }
      $('queue').append(li);
    }
    const reading = remote.filter(i=>['queued','processing'].includes(i.status)).length, ready = remote.filter(i=>i.status==='ready').length;
    $('progress').textContent = `${ready} leitura(s) pronta(s) · ${reading} aguardando ou em leitura · ${outbox.filter(i=>i.image).length} aguardando envio`;
    $('camera-progress').textContent = $('progress').textContent;
    const focused=outbox.find(i=>i.id===focusedCapture),status=focused?.status;document.body.dataset.readStage=document.body.classList.contains('camera-complete')?'ready':status||'idle';
    if(mobileWorkflow) document.body.classList.toggle('reading',!document.body.classList.contains('camera-complete')&&(reading>0||outbox.some(i=>['waiting','sending','received'].includes(i.status))));
  }
  async function poll() {
    if (stopped) return;
    try {
      const status = await api('status'); const justReady = !keyReady && !!status.key; active = status.active; keyReady = !!status.key; sessionKnown = true; mobileWorkflow=!!status.mobileWorkflow; currentKey=typeof status.key==='object'?status.key:null; roster=status.roster||[];assessment=status.assessment||null;
      $('context').textContent = status.context; $('capture').hidden = false;
      $('kind').options[1].disabled = !keyReady;
      if (justReady && !pendingImage) { $('kind').value = 'student'; tell(mobileWorkflow ? 'Gabarito oficial pronto. Primeiro selecione o aluno; depois leia o cartão-resposta dele.' : 'Agora fotografe as provas dos alunos. A primeira foto será conferida; as seguintes serão enviadas automaticamente.'); }
      updateStep();
      $('connection').textContent = active ? 'Conectado ao computador. Envio liberado.' : status.block && status.scanRequested && !status.activated ? 'Vinculando seu acesso a este bloco… Mantenha o Assistente aberto no computador.' : status.pauseReason === 'context' ? 'Envio pausado: confira o gabarito e vincule a avaliação no computador. Você pode fotografar; as fotos aguardam nesta aba.' : 'Computador sem conexão recente. Deixe o SIAP e o Assistente abertos. Você pode fotografar; as fotos aguardam nesta aba.';
      if (active && !connectedOnce) { tell('Celular conectado. O QR Code não precisa ser lido novamente nesta sessão.'); connectedOnce = true; }
      render(status.items); renderMobile(status); setEnabled(); flush();
    } catch (error) { active = false; $('connection').textContent = 'Envio indisponível. As fotos não enviadas permanecem nesta aba.'; setEnabled(); tell(error.message); }
    if (!stopped) setTimeout(poll, outbox.some(i=>['waiting','sending','received','queued','processing'].includes(i.status))?1000:3500);
  }
  $('camera').onclick = camera; $('stop').onclick = stopCamera;
  $('snap').onclick = () => { try { if (!$('video').videoWidth) throw new Error('Aguarde a câmera.'); preview(resize($('video'), $('video').videoWidth, $('video').videoHeight)); } catch (e) { tell(e.message); } };
  async function selectFile(event) {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 20000000) throw new Error('Selecione uma foto menor que 20 MB.');
      const url = URL.createObjectURL(file);
      try { const image = new Image(); image.src = url; await image.decode(); preview(resize(image, image.naturalWidth, image.naturalHeight)); }
      finally { URL.revokeObjectURL(url); }
    } catch { tell('Não foi possível ler esta foto. Tire outra foto ou selecione uma imagem JPEG/PNG da galeria.'); }
  }
  $('file').onchange = selectFile; $('native-file').onchange = selectFile;
  $('native-camera').onclick = () => { if (canCapture()) { stopCamera(); $('native-file').click(); } };
  $('gallery').onclick = () => { if (canCapture()) { stopCamera(); $('file').click(); } };
  $('students').onclick = () => { if (!keyReady || pendingImage) return; $('kind').value = 'student'; updateStep(); setEnabled(); camera(); };
  $('kind').onchange = ()=>{updateStep();setEnabled();};
  $('retake').onclick = reset;
  function enqueue() {
    if (!pendingImage || !canCapture()) return;
    if (outbox.filter(i => i.image).length >= 5) { tell('Aguarde o envio das fotos pendentes antes de capturar outras.'); return; }
    const official = capturedKind === 'official';
    if (!official) studentAutoSend = true;
    const id=crypto.randomUUID(); focusedCapture=id;
    outbox.push({ id, kind: capturedKind, studentId:capturedStudentId, image: pendingImage, status: 'waiting' }); reset(); if (official && !mobileWorkflow) stopCamera(); render();
    $('camera-status').textContent = mobileWorkflow ? 'Foto enviada para leitura. Aguarde o resultado…' : `Foto ${outbox.filter(i=>i.kind==='student').length} capturada — ${active ? 'enviando' : 'aguardando conexão'}. Pode enquadrar a próxima.`;
    if (!active) tell('Foto guardada nesta aba. O envio acontecerá quando a sessão do computador for liberada. Não feche esta página.');
    flush();
  }
  $('send').onclick = enqueue;
  const Core=window.SiapExamCore;
  function fillStudents(select, value='') {
    select.replaceChildren();
    const blank=document.createElement('option');blank.value='';blank.textContent='Selecione o aluno';select.append(blank);
    for(const r of roster){const option=document.createElement('option');option.value=r.id;option.textContent=r.name;select.append(option);}
    select.value=value;
  }
  function answerGrid(target, values, alphabet, onChange, key=null) {
    target.replaceChildren();
    values.forEach((answer,index)=>{
      const label=document.createElement('label');label.textContent=String(index+((key?currentKey?.firstQuestion:keyDraft?.firstQuestion)||1)).padStart(2,'0');
      const select=document.createElement('select');select.setAttribute('aria-label',`Questão ${index+((key?currentKey?.firstQuestion:keyDraft?.firstQuestion)||1)}`);
      for(const letter of [...alphabet,...(key?['-','*','?']:['?'])]){const option=document.createElement('option');option.value=letter;option.textContent=letter;select.append(option);}
      select.value=answer; const color=()=>{label.className=key?(select.value==='?'?'uncertain':select.value===key[index]?'right':'wrong'):'';};color();
      select.onchange=()=>{color();onChange(index,select.value);};label.append(select);target.append(label);
    });
  }
  let keyDraft=null, resultAnswers=[], resultKey=null, confirming=false;
  function renderMobile(status) {
    $('mobile-workflow').hidden=!mobileWorkflow;if(!mobileWorkflow)return;
    const selected=$('student-select').value;
    if($('student-select').dataset.roster!==JSON.stringify(roster)) {fillStudents($('student-select'),selected);$('student-select').dataset.roster=JSON.stringify(roster);}
    $('student-choice').hidden=!keyReady;
    document.body.classList.toggle('mobile-reviewing',!$('key-review').hidden||!$('mobile-result').hidden);
    if(keyReady && !roster.length) $('mobile-summary').textContent='Abra a avaliação da turma no SIAP para trazer os nomes. Você pode continuar fotografando.';
    const official=status.items.filter(i=>i.kind==='official'&&i.status==='ready'&&!i.discarded).at(-1);
    if(official && !keyReady && keyDraftId!==official.id){
      keyDraftId=official.id;keyDraft=JSON.parse(JSON.stringify(official.result));
      $('key-review').hidden=false;document.body.classList.add('mobile-reviewing');$('key-alphabet').value=keyDraft.alphabet;
      answerGrid($('key-grid'),keyDraft.answers,keyDraft.alphabet,(i,v)=>keyDraft.answers[i]=v);
      $('key-summary').textContent=keyDraft.ranges.map(r=>`${r.subject}: questões ${r.from+(keyDraft.firstQuestion||1)-1} a ${r.to+(keyDraft.firstQuestion||1)-1}`).join(' · ');
      $('key-photo').hidden=true; $('key-ranges').replaceChildren();
      for(const range of keyDraft.ranges){const row=document.createElement('div');row.className='range-row';
        for(const field of ['subject','from','to']){const input=document.createElement('input');input.type=field==='subject'?'text':'number';input.value=range[field];input.setAttribute('aria-label',field==='subject'?'Disciplina':field==='from'?'Primeira questão':'Última questão');input.oninput=()=>range[field]=field==='subject'?input.value:Number(input.value);row.append(input);} $('key-ranges').append(row);}
      if(!$('camera-view').hidden) completeCamera(()=>{stopCamera();$('key-review').scrollIntoView?.({block:'start',behavior:'smooth'});},'Conferir gabarito');
      else $('key-review').scrollIntoView?.({block:'start',behavior:'smooth'});tell('Gabarito lido. Confira as alternativas e confirme para começar.');
    }
    if(keyReady)$('key-review').hidden=true;
    const latest=status.items.find(i=>i.id===focusedCapture&&i.kind==='student'&&i.status==='ready'&&!i.discarded);
    if(resultItem)resultScore();
    if(latest && !dismissed.has(latest.id) && resultItem?.id!==latest.id) {if(!$('camera-view').hidden) cameraResult(latest);else showResult(latest);}
    const students=status.items.filter(i=>i.kind==='student'&&!i.discarded);
    const complete=students.filter(i=>i.review?.reviewed).length;
    $('mobile-summary').textContent=`${!roster.length?'Abra a avaliação no SIAP para trazer os nomes da turma. ':''}${complete} prova(s) conferida(s) · ${students.filter(i=>i.status==='ready'&&!i.review?.reviewed).length} para conferir. No computador, use Enviar identificados para o SIAP ao terminar.`;
    const reading=status.items.some(i=>['queued','processing'].includes(i.status)) || outbox.some(i=>['waiting','sending','received'].includes(i.status));
    document.body.classList.toggle('reading',reading&&!document.body.classList.contains('camera-complete'));
    if(reading && !document.body.classList.contains('camera-complete'))$('camera-status').textContent='Lendo a prova… Aguarde o resultado neste celular.';
    $('students').hidden=true;
    for(const [index,item] of outbox.entries()){
      const server=status.items.find(i=>i.id===item.id);if(server?.kind!=='student'||server.status!=='ready')continue;
      const li=$('queue').children[index];if(!li)continue;
      const name=roster.find(r=>r.id===(server.review?.studentId||server.selectedStudentId))?.name || 'Aluno não selecionado';
      li.textContent=`${name} — ${server.review?.reviewed?'conferida':'conferir resultado'}${server.timing ? (item.uploadMs!==undefined?' · envio '+(item.uploadMs/1000).toFixed(1)+' s':'')+' · fila '+(server.timing.queueMs/1000).toFixed(1)+' s · leitura '+((server.timing.readMs||0)/1000).toFixed(1)+' s' : ''}`;li.classList.add('student-row');
      const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Ver resultado';button.onclick=()=>showResult(server);li.append(button);
    }
  }
  function cameraResult(item){
    const reviewedKey=JSON.parse(JSON.stringify(currentKey));
    const studentId=item.review?.studentId||item.selectedStudentId,student=roster.find(r=>r.id===studentId),answers=item.review?.answers||item.result.answers;
    try {
      const scores=Core.score(currentKey,answers);if(item.result.warning?.trim())throw new Error(item.result.warning);if(!student)throw new Error('Selecione o aluno.');
      $('camera-summary').textContent=student.name+' — '+scores.map(r=>`${r.subject}: ${r.correct}/${r.total} acertos`).join(' · ');
      completeCamera(async()=>{
        $('camera-result').disabled=true;
        try{await api('mobile-review',{id:item.id,studentId,answers,key:reviewedKey});const row=lastRemote.find(i=>i.id===item.id);if(row)row.review={studentId,answers,reviewed:true};resultItem=item;stopCamera();nextStudent();render();renderMobile({items:lastRemote});}
        catch(e){$('camera-status').textContent=e.message;tell(e.message);}finally{$('camera-result').disabled=false;}
      },'Enviar resultado e próximo aluno');
    }catch(e){$('camera-summary').textContent=e.message;completeCamera(()=>showResult(item),'Conferir marcações');}
  }
  function completeCamera(next,label){document.body.classList.add('camera-complete');document.body.dataset.readStage='ready';document.body.classList.remove('reading');$('camera-status').textContent='Leitura concluída. Confira o resultado.';$('camera-result').hidden=false;$('camera-result').textContent=label;$('camera-result').onclick=next;$('snap').hidden=true;}
  function showResult(item){
    resultKey=JSON.parse(JSON.stringify(currentKey));resultItem=item;resultAnswers=[...(item.review?.answers||item.result.answers)];
    const id=item.review?.studentId||item.selectedStudentId||'';
    fillStudents($('result-student'),id);$('result-student').options[0].textContent='Selecione o aluno desta prova';
    $('result-photo').hidden=true;$('result-photo').removeAttribute('src');
    answerGrid($('result-answers'),resultAnswers,currentKey.alphabet,(i,v)=>{resultAnswers[i]=v;resultScore();},currentKey.answers);
    $('mobile-result').hidden=false;document.body.classList.add('mobile-reviewing');stopCamera();resultScore();tell('Prova lida. Confira o resultado abaixo.');$('mobile-result').scrollIntoView?.({block:'start',behavior:'smooth'});
  }
  function resultScore(){
    const id=$('result-student').value, student=roster.find(r=>r.id===id);
    $('result-name').textContent=student?.name||'Selecione o aluno';
    $('result-score').replaceChildren();
    let valid=false;
    try {const scores=Core.score(resultKey,resultAnswers),total=scores.reduce((a,r)=>a+r.total,0),correct=scores.reduce((a,r)=>a+r.correct,0);
      const big=document.createElement('div');big.className='score-big';big.textContent=`${correct} / ${total}`;const small=document.createElement('small');small.textContent=' acertos';big.append(small);$('result-score').append(big);
      for(const score of scores){const row=document.createElement('div');row.className='subject-score';row.textContent=`${score.subject}: ${score.correct} de ${score.total}`;$('result-score').append(row);}valid=true;
    }catch(e){$('result-score').textContent=e.message;}
    const different=false;
    $('result-warning').textContent=different?'O nome lido difere do aluno escolhido. Confira a foto antes de confirmar.':!student?'Escolha o aluno com a prova em mãos ou deixe pendente para preencher manualmente.':resultItem.result.warning||'Confira o aluno e os acertos antes de confirmar.';
    const changed=JSON.stringify(resultKey)!==JSON.stringify(currentKey);
    if(changed)$('result-warning').textContent='O gabarito mudou. Reabra este resultado para conferir novamente.';
    $('result-confirm').disabled=confirming||changed||!student||!valid||!active;
  }
  $('key-retake').onclick=async()=>{try{await api('mobile-discard',{id:keyDraftId});$('key-review').hidden=true;document.body.classList.remove('mobile-reviewing');keyDraftId='';focusedCapture='';camera();}catch(e){tell(e.message);}};
  $('key-photo-button').onclick=async()=>{try{const data=await api('mobile-image',{id:keyDraftId});$('key-photo').src=data.image;$('key-photo').hidden=false;}catch(e){tell(e.message);}};
  $('key-alphabet').onchange=()=>{if(!keyDraft)return;keyDraft.alphabet=$('key-alphabet').value;answerGrid($('key-grid'),keyDraft.answers,keyDraft.alphabet,(i,v)=>keyDraft.answers[i]=v);};
  $('key-confirm').onclick=async()=>{
    $('key-confirm').disabled=true;$('key-confirm').textContent='Enviando gabarito…';
    try{const key=Core.validateKey(keyDraft);await api('mobile-key',{key});currentKey=key;keyReady=true;$('key-review').hidden=true;document.body.classList.remove('mobile-reviewing');$('kind').value='student';$('student-choice').hidden=false;updateStep();setEnabled();$('student-choice').scrollIntoView?.({block:'start',behavior:'smooth'});tell('Agora escolha o aluno abaixo. A câmera abrirá para ler a prova dele.');}
    catch(e){tell(e.message);}finally{$('key-confirm').disabled=false;$('key-confirm').textContent='Usar gabarito e escolher aluno';}
  };
  $('student-select').onchange=()=>{updateStep();setEnabled();if($('student-select').value)camera();};
  $('result-student').onchange=resultScore;
  $('result-photo-button').onclick=async()=>{try{const id=resultItem.id,data=await api('mobile-image',{id});if(resultItem.id===id){$('result-photo').src=data.image;$('result-photo').hidden=false;}}catch(e){tell(e.message);}};
  function nextStudent(){dismissed.add(resultItem.id);resultItem=null;$('mobile-result').hidden=true;document.body.classList.remove('mobile-reviewing');focusedCapture='';$('student-select').value='';updateStep();setEnabled();$('student-choice').scrollIntoView?.({block:'center',behavior:'smooth'});tell('Próximo aluno: escolha o nome para abrir a câmera.');}
  $('result-confirm').onclick=async()=>{
    if(confirming)return;confirming=true;
    $('result-confirm').disabled=true;
    try{await api('mobile-review',{id:resultItem.id,studentId:$('result-student').value,answers:resultAnswers,key:resultKey});const item=lastRemote.find(i=>i.id===resultItem.id);if(item)item.review={studentId:$('result-student').value,answers:[...resultAnswers],reviewed:true};nextStudent();render();renderMobile({items:lastRemote});}
    catch(e){tell(e.message);}finally{confirming=false;if(resultItem)resultScore();}
  };
  $('result-skip').onclick=nextStudent;

  window.addEventListener('pagehide', stopCamera);
  window.addEventListener('keydown', event => { if (event.key === 'Escape') stopCamera(); });
  window.addEventListener('beforeunload', event => { if (pendingImage || outbox.some(i => i.image)) { event.preventDefault(); event.returnValue = ''; } });
  if (!/^[0-9a-f-]{36}$/.test(session || '') || !/^[0-9a-f]{64}$/.test(token || '')) { stopped = true; tell('Abra esta página pelo QR Code exibido no Assistente SIAP.'); }
  else poll();
})();
