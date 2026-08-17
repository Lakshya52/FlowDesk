import { useState, useEffect } from 'react';

/**
 * Debounce a value for a specified delay.
 * Returns a stable value that updates only after the user stops changing the input for `delay` ms.
 */
export default function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debounced;
}
