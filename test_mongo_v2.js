const { MongoClient } = require('mongodb');
const MONGO_URI = "mongodb+srv://fagnersato_db_user:0RBbsXRbChcpVqSs@cluster0.mongodb.net/sbar_unimed_cg?retryWrites=true&w=majority";

async function run() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    console.log("Connected successfully to MongoDB");
    const db = client.db('sbar_unimed_cg');
    const collections = await db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name));
    
    for (const colName of ['users', 'patients', 'sbar']) {
      const count = await db.collection(colName).countDocuments();
      console.log(`Collection ${colName} has ${count} documents`);
    }
  } catch (err) {
    console.error("Connection error:", err.message);
  } finally {
    await client.close();
  }
}
run();
