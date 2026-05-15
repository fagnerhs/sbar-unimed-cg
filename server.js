const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'sbar_unimed_cg';

// Ensure data directory exists for JSON fallback
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PATIENTS_FILE = path.join(DATA_DIR, 'patients.json');
const SBAR_FILE = path.join(DATA_DIR, 'sbar.json');

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

// ============ STORAGE ABSTRACTION ============
let storage = null;

// --- JSON FILE STORAGE ---
const jsonStorage = {
  name: 'JSON File',
  init() {
    function initFile(file, def) {
      if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def, null, 2));
    }
    initFile(USERS_FILE, [adminUser]);
    initFile(PATIENTS_FILE, []);
    initFile(SBAR_FILE, []);
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    if (!users.find(u => u.email === 'admin@unimedcg.coop.br')) {
      users.push(adminUser);
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }
  },
  readUsers() { try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch(e) { return []; } },
  writeUsers(d) { fs.writeFileSync(USERS_FILE, JSON.stringify(d, null, 2)); },
  readPatients() { try { return JSON.parse(fs.readFileSync(PATIENTS_FILE, 'utf8')); } catch(e) { return []; } },
  writePatients(d) { fs.writeFileSync(PATIENTS_FILE, JSON.stringify(d, null, 2)); },
  readSbar() { try { return JSON.parse(fs.readFileSync(SBAR_FILE, 'utf8')); } catch(e) { return []; } },
  writeSbar(d) { fs.writeFileSync(SBAR_FILE, JSON.stringify(d, null, 2)); },

  async findUser(query) { return this.readUsers().find(u => Object.keys(query).every(k => u[k] === query[k])) || null; },
  async getUsers() { return this.readUsers(); },
  async addUser(u) { const users = this.readUsers(); users.push(u); this.writeUsers(users); return u; },
  async updateUser(id, data) { const users = this.readUsers(); const i = users.findIndex(u => u.id === id); if (i === -1) return null; Object.assign(users[i], data); this.writeUsers(users); return users[i]; },
  async deleteUser(id) { let users = this.readUsers(); users = users.filter(u => u.id !== id); this.writeUsers(users); },
  async getPatients() { return this.readPatients(); },
  async addPatient(p) { const pts = this.readPatients(); pts.push(p); this.writePatients(pts); return p; },
  async updatePatient(id, data) { const pts = this.readPatients(); const i = pts.findIndex(p => p.id === id); if (i === -1) return null; Object.assign(pts[i], data); this.writePatients(pts); return pts[i]; },
  async deletePatient(id) { let pts = this.readPatients(); pts = pts.filter(p => p.id !== id); this.writePatients(pts); },
  async getSbar() { return this.readSbar(); },
  async addSbar(r) { const recs = this.readSbar(); recs.unshift(r); this.writeSbar(recs); return r; },
  async deleteSbar(id) { let recs = this.readSbar(); recs = recs.filter(r => r.id !== id); this.writeSbar(recs); }
};

// --- MONGODB STORAGE ---
function createMongoStorage(db) {
  function toFrontend(doc) { if (!doc) return doc; const o = { ...doc }; if (o._id && !o.id) o.id = o._id.toString(); delete o._id; return o; }
  return {
    name: 'MongoDB Atlas',
    async findUser(query) { return toFrontend(await db.collection('users').findOne(query)); },
    async getUsers() { return (await db.collection('users').find({}).toArray()).map(toFrontend); },
    async addUser(u) { await db.collection('users').insertOne(u); return toFrontend(u); },
    async updateUser(id, data) { delete data._id; const r = await db.collection('users').findOneAndUpdate({ id }, { $set: data }, { returnDocument: 'after' }); return r ? toFrontend(r) : null; },
    async deleteUser(id) { await db.collection('users').deleteOne({ id }); },
    async getPatients() { return (await db.collection('patients').find({}).toArray()).map(toFrontend); },
    async addPatient(p) { await db.collection('patients').insertOne(p); return toFrontend(p); },
    async updatePatient(id, data) { delete data._id; const r = await db.collection('patients').findOneAndUpdate({ id }, { $set: data }, { returnDocument: 'after' }); return r ? toFrontend(r) : null; },
    async deletePatient(id) { await db.collection('patients').deleteOne({ id }); },
    async getSbar() { return (await db.collection('sbar').find({}).sort({ timestamp: -1 }).toArray()).map(toFrontend); },
    async addSbar(r) { await db.collection("sbar").insertOne(r); return toFrontend(r); },
    async deleteSbar(id) { await db.collection("sbar").deleteOne({ id }); }
  };
}

