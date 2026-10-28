// Modelo de perfis, contas e opções de migração: schemas zod (fonte única) e os tipos
// derivados deles. Senha nunca faz parte destes objetos (vai à parte em JobSecrets).
// Sem Node: roda no main e no renderer.
import { z } from 'zod'

export const securitySchema = z.enum(['ssl', 'tls', 'none'])
export const presetSchema = z.enum(['none', 'gmail', 'office'])
export const jobModeSchema = z.enum(['login', 'sizes', 'dry', 'migrate'])
/** De qual tela veio o job: o painel do lote soma só os de "Várias contas". */
export const jobScopeSchema = z.enum(['single', 'batch'])

export type Security = z.output<typeof securitySchema>
export type Preset = z.output<typeof presetSchema>
export type JobMode = z.output<typeof jobModeSchema>
export type JobScope = z.output<typeof jobScopeSchema>

/** Porta padrão do IMAP para cada segurança (IMAPS 993; STARTTLS e texto puro 143). */
export function defaultPort(security: Security): number {
  return security === 'ssl' ? 993 : 143
}

const hostSchema = z.string().trim().min(1).max(253)
const portSchema = z.number().int().min(1).max(65535)
const extraArgsSchema = z.string().max(4000)

export const serverProfileSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  host: hostSchema,
  port: portSchema,
  security: securitySchema,
  preset: presetSchema,
  /** Desliga a validação do certificado (inseguro; a interface mostra aviso vermelho). */
  allowInvalidCert: z.boolean(),
  extraArgs: extraArgsSchema,
})
export type ServerProfile = z.output<typeof serverProfileSchema>

export const endpointSchema = z.object({
  /** Perfil de onde vieram host/porta/segurança, ou `null` se é personalizado. */
  profileId: z.string().min(1).max(100).nullable(),
  host: hostSchema,
  port: portSchema,
  security: securitySchema,
  preset: presetSchema,
  allowInvalidCert: z.boolean(),
  user: z.string().trim().min(1).max(320),
  rememberPassword: z.boolean(),
})
export type Endpoint = z.output<typeof endpointSchema>

export const folderMapSchema = z.object({
  from: z.string().min(1).max(1000),
  to: z.string().min(1).max(1000),
})
export type FolderMap = z.output<typeof folderMapSchema>

export const migrationOptionsSchema = z.object({
  automap: z.boolean(),
  justfolders: z.boolean(),
  /** Pasta do destino onde tudo é copiado; vazio = raiz. */
  subfolder2: z.string().max(1000),
  /** Regex do imapsync (`--exclude`), uma por item. */
  exclude: z.array(z.string().min(1).max(1000)).max(200),
  /** Só estas pastas (`--folder`); vazio = todas. */
  folders: z.array(z.string().min(1).max(1000)).max(500),
  f1f2: z.array(folderMapSchema).max(500),
  syncinternaldates: z.boolean(),
  maxBytesPerSecond: z.number().int().min(1).nullable(),
  errorsMax: z.number().int().min(1).max(100_000),
  extraArgs: extraArgsSchema,
})
export type MigrationOptions = z.output<typeof migrationOptionsSchema>

export const defaultMigrationOptions: MigrationOptions = {
  automap: false,
  justfolders: false,
  subfolder2: '',
  exclude: [],
  folders: [],
  f1f2: [],
  syncinternaldates: true,
  maxBytesPerSecond: null,
  errorsMax: 50,
  extraArgs: '',
}

export const accountSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().max(200),
  source: endpointSchema,
  dest: endpointSchema,
  options: migrationOptionsSchema,
})
export type Account = z.output<typeof accountSchema>

/** Senhas de um job: só existem no pedido de iniciar e na memória do main. */
export const jobSecretsSchema = z.object({
  password1: z.string().max(1024),
  password2: z.string().max(1024),
})
export type JobSecrets = z.output<typeof jobSecretsSchema>

/** Lado de um servidor: 1 = origem, 2 = destino (como no imapsync). */
export type Side = 1 | 2

/** Tamanhos de uma pasta na medição. `null` no destino = a pasta ainda não existe lá. */
export interface FolderSizes {
  size1: number | null
  msgs1: number | null
  size2: number | null
  msgs2: number | null
}

export type JobPhase = 'starting' | 'login' | 'sizing' | 'copying' | 'finalSizing' | 'done'

/** Números oficiais do bloco `++++ Statistics` e da última linha. */
export interface JobSummary {
  messagesTransferred: number | null
  messagesSkipped: number | null
  bytesTransferred: number | null
  errors: number | null
  exitName: string | null
  mostFrequentError: string | null
}

