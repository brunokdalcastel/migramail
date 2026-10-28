import { z } from 'zod'

// Schemas das settings e do app:info. Os modelos de conta, perfil e job ficam em model.ts (Fase 2).

export const settingsShape = {
  /** Quantas contas migram ao mesmo tempo no modo "Várias contas" (1–5). */
  parallelism: z.number().int().min(1).max(5),
  /** Última tela de migração aberta. */
  lastMode: z.enum(['single', 'batch']),
  /** Mostra a % por bytes (estimada) junto da % por mensagens. */
  showBytesPercent: z.boolean(),
}

export const appSettingsSchema = z.object(settingsShape)
export const appSettingsPatchSchema = z.object(settingsShape).partial().strict()

export type AppSettings = z.output<typeof appSettingsSchema>
export type AppSettingsPatch = z.output<typeof appSettingsPatchSchema>

export const appInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  electron: z.string(),
  chrome: z.string(),
})
export type AppInfo = z.output<typeof appInfoSchema>
