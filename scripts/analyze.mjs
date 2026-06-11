import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function walk(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = walk(target);
      files += nested.files;
      bytes += nested.bytes;
    } else {
      files += 1;
      bytes += statSync(target).size;
    }
  }
  return { files, bytes };
}

function toKb(bytes) {
  return (bytes / 1024).toFixed(1);
}

const projectName = path.basename(process.cwd());
const assets = walk(path.join(process.cwd(), 'assets'));
const data = walk(path.join(process.cwd(), 'data'));

console.log('Projet: ' + projectName);
console.log('Assets: ' + assets.files + ' fichiers / ' + toKb(assets.bytes) + ' KB');
console.log('Data: ' + data.files + ' fichiers / ' + toKb(data.bytes) + ' KB');
console.log('Frontend attendu sur http://localhost:5173');
console.log('Backend attendu sur http://localhost:4100');
console.log('Verifier aussi Lighthouse, EcoIndex, poids de page et nombre de requetes.');
