/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  SettingsControlGroup,
  SettingsSwitchField,
} from '../components/settings-form-layout'

export type ImageBillingResolutionTier = {
  name: string
  max_long_edge?: ImageBillingNumericDraft
  max_pixels?: ImageBillingNumericDraft
  ratio: ImageBillingNumericDraft
}

export type ImageBillingRule = {
  enabled?: boolean
  match_type?: 'exact' | 'prefix' | 'suffix' | 'contains'
  source?: string
  description?: string
  size_path?: string
  size_tier_path?: string
  default_size?: string
  quality_path?: string
  default_quality?: string
  unknown_policy?: 'default' | 'base' | 'highest' | 'reject'
  size_ratios?: Record<string, ImageBillingNumericDraft>
  quality_ratios?: Record<string, ImageBillingNumericDraft>
  resolution_tiers?: ImageBillingResolutionTier[]
}

type ImageBillingMatchType = NonNullable<ImageBillingRule['match_type']>
type ImageBillingUnknownPolicy = NonNullable<ImageBillingRule['unknown_policy']>
type ImageBillingNumericDraft = number | string

type RatioRecordEditorProps = {
  title: string
  description: string
  addLabel: string
  keyLabel: string
  keyPlaceholder: string
  value?: Record<string, ImageBillingNumericDraft>
  defaultKey: string
  onChange: (value: Record<string, ImageBillingNumericDraft>) => void
}

type RatioRecordDraftEntry = {
  id: string
  key: string
  ratio: ImageBillingNumericDraft
}

type ResolutionTierEditorProps = {
  value?: ImageBillingResolutionTier[]
  onChange: (value: ImageBillingResolutionTier[]) => void
}

const IMAGE_BILLING_MATCH_TYPES: Array<{
  value: ImageBillingMatchType
  labelKey: string
}> = [
  { value: 'exact', labelKey: 'Exact model' },
  { value: 'prefix', labelKey: 'Model prefix' },
  { value: 'suffix', labelKey: 'Model suffix' },
  { value: 'contains', labelKey: 'Model contains' },
]

const IMAGE_BILLING_UNKNOWN_POLICIES: Array<{
  value: ImageBillingUnknownPolicy
  labelKey: string
}> = [
  { value: 'default', labelKey: 'Use default tier' },
  { value: 'base', labelKey: 'Use base price' },
  { value: 'highest', labelKey: 'Use highest ratio' },
  { value: 'reject', labelKey: 'Reject request' },
]

const IMAGE_MODEL_NAME_HINTS = [
  'gpt-image',
  'dall-e',
  'dalle',
  'imagen',
  'image',
  'flux',
  'midjourney',
  'stable-diffusion',
  'sdxl',
  'seedream',
  'jimeng',
  'recraft',
  'ideogram',
  'cogview',
]

export function isLikelyImageModelName(name: string) {
  const normalized = name.trim().toLowerCase()
  if (!normalized) return false
  return IMAGE_MODEL_NAME_HINTS.some((hint) => normalized.includes(hint))
}

function createImageBillingTemplate(): ImageBillingRule {
  return {
    enabled: true,
    match_type: 'exact',
    size_path: 'size',
    quality_path: 'quality',
    unknown_policy: 'default',
    size_ratios: {},
    quality_ratios: {},
  }
}

export function formatImageBillingRule(value?: ImageBillingRule) {
  if (!value) return ''
  return JSON.stringify(value, null, 2)
}

export function parseImageBillingRuleJson(
  value: string
): ImageBillingRule | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Image billing rule must be a JSON object.')
  }
  return {
    enabled: true,
    ...(parsed as ImageBillingRule),
  }
}

