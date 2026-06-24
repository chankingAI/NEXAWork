/**
 * NexaWork Security Rules — shared pure helpers (N33)
 * ===================================================
 * Zero-dependency, side-effect-free logic for the security sub-pages:
 *  - the rule model (file allow/deny lists, command whitelist, network domain
 *    rules) carried inside `SecurityConfig.rules`,
 *  - glob / domain matchers and the per-category rule evaluator that turns an
 *    operation target into an `allow` / `deny` / `prompt` decision,
 *  - validators + normalizers used by both the renderer (input checks) and the
 *    SecurityManager (sanitising persisted / patched rules).
 *
 * The evaluator is consumed by the SecurityManager's sandbox gate so the rules
 * configured on the N33 sub-pages actually enforce: within a *guarded* sandbox
 * category an explicit allow auto-permits, an explicit deny blocks, and anything
 * unmatched falls through to the normal permission prompt.
 */

// ─── Rule model ───────────────────────────────────────────────

/** A single network domain rule: a host pattern + its action. */
export interface NetworkRule {
  /** Host pattern, e.g. `example.com` or `*.example.com`. */
  domain: string
  action: 'allow' | 'deny'
}

/** The full rule set persisted under `SecurityConfig.rules`. */
export interface SecurityRules {
  /** Path patterns explicitly allowed (whitelist) for file tools. */
  fileAllow: string[]
  /** Path patterns explicitly denied (blacklist) — takes precedence. */
  fileDeny: string[]
  /** Allowed command patterns (whitelist) for command tools. */
  commandAllow: string[]
  /** Network domain rules (allow / deny). */
  network: NetworkRule[]
}

/** Empty rule set: no rules configured (everything falls through to prompt). */
export const DEFAULT_SECURITY_RULES: SecurityRules = {
  fileAllow: [],
  fileDeny: [],
  commandAllow: [],
  network: [],
}

/** The categories that carry rules (mirrors the sandbox sub-policies). */
export type RuleCategory = 'file' | 'command' | 'network'

/** A rule decision for an operation target. */
export type RuleDecision = 'allow' | 'deny' | 'prompt'

// ─── Validation ───────────────────────────────────────────────

const MAX_PATTERN_LENGTH = 512
const DOMAIN_RE = /^(\*\.)?([a-z0-9-]+\.)*[a-z0-9-]+$/i

/** A non-empty, length-bounded pattern with no control characters. */
function isSanePattern(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_PATTERN_LENGTH &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: reject control chars
    !/[\u0000-\u001f]/.test(value)
  )
}

export function isValidPathPattern(value: string): boolean {
  return isSanePattern(value.trim())
}

export function isValidCommandPattern(value: string): boolean {
  return isSanePattern(value.trim())
}

export function isValidDomain(value: string): boolean {
  const trimmed = value.trim()
  if (!isSanePattern(trimmed)) return false
  return DOMAIN_RE.test(trimmed)
}

// ─── Glob / domain matching ───────────────────────────────────

/** Escape a literal string for embedding in a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&')
}

/**
 * Match a value against a glob-style pattern:
 *  - `**` matches any run of characters (including `/`),
 *  - `*`  matches any run of characters except `/`,
 *  - `?`  matches a single character except `/`.
 * Patterns without wildcards match exactly, or as a directory prefix
 * (`/etc` matches `/etc/passwd`).
 */
export function matchGlob(pattern: string, value: string): boolean {
  const pat = pattern.trim()
  if (!pat) return false
  const hasWildcard = /[*?]/.test(pat)
  if (!hasWildcard) {
    return (
      value === pat || value.startsWith(pat.endsWith('/') ? pat : `${pat}/`)
    )
  }
  let re = ''
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i]
    if (ch === '*') {
      if (pat[i + 1] === '*') {
        re += '.*'
        i++
      } else {
        re += '[^/]*'
      }
    } else if (ch === '?') {
      re += '[^/]'
    } else {
      re += escapeRegExp(ch)
    }
  }
  return new RegExp(`^${re}$`).test(value)
}

/** The executable token of a command line (first whitespace-delimited word). */
export function commandHead(command: string): string {
  return command.trim().split(/\s+/)[0] ?? ''
}

/** Extract the lower-cased host from a URL or bare host string. */
export function extractHost(target: string): string | null {
  const value = target.trim()
  if (!value) return null
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    return url.hostname.toLowerCase() || null
  } catch {
    return null
  }
}

