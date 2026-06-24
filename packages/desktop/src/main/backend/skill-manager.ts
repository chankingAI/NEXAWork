/**
 * NexaWork Recorded-Skill Manager (N27)
 * =====================================
 * Owns the catalog of skills generated from operation recordings. It performs
 * full CRUD (create from a recording / rename / edit steps / reorder / delete),
 * tracks execution history for success-rate stats, and renders the on-disk
 * `.claude/skills/<slug>/` bundle (SKILL.md + workflow.js + skill.json) so the
 * skills stay compatible with the workflow engine + Skill system.
 *
 * Like {@link ./recorder-manager}, it keeps zero native dependencies beyond
 * `fs`, accepts an injectable clock + id factory, and runs identically under
 * `bun test` with a null directory (pure in-memory).
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import { DEFAULT_RECORDING_CONFIG } from '../../shared/recording-config'
import {
  buildExecutionRecording,
  buildSkillSteps,
  coerceRecordedSkill,
  computeSuccessRate,
  DEFAULT_SKILL_ICON,
  DEFAULT_WAIT_MS,
  detectSkillVariables,
  generateSkillMd,
  generateWorkflowScript,
  insertWaitStep,
  type RecordedSkill,
  type RecordingAnalysis,
  removeStep,
  reorderSteps,
  sanitizeSkillName,
  type SkillExecutionRecord,
  type SkillStep,
  type SkillSummary,
  type SkillVariable,
  toSkillSummary,
  updateStep,
} from '../../shared/skill'
import type { RecordingFile } from './recorder-manager'

/** Persisted skill file name inside each skill directory. */
const SKILL_JSON = 'skill.json'

export interface SkillManagerOptions {
  /** Base `.claude/skills` dir, or null for in-memory (tests). */
  dir?: string | null
  /** Injectable clock (ms since epoch) for deterministic timing in tests. */
  now?: () => number
  /** Stable id factory (tests override for determinism). */
  generateId?: () => string
}

/** Fields accepted when generating a skill from a recording. */
export interface CreateSkillInput {
  recordingId: string
  name: string
  description?: string
  icon?: string
  tags?: string[]
  whenToUse?: string
  /** Caller-confirmed variables (overrides auto-detection when provided). */
  variables?: SkillVariable[]
}

/** Partial metadata update for an existing skill. */
export interface UpdateSkillInput {
  name?: string
  description?: string
  icon?: string
  tags?: string[]
  whenToUse?: string
  variables?: SkillVariable[]
}

export class SkillManager {
  private readonly dir: string | null
  private readonly now: () => number
  private readonly generateId: () => string
  /** In-memory source of truth, keyed by skill id (mirrors disk). */
  private readonly skills = new Map<string, RecordedSkill>()

