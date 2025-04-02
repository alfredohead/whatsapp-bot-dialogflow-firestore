const admin = require('firebase-admin');

if (!admin.apps.length) {
  const credentials = JSON.parse(Buffer.from(process.env.FIREBASE_JSON, 'base64').toString('utf-8'));
  admin.initializeApp({
    credential: admin.credential.cert(credentials)
  });
}

const db = admin.firestore();

async function saveUserContext(userId, context) {
  return db.collection('users').doc(userId).set(context, { merge: true });
}

async function getUserContext(userId) {
  const doc = await db.collection('users').doc(userId).get();
  return doc.exists ? doc.data() : null;
}

module.exports = { saveUserContext, getUserContext };
