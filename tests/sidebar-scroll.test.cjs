const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'sidebar-scroll.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(index, /sidebar-scroll\.css\?v=1/);
assert.match(css, /body \.side[\s\S]*overflow-y:\s*auto\s*!important/);
assert.match(css, /body \.class-list[\s\S]*overflow:\s*visible\s*!important/);
assert.match(css, /body \.class-sidebar[\s\S]*flex:\s*0 0 auto\s*!important/);
assert.doesNotMatch(css, /\.class-list[\s\S]*overflow-y:\s*auto/);

console.log('sidebar-scroll: rolagem única do menu lateral validada');
