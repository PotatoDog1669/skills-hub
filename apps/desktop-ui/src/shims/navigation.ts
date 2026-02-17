import { useEffect, useMemo, useState } from 'react';

function dispatchNavigationUpdate() {
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function navigate(url: string, replace = false) {
  if (replace) {
    window.history.replaceState({}, '', url);
  } else {
    window.history.pushState({}, '', url);
  }
  dispatchNavigationUpdate();
}

export function useSearchParams() {
  const [search, setSearch] = useState(() => window.location.search);

  useEffect(() => {
    const handleChange = () => setSearch(window.location.search);
    window.addEventListener('popstate', handleChange);
    return () => window.removeEventListener('popstate', handleChange);
  }, []);

  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useRouter() {
  return {
    push: (url: string) => navigate(url, false),
    replace: (url: string) => navigate(url, true),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    prefetch: async () => {},
    refresh: () => {
      window.dispatchEvent(new CustomEvent('skills-hub:refresh'));
    },
  };
}
