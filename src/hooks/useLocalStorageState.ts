import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';

export function useLocalStorageState<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(`Error parsing localStorage key "${key}":`, e);
      }
    }
    return defaultValue;
  });

  const setPersistentState: Dispatch<SetStateAction<T>> = useCallback((value) => {
    setState((prev) => {
      const nextValue = value instanceof Function ? value(prev) : value;
      localStorage.setItem(key, JSON.stringify(nextValue));
      return nextValue;
    });
  }, [key]);

  return [state, setPersistentState];
}
