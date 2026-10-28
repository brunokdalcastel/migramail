import { defaultMigrationOptions, type Account, type Endpoint } from '@shared/model'

// Conta e lado em branco, usados em "Uma conta" e em "Adicionar linha" do lote.

export const blankEndpoint = (): Endpoint => ({
  profileId: null,
  host: '',
  port: 993,
  security: 'ssl',
  preset: 'none',
  allowInvalidCert: false,
  user: '',
  rememberPassword: false,
})

export const blankAccount = (): Account => ({
  id: crypto.randomUUID(),
  label: '',
  source: blankEndpoint(),
  dest: blankEndpoint(),
  options: { ...defaultMigrationOptions },
})