export function ImageBillingRuleEditor(props: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const parsed = useMemo(() => {
    const trimmed = props.value.trim()
    if (!trimmed) {
      return {
        enabled: false,
        rule: createImageBillingTemplate(),
        error: '',
      }
    }

    try {
      const parsedRule = parseImageBillingRuleJson(trimmed)
      return {
        enabled: parsedRule?.enabled !== false,
        rule: parsedRule ?? createImageBillingTemplate(),
        error: '',
      }
    } catch {
      return {
        enabled: false,
        rule: createImageBillingTemplate(),
        error: 'Invalid image billing JSON.',
      }
    }
  }, [props.value])

  const writeRule = (rule: ImageBillingRule) => {
    props.onChange(formatImageBillingRule(rule))
  }

  const updateRule = (patch: Partial<ImageBillingRule>) => {
    writeRule({
      ...parsed.rule,
      ...patch,
      enabled: true,
    })
  }

  const handleEnabledChange = (checked: boolean) => {
    if (!checked) {
      props.onChange('')
      return
    }
    writeRule(createImageBillingTemplate())
  }

  return (
    <SettingsControlGroup className='space-y-4'>
      <SettingsSwitchField
        checked={parsed.enabled}
        onCheckedChange={handleEnabledChange}
        label={t('Enable image request parameter multipliers')}
        description={t(
          'Keep disabled when this model only needs one fixed request price.'
        )}
      />

      {parsed.error ? (
        <Alert variant='destructive'>
          <AlertTriangle data-icon='inline-start' />
          <AlertDescription>{t(parsed.error)}</AlertDescription>
        </Alert>
      ) : null}

      {parsed.enabled && !parsed.error ? (
        <div className='space-y-5'>
          <div className='grid gap-3 sm:grid-cols-2'>
            <Field>
              <FieldLabel>{t('Model match type')}</FieldLabel>
              <Select
                value={parsed.rule.match_type || 'exact'}
                onValueChange={(value) =>
                  updateRule({
                    match_type: value as ImageBillingMatchType,
                  })
                }
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {IMAGE_BILLING_MATCH_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {t(
                  'Use exact for one model, or prefix/suffix/contains for model families.'
                )}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t('Unknown image parameter')}</FieldLabel>
              <Select
                value={parsed.rule.unknown_policy || 'default'}
                onValueChange={(value) =>
                  updateRule({
                    unknown_policy: value as ImageBillingUnknownPolicy,
                  })
                }
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {IMAGE_BILLING_UNKNOWN_POLICIES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {t(
                  'How billing behaves when a configured size or quality value is not matched.'
                )}
              </FieldDescription>
            </Field>
          </div>

          <div className='grid gap-3 sm:grid-cols-2'>
            <Field>
              <FieldLabel>{t('Size field path')}</FieldLabel>
              <Input
                value={parsed.rule.size_path || ''}
                placeholder='size'
                onChange={(event) =>
                  updateRule({ size_path: event.target.value })
                }
              />
              <FieldDescription>
                {t('Request JSON path that contains a size such as 2048x1152.')}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t('Quality field path')}</FieldLabel>
              <Input
                value={parsed.rule.quality_path || ''}
                placeholder='quality'
                onChange={(event) =>
                  updateRule({ quality_path: event.target.value })
                }
              />
              <FieldDescription>
                {t('Request JSON path that contains quality or tier value.')}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t('Size tier field path')}</FieldLabel>
              <Input
                value={parsed.rule.size_tier_path || ''}
                placeholder='outputOptions.sizeTier'
                onChange={(event) =>
                  updateRule({ size_tier_path: event.target.value })
                }
              />
              <FieldDescription>
                {t(
                  'Optional explicit size tier path for providers that use one.'
                )}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t('Default size')}</FieldLabel>
              <Input
                value={parsed.rule.default_size || ''}
                placeholder='1024x1024'
                onChange={(event) =>
                  updateRule({ default_size: event.target.value })
                }
              />
              <FieldDescription>
                {t('Used when the request omits the size field.')}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t('Default quality')}</FieldLabel>
              <Input
                value={parsed.rule.default_quality || ''}
                placeholder='standard'
                onChange={(event) =>
                  updateRule({ default_quality: event.target.value })
                }
              />
              <FieldDescription>
                {t('Used when the request omits the quality field.')}
              </FieldDescription>
            </Field>
          </div>

          <RatioRecordEditor
            title={t('Size value ratios')}
            description={t(
              'Match exact size or tier values read from the request, such as 1K, 2K, 0.5K, or 2048x1152.'
            )}
            addLabel={t('Add size ratio')}
            keyLabel={t('Size value')}
            keyPlaceholder='1K'
            defaultKey='1K'
            value={parsed.rule.size_ratios}
            onChange={(value) => updateRule({ size_ratios: value })}
          />

          <ResolutionTierEditor
            value={parsed.rule.resolution_tiers}
            onChange={(value) => updateRule({ resolution_tiers: value })}
          />

          <RatioRecordEditor
            title={t('Quality ratios')}
            description={t(
              'Map provider quality values to billing multipliers only after confirming those parameters from official docs or adapter code.'
            )}
            addLabel={t('Add quality ratio')}
            keyLabel={t('Quality value')}
            keyPlaceholder='high'
            defaultKey='standard'
            value={parsed.rule.quality_ratios}
            onChange={(value) => updateRule({ quality_ratios: value })}
          />
        </div>
      ) : null}

      <Collapsible>
        <CollapsibleTrigger
          render={
            <Button
              type='button'
              variant='outline'
              className='flex w-full justify-between'
            />
          }
        >
          <span>{t('Advanced JSON')}</span>
          <ChevronDown />
        </CollapsibleTrigger>
        <CollapsibleContent className='pt-3'>
          <Textarea
            rows={10}
            value={props.value}
            placeholder={JSON.stringify(createImageBillingTemplate(), null, 2)}
            onChange={(event) => props.onChange(event.target.value)}
            className='font-mono text-xs'
          />
          <p className='text-muted-foreground mt-2 text-xs'>
            {t(
              'Advanced JSON writes the same rule object used by the visual editor.'
            )}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </SettingsControlGroup>
  )
}

