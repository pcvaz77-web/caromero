import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'media', 'cepi-block-art');
mkdirSync(output, { recursive: true });

const subjects = {
  portugues: '<path d="M9 14c10-4 17-3 23 2v35c-7-5-14-6-23-2zM55 14c-10-4-17-3-23 2v35c7-5 14-6 23-2zM16 24h9m-9 8h9m14-8h9m-9 8h9"/><path d="m43 8 9 2-7 10-7-2z"/>',
  ciencias: '<path d="M25 8h14m-11 0v18L15 49a5 5 0 0 0 4 7h26a5 5 0 0 0 4-7L36 26V8M21 43h22M27 48h3m9 3h2"/><circle cx="31" cy="36" r="2"/><circle cx="38" cy="39" r="1.5"/>',
  matematica: '<path d="M11 51V13h40M18 43l9-11 9 5 13-18M15 19l11 0-11 11zM40 47h14v-9z"/><circle cx="27" cy="32" r="2"/><circle cx="36" cy="37" r="2"/>',
  ingles: '<path d="M11 15h34a8 8 0 0 1 8 8v17a8 8 0 0 1-8 8H28L15 55v-8a8 8 0 0 1-4-7z"/><path d="M22 26h21m-21 9h15"/>',
  arte: '<path d="M32 8c-14 0-24 10-24 24s10 24 24 24h4c4 0 6-5 2-8-3-3-1-7 3-7h5c6 0 10-5 10-11C56 18 46 8 32 8z"/><circle cx="20" cy="22" r="2"/><circle cx="32" cy="17" r="2"/><circle cx="44" cy="23" r="2"/><circle cx="19" cy="36" r="2"/><path d="m43 48 13-16"/>',
  educacao_fisica: '<circle cx="32" cy="32" r="23"/><path d="m32 20-11 8 4 13h14l4-13-11-8zm-11 8-9-4m13 17-4 11m18-11 4 11m0-24 9-4M32 20V9"/>',
  historia: '<path d="M10 18 32 8l22 10M14 21h36M17 49h30M11 55h42M20 24v22m8-22v22m8-22v22m8-22v22"/><path d="M25 15h14"/>',
  geografia: '<circle cx="32" cy="32" r="23"/><path d="M9 32h46M32 9c-10 10-10 36 0 46M32 9c10 10 10 36 0 46M15 18c9 6 25 6 34 0M15 46c9-6 25-6 34 0"/>',
  fisica: '<path d="M10 13h44M32 13v32M18 22l-8 19h16zm28 0-8 19h16zM8 42h20m8 0h20M24 54h16"/><circle cx="32" cy="46" r="3"/>',
  quimica: '<path d="M25 8h14m-11 0v18L15 49a5 5 0 0 0 4 7h26a5 5 0 0 0 4-7L36 26V8M21 44h22"/><circle cx="29" cy="38" r="2"/><circle cx="38" cy="35" r="2"/><circle cx="35" cy="48" r="1.5"/>',
  biologia: '<path d="M14 51C13 29 24 15 50 11c1 28-12 42-36 40zM15 50c8-12 19-20 31-29M31 37l-7-11m13 5 11 3"/>',
  sociologia: '<circle cx="18" cy="22" r="6"/><circle cx="46" cy="22" r="6"/><circle cx="32" cy="17" r="7"/><path d="M8 47c0-9 5-14 12-14m36 14c0-9-5-14-12-14M17 52c0-10 6-17 15-17s15 7 15 17M12 55h40"/>',
  filosofia: '<path d="M16 17c8-9 24-10 33 0s8 26-2 34H31l-10 6v-9c-12-6-14-21-5-31z"/><path d="M25 28c0-5 3-8 8-8s8 3 8 7c0 4-4 6-8 9v3"/><circle cx="33" cy="46" r="1.5"/>',
};

const art = [
  ['fundamental', [
    ['portugues'], ['ciencias'], ['matematica'], ['ingles','arte','educacao_fisica'], ['historia'], ['geografia'],
  ]],
  ['medio', [
    ['portugues'], ['geografia','historia'], ['matematica'], ['ingles','arte','educacao_fisica'], ['fisica','quimica'], ['biologia','sociologia','filosofia'],
  ]],
];
const tones = [
  ['#e8efff','#4772ba'], ['#e6f4f1','#3a8b83'], ['#eee9fb','#7558b0'],
  ['#fff1d9','#a47b38'], ['#e8f4e8','#528861'], ['#e9f1f9','#4e769b'],
];

const icon = (name, x, y, opacity = 1, scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})" opacity="${opacity}" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${subjects[name]}</g>`;

for (const [stage, blocks] of art) {
  blocks.forEach((blockSubjects, index) => {
    const [base, ink] = tones[index];
    const stack = [0, 1, 2].map(slot => icon(blockSubjects[slot % blockSubjects.length], 5, 8 + slot * 78)).join('');
    const field = [0, 1, 2, 3].map((slot) => {
      const name = blockSubjects[slot % blockSubjects.length];
      return icon(name, 105 + slot * 114, slot % 2 ? 122 : 26, slot % 2 ? .42 : .5, 1.28);
    }).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 240" width="560" height="240" aria-hidden="true"><rect width="560" height="240" fill="${base}"/><g fill="none" stroke="${ink}" opacity=".16" stroke-width="1.4"><path d="M79 0v240M0 78h560M0 156h560"/><circle cx="172" cy="153" r="75"/><circle cx="405" cy="62" r="82"/><path d="M77 34h483M77 194h483"/></g><g color="${ink}">${stack}${field}</g></svg>`;
    writeFileSync(join(output, `${stage}-${index + 1}.svg`), svg + '\n', 'utf8');
  });
}
