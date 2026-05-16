const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI não definida.');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db('sbar_unimed_cg');
    const collections = await db.listCollections().toArray();
    console.log('collections=' + collections.map(c => c.name).sort().join(','));
    for (const name of ['users', 'patients', 'sbar']) {
      const count = await db.collection(name).countDocuments();
      console.log(`${name}_count=${count}`);
    }
    const samplePatients = await db.collection('patients')
      .find({}, { projection: { _id: 0, id: 1, sector: 1, setor: 1, discharged: 1, name: 1, bed: 1 } })
      .limit(5)
      .toArray();
    console.log('patient_fields_sample=' + JSON.stringify(samplePatients.map(p => ({
      hasId: !!p.id,
      sector: p.sector || null,
      setor: p.setor || null,
      discharged: p.discharged,
      hasName: !!p.name,
      hasBed: !!p.bed
    }))));
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('diagnostic_error=' + err.message);
  process.exit(1);
});
