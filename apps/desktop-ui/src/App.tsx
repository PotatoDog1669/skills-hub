import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { ConfirmProvider } from '@/components/ConfirmProvider';
import { Dashboard } from '@/components/Dashboard';
import { Sidebar } from '@/components/Sidebar';
import { APP_TYPES, type AppType, type ProviderRecord } from '@/lib/core/provider-types';
import { useEffect, useMemo, useState } from 'react';
import { getSnapshot, subscribeSnapshot } from './desktop-state';
import { hydrateTauriState, refreshSkillState } from './tauri-actions';

export function App() {
  const [snapshot, setSnapshot] = useState(() => getSnapshot());

  useEffect(() => {
    return subscribeSnapshot(() => {
      setSnapshot(getSnapshot());
    });
  }, []);

  useEffect(() => {
    async function bootstrap() {
      try {
        await invoke('health');
        await invoke('version');
        await hydrateTauriState();
      } catch {
        // Leave the previous desktop snapshot in place if runtime bootstrap fails.
      }
    }

    bootstrap();
  }, []);

  useEffect(() => {
    let mounted = true;
    let unlisten: UnlistenFn | null = null;

    async function bindSkillUpdates() {
      try {
        unlisten = await listen('skills://updated', async () => {
          if (!mounted) {
            return;
          }
          await refreshSkillState();
        });
      } catch {
        unlisten = null;
      }
    }

    void bindSkillUpdates();

    return () => {
      mounted = false;
      if (unlisten) {
        void unlisten();
      }
    };
  }, []);

  const currentProviders = useMemo(() => {
    return Object.fromEntries(
      APP_TYPES.map((appType) => {
        const current =
          snapshot.providers.find((provider) => provider.appType === appType && provider.isCurrent) ||
          null;
        return [appType, current];
      })
    ) as Record<AppType, ProviderRecord | null>;
  }, [snapshot.providers]);

  return (
    <ConfirmProvider>
      <div className="desktop-root">
        <Sidebar config={snapshot.config} />
        <main className="desktop-main">
          <Dashboard
            skills={snapshot.skills}
            config={snapshot.config}
            providers={snapshot.providers}
            universalProviders={snapshot.universalProviders}
            currentProviders={currentProviders}
            kitPolicies={snapshot.kitPolicies}
            kitLoadouts={snapshot.kitLoadouts}
            kits={snapshot.kits}
            officialPresets={snapshot.officialPresets}
          />
        </main>
      </div>
    </ConfirmProvider>
  );
}
