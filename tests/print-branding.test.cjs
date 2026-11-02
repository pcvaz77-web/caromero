const {test} = require('node:test');
const assert = require('node:assert/strict');
const branding = require('../print-branding.js');

const schoolLogo = 'data:image/png;base64,AAAA';
const stateLogo = 'data:image/jpeg;base64,BBBB';

test('usa logos do Meu CEPI ou das provas da escola regular', async () => {
  const db = rows => ({from:table => ({select:() => ({eq:() => ({maybeSingle:async() => ({data:rows[table] || null,error:null})})})})});
  assert.deepEqual(await branding.load(db({cepi_exam_headers:{school_logo_data:schoolLogo,state_logo_data:stateLogo}}),'school-1'),
    {school_logo_data:schoolLogo,state_logo_data:stateLogo});
  assert.deepEqual(await branding.load(db({class_exam_headers:{school_logo_data:schoolLogo,state_logo_data:stateLogo}}),'school-2'),
    {school_logo_data:schoolLogo,state_logo_data:stateLogo});
});

test('posiciona escola à esquerda e estado à direita no PDF', () => {
  const images = [];
  const doc = {
    getImageProperties:() => ({width:100,height:50,fileType:'PNG'}),
    addImage:(data,format,x,y,width,height) => images.push({data,x,y,width,height})
  };
  branding.drawPdf(doc,{school_logo_data:schoolLogo,state_logo_data:stateLogo},{pageWidth:210,left:15,right:15,top:8,width:25,height:22});
  assert.equal(images.length,2);
  assert.deepEqual(images.map(item => item.x),[15,170]);
  assert.ok(images.every(item => item.y === 8 && item.width === 25 && item.height === 12.5));
  assert.doesNotMatch(branding.markup({school_logo_data:'javascript:alert(1)'}),/javascript:/);
});
