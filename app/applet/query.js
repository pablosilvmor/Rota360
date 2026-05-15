import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  const q = collection(db, 'vehicles');
  const snap = await getDocs(q);
  console.log('Veículos encontrados:');
  snap.docs.forEach(d => {
    const data = d.data();
    console.log(`- Nome/Placa: ${data.plate || 'Sem placa'} (${data.brand} ${data.model})`);
    console.log(`  Link da imagem: ${data.imageUrl || 'Sem imagem'}`);
  });
  
  process.exit(0);
}
run();