/**
 * Match a host against a domain pattern. `*.example.com` matches any subdomain
 * of `example.com` as well as the apex; an exact pattern matches that host only.
 */
export function matchDomain(pattern: string, host: string): boolean {
  const pat = pattern.trim().toLowerCase()
  const h = host.trim().toLowerCase()
  if (!pat || !h) return false
  if (pat.startsWith('*.')) {
    const base = pat.slice(2)
    return h === base || h.endsWith(`.${base}`)
  }
  return h === pat
}

// ─── Evaluation ───────────────────────────────────────────────

/**
 * File rule decision for a path:
 *  - any deny pattern matches → `deny` (blacklist wins),
 *  - else with a non-empty allow list: a match → `allow`, no match → `deny`,
 *  - else (no allow list) → `prompt`.
 */
export function evaluateFileRule(
  rules: SecurityRules,
  path: string,
): RuleDecision {
  if (rules.fileDeny.some(p => matchGlob(p, path))) return 'deny'
  if (rules.fileAllow.length > 0) {
    return rules.fileAllow.some(p => matchGlob(p, path)) ? 'allow' : 'deny'
  }
  return 'prompt'
}

/**
 * Command whitelist decision: with a non-empty whitelist, a match (full-line
 * glob or executable head) → `allow`, otherwise `prompt`; an empty whitelist
 * always → `prompt`.
 */
export function evaluateCommandRule(
  rules: SecurityRules,
  command: string,
): RuleDecision {
  if (rules.commandAllow.length === 0) return 'prompt'
  const head = commandHead(command)
  const allowed = rules.commandAllow.some(
    p => matchGlob(p, command) || matchGlob(p, head) || head === p.trim(),
  )
  return allowed ? 'allow' : 'prompt'
}

/**
 * Network decision for a URL / host: a deny rule wins over an allow rule when
 * both match; an unmatched host → `prompt`.
 */
export function evaluateNetworkRule(
  rules: SecurityRules,
  target: string,
): RuleDecision {
  const host = extractHost(target)
  if (!host) return 'prompt'
  let allow = false
  for (const rule of rules.network) {
    if (matchDomain(rule.domain, host)) {
      if (rule.action === 'deny') return 'deny'
      allow = true
    }
  }
  return allow ? 'allow' : 'prompt'
}

/** Dispatch a rule evaluation by category. */
export function evaluateOperation(
  rules: SecurityRules,
  category: RuleCategory,
  target: string,
): RuleDecision {
  if (category === 'file') return evaluateFileRule(rules, target)
  if (category === 'command') return evaluateCommandRule(rules, target)
  return evaluateNetworkRule(rules, target)
}

// ─── Normalization ────────────────────────────────────────────

/** De-duplicate + trim a list of string patterns, dropping invalid entries. */
function normalizeList(
  value: unknown,
  valid: (s: string) => boolean,
): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of value) {
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (!valid(trimmed) || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

/** De-duplicate + validate network rules (last action for a domain wins). */
function normalizeNetwork(value: unknown): NetworkRule[] {
  if (!Array.isArray(value)) return []
  const byDomain = new Map<string, NetworkRule>()
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const domain = String((raw as NetworkRule).domain ?? '').trim()
    const action = (raw as NetworkRule).action
    if (!isValidDomain(domain)) continue
    if (action !== 'allow' && action !== 'deny') continue
    byDomain.set(domain.toLowerCase(), { domain, action })
  }
  return Array.from(byDomain.values())
}

/** Coerce an arbitrary value into a valid, sanitised SecurityRules. */
export function normalizeRules(value: unknown): SecurityRules {
  if (!value || typeof value !== 'object') {
    return cloneRules(DEFAULT_SECURITY_RULES)
  }
  const v = value as Partial<SecurityRules>
  return {
    fileAllow: normalizeList(v.fileAllow, isValidPathPattern),
    fileDeny: normalizeList(v.fileDeny, isValidPathPattern),
    commandAllow: normalizeList(v.commandAllow, isValidCommandPattern),
    network: normalizeNetwork(v.network),
  }
}

/** Deep clone a rule set (no shared array references). */
export function cloneRules(rules: SecurityRules): SecurityRules {
  return {
    fileAllow: [...rules.fileAllow],
    fileDeny: [...rules.fileDeny],
    commandAllow: [...rules.commandAllow],
    network: rules.network.map(r => ({ ...r })),
  }
}
