const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const port = process.env.PORT || 3000;
const supabaseHost = 'wqfpksyemvaxncsqwuzm.supabase.co';

const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 32,
  keepAliveMsecs: 15000
});

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function safePath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split('?')[0]);
  const normalizedPath = path.normalize(decodedPath).replace(/^([/\\])+/, '');
  const filePath = path.join(distDir, normalizedPath || 'index.html');
  return filePath.startsWith(distDir) ? filePath : path.join(distDir, 'index.html');
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': ['.html', '.js', '.css'].includes(ext) ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600'
    });
    res.end(data);
  });
}

function proxySupabase(req, res) {
  const upstreamPath = (req.url || '/').replace(/^\/supabase(?=\/|$)/, '') || '/';
  const headers = { ...req.headers };
  headers.host = supabaseHost;
  headers.origin = `https://${supabaseHost}`;
  headers.referer = `https://${supabaseHost}/`;
  delete headers['accept-encoding'];
  delete headers['content-length'];

  const proxyReq = https.request({
    hostname: supabaseHost,
    port: 443,
    method: req.method,
    path: upstreamPath,
    headers,
    agent: keepAliveAgent
  }, (proxyRes) => {
    const responseHeaders = { ...proxyRes.headers };
    delete responseHeaders['content-encoding'];
    delete responseHeaders['content-length'];
    responseHeaders['access-control-allow-origin'] = req.headers.origin || '*';
    responseHeaders['access-control-allow-credentials'] = 'true';
    res.writeHead(proxyRes.statusCode || 502, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (error) => {
    console.error('Supabase proxy error:', error.message);
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Supabase proxy failed' }));
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  if ((req.url || '').startsWith('/supabase/')) {
    proxySupabase(req, res);
    return;
  }

  const filePath = safePath(req.url || '/');
  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(res, filePath);
      return;
    }

    sendFile(res, path.join(distDir, 'index.html'));
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Planing server is running on port ${port}`);
});
