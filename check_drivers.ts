
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkData() {
  const querySnapshot = await getDocs(collection(db, 'drivers'));
  console.log(`TOTAL_DRIVERS: ${querySnapshot.size}`);
  querySnapshot.forEach((doc) => {
    console.log(`DRIVER: ${doc.id} => ${JSON.stringify(doc.data())}`);
  });
}

checkData().catch(console.error);
