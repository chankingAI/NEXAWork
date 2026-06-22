/**
 * CLI entrypoint for the computer-use-recorder package.
 *
 * Provides record/replay/generate commands that can be integrated
 * into the main claude-code CLI via Commander.js subcommands.
 *
 * Usage (standalone):
 *   bun run packages/@ant/computer-use-recorder/src/cli.ts record --output session.json
 *   bun run packages/@ant/computer-use-recorder/src/cli.ts replay --input session.json
 *   bun run packages/@ant/computer-use-recorder/src/cli.ts generate --input session.json --name my-skill
 *
 * Integration (via main CLI):
 *   claude record [--output path] [--task description]
 *   claude replay [--input path | --skill name] [--speed multiplier]
 *   claude generate [--input path] --name skill-name [--description text]
 */

import type { RecordingSession } from './types.js'
import { mergeEvents } from './eventMerger.js'
import { generateSkill } from './skillGenerator.js'
import { ReplayEngine } from './replayEngine.js'
import type {
  ActionExecutor,
  ExecutionResult,
  ReplayProgress,
} from './replayEngine.js'
import type { MergeOptions } from './eventMerger.js'
import type { SkillGenerateOptions } from './skillGenerator.js'

// ─── CLI Command Types ────────────────────────────────────────────────────────

export interface RecordCommandOptions {
  /** Output file path for the recording session JSON. */
  output: string
  /** Optional task description for the recording. */
  task?: string
  /** Whether to capture screenshots during recording (default: true). */
  screenshots?: boolean
  /** Screenshot interval in ms (default: 500). */
  screenshotInterval?: number
}

export interface ReplayCommandOptions {
  /** Input file path containing a recorded session JSON. */
  input?: string
  /** Skill name to replay (alternative to input file). */
  skill?: string
  /** Skills base directory (default: '.claude/skills'). */
  skillsDir?: string
  /** Speed multiplier (default: 1.0). */
  speed?: number
  /** Replay mode: 'direct' or 'adaptive' (default: 'direct'). */
  mode?: 'direct' | 'adaptive'
  /** Whether to verify each step (default: false). */
  verify?: boolean
}

export interface GenerateCommandOptions {
  /** Input file path containing a recorded session JSON. */
  input: string
  /** Name for the generated skill. */
  name: string
  /** Description of the skill. */
  description?: string
  /** When this skill should be used. */
  whenToUse?: string
  /** Tags for the skill. */
  tags?: string[]
  /** Output directory for skills (default: '.claude/skills'). */
  skillsDir?: string
  /** Workflow prompt strategy: 'direct' or 'semantic' (default: 'direct'). */
  strategy?: 'direct' | 'semantic'
}

// ─── CLI Command Handlers ─────────────────────────────────────────────────────

/**
 * Handle the `record` command.
 * Returns the session data (actual recording requires CDP connection from host).
 */
export async function handleRecordCommand(
  _options: RecordCommandOptions,
): Promise<{ started: boolean; message: string }> {
  // Recording requires a CDP connection which is provided by the host adapter.
  // This handler sets up the recording parameters; the actual recording loop
  // is driven by the host system (computer-use-mcp) that has access to CDP.
  return {
    started: true,
    message: `Recording started. Output will be saved to: ${_options.output}`,
  }
}

/**
 * Handle the `replay` command.
 * Loads a recorded session and replays it via the provided executor.
 */
export async function handleReplayCommand(
  options: ReplayCommandOptions,
  executor: ActionExecutor,
  loadSession: (path: string) => Promise<RecordingSession>,
  onProgress?: (progress: ReplayProgress) => void,
): Promise<{ status: string; stepsCompleted: number; totalSteps: number }> {
  let session: RecordingSession

  if (options.input) {
    session = await loadSession(options.input)
  } else if (options.skill) {
    const skillDir = options.skillsDir ?? '.claude/skills'
    const recordingPath = `${skillDir}/${options.skill}/recording.json`
    session = await loadSession(recordingPath)
  } else {
    throw new Error('Either --input or --skill must be provided')
  }

  const engine = new ReplayEngine(executor, {
    mode: options.mode ?? 'direct',
    speedMultiplier: options.speed ?? 1.0,
    verifySteps: options.verify ?? false,
  })

  const result = await engine.replay(session, onProgress)

  return {
    status: result.status,
    stepsCompleted: result.stepsCompleted,
    totalSteps: result.totalSteps,
  }
}