function RatioRecordEditor(props: RatioRecordEditorProps) {
  const { t } = useTranslation()
  const [draftEntries, setDraftEntries] = useState<RatioRecordDraftEntry[]>([])

  useEffect(() => {
    setDraftEntries(
      Object.entries(props.value || {}).map(([key, ratio], index) => ({
        id: `${props.title}-${key}-${index}`,
        key,
        ratio,
      }))
    )
  }, [props.title, props.value])

  const publishEntries = (
    entries: RatioRecordDraftEntry[],
    options: { force?: boolean } = {}
  ) => {
    const completeEntries = entries
      .map((entry) => ({
        ...entry,
        key: entry.key.trim(),
      }))
      .filter((entry) => entry.key !== '' && entry.ratio !== '')

    const keys = completeEntries.map((entry) => entry.key)
    const hasDuplicateKeys = new Set(keys).size !== keys.length
    const hasIncompleteDraft = completeEntries.length !== entries.length

    if (!options.force && (hasDuplicateKeys || hasIncompleteDraft)) {
      return
    }

    props.onChange(
      Object.fromEntries(
        completeEntries.map((entry) => [entry.key, entry.ratio])
      )
    )
  }

  const updateEntry = (
    index: number,
    key: string,
    ratio: ImageBillingNumericDraft
  ) => {
    const nextEntries = draftEntries.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, key, ratio } : entry
    )
    setDraftEntries(nextEntries)
    publishEntries(nextEntries)
  }

  const removeEntry = (index: number) => {
    const nextEntries = draftEntries.filter(
      (_, entryIndex) => entryIndex !== index
    )
    setDraftEntries(nextEntries)
    publishEntries(nextEntries, { force: true })
  }

  const addEntry = () => {
    let key = props.defaultKey
    let suffix = 2
    const existingKeys = new Set(draftEntries.map((entry) => entry.key))
    while (existingKeys.has(key)) {
      key = `${props.defaultKey}-${suffix}`
      suffix += 1
    }
    const nextEntries = [
      ...draftEntries,
      {
        id: `${props.title}-${key}-${Date.now()}`,
        key,
        ratio: 1,
      },
    ]
    setDraftEntries(nextEntries)
    publishEntries(nextEntries)
  }

  return (
    <div className='space-y-3 rounded-lg border p-3'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='text-sm font-medium'>{props.title}</div>
          <p className='text-muted-foreground mt-0.5 text-xs'>
            {props.description}
          </p>
        </div>
        <Button type='button' variant='outline' size='sm' onClick={addEntry}>
          <Plus data-icon='inline-start' />
          {props.addLabel}
        </Button>
      </div>

      {draftEntries.length === 0 ? (
        <p className='text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs'>
          {t('No ratios configured. The base request price will be used.')}
        </p>
      ) : (
        <div className='space-y-2'>
          {draftEntries.map((entry, index) => (
            <div
              key={entry.id}
              className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]'
            >
              <Input
                value={entry.key}
                placeholder={props.keyPlaceholder}
                aria-label={props.keyLabel}
                onChange={(event) =>
                  updateEntry(index, event.target.value, entry.ratio)
                }
              />
              <Input
                type='number'
                min='0'
                step='0.000001'
                value={entry.ratio}
                aria-label={t('Ratio')}
                onChange={(event) =>
                  updateEntry(
                    index,
                    entry.key,
                    event.target.value === '' ? '' : Number(event.target.value)
                  )
                }
              />
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label={t('Remove')}
                onClick={() => removeEntry(index)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ResolutionTierEditor(props: ResolutionTierEditorProps) {
  const { t } = useTranslation()
  const tiers = props.value || []

  const updateTier = (
    index: number,
    patch: Partial<ImageBillingResolutionTier>
  ) => {
    props.onChange(
      tiers.map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, ...patch } : tier
      )
    )
  }

  const addTier = () => {
    props.onChange([
      ...tiers,
      {
        name: `tier-${tiers.length + 1}`,
        max_long_edge: 1024,
        ratio: 1,
      },
    ])
  }

  const removeTier = (index: number) => {
    props.onChange(tiers.filter((_, tierIndex) => tierIndex !== index))
  }

  return (
    <div className='@container/resolution-tiers space-y-3 rounded-lg border p-3'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='text-sm font-medium'>{t('Resolution tiers')}</div>
          <p className='text-muted-foreground mt-0.5 text-xs'>
            {t(
              'Use long-edge or pixel thresholds when providers expose arbitrary width and height.'
            )}
          </p>
        </div>
        <Button type='button' variant='outline' size='sm' onClick={addTier}>
          <Plus data-icon='inline-start' />
          {t('Add resolution tier')}
        </Button>
      </div>

      {tiers.length === 0 ? (
        <p className='text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs'>
          {t(
            'No resolution tiers configured. Size value ratios are used first.'
          )}
        </p>
      ) : (
        <div className='space-y-2'>
          {tiers.map((tier, index) => (
            <div
              key={`resolution-tier-${index}`}
              className='bg-muted/20 grid gap-3 rounded-md border p-2.5'
            >
              <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-2'>
                <div className='min-w-0 space-y-1'>
                  <div className='text-muted-foreground text-[10px] font-medium whitespace-nowrap'>
                    {t('Tier name')}
                  </div>
                  <Input
                    value={tier.name}
                    placeholder='2K'
                    aria-label={t('Tier name')}
                    onChange={(event) =>
                      updateTier(index, { name: event.target.value })
                    }
                  />
                </div>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  aria-label={t('Remove')}
                  className='self-end'
                  onClick={() => removeTier(index)}
                >
                  <Trash2 />
                </Button>
              </div>

              <div className='grid gap-2 @md/resolution-tiers:grid-cols-3'>
                <div className='min-w-0 space-y-1'>
                  <div className='text-muted-foreground text-[10px] font-medium whitespace-nowrap'>
                    {t('Max long edge')}
                  </div>
                  <Input
                    type='number'
                    min='0'
                    step='1'
                    value={tier.max_long_edge ?? ''}
                    placeholder='2048'
                    aria-label={t('Max long edge')}
                    onChange={(event) =>
                      updateTier(index, {
                        max_long_edge:
                          event.target.value === ''
                            ? ''
                            : Number(event.target.value),
                      })
                    }
                  />
                </div>
                <div className='min-w-0 space-y-1'>
                  <div className='text-muted-foreground text-[10px] font-medium whitespace-nowrap'>
                    {t('Max pixels')}
                  </div>
                  <Input
                    type='number'
                    min='0'
                    step='1'
                    value={tier.max_pixels ?? ''}
                    placeholder='4194304'
                    aria-label={t('Max pixels')}
                    onChange={(event) =>
                      updateTier(index, {
                        max_pixels:
                          event.target.value === ''
                            ? ''
                            : Number(event.target.value),
                      })
                    }
                  />
                </div>
                <div className='min-w-0 space-y-1'>
                  <div className='text-muted-foreground text-[10px] font-medium whitespace-nowrap'>
                    {t('Ratio')}
                  </div>
                  <Input
                    type='number'
                    min='0'
                    step='0.000001'
                    value={tier.ratio}
                    aria-label={t('Ratio')}
                    onChange={(event) =>
                      updateTier(index, {
                        ratio:
                          event.target.value === ''
                            ? ''
                            : Number(event.target.value),
                      })
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
