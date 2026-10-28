import { deleteProfile, listProfiles, saveProfile } from '../store/profiles'
import { handle } from './register'

// Canais dos perfis de servidor. Os prontos (Gmail, Microsoft 365) recusam edição e exclusão.

export function registerProfilesHandlers(): void {
  handle('profiles:list', () => listProfiles())
  handle('profiles:save', (input) => saveProfile(input))
  handle('profiles:delete', ({ id }) => {
    deleteProfile(id)
    return null
  })
}
