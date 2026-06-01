import React, { createContext, useContext, useState, useEffect } from 'react';

interface PrivacyContextType {
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

export const PrivacyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPrivacyMode, setIsPrivacyMode] = useState(() => {
    const saved = localStorage.getItem('privacy_mode');
    return saved === 'true';
  });

  const togglePrivacyMode = () => {
    setIsPrivacyMode(prev => {
      const next = !prev;
      localStorage.setItem('privacy_mode', String(next));
      return next;
    });
  };

  return (
    <PrivacyContext.Provider value={{ isPrivacyMode, togglePrivacyMode }}>
      {children}
    </PrivacyContext.Provider>
  );
};

export const usePrivacy = () => {
  const context = useContext(PrivacyContext);
  if (context === undefined) {
    throw new Error('usePrivacy must be used within a PrivacyProvider');
  }
  return context;
};

export const PrivateValue: React.FC<{ value: React.ReactNode; original?: string }> = ({ value, original }) => {
  const { isPrivacyMode } = usePrivacy();

  return (
    <span className={`transition-all duration-300 ${isPrivacyMode ? 'blur-[5px] select-none' : ''}`}>
      {value || original || '••••••••'}
    </span>
  );
};
