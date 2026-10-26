import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Fails the build when the exported-game player template is over budget or malformed (T113). */

/** 600 KB budget, counted in KiB (1 KB = 1024 bytes). */
const BUDGET_KB = 600;
const PLACEHOLDER = '<script id="stickwix-game" type="application/json">__STICKWIX_GAME__</script>';
const file = fileURLToPath(new URL('../public/player-template.html', import.meta.url));

let bytes: number;
try {
  bytes = statSync(file).size;
} catch {
  console.error(`player-template.html not found at ${file}. Run \`pnpm build:player\`.`);
  process.exit(1);
}

const kb = bytes / 1024;
const html = readFileSync(file, 'utf8');
const placeholders = html.split('__STICKWIX_GAME__').length - 1;
const tag = html.includes(PLACEHOLDER);

console.log(`player-template.html: ${kb.toFixed(1)} KB, ${bytes} bytes (budget ${BUDGET_KB} KB = ${BUDGET_KB * 1024} bytes)`);
if (placeholders !== 1 || !tag) {
  console.error(`Expected exactly one ${PLACEHOLDER} placeholder, found ${placeholders}.`);
  process.exit(1);
}
if (kb > BUDGET_KB) {
  console.error(`Player template is ${(kb - BUDGET_KB).toFixed(1)} KB over budget.`);
  process.exit(1);
}
