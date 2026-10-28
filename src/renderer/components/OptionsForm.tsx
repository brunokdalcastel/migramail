import { useEffect, useMemo, useState } from 'react'
import { checkExtraArgs, splitArgs } from '@shared/extraArgs'
import type { FolderMap, MigrationOptions } from '@shared/model'
import { t } from '../i18n/pt-BR'
import { Check, Field, Notes, TextArea, TextInput } from './Form'

// Opções da migração em duas camadas: as comuns à vista e o "Avançado" recolhido. As listas e
// os números são editados como texto (uma pasta por linha) e só sobem para `onChange` quando
// válidos; `onValidChange` avisa quem usa se algum campo está com erro.

const lines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

function parseMaps(text: string): { maps: FolderMap[]; error: string | null } {
  const maps: FolderMap[] = []
  let error: string | null = null
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line) return
    const eq = line.indexOf('=')
    const from = line.slice(0, eq).trim()
    const to = line.slice(eq + 1).trim()
    if (eq < 0 || !from || !to) error ??= t('options.f1f2Invalid', { line: i + 1 })
    else maps.push({ from, to })
  })
  return { maps, error }
}

/** Inteiro positivo; vazio = `null` (quando permitido). `undefined` = inválido. */
function parsePositive(text: string, allowEmpty: boolean): number | null | undefined {
  const s = text.trim()
  if (!s) return allowEmpty ? null : undefined
  return /^\d+$/.test(s) && Number(s) > 0 ? Number(s) : undefined
}

export function OptionsForm({
  value,
  onChange,
  onValidChange,
}: {
  value: MigrationOptions
  onChange: (next: MigrationOptions) => void
  onValidChange: (valid: boolean) => void
}): React.JSX.Element {
  // textos iniciais: quem usa remonta o formulário (key) ao trocar de conta
  const [folders, setFolders] = useState(() => value.folders.join('\n'))
  const [exclude, setExclude] = useState(() => value.exclude.join('\n'))
  const [maps, setMaps] = useState(() => value.f1f2.map((m) => `${m.from}=${m.to}`).join('\n'))
  const [maxSpeed, setMaxSpeed] = useState(() =>
    value.maxBytesPerSecond === null ? '' : String(Math.round(value.maxBytesPerSecond / 1024)),
  )
  const [errorsMax, setErrorsMax] = useState(() => String(value.errorsMax))
  const [advanced, setAdvanced] = useState(
    () =>
      value.f1f2.length > 0 ||
      value.maxBytesPerSecond !== null ||
      value.justfolders ||
      value.extraArgs.trim() !== '',
  )

  const mapsParsed = parseMaps(maps)
  const speed = parsePositive(maxSpeed, true)
  const errMax = parsePositive(errorsMax, false)
  const extra = useMemo(() => checkExtraArgs(splitArgs(value.extraArgs)), [value.extraArgs])
  const valid =
    mapsParsed.error === null &&
    speed !== undefined &&
    errMax !== undefined &&
    extra.errors.length === 0

  useEffect(() => onValidChange(valid), [valid, onValidChange])

  const set = (patch: Partial<MigrationOptions>): void => onChange({ ...value, ...patch })

  return (
    <section aria-labelledby="options-title" className="glass flex flex-col gap-4 p-5">
      <h2 id="options-title" className="label m-0">
        {t('options.title')}
      </h2>
      <div className="grid grid-cols-2 gap-x-6">
        <Check
          label={t('options.automap')}
          hint={t('options.automapHint')}
          checked={value.automap}
          onChange={(automap) => set({ automap })}
        />
        <Check
          label={t('options.syncinternaldates')}
          checked={value.syncinternaldates}
          onChange={(syncinternaldates) => set({ syncinternaldates })}
        />
      </div>
      <Field label={t('options.subfolder2')} hint={t('options.subfolder2Hint')}>
        <TextInput
          value={value.subfolder2}
          spellCheck={false}
          onChange={(e) => set({ subfolder2: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('options.folders')} hint={t('options.foldersHint')}>
          <TextArea
            value={folders}
            spellCheck={false}
            onChange={(e) => {
              setFolders(e.target.value)
              set({ folders: lines(e.target.value) })
            }}
          />
        </Field>
        <Field label={t('options.exclude')} hint={t('options.excludeHint')}>
          <TextArea
            value={exclude}
            spellCheck={false}
            className="num text-sm"
            onChange={(e) => {
              setExclude(e.target.value)
              set({ exclude: lines(e.target.value) })
            }}
          />
        </Field>
      </div>

      <details
        open={advanced}
        onToggle={(e) => setAdvanced((e.target as HTMLDetailsElement).open)}
        className="group"
      >
        <summary className="flex min-h-11 cursor-pointer items-center text-[15px] font-medium text-fg-2 hover:text-fg">
          {t('options.advanced')}
        </summary>
        <div className="flex flex-col gap-4 pt-2">
          <Check
            label={t('options.justfolders')}
            checked={value.justfolders}
            onChange={(justfolders) => set({ justfolders })}
          />
          <Field
            label={t('options.f1f2')}
            hint={t('options.f1f2Hint')}
            error={mapsParsed.error ?? undefined}
          >
            <TextArea
              value={maps}
              spellCheck={false}
              aria-invalid={mapsParsed.error ? true : undefined}
              onChange={(e) => {
                setMaps(e.target.value)
                const parsed = parseMaps(e.target.value)
                if (parsed.error === null) set({ f1f2: parsed.maps })
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t('options.maxSpeed')}
              hint={t('options.maxSpeedHint')}
              error={speed === undefined ? t('options.numberInvalid') : undefined}
            >
              <TextInput
                inputMode="numeric"
                className="num"
                value={maxSpeed}
                aria-invalid={speed === undefined ? true : undefined}
                onChange={(e) => {
                  setMaxSpeed(e.target.value)
                  const n = parsePositive(e.target.value, true)
                  if (n !== undefined) set({ maxBytesPerSecond: n === null ? null : n * 1024 })
                }}
              />
            </Field>
            <Field
              label={t('options.errorsMax')}
              error={errMax === undefined ? t('options.numberInvalid') : undefined}
            >
              <TextInput
                inputMode="numeric"
                className="num"
                value={errorsMax}
                aria-invalid={errMax === undefined ? true : undefined}
                onChange={(e) => {
                  setErrorsMax(e.target.value)
                  const n = parsePositive(e.target.value, false)
                  if (typeof n === 'number') set({ errorsMax: Math.min(n, 100_000) })
                }}
              />
            </Field>
          </div>
          <Field label={t('server.extraArgs')} hint={t('server.extraArgsHint')}>
            <TextInput
              value={value.extraArgs}
              spellCheck={false}
              className="num text-sm"
              placeholder="--exclude ^Junk$"
              aria-invalid={extra.errors.length > 0 ? true : undefined}
              onChange={(e) => set({ extraArgs: e.target.value })}
            />
          </Field>
          <Notes errors={extra.errors} warnings={extra.warnings} />
        </div>
      </details>
    </section>
  )
}
