// Fonte única dos contratos IPC. Todo canal novo nasce aqui, com schema zod do pedido (`req`)
// e da resposta (`res`). O main valida `req` sempre e `res` em dev (ipc/register.ts).
// - ipc: renderer → main (request/response), sempre devolve IpcResult
// - ipcEvents: main → renderer (push)
import { z } from 'zod'
import type { AccountDraft, CsvError } from './csv'
import {
  accountSchema,
  batchSummarySchema,
  jobModeSchema,
  jobScopeSchema,
  jobSnapshotSchema,
  securitySchema,
  serverProfileSchema,
} from './model'
import { appInfoSchema, appSettingsPatchSchema, appSettingsSchema } from './schemas'

const none = z.undefined()

const channel = <Req extends z.ZodType, Res extends z.ZodType>(req: Req, res: Res) => ({
  req,
  res,
})

const idSchema = z.string().min(1).max(100)
const jobIdReq = z.object({ jobId: idSchema })
/** Vazia ou ausente = usar a senha lembrada. */
const passwordSchema = z.string().max(1024).optional()
const accountListSchema = z.array(accountSchema).max(10_000)

/** Perfil a salvar: sem `id` cria um novo. */
const profileInputSchema = serverProfileSchema.extend({ id: idSchema.optional() })

/** Só diz se há senha lembrada em cada lado; a senha nunca volta ao renderer. */
const savedPasswordsSchema = z.record(
  z.string(),
  z.object({ source: z.boolean(), dest: z.boolean() }),
)

const accountsStateSchema = z.object({
  single: accountSchema.nullable(),
  batch: z.array(accountSchema),
  savedPasswords: savedPasswordsSchema,
})

const accountsSaveSchema = z.object({
  single: accountSchema.nullable(),
  batch: accountListSchema,
  /** Senhas digitadas a lembrar (só nos lados com "lembrar senha" marcado). */
  passwords: z
    .array(z.object({ accountId: idSchema, password1: passwordSchema, password2: passwordSchema }))
    .max(10_000)
    .optional(),
})

const draftEndpointSchema = z.object({
  host: z.string(),
  port: z.number(),
  security: securitySchema,
  user: z.string(),
})

// As linhas importadas trazem as senhas do arquivo: o renderer as guarda em memória até iniciar.
const csvImportSchema = z.object({
  rows: z.array(
    z.object({
      line: z.number(),
      source: draftEndpointSchema,
      dest: draftEndpointSchema,
      password1: z.string(),
      password2: z.string(),
      extraArgs: z.string(),
    }) satisfies z.ZodType<AccountDraft>,
  ),
  errors: z.array(
    z.object({ line: z.number(), message: z.string() }) satisfies z.ZodType<CsvError>,
  ),
})

export const ipc = {
  'app:info': channel(none, appInfoSchema),
  /** Versão do imapsync.exe embutido; a 1ª leitura leva ~30 s, depois vem do cache. */
  'about:engine': channel(none, z.object({ version: z.string().nullable() })),
  'about:openLogs': channel(none, z.null()),
  'about:openSite': channel(none, z.null()),

  'settings:get': channel(none, appSettingsSchema),
  'settings:update': channel(appSettingsPatchSchema, appSettingsSchema),

  'profiles:list': channel(none, z.array(serverProfileSchema)),
  'profiles:save': channel(profileInputSchema, serverProfileSchema),
  'profiles:delete': channel(z.object({ id: idSchema }), z.null()),

  'accounts:load': channel(none, accountsStateSchema),
  'accounts:save': channel(accountsSaveSchema, accountsStateSchema),
  'accounts:importCsv': channel(z.object({ path: z.string().min(1).max(32_767) }), csvImportSchema),
  'accounts:exportCsv': channel(
    z.object({ accounts: accountListSchema }),
    z.object({ path: z.string().nullable() }),
  ),

  'jobs:start': channel(
    z.object({
      account: accountSchema,
      mode: jobModeSchema,
      password1: passwordSchema,
      password2: passwordSchema,
      /** Ausente = "Uma conta". */
      scope: jobScopeSchema.optional(),
    }),
    z.object({ jobId: z.string(), warnings: z.array(z.string()) }),
  ),
  'jobs:stop': channel(jobIdReq, z.null()),
  'jobs:stopAll': channel(none, z.null()),
  'jobs:retry': channel(jobIdReq, z.object({ jobId: z.string() })),
  /** Tira da lista um job terminado (linha removida da tabela do lote). */
  'jobs:remove': channel(jobIdReq, z.null()),
  'jobs:batchSummary': channel(none, batchSummarySchema),
  'jobs:list': channel(none, z.array(jobSnapshotSchema)),
  'jobs:log': channel(jobIdReq, z.object({ lines: z.array(z.string()) })),
  'jobs:openLog': channel(jobIdReq, z.null()),
}

export const ipcEvents = {
  'settings:changed': appSettingsSchema,
  /** Só os jobs que mudaram desde o último envio (o renderer junta por id). */
  'jobs:changed': z.array(jobSnapshotSchema),
  /** Linhas novas da saída de um job, já com as senhas mascaradas. */
  'jobs:log': z.object({ jobId: z.string(), lines: z.array(z.string()) }),
  /** Job tirado da lista (o "Rodar de novo" troca o antigo por um novo). */
  'jobs:removed': z.object({ jobId: z.string() }),
  /** Painel do lote, no máximo 1×/s enquanto jobs do lote mudam. */
  'jobs:batch': batchSummarySchema,
} satisfies Record<string, z.ZodType>

export type IpcChannel = keyof typeof ipc
export type IpcEvent = keyof typeof ipcEvents

export type IpcRequest<K extends IpcChannel> = z.output<(typeof ipc)[K]['req']>
export type IpcResponse<K extends IpcChannel> = z.output<(typeof ipc)[K]['res']>
export type IpcEventPayload<E extends IpcEvent> = z.output<(typeof ipcEvents)[E]>

/** Códigos fixos do IPC; erros de domínio (UserError) trazem o próprio código. */
export type IpcErrorCode =
  | 'invalid_payload'
  | 'forbidden_sender'
  | 'unknown_channel'
  | 'invalid_response'
  | 'internal'
  | (string & {})

export type IpcResult<T> =
  { ok: true; data: T } | { ok: false; code: IpcErrorCode; message: string }

/** Canais sem payload são chamados sem o segundo argumento. */
export type InvokeArgs<K extends IpcChannel> =
  undefined extends IpcRequest<K> ? [] : [req: IpcRequest<K>]

/** O que o preload expõe em `window.migramail`. */
export interface MigraMailBridge {
  invoke<K extends IpcChannel>(
    channel: K,
    ...args: InvokeArgs<K>
  ): Promise<IpcResult<IpcResponse<K>>>
  on<E extends IpcEvent>(event: E, listener: (payload: IpcEventPayload<E>) => void): () => void
  /** Caminho no disco de um arquivo arrastado ou escolhido (importar CSV). */
  pathForFile(file: File): string | null
}

export function isChannel(name: unknown): name is IpcChannel {
  return typeof name === 'string' && Object.hasOwn(ipc, name)
}

export function isEventName(name: unknown): name is IpcEvent {
  return typeof name === 'string' && Object.hasOwn(ipcEvents, name)
}
