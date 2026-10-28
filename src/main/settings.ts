import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { appSettingsSchema, settingsShape, type AppSettings } from '@shared/schemas'

// settings.json fica em %APPDATA%\MigraMail, junto de profiles.json e accounts.json (Fase 4).

export const DEFAULT_SETTINGS: AppSettings = {
  parallelism: 2,
  lastMode: 'single',
  showBytesPercent: true,
}

type Key = keyof AppSettings

const settingsPath = (): string => join(app.getPath('userData'), 'settings.json')

/** Grava em `<arquivo>.tmp` e troca por rename: quem lê nunca vê um arquivo pela metade. */
export function writeFileAtomic(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, data, 'utf8')
  renameSync(tmp, path)
}

/** JSON do arquivo, ou `undefined` se não existe ou está corrompido. */
export function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

/**
 * Monta as settings a partir do que está salvo: cada chave válida é aproveitada e as
 * ausentes ou inválidas (versão antiga, edição manual) voltam ao padrão, sem perder o resto.
 */
export function normalizeSettings(raw: unknown): AppSettings {
  const result: Record<string, unknown> = { ...structuredClone(DEFAULT_SETTINGS) }
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(settingsShape) as Key[]) {
      const parsed = settingsShape[key].safeParse((raw as Record<string, unknown>)[key])
      if (parsed.success) result[key] = parsed.data
    }
  }
  return appSettingsSchema.parse(result)
}

type Listener = (settings: AppSettings) => void
const listeners = new Set<Listener>()

/** Avisado depois de cada updateSettings; devolve o unsubscribe. */
export function onSettingsChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSettings(): AppSettings {
  return normalizeSettings(readJsonFile(settingsPath()))
}

/** Valida o patch por completo (lança se inválido), salva e avisa os ouvintes. */
export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  // chave com undefined (possível via IPC) não apaga o valor atual
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
  const next = appSettingsSchema.parse({ ...getSettings(), ...defined })
  writeFileAtomic(settingsPath(), JSON.stringify(next, null, 2))
  for (const listener of listeners) listener(next)
  return next
}