/**
 * Handle the `generate` command.
 * Loads a recorded session and generates a skill package from it.
 */
export async function handleGenerateCommand(
  options: GenerateCommandOptions,
  loadSession: (path: string) => Promise<RecordingSession>,
  writeFiles: (
    files: Record<string, { path: string; content: string }>,
  ) => Promise<void>,
): Promise<{ skillDir: string; fileCount: number }> {
  const session = await loadSession(options.input)

  const mergeOpts: MergeOptions = {
    typeGapMs: 300,
    scrollGapMs: 200,
    stripScreenshots: true,
  }

  const skillOpts: SkillGenerateOptions = {
    name: options.name,
    description:
      options.description ?? `Skill generated from recording: ${session.id}`,
    whenToUse: options.whenToUse,
    tags: options.tags,
    skillsBaseDir: options.skillsDir ?? '.claude/skills',
    mergeOptions: mergeOpts,
    workflowOptions: {
      promptStrategy: options.strategy ?? 'direct',
    },
  }

  const skill = generateSkill(session, skillOpts)

  // Write all generated files
  const filesToWrite: Record<string, { path: string; content: string }> = {}
  for (const [filename, content] of Object.entries(skill.files)) {
    filesToWrite[filename] = {
      path: `${skill.dirPath}/${filename}`,
      content,
    }
  }

  await writeFiles(filesToWrite)

  return {
    skillDir: skill.dirPath,
    fileCount: Object.keys(skill.files).length,
  }
}

// ─── CLI Registration Helper ──────────────────────────────────────────────────

/**
 * Configuration for registering recorder commands with Commander.js.
 * Used by the main CLI (src/main.tsx) to integrate recording capabilities.
 */
export interface RecorderCommandConfig {
  /** Command name (e.g., 'record', 'replay', 'generate'). */
  name: string
  /** Command description shown in help. */
  description: string
  /** Command options with their flags and descriptions. */
  options: Array<{
    flags: string
    description: string
    defaultValue?: string | boolean | number
  }>
}

/**
 * Returns the command configurations for integration with Commander.js.
 */
export function getRecorderCommands(): RecorderCommandConfig[] {
  return [
    {
      name: 'record',
      description: 'Record user actions for replay and skill generation',
      options: [
        {
          flags: '-o, --output <path>',
          description: 'Output file path',
          defaultValue: 'recording.json',
        },
        {
          flags: '-t, --task <description>',
          description: 'Task description for the recording',
        },
        {
          flags: '--no-screenshots',
          description: 'Disable screenshot capture',
        },
        {
          flags: '--screenshot-interval <ms>',
          description: 'Screenshot interval in ms',
          defaultValue: '500',
        },
      ],
    },
    {
      name: 'replay',
      description: 'Replay a recorded session or skill',
      options: [
        {
          flags: '-i, --input <path>',
          description: 'Input recording file path',
        },
        { flags: '-s, --skill <name>', description: 'Skill name to replay' },
        {
          flags: '--skills-dir <path>',
          description: 'Skills directory',
          defaultValue: '.claude/skills',
        },
        {
          flags: '--speed <multiplier>',
          description: 'Playback speed',
          defaultValue: '1.0',
        },
        {
          flags: '--mode <mode>',
          description: 'Replay mode (direct|adaptive)',
          defaultValue: 'direct',
        },
        {
          flags: '--verify',
          description: 'Verify each step with screenshot',
          defaultValue: false,
        },
      ],
    },
    {
      name: 'generate',
      description: 'Generate a skill from a recorded session',
      options: [
        {
          flags: '-i, --input <path>',
          description: 'Input recording file path',
        },
        { flags: '-n, --name <name>', description: 'Skill name (required)' },
        { flags: '-d, --description <text>', description: 'Skill description' },
        {
          flags: '--when-to-use <text>',
          description: 'When this skill should be triggered',
        },
        { flags: '--tags <tags...>', description: 'Tags for categorization' },
        {
          flags: '--skills-dir <path>',
          description: 'Output skills directory',
          defaultValue: '.claude/skills',
        },
        {
          flags: '--strategy <strategy>',
          description: 'Prompt strategy (direct|semantic)',
          defaultValue: 'direct',
        },
      ],
    },
  ]
}
