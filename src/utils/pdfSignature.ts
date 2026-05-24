import { auth, db } from '../lib/firebase';
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';

export interface SignatureData {
  documentType: string;
  documentTitle: string;
}

export const createSignature = async (data: SignatureData): Promise<string | null> => {
  try {
    const user = auth.currentUser;
    if (!user) return null; // Only signed in users can create valid signatures
    
    // We create a new doc ref manually to get the ID right away
    const signatureRef = doc(collection(db, 'signatures'));
    
    await setDoc(signatureRef, {
      documentType: data.documentType,
      documentTitle: data.documentTitle,
      signerName: user.displayName || user.email || 'Usuário ROTA 360',
      signerEmail: user.email,
      signerId: user.uid,
      timestamp: Date.now(),
      companyName: 'ROTA 360'
    });

    return signatureRef.id;
  } catch (error) {
    console.error('Error creating digital signature:', error);
    return null;
  }
};

export const getQRCodeDataUrl = async (url: string): Promise<string> => {
  try {
    const proxyUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`;
    const resp = await fetch(proxyUrl);
    const blob = await resp.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error generating QR code:', error);
    return '';
  }
};

export const generateVerificationUrl = (signatureId: string): string => {
  // Using the window.location.origin to point to the current environment url
  return `${window.location.origin}/verify/${signatureId}`;
};
