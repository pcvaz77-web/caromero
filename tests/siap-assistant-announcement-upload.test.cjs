const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'platform-siap-announcement.js'), 'utf8');

function setup() {
  const calls = {uploads:[], saves:[], removed:[]};
  let row = null;
  const elements = {
    title:{value:''}, message_body:{value:''}, link_label:{value:''}, link_url:{value:''}, media_source:{value:'none'},
    media_type:{value:''}, media_url:{value:''}, media_file:{files:[],set value(value) { if (value === '') this.files=[]; },get value() { return ''; }}
  };
  const form = {
    elements,
    addEventListener() {},
    querySelector() { return {hidden:false}; }
  };
  const nodes = {
    platformSiapAnnouncementRoot:{innerHTML:''},
    platformSiapAnnouncementForm:form,
    platformSiapAnnouncementPreview:{innerHTML:''},
    platformSiapAnnouncementStatus:{textContent:'',classList:{toggle() {}}},
    platformSiapAnnouncementPublish:{disabled:false},
    platformSiapAnnouncementDisable:{disabled:false},
    platformSiapAnnouncementRemoveMedia:{disabled:false,hidden:true}
  };
  const document = {
    getElementById:id => nodes[id],
    createElement:() => ({set textContent(value) { this.innerHTML = value; },innerHTML:''})
  };
  const db = {
    from:() => ({select:() => ({eq:() => ({maybeSingle:async () => ({data:row,error:null})})})}),
    storage:{from:() => ({
      upload:async (name,file) => { calls.uploads.push({name,file}); return {error:null}; },
      getPublicUrl:name => ({data:{publicUrl:`https://example.supabase.co/storage/v1/object/public/siap-announcement-media/${name}`}}),
      remove:async names => { calls.removed.push(...names); return {error:null}; }
    })},
    rpc:async (name,input) => { calls.saves.push({name,input}); row = {
      title:input.p_title,message_body:input.p_message_body,
      media_type:input.p_media_type,media_url:input.p_media_url,
      link_label:input.p_link_label,link_url:input.p_link_url,
      active:input.p_active,updated_at:new Date().toISOString()
    }; return {error:null}; }
  };
  class PreviewURL extends URL {}
  PreviewURL.createObjectURL = () => 'blob:preview';
  PreviewURL.revokeObjectURL = () => {};
  const window = {};
  vm.runInNewContext(script, {window,document,db,URL:PreviewURL,crypto:{randomUUID:() => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}});
  return {window,elements,form,calls,nodes};
}

const settle = () => new Promise(resolve => setTimeout(resolve, 20));

test('arquivo escolhido é enviado e sua URL pública é salva no comunicado', async () => {
  const ui = setup();
  await ui.window.openPlatformSiapAnnouncement();
  ui.elements.title.value = 'Novidade';
  ui.elements.message_body.value = 'Mensagem para professores';
  ui.elements.media_source.value = 'file';
  ui.elements.media_file.files = [{type:'video/mp4',size:1024}];
  ui.form.onsubmit({preventDefault() {}});
  await settle();
  assert.equal(ui.calls.uploads.length,1);
  assert.equal(ui.calls.saves[0].input.p_media_type,'video');
  assert.match(ui.calls.saves[0].input.p_media_url,/siap-announcement-media\/assistant\/.*\.mp4$/);
});

test('imagem do dispositivo é salva como imagem', async () => {
  const ui = setup();
  await ui.window.openPlatformSiapAnnouncement();
  ui.elements.title.value = 'Novidade';
  ui.elements.message_body.value = 'Mensagem para professores';
  ui.elements.media_source.value = 'file';
  ui.elements.media_file.files = [{type:'image/png',size:2048}];
  ui.form.onsubmit({preventDefault() {}});
  await settle();
  assert.equal(ui.calls.saves[0].input.p_media_type,'image');
  assert.match(ui.calls.saves[0].input.p_media_url,/\.png$/);
});

