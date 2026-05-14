const http = require('http');
const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://fagnersato_db_user:f8b7P1SILe2cDvx6@cluster0.7y9dyzb.mongodb.net/?appName=Cluster0';
const DB_NAME = 'sbar_unimed_cg';

let db;

// Admin user template
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

async function connectDB(retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Connecting to MongoDB Atlas (attempt ${i+1}/${retries})...`);
      const client = new MongoClient(MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000
      });
      await client.connect();
      db = client.db(DB_NAME);
      console.log('Connected to MongoDB Atlas successfully!');

      // Ensure admin exists
      const existingAdmin = await db.collection('users').findOne({ email: 'admin@unimedcg.coop.br' });
      if (!existingAdmin) {
        await db.collection('users').insertOne(adminUser);
        console.log('Admin user created');
      }

      // Create indexes for performance
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('patients').createIndex({ sector: 1 });
      await db.collection('sbar').createIndex({ patientId: 1 });
      await db.collection('sbar').createIndex({ timestamp: -1 });
      console.log('Database indexes created');
      return; // success
    } catch (e) {
      console.error(`MongoDB connection attempt ${i+1} failed:`, e.message);
      if (i < retries - 1) {
        console.log('Retrying in 3 seconds...');
        await new Promise(r => setTimeout(r, 3000));
      } else {
        console.error('All connection attempts failed. Exiting.');
        process.exit(1);
      }
    }
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

// Convert MongoDB _id to id for frontend compatibility
function toFrontend(doc) {
  if (!doc) return doc;
  const obj = { ...doc };
  if (obj._id && !obj.id) {
    obj.id = obj._id.toString();
  }
  delete obj._id;
  return obj;
}

function toFrontendArray(docs) {
  return docs.map(toFrontend);
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

    try {
      // POST /api/login
      if (req.url === '/api/login' && req.method === 'POST') {
        const body = await parseBody(req);
        const user = await db.collection('users').findOne({ email: body.email, password: body.password });
        if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'E-mail ou senha incorretos' })); return; }
        if (user.status === 'pending') { res.writeHead(403); res.end(JSON.stringify({ error: 'Seu cadastro aguarda aprovação do administrador' })); return; }
        if (user.status === 'inactive') { res.writeHead(403); res.end(JSON.stringify({ error: 'Seu acesso foi desativado. Contate o administrador.' })); return; }
        res.writeHead(200);
        res.end(JSON.stringify(toFrontend(user)));
        return;
      }

      // GET /api/users
      if (req.url === '/api/users' && req.method === 'GET') {
        const users = await db.collection('users').find({}).toArray();
        res.writeHead(200);
        res.end(JSON.stringify(toFrontendArray(users)));
        return;
      }

      // POST /api/users (register)
      if (req.url === '/api/users' && req.method === 'POST') {
        const body = await parseBody(req);
        const existing = await db.collection('users').findOne({ email: body.email });
        if (existing) {
          res.writeHead(409);
          res.end(JSON.stringify({ error: 'E-mail já cadastrado' }));
          return;
        }
        body.id = Date.now().toString();
        body.role = 'user';
        body.status = 'pending';
        await db.collection('users').insertOne(body);
        res.writeHead(201);
        res.end(JSON.stringify(toFrontend(body)));
        return;
      }

      // PUT /api/users/:id
      if (req.url.match(/^\/api\/users\/[^/]+$/) && req.method === 'PUT') {
        const id = req.url.split('/').pop();
        const body = await parseBody(req);
        delete body._id; // prevent _id update conflict
        const result = await db.collection('users').findOneAndUpdate(
          { id: id },
          { $set: body },
          { returnDocument: 'after' }
        );
        if (!result) { res.writeHead(404); res.end(JSON.stringify({ error: 'Usuário não encontrado' })); return; }
        res.writeHead(200);
        res.end(JSON.stringify(toFrontend(result)));
        return;
      }

      // DELETE /api/users/:id
      if (req.url.match(/^\/api\/users\/[^/]+$/) && req.method === 'DELETE') {
        const id = req.url.split('/').pop();
        await db.collection('users').deleteOne({ id: id });
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // GET /api/patients
      if (req.url === '/api/patients' && req.method === 'GET') {
        const patients = await db.collection('patients').find({}).toArray();
        res.writeHead(200);
        res.end(JSON.stringify(toFrontendArray(patients)));
        return;
      }

      // POST /api/patients
      if (req.url === '/api/patients' && req.method === 'POST') {
        const body = await parseBody(req);
        body.id = Date.now().toString();
        await db.collection('patients').insertOne(body);
        res.writeHead(201);
        res.end(JSON.stringify(toFrontend(body)));
        return;
      }

      // PUT /api/patients/:id
      if (req.url.match(/^\/api\/patients\/[^/]+$/) && req.method === 'PUT') {
        const id = req.url.split('/').pop();
        const body = await parseBody(req);
        delete body._id;
        const result = await db.collection('patients').findOneAndUpdate(
          { id: id },
          { $set: body },
          { returnDocument: 'after' }
        );
        if (!result) { res.writeHead(404); res.end(JSON.stringify({ error: 'Paciente não encontrado' })); return; }
        res.writeHead(200);
        res.end(JSON.stringify(toFrontend(result)));
        return;
      }

      // GET /api/sbar
      if (req.url === '/api/sbar' && req.method === 'GET') {
        const records = await db.collection('sbar').find({}).sort({ timestamp: -1 }).toArray();
        res.writeHead(200);
        res.end(JSON.stringify(toFrontendArray(records)));
        return;
      }

      // POST /api/sbar
      if (req.url === '/api/sbar' && req.method === 'POST') {
        const body = await parseBody(req);
        body.id = Date.now().toString();
        await db.collection('sbar').insertOne(body);
        res.writeHead(201);
        res.end(JSON.stringify(toFrontend(body)));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Rota não encontrada' }));

    } catch (e) {
      console.error('API Error:', e.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Erro interno do servidor' }));
    }
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

// Start server after DB connection
connectDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SBAR Unimed CG Server running on http://0.0.0.0:${PORT}`);
    console.log(`Connected to MongoDB Atlas - Database: ${DB_NAME}`);
  });
});
