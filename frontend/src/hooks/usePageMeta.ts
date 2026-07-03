import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMeta } from './useMeta';

export function usePageMeta() {
  const location = useLocation();
  const [metaData, setMetaData] = useState({
    title: 'Heavy Ops',
    description: 'Poste de supervision centralisée',
    keywords: 'dashboard, supervision',
  });

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const res = await fetch('/api/meta');
        const pages = await res.json();

        const pageKey = location.pathname === '/' ? '/' : location.pathname;
        const meta = pages[pageKey] || metaData;

        setMetaData(meta);
      } catch (_error) {
        // Si l'API échoue, garder les meta par défaut
      }
    };

    fetchMeta();
  }, [location.pathname]);

  useMeta(location.pathname, metaData);
}
