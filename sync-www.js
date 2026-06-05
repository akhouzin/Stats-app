// Copies Stats web source files into www/ for Capacitor.
// Run: node sync-www.js
const fs   = require('fs');
const path = require('path');

const SRC  = __dirname;
const DEST = path.join(__dirname, 'www');

const INCLUDE = [
  'index.html',
  'logo.png',
];
const INCLUDE_DIRS = ['app', 'styles'];

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else copyFile(s, d);
  }
}

fs.mkdirSync(DEST, { recursive: true });

for (const f of INCLUDE) {
  copyFile(path.join(SRC, f), path.join(DEST, f));
  console.log('  copied', f);
}
for (const d of INCLUDE_DIRS) {
  copyDir(path.join(SRC, d), path.join(DEST, d));
  console.log('  copied', d + '/');
}

console.log('www/ ready.');
