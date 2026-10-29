'use strict';

const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'node_modules', 'app');

fs.mkdirSync(path.dirname(target), {recursive: true});

try {
  fs.lstatSync(target);
} catch {
  fs.symlinkSync(path.join('..', 'app'), target, 'dir');
}
