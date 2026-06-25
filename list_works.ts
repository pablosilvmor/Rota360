import { getDocs, collection } from "firebase/firestore";
import { db } from "./src/lib/firebase.js";

async function main() {
  const querySnapshot = await getDocs(collection(db, "works"));
  const works = querySnapshot.docs.map(d => d.data().name);
  console.log("Registered Works:");
  console.log(works);
  process.exit(0);
}

main().catch(console.error);
