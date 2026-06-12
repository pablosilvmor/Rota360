import { addDoc, updateDoc, deleteDoc, setDoc, doc, collection, serverTimestamp, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { windowToastManager } from '../contexts/ToastContext';

export type ActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';

export async function logAudit(
  type: ActionType,
  screen: string,
  collectionName: string,
  docId: string,
  payload: any,
  previousPayload?: any
) {
  try {
    const user = auth.currentUser;
    let userName = 'Desconhecido';
    
    if (user) {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        userName = userDoc.data().name || user.email || 'Desconhecido';
      }
    }

    await addDoc(collection(db, 'audit_logs'), {
      type,
      screen,
      collectionName,
      docId,
      payload: payload || null,
      previousPayload: previousPayload || null,
      userId: user?.uid || 'unknown',
      userEmail: user?.email || 'unknown',
      userName,
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error('Failed to log audit:', error);
  }
}

export async function auditDelete(
  collectionName: string,
  docId: string,
  screen: string
) {
  const docRef = doc(db, collectionName, docId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return;

  const data = snapshot.data();
  
  // Actually delete
  await deleteDoc(docRef);
  
  // Log audit
  await logAudit('DELETE', screen, collectionName, docId, data);

  // Show undo toast
  if (windowToastManager.showUndoToast) {
    windowToastManager.showUndoToast('Exclusão realizada.', async () => {
      // Undo deletion
      await setDoc(docRef, data);
      await logAudit('RESTORE', screen, collectionName, docId, data);
    });
  }
}
