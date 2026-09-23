const test=require('node:test');
const assert=require('node:assert/strict');
const manifest=require('../manifest.json');
test('versao exibida no Chrome corresponde a versao real do pacote',()=>{
  assert.equal(manifest.version_name || manifest.version,manifest.version);
});
