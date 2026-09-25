const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'reports.js'), 'utf8');
const start = source.indexOf('  async function currentReportSchoolName(schoolId) {');
const end = source.indexOf('\n  async function generateReport()', start);
assert.ok(start >= 0 && end > start);

function resolver(activeMembership, lookup) {
  const requestedIds = [];
  const db = {
    from(table) {
      assert.equal(table, 'schools');
      return {
        select(column) {
          assert.equal(column, 'name');
          return {
            eq(key, id) {
              assert.equal(key, 'id');
              requestedIds.push(id);
              return { maybeSingle: () => lookup(id) };
            }
          };
        }
      };
    }
  };
  const currentReportSchoolName = vm.runInNewContext(`(${source.slice(start, end).trim()})`, {
    window: { getActiveSchoolMembership: () => activeMembership }, db
  });
  return { currentReportSchoolName, requestedIds };
}

test('usa o nome completo apenas do vínculo com a escola do relatório', async () => {
  const { currentReportSchoolName, requestedIds } = resolver(
    { school_id:'escola-a', schools:{ name:'  Escola Estadual A  ' } },
    () => { throw new Error('Consulta desnecessária'); }
  );
  assert.equal(await currentReportSchoolName('escola-a'), 'Escola Estadual A');
  assert.deepEqual(requestedIds, []);
});

test('não usa o nome de outra escola e restringe a consulta ao ID do relatório', async () => {
  const { currentReportSchoolName, requestedIds } = resolver(
    { school_id:'escola-a', schools:{ name:'Escola Estadual A' } },
    async id => ({ data:{ name:id === 'escola-b' ? 'Escola Estadual B' : null }, error:null })
  );
  assert.equal(await currentReportSchoolName('escola-b'), 'Escola Estadual B');
  assert.deepEqual(requestedIds, ['escola-b']);
});

test('não gera nome fictício quando a escola não pode ser consultada', async () => {
  const { currentReportSchoolName } = resolver(null, async () => ({ data:null, error:{ message:'Sem acesso' } }));
  assert.equal(await currentReportSchoolName('escola-b'), null);
});
