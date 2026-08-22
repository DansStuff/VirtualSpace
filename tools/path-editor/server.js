const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = Number(process.env.PATH_EDITOR_PORT) || 4177
const PROJECT_ROOT = path.resolve(__dirname, '../..')
const EDITOR_HTML = path.join(__dirname, 'index.html')
const ROUTEDATA_PATH = path.join(PROJECT_ROOT, 'src/path/routedata.ts')

function send(res, status, body, contentType) {
  res.writeHead(status, {
    'Content-Type': contentType || 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function looksLikeRouteData(source) {
  return (
    typeof source === 'string' &&
    source.includes('export const SHIP_ROUTE') &&
    source.includes('planets:') &&
    source.includes('legs:')
  )
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')

  if (req.method === 'OPTIONS') {
    send(res, 204, '')
    return
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    try {
      send(res, 200, fs.readFileSync(EDITOR_HTML), 'text/html; charset=utf-8')
    } catch (err) {
      send(res, 500, err && err.message ? err.message : 'Failed to read editor')
    }
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/route') {
    try {
      send(res, 200, fs.readFileSync(ROUTEDATA_PATH, 'utf8'), 'text/plain; charset=utf-8')
    } catch (err) {
      send(res, 404, err && err.message ? err.message : 'routedata.ts not found')
    }
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/save') {
    try {
      const raw = await readBody(req)
      const payload = raw ? JSON.parse(raw) : {}
      const source = payload.source
      if (!looksLikeRouteData(source)) {
        send(res, 400, 'Payload must be a SHIP_ROUTE TypeScript module')
        return
      }
      fs.mkdirSync(path.dirname(ROUTEDATA_PATH), { recursive: true })
      fs.writeFileSync(ROUTEDATA_PATH, source.replace(/\s+$/, '') + '\n', 'utf8')
      send(res, 200, JSON.stringify({ ok: true, path: 'src/path/routedata.ts' }), 'application/json; charset=utf-8')
    } catch (err) {
      send(res, 500, err && err.message ? err.message : 'Save failed')
    }
    return
  }

  send(res, 404, 'Not found')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('Path editor  http://127.0.0.1:' + PORT + '/')
  console.log('Writes to    src/path/routedata.ts')
})
