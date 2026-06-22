/**
 * Workflow Builder — Converts merged RawActionEvent[] into a WorkflowScript
 * compatible with packages/workflow-engine/src/engine/script.ts parseScript().
 *
 * The generated script uses the hooks API:
 * - phase(title) for grouping actions
 * - agent(prompt, opts) for individual action execution
 *
 * Reference: packages/workflow-engine/src/engine/script.ts — parseScript format
 * Reference: packages/workflow-engine/src/types.ts — WorkflowMeta
 */

import type { RawActionEvent } from './types.js'

export interface WorkflowBuildOptions {
  /** Name of the generated workflow. */
  name: string
  /** Description of what this workflow does. */
  description: string
  /** When this workflow should be used. */
  whenToUse?: string
  /**
   * Strategy for generating agent prompts:
   * - 'direct': Emit direct computer-use actions (dispatchAction compatible)
   * - 'semantic': Emit higher-level descriptions (requires AI interpretation)
   * Default: 'direct'
   */
  promptStrategy?: 'direct' | 'semantic'
}

/**
 * A single step in the workflow, representing one or more merged actions.
 */
export interface WorkflowStep {
  /** Human-readable description of this step. */
  description: string
  /** The action to perform (direct mode). */
  action: RawActionEvent
  /** Phase this step belongs to. */
  phase?: string
}

/**
 * Build a workflow script string from merged events.
 * The output is directly parseable by workflow-engine's parseScript().
 */
export function buildWorkflowScript(
  events: readonly RawActionEvent[],
  options: WorkflowBuildOptions,
): string {
  const strategy = options.promptStrategy ?? 'direct'
  const steps = groupIntoSteps(events)
  const phases = detectPhases(steps)

  const metaObj = buildMeta(options, phases)
  const metaStr = `export const meta = ${JSON.stringify(metaObj, null, 2)};`

  const bodyStr = generateBody(steps, phases, strategy)

  return `${metaStr}\n\n${bodyStr}`
}

/**
 * Group events into logical workflow steps.
 * A "step" is typically one user intention (click a button, type into a field, etc.)
 */
function groupIntoSteps(events: readonly RawActionEvent[]): WorkflowStep[] {
  const steps: WorkflowStep[] = []

  for (const event of events) {
    const description = describeAction(event)
    steps.push({ description, action: event })
  }

  return steps
}

/**
 * Detect phase boundaries based on window context changes and significant actions.
 */
function detectPhases(
  steps: WorkflowStep[],
): Array<{ title: string; startIndex: number }> {
  if (steps.length === 0) return []

  const phases: Array<{ title: string; startIndex: number }> = []
  let lastUrl = ''
  let lastAppName = ''

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    const url = step.action.window_context.url ?? ''
    const appName = step.action.window_context.app_name

    // New phase on app switch
    if (appName !== lastAppName && lastAppName !== '') {
      phases.push({
        title: `Switch to ${appName}`,
        startIndex: i,
      })
    }
    // New phase on significant URL change (different domain)
    else if (url && lastUrl && getDomain(url) !== getDomain(lastUrl)) {
      phases.push({
        title: `Navigate to ${getDomain(url)}`,
        startIndex: i,
      })
    }

    lastUrl = url
    lastAppName = appName
  }

  // If no phases detected, create a single default phase
  if (phases.length === 0) {
    const firstStep = steps[0]!
    phases.push({
      title: `${firstStep.action.window_context.app_name} operations`,
      startIndex: 0,
    })
  }

  return phases
}

function buildMeta(
  options: WorkflowBuildOptions,
  phases: Array<{ title: string; startIndex: number }>,
): {
  name: string
  description: string
  whenToUse?: string
  phases?: Array<{ title: string }>
} {
  const meta: {
    name: string
    description: string
    whenToUse?: string
    phases?: Array<{ title: string }>
  } = {
    name: options.name,
    description: options.description,
  }
  if (options.whenToUse) meta.whenToUse = options.whenToUse
  if (phases.length > 1) {
    meta.phases = phases.map(p => ({ title: p.title }))
  }
  return meta
}

/**
 * Generate the async function body that uses hooks.agent() for each step.
 */
