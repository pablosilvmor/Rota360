import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app); // Note: firestoreDatabaseId if needed

async function run() {
  const q = collection(db, 'vehicles');
  const snap = await getDocs(q);
  snap.docs.forEach(d => {
    if (d.data().plate === 'PYC7587') {
      console.log('PYC7587:', d.id, JSON.stringify(d.data(), null, 2));
    } else {
      console.log('Other:', d.data().plate);
    }
  });
  process.exit(0);
}
run();
