import { describe, expect, test } from 'bun:test'
import {
  handleRecordCommand,
  handleReplayCommand,
  handleGenerateCommand,
  getRecorderCommands,
} from '../cli.js'
import type {
  ActionExecutor,
  ExecutionResult,
  ReplayProgress,
} from '../replayEngine.js'
import type { RecordingSession } from '../types.js'

class MockExecutor implements ActionExecutor {
  calls: Array<{ action: string }> = []
  async execute(action: { action: string }): Promise<ExecutionResult> {
    this.calls.push(action)
    return { success: true }
  }
  async screenshot(): Promise<string> {
    return 'mock'
  }
}

function makeMockSession(): RecordingSession {
  return {
    id: 'cli-test-session',
    startTime: 1000,
    endTime: 5000,
    status: 'stopped',
    events: [
      {
        action: 'left_click',
        coordinate: [100, 200] as [number, number],
        timestamp: 1000,
        screenshot_before: null,
        screenshot_after: null,
        window_context: { app_name: 'Chrome', window_title: 'Test' },
      },
      {
        action: 'type',
        text: 'hello',
        timestamp: 2000,
        screenshot_before: null,
        screenshot_after: null,
        window_context: { app_name: 'Chrome', window_title: 'Test' },
      },
    ],
    metadata: {
      platform: 'darwin',
      screen_width: 1920,
      screen_height: 1080,
    },
  }
}

describe('CLI Commands', () => {
  describe('handleRecordCommand', () => {
    test('returns started status with output path', async () => {
      const result = await handleRecordCommand({
        output: '/tmp/test-recording.json',
      })
      expect(result.started).toBe(true)
      expect(result.message).toContain('/tmp/test-recording.json')
    })
  })

  describe('handleReplayCommand', () => {
    test('replays from input file', async () => {
      const executor = new MockExecutor()
      const session = makeMockSession()
      const loadSession = async (_path: string) => session

      const result = await handleReplayCommand(
        { input: '/tmp/recording.json', speed: 10000 },
        executor,
        loadSession,
      )

      expect(result.status).toBe('completed')
      expect(result.stepsCompleted).toBe(2)
      expect(result.totalSteps).toBe(2)
      expect(executor.calls).toHaveLength(2)
    })

    test('replays from skill name', async () => {
      const executor = new MockExecutor()
      const session = makeMockSession()
      let loadedPath = ''
      const loadSession = async (path: string) => {
        loadedPath = path
        return session
      }

      await handleReplayCommand(
        { skill: 'my-skill', skillsDir: 'custom/skills', speed: 10000 },
        executor,
        loadSession,
      )

      expect(loadedPath).toBe('custom/skills/my-skill/recording.json')
    })

    test('throws if neither input nor skill provided', async () => {
      const executor = new MockExecutor()
      const loadSession = async (_path: string) => makeMockSession()

      await expect(
        handleReplayCommand({}, executor, loadSession),
      ).rejects.toThrow('Either --input or --skill must be provided')
    })

    test('reports progress', async () => {
      const executor = new MockExecutor()
      const session = makeMockSession()
      const loadSession = async (_path: string) => session
      const progressUpdates: ReplayProgress[] = []

      await handleReplayCommand(
        { input: '/tmp/r.json', speed: 10000 },
        executor,
        loadSession,
        p => progressUpdates.push(p),
      )

      expect(progressUpdates.length).toBeGreaterThan(0)
    })
  })

  describe('handleGenerateCommand', () => {
    test('generates skill files', async () => {
      const session = makeMockSession()
      const loadSession = async (_path: string) => session
      const writtenFiles: Record<string, { path: string; content: string }> = {}
      const writeFiles = async (
        files: Record<string, { path: string; content: string }>,
      ) => {
        Object.assign(writtenFiles, files)
      }

      const result = await handleGenerateCommand(
        {
          input: '/tmp/recording.json',
          name: 'test-skill',
          description: 'A test skill',
        },
        loadSession,
        writeFiles,
      )

      expect(result.skillDir).toBe('.claude/skills/test-skill')
      expect(result.fileCount).toBe(3)
      expect(writtenFiles['SKILL.md']).toBeDefined()
      expect(writtenFiles['workflow.js']).toBeDefined()
      expect(writtenFiles['recording.json']).toBeDefined()
    })

    test('respects custom skills directory', async () => {
      const session = makeMockSession()
      const loadSession = async (_path: string) => session
      const writtenFiles: Record<string, { path: string; content: string }> = {}
      const writeFiles = async (
        files: Record<string, { path: string; content: string }>,
      ) => {
        Object.assign(writtenFiles, files)
      }

      const result = await handleGenerateCommand(
        {
          input: '/tmp/r.json',
          name: 'custom-skill',
          skillsDir: 'my/skills',
        },
        loadSession,
        writeFiles,
      )

      expect(result.skillDir).toBe('my/skills/custom-skill')
    })

    test('uses semantic strategy when specified', async () => {
      const session = makeMockSession()
      const loadSession = async (_path: string) => session
      const writtenFiles: Record<string, { path: string; content: string }> = {}
      const writeFiles = async (
        files: Record<string, { path: string; content: string }>,
      ) => {
        Object.assign(writtenFiles, files)
      }

      await handleGenerateCommand(
        {
          input: '/tmp/r.json',
          name: 'semantic-skill',
          strategy: 'semantic',
        },
        loadSession,
        writeFiles,
      )

      // Semantic strategy produces different prompts (doesn't include raw coordinates)
      const wf = writtenFiles['workflow.js']!.content
      expect(wf).toContain('await agent(')
    })
  })

  describe('getRecorderCommands', () => {
    test('returns three commands', () => {
      const commands = getRecorderCommands()
      expect(commands).toHaveLength(3)
    })

    test('record command has correct structure', () => {
      const commands = getRecorderCommands()
      const record = commands.find(c => c.name === 'record')
      expect(record).toBeDefined()
      expect(record!.description).toContain('Record')
      expect(record!.options.length).toBeGreaterThan(0)
    })

    test('replay command has correct structure', () => {
      const commands = getRecorderCommands()
      const replay = commands.find(c => c.name === 'replay')
      expect(replay).toBeDefined()
      expect(replay!.description).toContain('Replay')
      expect(replay!.options.some(o => o.flags.includes('--input'))).toBe(true)
      expect(replay!.options.some(o => o.flags.includes('--skill'))).toBe(true)
    })

    test('generate command has correct structure', () => {
      const commands = getRecorderCommands()
      const generate = commands.find(c => c.name === 'generate')
      expect(generate).toBeDefined()
      expect(generate!.description).toContain('Generate')
      expect(generate!.options.some(o => o.flags.includes('--name'))).toBe(true)
    })
  })
})
