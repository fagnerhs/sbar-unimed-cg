const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Use /opt/render/project/data on Render (persistent disk), fallback to local data dir
const RENDER_DISK = '/opt/render/project/data';
const DATA_DIR = fs.existsSync(RENDER_DISK) ? RENDER_DISK : path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Data files
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PATIENTS_FILE = path.join(DATA_DIR, 'patients.json');
const SBAR_FILE = path.join(DATA_DIR, 'sbar.json');

console.log(`Data directory: ${DATA_DIR}`);

// Initialize data files ONLY if they don't exist (preserves existing data)
function initDataFile(file, defaultData) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
    console.log(`Created new data file: ${file}`);
  } else {
    console.log(`Existing data file found: ${file}`);
  }
}

// Initialize with admin user
const adminUser = {
  id: 'admin_001',
  name: 'Administrador',
  email: 'admin@unimedcg.coop.br',
  password: 'admin123',
  profissao: 'Administrador',
  conselho: 'N/A',
  setor: 'Todos',
  role: 'admin',
  status: 'active'
};

initDataFile(USERS_FILE, [adminUser]);
initDataFile(PATIENTS_FILE, []);
initDataFile(SBAR_FILE, []);

// Ensure admin exists in existing data
let usersInit = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
if (!usersInit.find(u => u.email === 'admin@unimedcg.coop.br')) {
  usersInit.push(adminUser);
  fs.writeFileSync(USERS_FILE, JSON.stringify(usersInit, null, 2));
  console.log('Admin user added to existing data');
}

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch(e) { console.error(`Error reading ${file}:`, e.message); return []; }
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch(e) {
    console.error(`Error writing ${file}:`, e.message);
  }
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch(e) { resolve({}); }
    });
  });
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // API Routes
  if (req.url.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');

    // POST /api/login
    if (req.url === '/api/login' && req.method === 'POST') {
      const body = await parseBody(req);
      const users = readJSON(USERS_FILE);
      const user = users.find(u => u.email === body.email && u.password === body.password);
      if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'E-mail ou senha incorretos' })); return; }
      if (user.status === 'pending') { res.writeHead(403); res.end(JSON.stringify({ error: 'Seu cadastro aguarda aprovação do administrador' })); return; }
      if (user.status === 'inactive') { res.writeHead(403); res.end(JSON.stringify({ error: 'Seu acesso foi desativado. Contate o administrador.' })); return; }
      res.writeHead(200);
      res.end(JSON.stringify(user));
      return;
    }

    // GET /api/users
    if (req.url === '/api/users' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(readJSON(USERS_FILE)));
      return;
    }

    // POST /api/users (register)
    if (req.url === '/api/users' && req.method === 'POST') {
      const body = await parseBody(req);
      const users = readJSON(USERS_FILE);
      if (users.find(u => u.email === body.email)) {
        res.writeHead(409);
        res.end(JSON.stringify({ error: 'E-mail já cadastrado' }));
        return;
      }
      body.id = Date.now().toString();
      body.role = 'user';
      body.status = 'pending';
      users.push(body);
      writeJSON(USERS_FILE, users);
      res.writeHead(201);
      res.end(JSON.stringify(body));
      return;
    }

    // PUT /api/users/:id
    if (req.url.match(/^\/api\/users\/[^/]+$/) && req.method === 'PUT') {
      const id = req.url.split('/').pop();
      const body = await parseBody(req);
      const users = readJSON(USERS_FILE);
      const idx = users.findIndex(u => u.id === id);
      if (idx === -1) { res.writeHead(404); res.end(JSON.stringify({ error: 'Usuário não encontrado' })); return; }
      Object.assign(users[idx], body);
      writeJSON(USERS_FILE, users);
      res.writeHead(200);
      res.end(JSON.stringify(users[idx]));
      return;
    }

    // DELETE /api/users/:id
    if (req.url.match(/^\/api\/users\/[^/]+$/) && req.method === 'DELETE') {
      const id = req.url.split('/').pop();
      let users = readJSON(USERS_FILE);
      users = users.filter(u => u.id !== id);
      writeJSON(USERS_FILE, users);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // GET /api/patients
    if (req.url === '/api/patients' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(readJSON(PATIENTS_FILE)));
      return;
    }

    // POST /api/patients
    if (req.url === '/api/patients' && req.method === 'POST') {
      const body = await parseBody(req);
      const patients = readJSON(PATIENTS_FILE);
      body.id = Date.now().toString();
      patients.push(body);
      writeJSON(PATIENTS_FILE, patients);
      res.writeHead(201);
      res.end(JSON.stringify(body));
      return;
    }

    // PUT /api/patients/:id
    if (req.url.match(/^\/api\/patients\/[^/]+$/) && req.method === 'PUT') {
      const id = req.url.split('/').pop();
      const body = await parseBody(req);
      const patients = readJSON(PATIENTS_FILE);
      const idx = patients.findIndex(p => p.id === id);
      if (idx === -1) { res.writeHead(404); res.end(JSON.stringify({ error: 'Paciente não encontrado' })); return; }
      Object.assign(patients[idx], body);
      writeJSON(PATIENTS_FILE, patients);
      res.writeHead(200);
      res.end(JSON.stringify(patients[idx]));
      return;
    }

    // GET /api/sbar
    if (req.url === '/api/sbar' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(readJSON(SBAR_FILE)));
      return;
    }

    // POST /api/sbar
    if (req.url === '/api/sbar' && req.method === 'POST') {
      const body = await parseBody(req);
      const records = readJSON(SBAR_FILE);
      body.id = Date.now().toString();
      records.unshift(body);
      writeJSON(SBAR_FILE, records);
      res.writeHead(201);
      res.end(JSON.stringify(body));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Rota não encontrada' }));
    return;
  }

  // Static file serving with no-cache headers for HTML
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const contentType = MIME_TYPES[ext] || 'text/html';
  try {
    const content = fs.readFileSync(filePath);
    const headers = { 'Content-Type': contentType };
    // Prevent caching of HTML to always serve latest version
    if (ext === '.html' || ext === '') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }
    res.writeHead(200, headers);
    res.end(content);
  } catch(e) {
    res.writeHead(500);
    res.end('Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SBAR Unimed CG Server running on http://0.0.0.0:${PORT}`);
  console.log(`Data stored in: ${DATA_DIR}`);
});
