#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, '..', 'client', 'dist');
const required = ['index.html'];
for (const file of required) {
  const target = path.join(dist, file);
  if (!fs.existsSync(target) || fs.statSync(target).size === 0) {
    throw new Error(`missing build artifact: client/dist/${file}`);
  }
}
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!html.includes('/assets/')) throw new Error('index.html does not reference bundled assets');
console.log('[build] PASS client/dist artifacts');
