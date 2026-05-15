const { MongoClient } = require('mongodb');
const MONGO_URI = "mongodb+srv://fagnersato_db_user:pfCnUFa75WxpALCK@cluster0.7y9dyzb.mongodb.net/sbar_unimed_cg?retryWrites=true&w=majority";

async function run() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    console.log("SUCCESS: Connected to MongoDB Atlas");
    const db = client.db('sbar_unimed_cg');
    const collections = await db.listCollections().toArray();
    console.log("Collections found:", collections.map(c => c.name));
  } catch (err) {
    console.error("FAILURE:", err.message);
  } finally {
    await client.close();
  }
}
run();