async function initStorage() {
  if (MONGO_URI) {
    try {
      console.log('Attempting MongoDB Atlas connection...');
      const { MongoClient } = require('mongodb');
      const client = new MongoClient(MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000
      });
      await client.connect();
      const db = client.db(DB_NAME);
      console.log('Connected to MongoDB Atlas!');

      // Ensure admin
      const admin = await db.collection('users').findOne({ email: 'admin@unimedcg.coop.br' });
      if (!admin) { await db.collection('users').insertOne(adminUser); console.log('Admin created in MongoDB'); }

      // Indexes
      await db.collection('users').createIndex({ email: 1 }, { unique: true }).catch(() => {});
      await db.collection('users').createIndex({ id: 1 }).catch(() => {});
      await db.collection('patients').createIndex({ id: 1 }).catch(() => {});
      await db.collection('patients').createIndex({ sector: 1 }).catch(() => {});
      await db.collection('sbar').createIndex({ patientId: 1 }).catch(() => {});
      await db.collection('sbar').createIndex({ timestamp: -1 }).catch(() => {});

      storage = createMongoStorage(db);
      console.log(`Using MongoDB Atlas for data storage with URI: ${MONGO_URI}`);
      return;
    } catch (e) {
      console.error('MongoDB connection failed:', e.message);
      console.log('Falling back to JSON file storage...');
    }
  } else {
    console.log('No MONGO_URI set.');
  }

  // Fallback to JSON
  jsonStorage.init();
  storage = jsonStorage;
  console.log("Using JSON file storage (MongoDB connection failed or MONGO_URI not set).");
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve({}); } });
  });
}

