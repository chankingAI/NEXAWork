/**
 * NexaWork RuntimeManagerPage (N34)
 * ==================================
 * Built-in runtime version management + install / uninstall. Each runtime
 * (Python / Node.js / Git Bash) shows its detected version and install status
 * with install / uninstall actions; "install" probes the host through the
 * main-process SecurityManager and "uninstall" disables + clears it.
 */
import { Boxes, Download, Loader2, Trash2 } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';
import type { MessageKey } from '../../i18n';
import { useSecurityCenter } from '../../hooks/useSecurityCenter';
import {
  type RuntimeId,
  RUNTIME_IDS,
  type RuntimeInstallStatus,
  type RuntimeState,
} from '../../../shared/security-center';
import { Card, SubPageHeader } from './primitives';

const RUNTIME_LABEL: Record<RuntimeId, string> = {
  python: 'Python',
  node: 'Node.js',
  gitBash: 'Git Bash',
};

export function runtimeStatusLabelKey(status: RuntimeInstallStatus): MessageKey {
  return `security.runtime.status.${status}` as MessageKey;
}

function statusTone(status: RuntimeInstallStatus): string {
  if (status === 'installed') return '#34C759';
  if (status === 'not-installed') return 'var(--color-text-tertiary)';
  return '#FF9500';
}

function RuntimeRow({
  id,
  state,
  busy,
  onInstall,
  onUninstall,
}: {
  id: RuntimeId;
  state: RuntimeState;
  busy: boolean;
  onInstall: () => void;
  onUninstall: () => void;
}) {
  const { t } = useI18n();
  const pending = state.status === 'installing' || state.status === 'uninstalling';
  return (
    <div className="flex items-center justify-between gap-6 border-b border-[var(--color-border)] py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">{RUNTIME_LABEL[id]}</p>
          <span
            className="rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: `${statusTone(state.status)}1a`, color: statusTone(state.status) }}
          >
            {t(runtimeStatusLabelKey(state.status))}
          </span>
        </div>
        <p className="mt-0.5 font-mono text-xs text-[var(--color-text-tertiary)]">
          {state.version ?? t('security.runtime.versionUnknown')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onInstall}
          disabled={busy || pending}
          className="flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {state.installed ? t('security.runtime.reinstall') : t('security.runtime.install')}
        </button>
        <button
          type="button"
          onClick={onUninstall}
          disabled={busy || pending || !state.installed}
          className="flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-accent-red)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={13} />
          {t('security.runtime.uninstall')}
        </button>
      </div>
    </div>
  );
}

export function RuntimeManagerPage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const { config, busy, installRuntime, uninstallRuntime } = useSecurityCenter();
  const runtimes = config.runtimes;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--color-bg-secondary)]">
      <SubPageHeader
        icon={<Boxes size={15} />}
        title={t('security.runtime.title')}
        subtitle={t('security.runtime.desc')}
        backLabel={t('security.subpage.back')}
        onBack={onBack}
      />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <Card
            icon={<Boxes size={16} />}
            title={t('security.runtimes.title')}
            description={t('security.runtimes.desc')}
          >
            {RUNTIME_IDS.map(id => (
              <RuntimeRow
                key={id}
                id={id}
                state={runtimes[id]}
                busy={busy}
                onInstall={() => void installRuntime(id)}
                onUninstall={() => void uninstallRuntime(id)}
              />
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
