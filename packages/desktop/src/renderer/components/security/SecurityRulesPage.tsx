/**
 * NexaWork SecurityRulesPage (N33)
 * =================================
 * The file / command / network rule sub-page reached from the security center.
 * Renders the relevant rule editors for the active sandbox category:
 *  - file:    allow (whitelist) + deny (blacklist) path-pattern lists,
 *  - command: a command whitelist,
 *  - network: domain rules with an allow / deny action each,
 * plus a live rule tester that evaluates a sample target against the rules
 * (mirroring the main-process sandbox gate).
 *
 * All mutations flow through `useSecurityCenter` → IPC → SecurityManager; the
 * rules actually enforce in the permission flow.
 */
import { useState } from 'react';
import { FileCheck2, Globe, Plus, Terminal, X } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';
import { useSecurityCenter } from '../../hooks/useSecurityCenter';
import {
  isValidCommandPattern,
  isValidDomain,
  isValidPathPattern,
  type NetworkRule,
  type RuleCategory,
  type RuleDecision,
} from '../../../shared/security-rules';
import { Card, Dropdown, SubPageHeader } from './primitives';

const CATEGORY_ICON: Record<RuleCategory, typeof FileCheck2> = {
  file: FileCheck2,
  command: Terminal,
  network: Globe,
};

