import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Preloader } from '../components/Preloader';

export interface UserData {
  uid: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  allowedScreens: string[];
  photoURL?: string;
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeSnapshot: () => void;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      console.log("Auth State Changed. User:", currentUser?.email);
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
          let userDoc;
          try {
            console.log("Fetching user doc for:", currentUser.uid);
            userDoc = await getDoc(userRef);
          } catch (error) {
            console.error('getDoc error:', error);
            setLoading(false);
            return;
          }
        
          if (!userDoc.exists()) {
            console.log("User doc does not exist, creating...");
            const isAdmin = currentUser.email === 'bemongv@gmail.com';
            const newUserData = {
              email: currentUser.email || '',
              name: currentUser.displayName || '',
              role: isAdmin ? 'admin' : 'operador',
              isActive: isAdmin,
              allowedScreens: isAdmin 
                ? ['/', '/fleet', '/maintenance', '/inspections', '/drivers', '/settings', '/admin', '/fuel', '/tracking', '/reports', '/checklist']
                : [],
              photoURL: currentUser.photoURL || '',
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            try {
              await setDoc(userRef, newUserData);
              console.log("User doc created successfully");
            } catch (error) {
              console.error('setDoc error for user:', error);
            }
          }

        console.log("Starting user snapshot listener");
        unsubscribeSnapshot = onSnapshot(userRef, (docSnap) => {
          console.log("User Snapshot received. Exists:", docSnap.exists());
          if (docSnap.exists()) {
            const data = docSnap.data();
            // Sync photoURL if it changed or is missing in firestore
            if (currentUser.photoURL && data.photoURL !== currentUser.photoURL) {
              updateDoc(userRef, { photoURL: currentUser.photoURL }).catch(console.error);
            }
            setUserData({ uid: docSnap.id, ...data } as UserData);
          } else {
            setUserData(null);
          }
          console.log("Setting Auth loading to false");
          setLoading(false);
        }, (error) => {
          console.error('Firestore Error on Auth:', error);
          setLoading(false);
        });
      } else {
        console.log("No user session found. Setting loading to false");
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, loginWithGoogle, logout }}>
      {loading ? <Preloader /> : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