test('vídeo de até 50 MB é aceito e acima do limite é recusado', async () => {
  const ui = setup();
  await ui.window.openPlatformSiapAnnouncement();
  ui.elements.title.value = 'Novidade';
  ui.elements.message_body.value = 'Mensagem para professores';
  ui.elements.media_source.value = 'file';
  ui.elements.media_file.files = [{type:'video/mp4',size:40 * 1024 * 1024}];
  ui.form.onsubmit({preventDefault() {}});
  await settle();
  assert.equal(ui.calls.uploads.length,1);
  ui.elements.media_source.value = 'file';
  ui.elements.media_file.files = [{type:'video/mp4',size:50 * 1024 * 1024 + 1}];
  ui.form.onsubmit({preventDefault() {}});
  await settle();
  assert.equal(ui.calls.uploads.length,1);
  assert.match(ui.nodes.platformSiapAnnouncementStatus.textContent,/até 50 MB/);
});

test('remover mídia publicada preserva mensagem e botão e apaga arquivo próprio', async () => {
  const ui = setup();
  await ui.window.openPlatformSiapAnnouncement();
  ui.elements.title.value = 'Novidade';
  ui.elements.message_body.value = 'Mensagem para professores';
  ui.elements.link_label.value = 'Saiba mais';
  ui.elements.link_url.value = 'https://example.org/novidade';
  ui.elements.media_source.value = 'file';
  ui.elements.media_file.files = [{type:'video/mp4',size:1024}];
  ui.form.onsubmit({preventDefault() {}});
  await settle();
  assert.equal(ui.nodes.platformSiapAnnouncementRemoveMedia.hidden,false);
  await ui.nodes.platformSiapAnnouncementRemoveMedia.onclick();
  assert.equal(ui.calls.saves.length,2);
  assert.equal(ui.calls.saves[1].input.p_media_url,null);
  assert.equal(ui.calls.saves[1].input.p_active,true);
  assert.equal(ui.calls.saves[1].input.p_message_body,'Mensagem para professores');
  assert.equal(ui.calls.saves[1].input.p_link_label,'Saiba mais');
  assert.equal(ui.calls.removed.length,1);
  assert.equal(ui.nodes.platformSiapAnnouncementRemoveMedia.hidden,true);
});

test('nome e link HTTPS viram botão na prévia e são salvos separados da mídia', async () => {
  const ui = setup();
  await ui.window.openPlatformSiapAnnouncement();
  ui.elements.title.value = 'Novidade';
  ui.elements.message_body.value = 'Mensagem para professores';
  ui.elements.link_label.value = 'Ver promoção';
  ui.elements.link_url.value = 'https://example.org/oferta';
  ui.form.onsubmit({preventDefault() {}});
  await settle();
  assert.equal(ui.calls.saves[0].name,'platform_set_siap_assistant_announcement_v2');
  assert.equal(ui.calls.saves[0].input.p_link_label,'Ver promoção');
  assert.equal(ui.calls.saves[0].input.p_link_url,'https://example.org/oferta');
  assert.match(ui.nodes.platformSiapAnnouncementPreview.innerHTML,/class="platform-siap-announcement-action"/);
  assert.match(ui.nodes.platformSiapAnnouncementPreview.innerHTML,/>Ver promoção<\/a>/);
});

test('botão incompleto ou com URL insegura não é publicado', async () => {
  const ui = setup();
  await ui.window.openPlatformSiapAnnouncement();
  ui.elements.title.value = 'Novidade';
  ui.elements.message_body.value = 'Mensagem para professores';
  ui.elements.link_label.value = 'Abrir';
  ui.form.onsubmit({preventDefault() {}});
  await settle();
  assert.equal(ui.calls.saves.length,0);
  ui.elements.link_url.value = 'javascript:alert(1)';
  ui.form.onsubmit({preventDefault() {}});
  await settle();
  assert.equal(ui.calls.saves.length,0);
});
