/**
 * @ant/computer-use-recorder — Captures user desktop/browser actions
 * for replay and skill generation.
 */

// ─── Core Types ───────────────────────────────────────────────────────────────
export type {
  RecordableAction,
  ScrollDirection,
  WindowContext,
  ElementContext,
  RawActionEvent,
  Platform,
  RecordingMetadata,
  RecordingStatus,
  RecordingSession,
  RecorderStartOptions,
  RecorderStopResult,
  RecorderEvent,
} from './types.js'

// ─── CDP Recorder ─────────────────────────────────────────────────────────────
export { CdpRecorder } from './cdpRecorder.js'
export type {
  CdpClient,
  ScreenshotProvider,
  CdpRecorderOptions,
} from './cdpRecorder.js'

// ─── Event Merger ─────────────────────────────────────────────────────────────
export { mergeEvents } from './eventMerger.js'
export type { MergeOptions } from './eventMerger.js'

// ─── Workflow Builder ─────────────────────────────────────────────────────────
export { buildWorkflowScript } from './workflowBuilder.js'
export type {
  WorkflowBuildOptions,
  WorkflowStep,
} from './workflowBuilder.js'

// ─── Replay Engine ────────────────────────────────────────────────────────────
export { ReplayEngine } from './replayEngine.js'
export type {
  DispatchableAction,
  ActionExecutor,
  ExecutionResult,
  ReplayMode,
  ReplayOptions,
  ReplayProgressCallback,
  ReplayProgress,
  ReplayResult,
} from './replayEngine.js'

// ─── Skill Generator ──────────────────────────────────────────────────────────
export { generateSkill } from './skillGenerator.js'
export type {
  SkillGenerateOptions,
  GeneratedSkill,
} from './skillGenerator.js'

// ─── Desktop Recorder ─────────────────────────────────────────────────────────
export { DesktopRecorder, loadCaptureBackend } from './desktopRecorder.js'
export type {
  RawInputEvent,
  InputCaptureBackend,
  CaptureHandle,
  DesktopRecorderOptions,
} from './desktopRecorder.js'

// ─── Element Capture ──────────────────────────────────────────────────────────
export { ElementCaptureService, loadElementBackend } from './elementCapture.js'
export type {
  ElementQuery,
  ElementCaptureBackend,
  ElementCaptureOptions,
} from './elementCapture.js'

// ─── Visual Matcher ───────────────────────────────────────────────────────────
export { VisualMatcher } from './visualMatcher.js'
export type {
  LocationResult,
  MatchLevel,
  VisualMatcherOptions,
  AccessibilityLocator,
  VisionProvider,
  ScreenshotProvider as VisualScreenshotProvider,
  MatchContext,
  DryRunResult,
} from './visualMatcher.js'

// ─── Variable Abstraction ─────────────────────────────────────────────────────
export {
  VariableAbstractionEngine,
  detectVariables,
  generateSchema,
  rewriteWorkflowScript,
} from './variableAbstraction.js'
export type {
  DetectedVariable,
  VariableType,
  SchemaField,
  GeneratedSchema,
  VariableAbstractionOptions,
  AIVariableAnalyzer,
  AnalysisContext,
} from './variableAbstraction.js'

// ─── CLI ──────────────────────────────────────────────────────────────────────
export {
  handleRecordCommand,
  handleReplayCommand,
  handleGenerateCommand,
  getRecorderCommands,
} from './cli.js'
export type {
  RecordCommandOptions,
  ReplayCommandOptions,
  GenerateCommandOptions,
  RecorderCommandConfig,
} from './cli.js'
