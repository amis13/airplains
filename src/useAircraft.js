import { useEffect, useState } from 'react';

export function useAircraft() {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    let active = true, timer, controller;
    async function poll() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch('/api/aircraft', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('No se puede consultar el receptor');
        const data = await response.json();
        if (!Array.isArray(data.aircraft) || !data.feed) throw new Error('Respuesta del receptor no válida');
        if (active) setState({ data, error: null, loading: false });
      } catch {
        if (active) setState({ data: null, error: 'No se puede conectar con el servidor local. Comprueba que npm run dev o npm start sigue en ejecución.', loading: false });
      } finally {
        clearTimeout(timeout);
        if (active) timer = setTimeout(poll, 1000);
      }
    }
    poll();
    return () => { active = false; clearTimeout(timer); controller?.abort(); };
  }, []);
  return state;
}