/** Estado do progresso montado a partir da saída do imapsync (redutor em parser.ts). */
export interface JobProgress {
  mode: JobMode
  phase: JobPhase
  /** Lados que já entraram com sucesso. */
  loggedIn: { 1: boolean; 2: boolean }
  /** Medição antes da cópia, pela ordem em que as pastas aparecem. */
  folders: Record<string, FolderSizes>
  folderOrder: string[]
  /** Medição depois da cópia (`foldersizesatend`). */
  finalFolders: Record<string, FolderSizes>
  sizingIndex: number
  sizingTotal: number
  totalSize1: number | null
  totalSize2: number | null
  /** `Host1 Nb messages` da medição inicial: base da % por mensagens. */
  totalMessages: number | null
  /** Σ max(0, size1 − size2) por pasta: base da % por bytes (estimada). */
  estimatedToCopy: number | null
  quotaExceeded: boolean
  /** Pastas da origem que o `--dry` não simulou (ainda não existem no destino). */
  dryUnsimulatedFolders: string[]
  folderIndex: number
  folderTotal: number
  currentFolder: string | null
  currentFolderDest: string | null
  /** Do `N/M msgs left`: N = falta processar na conta toda (inclui as puladas), M = total. */
  msgsLeft: number | null
  msgsLeftTotal: number | null
  msgsCopied: number
  bytesSent: number
  msgErrors: number
  speedMsgs: number | null
  speedKiBs: number | null
  etaSeconds: number | null
  summary: JobSummary
  exitCode: number | null
}

/** Progresso de um job que ainda não leu nenhuma linha. */
export function initialProgress(mode: JobMode): JobProgress {
  return {
    mode,
    phase: 'starting',
    loggedIn: { 1: false, 2: false },
    folders: {},
    folderOrder: [],
    finalFolders: {},
    sizingIndex: 0,
    sizingTotal: 0,
    totalSize1: null,
    totalSize2: null,
    totalMessages: null,
    estimatedToCopy: null,
    quotaExceeded: false,
    dryUnsimulatedFolders: [],
    folderIndex: 0,
    folderTotal: 0,
    currentFolder: null,
    currentFolderDest: null,
    msgsLeft: null,
    msgsLeftTotal: null,
    msgsCopied: 0,
    bytesSent: 0,
    msgErrors: 0,
    speedMsgs: null,
    speedKiBs: null,
    etaSeconds: null,
    summary: {
      messagesTransferred: null,
      messagesSkipped: null,
      bytesTransferred: null,
      errors: null,
      exitName: null,
      mostFrequentError: null,
    },
    exitCode: null,
  }
}

/** Acima disso, jobs no mesmo host ao mesmo tempo geram aviso (RF10). */
export const HOST_CONCURRENCY_WARN = 3

/** Ciclo de vida do processo de um job. */
export type JobState = 'queued' | 'running' | 'stopping' | 'finished'

/** Status mostrado na interface: o estado e, depois de terminar, o resultado. */
export type JobStatus = 'queued' | 'running' | 'stopping' | 'ok' | 'warning' | 'error' | 'stopped'

/** Ponto do gráfico de % ao longo do tempo (`t` em ms desde a época). */
export interface JobSeriesPoint {
  t: number
  percentMessages: number | null
  percentBytes: number | null
  bytesSent: number
}

/** O que o main mostra de um job. Sem senha: só id, conta, progresso e resultado. */
export interface JobSnapshot {
  id: string
  accountId: string
  label: string
  sourceHost: string
  sourceUser: string
  destHost: string
  destUser: string
  mode: JobMode
  scope: JobScope
  state: JobState
  status: JobStatus
  progress: JobProgress
  percentMessages: number | null
  percentBytes: number | null
  series: JobSeriesPoint[]
  /** Do `Exiting with return value` ou, sem essa linha, o código do processo. */
  exitCode: number | null
  stoppedByUser: boolean
  /** Falha antes de o imapsync rodar (exe ausente, spawn recusado). */
  error: string | null
  queuedAt: number
  startedAt: number | null
  finishedAt: number | null
  /** Caminho completo do log do imapsync deste job. */
  logPath: string | null
}

/** Visão do lote (jobs de "Várias contas"): contas por status, % geral e a série total. */
export interface BatchSummary {
  counts: Record<JobStatus, number>
  total: number
  percentMessages: number | null
  percentBytes: number | null
  bytesSent: number
  series: JobSeriesPoint[]
}

// ---- Perfis prontos ----

/** Perfis que vêm com o app: somente leitura, sempre no topo da lista e fora do profiles.json. */
export const BUILTIN_PROFILES: readonly ServerProfile[] = [
  {
    id: 'builtin:gmail',
    name: 'Gmail',
    host: 'imap.gmail.com',
    port: 993,
    security: 'ssl',
    preset: 'gmail',
    allowInvalidCert: false,
    extraArgs: '',
  },
  {
    id: 'builtin:office',
    name: 'Microsoft 365',
    host: 'outlook.office365.com',
    port: 993,
    security: 'ssl',
    preset: 'office',
    allowInvalidCert: false,
    extraArgs: '',
  },
]

