import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { Preloader } from '../components/Preloader';

export interface UserData {
  uid: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  allowedScreens: string[];
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
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
          let userDoc;
          try {
            userDoc = await getDoc(userRef);
          } catch (error) {
            console.error('getDoc error:', error);
            setLoading(false);
            return;
          }
        
          if (!userDoc.exists()) {
            const isAdmin = currentUser.email === 'bemongv@gmail.com';
            const newUserData = {
              email: currentUser.email || '',
              name: currentUser.displayName || '',
              role: isAdmin ? 'admin' : 'operador',
              isActive: true,
              allowedScreens: isAdmin 
                ? ['/', '/fleet', '/maintenance', '/drivers', '/settings', '/admin', '/fuel', '/tracking']
                : ['/'],
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            try {
              await setDoc(userRef, newUserData);
            } catch (error) {
              console.error('setDoc error for user:', error, JSON.stringify(newUserData));
            }
          }

        unsubscribeSnapshot = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setUserData({ uid: docSnap.id, ...docSnap.data() } as UserData);
          } else {
            setUserData(null);
          }
          setLoading(false);
        }, (error) => {
          console.error('Firestore Error on Auth:', error);
          setLoading(false);
        });
      } else {
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