const MIME_TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.url.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    try {
      // POST /api/login
      if (req.url === '/api/login' && req.method === 'POST') {
        const body = await parseBody(req);
        const user = await storage.findUser({ email: body.email, password: body.password });
        if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'E-mail ou senha incorretos' })); return; }
        if (user.status === 'pending') { res.writeHead(403); res.end(JSON.stringify({ error: 'Seu cadastro aguarda aprovação do administrador' })); return; }
        if (user.status === 'inactive') { res.writeHead(403); res.end(JSON.stringify({ error: 'Seu acesso foi desativado. Contate o administrador.' })); return; }
        res.writeHead(200); res.end(JSON.stringify(user)); return;
      }

      // GET /api/users
      if (req.url === '/api/users' && req.method === 'GET') {
        res.writeHead(200); res.end(JSON.stringify(await storage.getUsers())); return;
      }

      // POST /api/users
      if (req.url === '/api/users' && req.method === 'POST') {
        const body = await parseBody(req);
        const existing = await storage.findUser({ email: body.email });
        if (existing) { res.writeHead(409); res.end(JSON.stringify({ error: 'E-mail já cadastrado' })); return; }
        body.id = Date.now().toString(); body.role = 'user'; body.status = 'pending';
        const user = await storage.addUser(body);
        res.writeHead(201); res.end(JSON.stringify(user)); return;
      }

      // PUT /api/users/:id
      if (req.url.match(/^\/api\/users\/[^/]+$/) && req.method === 'PUT') {
        const id = req.url.split('/').pop();
        const body = await parseBody(req);
        const user = await storage.updateUser(id, body);
        if (!user) { res.writeHead(404); res.end(JSON.stringify({ error: 'Usuário não encontrado' })); return; }
        res.writeHead(200); res.end(JSON.stringify(user)); return;
      }

      // DELETE /api/users/:id
      if (req.url.match(/^\/api\/users\/[^/]+$/) && req.method === 'DELETE') {
        await storage.deleteUser(req.url.split('/').pop());
        res.writeHead(200); res.end(JSON.stringify({ success: true })); return;
      }

      // GET /api/patients
      if (req.url === '/api/patients' && req.method === 'GET') {
        res.writeHead(200); res.end(JSON.stringify(await storage.getPatients())); return;
      }

      // POST /api/patients
      if (req.url === '/api/patients' && req.method === 'POST') {
        const body = await parseBody(req); body.id = Date.now().toString();
        const p = await storage.addPatient(body);
        res.writeHead(201); res.end(JSON.stringify(p)); return;
      }

      // PUT /api/patients/:id
      if (req.url.match(/^\/api\/patients\/[^/]+$/) && req.method === 'PUT') {
        const id = req.url.split('/').pop();
        const body = await parseBody(req);
        const p = await storage.updatePatient(id, body);
        if (!p) { res.writeHead(404); res.end(JSON.stringify({ error: 'Paciente não encontrado' })); return; }
        res.writeHead(200); res.end(JSON.stringify(p)); return;
      }

      // DELETE /api/patients/:id
      if (req.url.match(/^\/api\/patients\/[^/]+$/) && req.method === 'DELETE') {
        const id = req.url.split('/').pop();
        await storage.deletePatient(id);
        res.writeHead(200); res.end(JSON.stringify({ success: true })); return;
      }

      // GET /api/sbar
      if (req.url === '/api/sbar' && req.method === 'GET') {
        // For now, return all SBARs. Frontend will handle filtering based on user roles.
        // TODO: Implement server-side filtering for PH records based on user role.
        res.writeHead(200); res.end(JSON.stringify(await storage.getSbar())); return;
      }

      // POST /api/sbar
      if (req.url === '/api/sbar' && req.method === 'POST') {
        const body = await parseBody(req); body.id = Date.now().toString();
        const r = await storage.addSbar(body);
        res.writeHead(201); res.end(JSON.stringify(r)); return;
      }

      // DELETE /api/sbar/:id
      if (req.url.match(/^\/api\/sbar\/[^/]+$/) && req.method === 'DELETE') {
        const id = req.url.split('/').pop();
        await storage.deleteSbar(id);
        res.writeHead(200); res.end(JSON.stringify({ success: true })); return;
      }

      res.writeHead(404); res.end(JSON.stringify({ error: 'Rota não encontrada' }));
    } catch (e) {
      console.error('API Error:', e.message);
      res.writeHead(500); res.end(JSON.stringify({ error: 'Erro interno do servidor' }));
    }
    return;
  }

  // Static files
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  if (!fs.existsSync(filePath)) filePath = path.join(PUBLIC_DIR, 'index.html');
  const contentType = MIME_TYPES[ext] || 'text/html';
  try {
    const content = fs.readFileSync(filePath);
    const headers = { 'Content-Type': contentType };
    if (ext === '.html' || ext === '' || ext === '.js' || ext === '.json') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache'; headers['Expires'] = '0';
    }
    res.writeHead(200, headers); res.end(content);
  } catch(e) { res.writeHead(500); res.end('Server Error'); }
});

initStorage().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SBAR Unimed CG running on http://0.0.0.0:${PORT}`);
    console.log(`Storage: ${storage.name}`);
  });
}).catch(e => {
  console.error('Fatal error:', e.message);
  // Start with JSON fallback anyway
  jsonStorage.init();
  storage = jsonStorage;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SBAR Unimed CG running on http://0.0.0.0:${PORT} (JSON fallback)`);
  });
});
