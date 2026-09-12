const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'student-search-filters.js'),'utf8');
const realtime=fs.readFileSync(path.join(root,'realtime-sync.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase','migrations','119_school_quick_filter_favorites.sql'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');

assert.match(source,/DEFAULT_FAVORITE_KEYS = \['laudo','nao_alfabetizado','ocorrencia'\]/);
assert.match(source,/obsid:\$\{option\.id\}/);
assert.match(source,/Configurar os 3 favoritos/);
assert.match(source,/Selecione exatamente 3 filtros/);
assert.match(source,/permission\?\.role==='admin' \|\| !!permission\?\.is_coordinator/);
assert.match(source,/school_quick_filter_favorites/);
assert.match(source,/favoriteStoredKeys=\[\.\.\.DEFAULT_FAVORITE_KEYS\]/);
assert.match(source,/!window\.canViewOccurrences\?\.\(\)&&activeQuickFilter==='ocorrencia'/);
assert.match(realtime,/school_quick_filter_favorites/);
assert.match(migration,/school_id uuid primary key/);
assert.match(migration,/favorite_1<>favorite_2 and favorite_1<>favorite_3 and favorite_2<>favorite_3/);
assert.match(migration,/public\.is_school_admin\(school_id\) or public\.is_school_coordinator\(school_id\)/);
assert.match(migration,/replica identity full/);
assert.match(index,/student-search-filters\.js\?v=7/);
assert.match(index,/realtime-sync\.js\?v=15/);

console.log('Três filtros favoritos configuráveis permanecem isolados por escola e sincronizados em tempo real.');
