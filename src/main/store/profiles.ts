import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  BUILTIN_PROFILES,
  isBuiltinProfile,
  serverProfileSchema,
  type ServerProfile,
} from '@shared/model'
import { UserError } from '../errors'
import { logger } from '../logger'
import { readJsonFile, writeFileAtomic } from '../settings'

// profiles.json em %APPDATA%\MigraMail guarda só os perfis do usuário: `{ profiles: [...] }`.
// Os prontos (Gmail, Microsoft 365) vêm do código, somente leitura e sempre no topo da lista,
// então um arquivo corrompido ou apagado nunca os perde.

/** Perfil a salvar: sem `id` é um perfil novo. */
export type ProfileInput = Omit<ServerProfile, 'id'> & { id?: string | undefined }

const profilesPath = (): string => join(app.getPath('userData'), 'profiles.json')

/** Perfis do usuário válidos; entrada inválida é descartada com log, sem derrubar as outras. */
function readUserProfiles(): ServerProfile[] {
  const path = profilesPath()
  const raw = readJsonFile(path)
  const entries = raw && typeof raw === 'object' ? (raw as { profiles?: unknown }).profiles : null
  if (!Array.isArray(entries)) {
    if (existsSync(path)) logger.warn('[profiles] profiles.json ilegível; usando só os prontos')
    return []
  }
  const seen = new Set<string>()
  const profiles: ServerProfile[] = []
  entries.forEach((entry, i) => {
    const parsed = serverProfileSchema.safeParse(entry)
    if (!parsed.success || isBuiltinProfile(parsed.data.id) || seen.has(parsed.data.id)) {
      logger.warn(`[profiles] entrada ${i} de profiles.json descartada`)
      return
    }
    seen.add(parsed.data.id)
    profiles.push(parsed.data)
  })
  return profiles
}

function writeUserProfiles(profiles: ServerProfile[]): void {
  writeFileAtomic(profilesPath(), JSON.stringify({ profiles }, null, 2))
}

export function listProfiles(): ServerProfile[] {
  return [...BUILTIN_PROFILES, ...readUserProfiles()]
}

/** Cria (sem `id`) ou substitui um perfil do usuário. Nomes não se repetem. */
export function saveProfile(input: ProfileInput): ServerProfile {
  if (input.id !== undefined && isBuiltinProfile(input.id)) {
    throw new UserError('Os perfis prontos não podem ser alterados. Crie um perfil novo.')
  }
  const profile = serverProfileSchema.parse({ ...input, id: input.id ?? randomUUID() })
  const name = profile.name.toLocaleLowerCase('pt-BR')
  if (
    listProfiles().some((p) => p.id !== profile.id && p.name.toLocaleLowerCase('pt-BR') === name)
  ) {
    throw new UserError('Já existe um perfil com esse nome.')
  }
  const profiles = readUserProfiles()
  const index = profiles.findIndex((p) => p.id === profile.id)
  if (index === -1) profiles.push(profile)
  else profiles[index] = profile
  writeUserProfiles(profiles)
  return profile
}

/** Contas que usavam o perfil passam a "Personalizado" ao carregar (applyProfile). */
export function deleteProfile(id: string): void {
  if (isBuiltinProfile(id)) throw new UserError('Os perfis prontos não podem ser excluídos.')
  const profiles = readUserProfiles()
  const next = profiles.filter((p) => p.id !== id)
  if (next.length !== profiles.length) writeUserProfiles(next)
}