export function isBuiltinProfile(id: string): boolean {
  return id.startsWith('builtin:')
}

/**
 * Lado de uma conta com os dados atuais do perfil escolhido (os campos ficam travados na
 * interface). Perfil que não existe mais vira "Personalizado", mantendo host/porta/segurança.
 */
export function applyProfile(endpoint: Endpoint, profiles: readonly ServerProfile[]): Endpoint {
  if (endpoint.profileId === null) return endpoint
  const p = profiles.find((x) => x.id === endpoint.profileId)
  if (!p) return { ...endpoint, profileId: null }
  return {
    ...endpoint,
    host: p.host,
    port: p.port,
    security: p.security,
    preset: p.preset,
    allowInvalidCert: p.allowInvalidCert,
  }
}

// ---- Schemas do que o main manda ao renderer ----
// `satisfies` prende cada schema ao tipo acima: campo novo no tipo sem schema não compila.

const nullableNumber = z.number().nullable()

const folderSizesSchema = z.object({
  size1: nullableNumber,
  msgs1: nullableNumber,
  size2: nullableNumber,
  msgs2: nullableNumber,
}) satisfies z.ZodType<FolderSizes>

const jobSummarySchema = z.object({
  messagesTransferred: nullableNumber,
  messagesSkipped: nullableNumber,
  bytesTransferred: nullableNumber,
  errors: nullableNumber,
  exitName: z.string().nullable(),
  mostFrequentError: z.string().nullable(),
}) satisfies z.ZodType<JobSummary>

export const jobProgressSchema = z.object({
  mode: jobModeSchema,
  phase: z.enum(['starting', 'login', 'sizing', 'copying', 'finalSizing', 'done']),
  loggedIn: z.object({ 1: z.boolean(), 2: z.boolean() }),
  folders: z.record(z.string(), folderSizesSchema),
  folderOrder: z.array(z.string()),
  finalFolders: z.record(z.string(), folderSizesSchema),
  sizingIndex: z.number(),
  sizingTotal: z.number(),
  totalSize1: nullableNumber,
  totalSize2: nullableNumber,
  totalMessages: nullableNumber,
  estimatedToCopy: nullableNumber,
  quotaExceeded: z.boolean(),
  dryUnsimulatedFolders: z.array(z.string()),
  folderIndex: z.number(),
  folderTotal: z.number(),
  currentFolder: z.string().nullable(),
  currentFolderDest: z.string().nullable(),
  msgsLeft: nullableNumber,
  msgsLeftTotal: nullableNumber,
  msgsCopied: z.number(),
  bytesSent: z.number(),
  msgErrors: z.number(),
  speedMsgs: nullableNumber,
  speedKiBs: nullableNumber,
  etaSeconds: nullableNumber,
  summary: jobSummarySchema,
  exitCode: nullableNumber,
}) satisfies z.ZodType<JobProgress>

const jobSeriesPointSchema = z.object({
  t: z.number(),
  percentMessages: nullableNumber,
  percentBytes: nullableNumber,
  bytesSent: z.number(),
}) satisfies z.ZodType<JobSeriesPoint>

const jobStatusSchema = z.enum([
  'queued',
  'running',
  'stopping',
  'ok',
  'warning',
  'error',
  'stopped',
]) satisfies z.ZodType<JobStatus>

/** Estrito: em dev, qualquer campo a mais (uma senha, por exemplo) barra o envio. */
export const jobSnapshotSchema = z.strictObject({
  id: z.string(),
  accountId: z.string(),
  label: z.string(),
  sourceHost: z.string(),
  sourceUser: z.string(),
  destHost: z.string(),
  destUser: z.string(),
  mode: jobModeSchema,
  scope: jobScopeSchema,
  state: z.enum(['queued', 'running', 'stopping', 'finished']),
  status: jobStatusSchema,
  progress: jobProgressSchema,
  percentMessages: nullableNumber,
  percentBytes: nullableNumber,
  series: z.array(jobSeriesPointSchema),
  exitCode: nullableNumber,
  stoppedByUser: z.boolean(),
  error: z.string().nullable(),
  queuedAt: z.number(),
  startedAt: nullableNumber,
  finishedAt: nullableNumber,
  logPath: z.string().nullable(),
}) satisfies z.ZodType<JobSnapshot>

export const batchSummarySchema = z.object({
  counts: z.record(jobStatusSchema, z.number()),
  total: z.number(),
  percentMessages: nullableNumber,
  percentBytes: nullableNumber,
  bytesSent: z.number(),
  series: z.array(jobSeriesPointSchema),
}) satisfies z.ZodType<BatchSummary>
