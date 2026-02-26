#!/usr/bin/env node
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');

const args = process.argv.slice(2);
const getArg = (n) => { const f = args.find(a => a.startsWith(`--${n}=`)); return f ? f.slice(n.length + 3) : null; };
const hasFlag = (n) => args.includes(`--${n}`);

if (hasFlag('help') || hasFlag('h')) {
  console.log(`IIIF Annotator\n\nUsage: npx iiif-annotator [options]\n\nOptions:\n  --port=<n>    Port (default: 3000)\n  --data=<dir>  Data directory (default: ~/.iiif-annotator)\n  --open        Open browser automatically\n  --help        Show help\n`);
  process.exit(0);
}

const port = getArg('port') || process.env.PORT || '3000';
const dataDir = getArg('data')
  ? path.resolve(getArg('data'))
  : (process.env.IIIF_DATA_DIR || path.join(os.homedir(), '.iiif-annotator'));

fs.mkdirSync(path.join(dataDir, 'projects'), { recursive: true });
fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });

const buildId = path.join(__dirname, '..', '.next', 'BUILD_ID');
if (!fs.existsSync(buildId)) {
  console.error('Error: No production build found.');
  console.error('Run `npm run build` (or `next build`) first, then try again.');
  process.exit(1);
}

process.env.NODE_ENV = 'production';
process.env.PORT = port;
process.env.IIIF_DATA_DIR = dataDir;

console.log(`Starting IIIF Annotator...`);
console.log(`Data: ${dataDir}  Port: ${port}`);

if (hasFlag('open')) {
  setTimeout(() => {
    const url = `http://localhost:${port}`;
    const cmd = process.platform === 'darwin' ? `open "${url}"`
      : process.platform === 'win32' ? `start "${url}"` : `xdg-open "${url}"`;
    exec(cmd);
  }, 2000);
}

require(path.join(__dirname, '..', 'server.js'));