  constructor(options: SkillManagerOptions = {}) {
    this.dir = options.dir ?? null
    this.now = options.now ?? Date.now
    this.generateId =
      options.generateId ??
      (() => `skill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
    this.loadFromDisk()
  }

  // ─── Queries ────────────────────────────────────────────────────────────

  /** List skill summaries, most-recently updated/used first. */
  list(): SkillSummary[] {
    return Array.from(this.skills.values())
      .map(toSkillSummary)
      .sort(
        (a, b) => (b.lastUsedAt ?? b.updatedAt) - (a.lastUsedAt ?? a.updatedAt),
      )
  }

  /** Get the full skill by id, or null. */
  get(id: string): RecordedSkill | null {
    const skill = this.skills.get(id)
    return skill ? structuredClone(skill) : null
  }

  /**
   * Analyze a recording into steps + auto-detected variables, used to populate
   * the generate-from-recording dialog before the skill is created.
   */
  analyzeRecording(file: RecordingFile): RecordingAnalysis {
    const steps = buildSkillSteps(file.events, i => `${file.id}_step_${i}`)
    const variables = detectSkillVariables(file.events)
    return { recordingId: file.id, steps, variables }
  }

  // ─── Mutations ────────────────────────────────────────────────────────────

  /** Create a skill from a finished recording. */
  createFromRecording(
    file: RecordingFile,
    input: CreateSkillInput,
  ): RecordedSkill {
    const ts = this.now()
    const steps = buildSkillSteps(file.events, i => `${file.id}_step_${i}`)
    const variables = input.variables ?? detectSkillVariables(file.events)
    const skill: RecordedSkill = {
      id: this.generateId(),
      name: input.name.trim() || file.taskDescription?.trim() || '录制技能',
      description: input.description?.trim() ?? '',
      icon: input.icon?.trim() || DEFAULT_SKILL_ICON,
      tags: input.tags ?? [],
      whenToUse: input.whenToUse?.trim() || undefined,
      source: 'recorded',
      recordingId: file.id,
      steps,
      variables,
      executions: [],
      createdAt: ts,
      updatedAt: ts,
    }
    this.skills.set(skill.id, skill)
    this.persist(skill)
    return structuredClone(skill)
  }

  /** Update a skill's metadata + variables. */
  update(id: string, patch: UpdateSkillInput): RecordedSkill | null {
    const skill = this.skills.get(id)
    if (!skill) return null
    if (patch.name !== undefined) skill.name = patch.name.trim() || skill.name
    if (patch.description !== undefined) skill.description = patch.description
    if (patch.icon !== undefined) skill.icon = patch.icon.trim() || skill.icon
    if (patch.tags !== undefined) skill.tags = patch.tags
    if (patch.whenToUse !== undefined) {
      skill.whenToUse = patch.whenToUse.trim() || undefined
    }
    if (patch.variables !== undefined) skill.variables = patch.variables
    skill.updatedAt = this.now()
    this.persist(skill)
    return structuredClone(skill)
  }

  /** Reorder a skill's steps (drag-and-drop). */
  reorderSteps(
    id: string,
    fromIndex: number,
    toIndex: number,
  ): RecordedSkill | null {
    const skill = this.skills.get(id)
    if (!skill) return null
    skill.steps = reorderSteps(skill.steps, fromIndex, toIndex)
    skill.updatedAt = this.now()
    this.persist(skill)
    return structuredClone(skill)
  }

  /** Edit a single step's detail / description / wait time. */
  updateStep(
    id: string,
    stepId: string,
    patch: Partial<Pick<SkillStep, 'detail' | 'description' | 'waitMs'>>,
  ): RecordedSkill | null {
    const skill = this.skills.get(id)
    if (!skill) return null
    skill.steps = updateStep(skill.steps, stepId, patch)
    skill.updatedAt = this.now()
    this.persist(skill)
    return structuredClone(skill)
  }

  /** Remove a step from a skill. */
  removeStep(id: string, stepId: string): RecordedSkill | null {
    const skill = this.skills.get(id)
    if (!skill) return null
    skill.steps = removeStep(skill.steps, stepId)
    skill.updatedAt = this.now()
    this.persist(skill)
    return structuredClone(skill)
  }

  /** Insert an explicit wait step after the given index. */
  addWaitStep(
    id: string,
    afterIndex: number,
    waitMs: number = DEFAULT_WAIT_MS,
  ): RecordedSkill | null {
    const skill = this.skills.get(id)
    if (!skill) return null
    skill.steps = insertWaitStep(
      skill.steps,
      afterIndex,
      waitMs,
      () => `${id}_wait_${this.generateId()}`,
    )
    skill.updatedAt = this.now()
    this.persist(skill)
    return structuredClone(skill)
  }

  /** Duplicate a skill (deep copy with a fresh id + cleared history). */
  duplicate(id: string): RecordedSkill | null {
    const skill = this.skills.get(id)
    if (!skill) return null
    const ts = this.now()
    const copy: RecordedSkill = {
      ...structuredClone(skill),
      id: this.generateId(),
      name: `${skill.name} 副本`,
      executions: [],
      createdAt: ts,
      updatedAt: ts,
      lastUsedAt: undefined,
    }
    this.skills.set(copy.id, copy)
    this.persist(copy)
    return structuredClone(copy)
  }

  /** Delete a skill (removes its on-disk bundle too). */
  delete(id: string): boolean {
    const skill = this.skills.get(id)
    if (!skill) return false
    this.skills.delete(id)
    if (this.dir) {
      const dirPath = this.skillDir(skill)
      if (existsSync(dirPath)) rmSync(dirPath, { recursive: true, force: true })
    }
    return true
  }

  /** Append an execution record + bump lastUsedAt. */
  recordExecution(
    id: string,
    record: Omit<SkillExecutionRecord, 'id'>,
  ): RecordedSkill | null {
    const skill = this.skills.get(id)
    if (!skill) return null
    skill.executions.push({ ...record, id: this.generateId() })
    skill.lastUsedAt = record.finishedAt
    skill.updatedAt = this.now()
    this.persist(skill)
    return structuredClone(skill)
  }

  /**
   * Build a replay-ready recording for a skill + parameter values. Returns null
   * when the skill is unknown. Does not record the execution itself — the IPC
   * layer drives replay and reports the outcome via {@link recordExecution}.
   */
  buildExecution(
    id: string,
    params: Record<string, string>,
  ): RecordingFile | null {
    const skill = this.skills.get(id)
    if (!skill) return null
    return buildExecutionRecording(
      skill,
      params,
      DEFAULT_RECORDING_CONFIG,
      this.now(),
    )
  }

  /** Export a skill bundle as a single JSON string (for download). */
  exportSkill(id: string): { fileName: string; content: string } | null {
    const skill = this.skills.get(id)
    if (!skill) return null
    const bundle = {
      skill,
      'SKILL.md': generateSkillMd(skill),
      'workflow.js': generateWorkflowScript(skill),
    }
    return {
      fileName: `${sanitizeSkillName(skill.name)}.skill.json`,
      content: JSON.stringify(bundle, null, 2),
    }
  }

  /** Current success rate in [0, 1] for a skill (test/diagnostic helper). */
  successRate(id: string): number {
    const skill = this.skills.get(id)
    return skill ? computeSuccessRate(skill.executions) : 0
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private skillDir(skill: RecordedSkill): string {
    if (!this.dir) return ''
    return join(this.dir, sanitizeSkillName(skill.name) + '-' + skill.id)
  }

  /** Write the skill bundle (skill.json + SKILL.md + workflow.js) atomically. */
  private persist(skill: RecordedSkill): void {
    if (!this.dir) return
    const dirPath = this.skillDir(skill)
    if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true })
    this.atomicWrite(join(dirPath, SKILL_JSON), JSON.stringify(skill, null, 2))
    this.atomicWrite(join(dirPath, 'SKILL.md'), generateSkillMd(skill))
    this.atomicWrite(
      join(dirPath, 'workflow.js'),
      generateWorkflowScript(skill),
    )
  }

  private atomicWrite(path: string, content: string): void {
    const tmp = `${path}.tmp`
    writeFileSync(tmp, content, 'utf-8')
    try {
      renameSync(tmp, path)
    } catch {
      if (existsSync(tmp)) rmSync(tmp)
    }
  }

  /** Load every persisted skill bundle from disk into memory. */
  private loadFromDisk(): void {
    if (!this.dir || !existsSync(this.dir)) return
    for (const entry of readdirSync(this.dir)) {
      const dirPath = join(this.dir, entry)
      try {
        if (!statSync(dirPath).isDirectory()) continue
        const jsonPath = join(dirPath, SKILL_JSON)
        if (!existsSync(jsonPath)) continue
        const parsed = coerceRecordedSkill(
          JSON.parse(readFileSync(jsonPath, 'utf-8')),
        )
        if (parsed) this.skills.set(parsed.id, parsed)
      } catch {
        // Skip corrupt bundles rather than failing the whole catalog.
      }
    }
  }
}

// ─── Singleton management ─────────────────────────────────────
let instance: SkillManager | null = null

/** Initialize the singleton skill manager. Pass null dir for in-memory. */
export function initSkillManager(
  options: SkillManagerOptions = {},
): SkillManager {
  instance = new SkillManager(options)
  return instance
}

/** Get the singleton manager, creating an in-memory one on first use. */
export function getSkillManager(): SkillManager {
  if (!instance) instance = new SkillManager()
  return instance
}
