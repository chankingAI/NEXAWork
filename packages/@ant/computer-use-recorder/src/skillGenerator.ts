/**
 * Skill Generator — Creates .claude/skills/ compatible skill files
 * from recorded and merged workflow events.
 *
 * The generated skill includes:
 * - SKILL.md with metadata (name, description, whenToUse)
 * - workflow.js compatible with workflow-engine parseScript()
 * - recording.json with the original event data for re-learning
 *
 * Reference: src/services/skillLearning/skillGenerator.ts — existing skill generation
 * Reference: src/skills/loadSkillsDir.ts — skill directory format
 */

import type { RawActionEvent, RecordingSession } from './types.js'
import { buildWorkflowScript } from './workflowBuilder.js'
import { mergeEvents } from './eventMerger.js'
import type { MergeOptions } from './eventMerger.js'
import type { WorkflowBuildOptions } from './workflowBuilder.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SkillGenerateOptions {
  /** Name for the skill (used as directory name). */
  name: string
  /** Human-readable description. */
  description: string
  /** When this skill should be triggered/suggested. */
  whenToUse?: string
  /** Tags for categorization. */
  tags?: string[]
  /** Base directory for skills (default: '.claude/skills'). */
  skillsBaseDir?: string
  /** Merge options for event processing. */
  mergeOptions?: MergeOptions
  /** Workflow build options. */
  workflowOptions?: Partial<WorkflowBuildOptions>
}

export interface GeneratedSkill {
  /** Directory path where skill files should be written. */
  dirPath: string
  /** Map of relative file path → file content. */
  files: Record<string, string>
  /** The merged events used to generate this skill. */
  mergedEvents: RawActionEvent[]
  /** The generated workflow script source. */
  workflowScript: string
}

// ─── Skill Generator ──────────────────────────────────────────────────────────

/**
 * Generate a skill from a recording session.
 * Returns the file contents to be written — does not perform filesystem I/O.
 */
export function generateSkill(
  session: RecordingSession,
  options: SkillGenerateOptions,
): GeneratedSkill {
  // Merge raw events into semantic operations
  const mergedEvents = mergeEvents(session.events, options.mergeOptions)

  // Build workflow script
  const workflowOptions: WorkflowBuildOptions = {
    name: options.name,
    description: options.description,
    whenToUse: options.whenToUse,
    ...options.workflowOptions,
  }
  const workflowScript = buildWorkflowScript(mergedEvents, workflowOptions)

  // Generate SKILL.md content
  const skillMd = generateSkillMd(options, session, mergedEvents)

  // Generate recording.json (stripped of screenshots for size)
  const recordingJson = generateRecordingJson(session, mergedEvents)

  const dirName = sanitizeSkillName(options.name)
  const baseDir = options.skillsBaseDir ?? '.claude/skills'
  const dirPath = `${baseDir}/${dirName}`

  return {
    dirPath,
    files: {
      'SKILL.md': skillMd,
      'workflow.js': workflowScript,
      'recording.json': recordingJson,
    },
    mergedEvents,
    workflowScript,
  }
}

/**
 * Generate SKILL.md content following the existing skill format.
 */
function generateSkillMd(
  options: SkillGenerateOptions,
  session: RecordingSession,
  mergedEvents: RawActionEvent[],
): string {
  const lines: string[] = []

  // YAML frontmatter
  lines.push('---')
  lines.push(`name: ${options.name}`)
  lines.push(`description: ${options.description}`)
  if (options.whenToUse) {
    lines.push(`when_to_use: ${options.whenToUse}`)
  }
  if (options.tags?.length) {
    lines.push(`tags: [${options.tags.map(t => `"${t}"`).join(', ')}]`)
  }
  lines.push(`source: recorded`)
  lines.push(`recorded_at: ${new Date(session.startTime).toISOString()}`)
  lines.push(`platform: ${session.metadata.platform}`)
  lines.push(`total_steps: ${mergedEvents.length}`)
  lines.push('---')
  lines.push('')

  // Description
  lines.push(`# ${options.name}`)
  lines.push('')
  lines.push(options.description)
  lines.push('')

  // Steps summary
  lines.push('## Steps')
  lines.push('')
  for (let i = 0; i < Math.min(mergedEvents.length, 20); i++) {
    const event = mergedEvents[i]!
    const desc = describeStep(event)
    lines.push(`${i + 1}. ${desc}`)
  }
  if (mergedEvents.length > 20) {
    lines.push(`... and ${mergedEvents.length - 20} more steps`)
  }
  lines.push('')

  // Usage
  lines.push('## Usage')
  lines.push('')
  lines.push(
    'This skill was automatically generated from a user recording. ' +
      'It can be replayed directly via the workflow engine or adapted by AI.',
  )
  lines.push('')
  lines.push('### Replay')
  lines.push('```')
  lines.push(`claude replay --skill ${sanitizeSkillName(options.name)}`)
  lines.push('```')

  return lines.join('\n')
}

/**
 * Generate a compact recording.json with merged events (no screenshots).
 */
function generateRecordingJson(
  session: RecordingSession,
  mergedEvents: RawActionEvent[],
): string {
  const data = {
    sessionId: session.id,
    startTime: session.startTime,
    endTime: session.endTime,
    metadata: session.metadata,
    events: mergedEvents.map(e => ({
      ...e,
      screenshot_before: null,
      screenshot_after: null,
    })),
  }
  return JSON.stringify(data, null, 2)
}

function describeStep(event: RawActionEvent): string {
  switch (event.action) {
    case 'left_click':
      return `Click at (${event.coordinate?.[0]}, ${event.coordinate?.[1]})${event.element_context?.accessible_name ? ` on "${event.element_context.accessible_name}"` : ''}`
    case 'right_click':
      return `Right-click at (${event.coordinate?.[0]}, ${event.coordinate?.[1]})`
    case 'double_click':
      return `Double-click at (${event.coordinate?.[0]}, ${event.coordinate?.[1]})`
    case 'type':
      return `Type "${(event.text ?? '').slice(0, 40)}${(event.text ?? '').length > 40 ? '...' : ''}"`
    case 'key':
      return `Press ${event.text}`
    case 'scroll':
      return `Scroll ${event.scroll_direction}`
    case 'mouse_move':
      return `Move to (${event.coordinate?.[0]}, ${event.coordinate?.[1]})`
    case 'left_click_drag':
      return `Drag from (${event.start_coordinate?.[0]}, ${event.start_coordinate?.[1]}) to (${event.coordinate?.[0]}, ${event.coordinate?.[1]})`
    default:
      return event.action
  }
}

function sanitizeSkillName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