/** A removable rule chip. */
function RuleChip({ label, onRemove, removeLabel }: { label: string; onRemove: () => void; removeLabel: string }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2">
      <span className="truncate font-mono text-xs text-[var(--color-text-primary)]">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${removeLabel} ${label}`}
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-accent-red)]"
      >
        <X size={13} />
      </button>
    </li>
  );
}

/** A single string-list editor (path / command whitelist). */
function ListEditor({
  title,
  hint,
  items,
  placeholder,
  validate,
  onAdd,
  onRemove,
}: {
  title: string;
  hint?: string;
  items: string[];
  placeholder: string;
  validate: (v: string) => boolean;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const invalid = trimmed.length > 0 && !validate(trimmed);
  const duplicate = trimmed.length > 0 && items.includes(trimmed);

  const submit = () => {
    if (!trimmed || invalid || duplicate) return;
    onAdd(trimmed);
    setDraft('');
  };

  return (
    <div className="py-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)]">{title}</h4>
        <span className="text-[11px] text-[var(--color-text-tertiary)]">{items.length}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={placeholder}
          className={`h-9 flex-1 rounded-[var(--radius-md)] border bg-[var(--color-bg-primary)] px-3 font-mono text-xs text-[var(--color-text-primary)] outline-none transition-colors duration-[var(--duration-fast)] placeholder:font-sans focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] ${
            invalid || duplicate ? 'border-[var(--color-accent-red)]' : 'border-[var(--color-border)]'
          }`}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!trimmed || invalid || duplicate}
          className="flex h-9 items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-3 text-xs font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Plus size={13} />
          {t('security.rules.add')}
        </button>
      </div>
      {invalid ? (
        <p className="mt-1.5 text-[11px] text-[var(--color-accent-red)]">{t('security.rules.invalid')}</p>
      ) : null}
      {duplicate ? (
        <p className="mt-1.5 text-[11px] text-[var(--color-accent-red)]">{t('security.rules.duplicate')}</p>
      ) : null}
      {hint ? <p className="mt-1.5 text-[11px] text-[var(--color-text-tertiary)]">{hint}</p> : null}
      {items.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {items.map(item => (
            <RuleChip
              key={item}
              label={item}
              onRemove={() => onRemove(item)}
              removeLabel={t('security.rules.remove')}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-3 py-4 text-center text-xs text-[var(--color-text-tertiary)]">{t('security.rules.empty')}</p>
      )}
    </div>
  );
}

/** The network domain-rule editor (domain + allow/deny action). */
function NetworkEditor({
  rules,
  onAdd,
  onRemove,
}: {
  rules: NetworkRule[];
  onAdd: (rule: NetworkRule) => void;
  onRemove: (domain: string) => void;
}) {
  const { t } = useI18n();
  const [domain, setDomain] = useState('');
  const [action, setAction] = useState<'allow' | 'deny'>('allow');
  const trimmed = domain.trim();
  const invalid = trimmed.length > 0 && !isValidDomain(trimmed);
  const duplicate = trimmed.length > 0 && rules.some(r => r.domain.toLowerCase() === trimmed.toLowerCase());

  const submit = () => {
    if (!trimmed || invalid || duplicate) return;
    onAdd({ domain: trimmed, action });
    setDomain('');
  };

  return (
    <div className="py-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)]">{t('security.rules.domainRules')}</h4>
        <span className="text-[11px] text-[var(--color-text-tertiary)]">{rules.length}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={domain}
          onChange={e => setDomain(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={t('security.rules.addDomain')}
          className={`h-9 flex-1 rounded-[var(--radius-md)] border bg-[var(--color-bg-primary)] px-3 font-mono text-xs text-[var(--color-text-primary)] outline-none transition-colors duration-[var(--duration-fast)] placeholder:font-sans focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] ${
            invalid || duplicate ? 'border-[var(--color-accent-red)]' : 'border-[var(--color-border)]'
          }`}
        />
        <Dropdown
          ariaLabel={t('security.rules.action.allow')}
          value={action}
          onChange={v => setAction(v as 'allow' | 'deny')}
          options={[
            { value: 'allow', label: t('security.rules.action.allow') },
            { value: 'deny', label: t('security.rules.action.deny') },
          ]}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!trimmed || invalid || duplicate}
          className="flex h-9 items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-3 text-xs font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Plus size={13} />
          {t('security.rules.add')}
        </button>
      </div>
      {invalid ? (
        <p className="mt-1.5 text-[11px] text-[var(--color-accent-red)]">{t('security.rules.invalid')}</p>
      ) : null}
      {duplicate ? (
        <p className="mt-1.5 text-[11px] text-[var(--color-accent-red)]">{t('security.rules.duplicate')}</p>
      ) : null}
      <p className="mt-1.5 text-[11px] text-[var(--color-text-tertiary)]">{t('security.rules.hint.network')}</p>
      {rules.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {rules.map(rule => (
            <li
              key={rule.domain}
              className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2"
            >
              <span className="truncate font-mono text-xs text-[var(--color-text-primary)]">{rule.domain}</span>
              <div className="flex items-center gap-2">
                <span
                  className="rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: rule.action === 'allow' ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.12)',
                    color: rule.action === 'allow' ? '#34C759' : '#FF3B30',
                  }}
                >
                  {rule.action === 'allow' ? t('security.rules.action.allow') : t('security.rules.action.deny')}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(rule.domain)}
                  aria-label={`${t('security.rules.remove')} ${rule.domain}`}
                  className="flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-accent-red)]"
                >
                  <X size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 py-4 text-center text-xs text-[var(--color-text-tertiary)]">{t('security.rules.empty')}</p>
      )}
    </div>
  );
}

/** A live tester showing what the gate would decide for a sample target. */
function RuleTester({ category }: { category: RuleCategory }) {
  const { t } = useI18n();
  const { testRule } = useSecurityCenter();
  const [target, setTarget] = useState('');
  const [result, setResult] = useState<RuleDecision | null>(null);

  const run = async () => {
    if (!target.trim()) return;
    setResult(await testRule(category, target.trim()));
  };

  const tone = result === 'allow' ? '#34C759' : result === 'deny' ? '#FF3B30' : 'var(--color-text-secondary)';

  return (
    <div className="py-4">
      <h4 className="mb-2 text-sm font-medium text-[var(--color-text-primary)]">{t('security.rules.tester.title')}</h4>
      <div className="flex items-center gap-2">
        <input
          value={target}
          onChange={e => {
            setTarget(e.target.value);
            setResult(null);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') void run();
          }}
          placeholder={t('security.rules.tester.placeholder')}
          className="h-9 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 font-mono text-xs text-[var(--color-text-primary)] outline-none transition-colors duration-[var(--duration-fast)] placeholder:font-sans focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)]"
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={!target.trim()}
          className="flex h-9 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {t('security.rules.tester.test')}
        </button>
      </div>
      {result ? (
        <p className="mt-2.5 text-xs font-medium" style={{ color: tone }}>
          {t(`security.rules.tester.result.${result}` as Parameters<typeof t>[0])}
        </p>
      ) : null}
    </div>
  );
}

export function SecurityRulesPage({ category, onBack }: { category: RuleCategory; onBack: () => void }) {
  const { t } = useI18n();
  const { config, updateRules } = useSecurityCenter();
  const rules = config.rules;
  const Icon = CATEGORY_ICON[category];

  const addTo = (key: 'fileAllow' | 'fileDeny' | 'commandAllow', value: string) =>
    void updateRules({ [key]: [...rules[key], value] });
  const removeFrom = (key: 'fileAllow' | 'fileDeny' | 'commandAllow', value: string) =>
    void updateRules({ [key]: rules[key].filter(v => v !== value) });
  const addNetwork = (rule: NetworkRule) =>
    void updateRules({
      network: [...rules.network.filter(r => r.domain.toLowerCase() !== rule.domain.toLowerCase()), rule],
    });
  const removeNetwork = (domain: string) =>
    void updateRules({ network: rules.network.filter(r => r.domain !== domain) });

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--color-bg-secondary)]">
      <SubPageHeader
        icon={<Icon size={15} />}
        title={t(`security.rules.${category}.title` as Parameters<typeof t>[0])}
        subtitle={t(`security.rules.${category}.desc` as Parameters<typeof t>[0])}
        backLabel={t('security.subpage.back')}
        onBack={onBack}
      />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {category === 'file' ? (
            <Card icon={<FileCheck2 size={16} />} title={t('security.rules.file.title')}>
              <ListEditor
                title={t('security.rules.allowList')}
                hint={t('security.rules.hint.file')}
                items={rules.fileAllow}
                placeholder={t('security.rules.addPath')}
                validate={isValidPathPattern}
                onAdd={v => addTo('fileAllow', v)}
                onRemove={v => removeFrom('fileAllow', v)}
              />
              <ListEditor
                title={t('security.rules.denyList')}
                items={rules.fileDeny}
                placeholder={t('security.rules.addPath')}
                validate={isValidPathPattern}
                onAdd={v => addTo('fileDeny', v)}
                onRemove={v => removeFrom('fileDeny', v)}
              />
            </Card>
          ) : null}

          {category === 'command' ? (
            <Card icon={<Terminal size={16} />} title={t('security.rules.command.title')}>
              <ListEditor
                title={t('security.rules.commandWhitelist')}
                hint={t('security.rules.hint.command')}
                items={rules.commandAllow}
                placeholder={t('security.rules.addCommand')}
                validate={isValidCommandPattern}
                onAdd={v => addTo('commandAllow', v)}
                onRemove={v => removeFrom('commandAllow', v)}
              />
            </Card>
          ) : null}

          {category === 'network' ? (
            <Card icon={<Globe size={16} />} title={t('security.rules.network.title')}>
              <NetworkEditor rules={rules.network} onAdd={addNetwork} onRemove={removeNetwork} />
            </Card>
          ) : null}

          <Card icon={<Icon size={16} />} title={t('security.rules.tester.title')}>
            <RuleTester category={category} />
          </Card>
        </div>
      </div>
    </div>
  );
}
