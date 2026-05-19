import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';

export function useLocalStorageState<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error(`Error reading/parsing localStorage key "${key}":`, e);
    }
    return defaultValue;
  });

  const setPersistentState: Dispatch<SetStateAction<T>> = useCallback((value) => {
    setState((prev) => {
      const nextValue = value instanceof Function ? value(prev) : value;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(key, JSON.stringify(nextValue));
        } catch (e) {
          console.error(`Error writing to localStorage key "${key}":`, e);
        }
      }
      return nextValue;
    });
  }, [key]);

  return [state, setPersistentState];
}
