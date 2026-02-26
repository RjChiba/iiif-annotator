'use strict';
const path = require('path');
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOSTNAME || 'localhost';
const dataDir = process.env.IIIF_DATA_DIR;
const uploadsDir = dataDir ? path.join(dataDir, 'uploads') : null;
const appDir = __dirname;

const app = next({ dev, hostname, port, dir: appDir });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url || '/', true);
    const { pathname } = parsedUrl;

    if (uploadsDir && pathname && pathname.startsWith('/uploads/')) {
      const rel = decodeURIComponent(pathname.slice('/uploads/'.length));
      const filePath = path.resolve(uploadsDir, rel);
      if (!filePath.startsWith(path.resolve(uploadsDir))) {
        res.writeHead(403); res.end(); return;
      }
      fs.access(filePath, fs.constants.R_OK, (err) => {
        if (err) { res.writeHead(404); res.end(); return; }
        const ext = path.extname(filePath).toLowerCase();
        const ct = ext === '.png' ? 'image/png'
          : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
          : ext === '.webp' ? 'image/webp' : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': ct });
        fs.createReadStream(filePath).pipe(res);
      });
      return;
    }

    handle(req, res, parsedUrl);
  }).listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`\n> IIIF Annotator ready on http://${hostname}:${port}`);
    if (dataDir) console.log(`> Data: ${dataDir}`);
  });
}).catch((err) => { console.error(err); process.exit(1); });
