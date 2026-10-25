import { useEffect, useState } from 'react';
export function useApiHealth() {
  const [status, setStatus] = useState<
    'checking' | 'available' | 'unavailable'
  >('checking');
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    fetch('/api/health', { signal: controller.signal })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (
          !response.ok ||
          !result ||
          typeof result !== 'object' ||
          !('status' in result) ||
          result.status !== 'ok'
        )
          throw new Error('Resposta inválida');
        if (active) setStatus('available');
      })
      .catch(() => {
        if (active) setStatus('unavailable');
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);
  return status;
}