function generateBody(
  steps: WorkflowStep[],
  phases: Array<{ title: string; startIndex: number }>,
  strategy: 'direct' | 'semantic',
): string {
  const lines: string[] = []
  let currentPhaseIdx = 0

  for (let i = 0; i < steps.length; i++) {
    // Check if we're entering a new phase
    const nextPhase = phases[currentPhaseIdx + 1]
    if (nextPhase && i >= nextPhase.startIndex) {
      currentPhaseIdx++
      lines.push(`phase(${JSON.stringify(phases[currentPhaseIdx]!.title)})`)
      lines.push('')
    } else if (i === 0 && phases[0]) {
      lines.push(`phase(${JSON.stringify(phases[0].title)})`)
      lines.push('')
    }

    const step = steps[i]!
    const prompt =
      strategy === 'direct'
        ? buildDirectPrompt(step)
        : buildSemanticPrompt(step)

    const label = step.description.slice(0, 60)
    lines.push(
      `await agent(${JSON.stringify(prompt)}, { label: ${JSON.stringify(label)} })`,
    )
  }

  return lines.join('\n')
}

/**
 * Build a direct-execution prompt that includes exact action parameters.
 * This allows replay without AI interpretation.
 */
function buildDirectPrompt(step: WorkflowStep): string {
  const a = step.action
  const parts: string[] = [`Execute computer action: ${a.action}`]

  if (a.coordinate) {
    parts.push(`coordinate: [${a.coordinate[0]}, ${a.coordinate[1]}]`)
  }
  if (a.start_coordinate) {
    parts.push(
      `start_coordinate: [${a.start_coordinate[0]}, ${a.start_coordinate[1]}]`,
    )
  }
  if (a.text) {
    parts.push(`text: "${a.text}"`)
  }
  if (a.scroll_direction) {
    parts.push(`scroll_direction: "${a.scroll_direction}"`)
  }
  if (a.scroll_amount) {
    parts.push(`scroll_amount: ${a.scroll_amount}`)
  }
  if (a.duration) {
    parts.push(`duration: ${a.duration}`)
  }

  if (a.window_context.url) {
    parts.push(`context: ${a.window_context.url}`)
  }

  return parts.join('\n')
}

/**
 * Build a semantic prompt that describes the user's intention.
 * Requires AI interpretation during replay.
 */
function buildSemanticPrompt(step: WorkflowStep): string {
  const a = step.action
  const ctx = a.window_context
  const elem = a.element_context

  let prompt = step.description
  if (ctx.url) prompt += ` on page: ${ctx.url}`
  if (elem?.accessible_name) prompt += ` (target: "${elem.accessible_name}")`
  if (elem?.selector) prompt += ` [selector: ${elem.selector}]`

  return prompt
}

/**
 * Generate a human-readable description of an action.
 */
function describeAction(event: RawActionEvent): string {
  const elem = event.element_context
  const target = elem?.accessible_name || elem?.selector || ''

  switch (event.action) {
    case 'left_click':
      return target
        ? `Click on "${target}"`
        : `Click at (${event.coordinate?.[0]}, ${event.coordinate?.[1]})`
    case 'right_click':
      return target
        ? `Right-click on "${target}"`
        : `Right-click at (${event.coordinate?.[0]}, ${event.coordinate?.[1]})`
    case 'double_click':
      return target
        ? `Double-click on "${target}"`
        : `Double-click at (${event.coordinate?.[0]}, ${event.coordinate?.[1]})`
    case 'type':
      return `Type "${(event.text ?? '').slice(0, 30)}${(event.text ?? '').length > 30 ? '...' : ''}"`
    case 'key':
      return `Press ${event.text}`
    case 'scroll':
      return `Scroll ${event.scroll_direction} ${event.scroll_amount ?? 1} times`
    case 'mouse_move':
      return `Move mouse to (${event.coordinate?.[0]}, ${event.coordinate?.[1]})`
    case 'left_click_drag':
      return `Drag from (${event.start_coordinate?.[0]}, ${event.start_coordinate?.[1]}) to (${event.coordinate?.[0]}, ${event.coordinate?.[1]})`
    case 'hold_key':
      return `Hold ${event.text} for ${event.duration}s`
    case 'wait':
      return `Wait ${event.duration}s`
    default:
      return `${event.action}`
  }
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
