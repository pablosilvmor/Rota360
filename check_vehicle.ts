import { getDocs, collection, query, where } from "firebase/firestore";
import { db } from "./src/lib/firebase.js";

async function main() {
  const q = query(collection(db, "vehicles"), where("plate", "==", "SIU6F26"));
  const querySnapshot = await getDocs(q);
  console.log(`Found ${querySnapshot.size} vehicles with plate SIU6F26`);
  querySnapshot.forEach(doc => {
    console.log(doc.id, "=>", doc.data().costCenter);
  });
  
  const worksSnap = await getDocs(collection(db, "works"));
  console.log("Works:", worksSnap.docs.map(d => d.data().name));
  
  process.exit(0);
}

main().catch(console.error);
