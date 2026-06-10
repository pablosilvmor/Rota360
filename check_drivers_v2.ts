
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkData() {
  const querySnapshot = await getDocs(collection(db, 'drivers'));
  let out = `TOTAL_DRIVERS: ${querySnapshot.size}\n`;
  querySnapshot.forEach((doc) => {
    out += `DRIVER: ${doc.id} => ${JSON.stringify(doc.data())}\n`;
  });
  fs.writeFileSync('drivers_data.txt', out);
}

checkData().catch(e => fs.writeFileSync('drivers_data.txt', e.toString()));
