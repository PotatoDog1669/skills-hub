import { invoke } from '@tauri-apps/api/core';
import { ConfirmProvider } from '@/components/ConfirmProvider';
import { Dashboard } from '@/components/Dashboard';
import { Sidebar } from '@/components/Sidebar';
import { APP_TYPES, type AppType, type ProviderRecord } from '@/lib/core/provider-types';
import { useEffect, useMemo, useState } from 'react';
import { getSnapshot, subscribeSnapshot } from './desktop-state';
import { hydrateTauriState } from './tauri-actions';

type HealthResponse = {
  status: string;
};

type VersionResponse = {
  version: string;
};

type RuntimeStatus = {
  health: string;
  version: string;
  error: string | null;
};

export function App() {
  const [snapshot, setSnapshot] = useState(() => getSnapshot());
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>({
    health: 'loading',
    version: 'loading',
    error: null,
  });

  useEffect(() => {
    return subscribeSnapshot(() => {
      setSnapshot(getSnapshot());
    });
  }, []);

  useEffect(() => {
    async function bootstrap() {
      try {
        const healthResult = await invoke<HealthResponse>('health');
        const versionResult = await invoke<VersionResponse>('version');
        await hydrateTauriState();
        setRuntimeStatus({
          health: healthResult.status,
          version: versionResult.version,
          error: null,
        });
      } catch (error) {
        setRuntimeStatus({
          health: 'error',
          version: 'unknown',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    bootstrap();
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
          <div className="desktop-status" title={runtimeStatus.error || undefined}>
            <span>tauri: {runtimeStatus.health}</span>
            <span>version: {runtimeStatus.version}</span>
          </div>
          <Dashboard
            skills={snapshot.skills}
            config={snapshot.config}
            providers={snapshot.providers}
            universalProviders={snapshot.universalProviders}
            currentProviders={currentProviders}
            kitPolicies={snapshot.kitPolicies}
            kitLoadouts={snapshot.kitLoadouts}
            kits={snapshot.kits}
          />
        </main>
      </div>
    </ConfirmProvider>
  );
}
