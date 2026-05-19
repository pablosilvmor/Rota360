import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';

export function useLocalStorageState<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        // Se esperarmos um array mas vier outra coisa, podemos opcionalmente tratar aqui, 
        // mas por hora o fallback para o try-catch resolve a maioria dos erros de sintaxe.
        return parsed;
      } catch (e) {
        console.error(`Error parsing localStorage key "${key}":`, e);
        return defaultValue;
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
