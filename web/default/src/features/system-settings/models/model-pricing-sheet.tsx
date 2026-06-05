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
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
} from '@/components/drawer-layout'
import { combineBillingExpr } from '@/features/pricing/lib/billing-expr'
import {
  SettingsControlGroup,
  SettingsSwitchField,
} from '../components/settings-form-layout'
import { formatPricingNumber } from './pricing-format'
import { TieredPricingEditor } from './tiered-pricing-editor'

const createModelPricingSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().min(1, t('Model name is required')),
    price: z.string().optional(),
    ratio: z.string().optional(),
    cacheRatio: z.string().optional(),
    createCacheRatio: z.string().optional(),
    completionRatio: z.string().optional(),
    imageRatio: z.string().optional(),
    audioRatio: z.string().optional(),
    audioCompletionRatio: z.string().optional(),
  })

type ModelPricingFormValues = z.infer<
  ReturnType<typeof createModelPricingSchema>
>

type PricingMode = 'per-token' | 'per-request' | 'tiered_expr'
type LaneKey =
  | 'completion'
  | 'cache'
  | 'createCache'
  | 'image'
  | 'audioInput'
  | 'audioOutput'

export type ModelRatioData = {
  name: string
  price?: string
  ratio?: string
  cacheRatio?: string
  createCacheRatio?: string
  completionRatio?: string
  imageRatio?: string
  audioRatio?: string
  audioCompletionRatio?: string
  billingMode?: PricingMode
  billingExpr?: string
  requestRuleExpr?: string
  imageBillingRule?: ImageBillingRule
}

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

type ModelPricingSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: ModelRatioData) => void
  onCancel?: () => void
  editData?: ModelRatioData | null
  selectedTargetCount?: number
}

type ModelPricingEditorPanelProps = Omit<
  ModelPricingSheetProps,
  'open' | 'onOpenChange'
> & {
  className?: string
}

type PreviewRow = {
  key: string
  label: string
  value: string
  multiline?: boolean
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

const numericDraftRegex = /^(\d+(\.\d*)?|\.\d*)?$/

const EMPTY_LANE_PRICES: Record<LaneKey, string> = {
  completion: '',
  cache: '',
  createCache: '',
  image: '',
  audioInput: '',
  audioOutput: '',
}

const EMPTY_LANE_ENABLED: Record<LaneKey, boolean> = {
  completion: false,
  cache: false,
  createCache: false,
  image: false,
  audioInput: false,
  audioOutput: false,
}

const ratioFieldByLane: Record<LaneKey, keyof ModelPricingFormValues> = {
  completion: 'completionRatio',
  cache: 'cacheRatio',
  createCache: 'createCacheRatio',
  image: 'imageRatio',
  audioInput: 'audioRatio',
  audioOutput: 'audioCompletionRatio',
}

const laneConfigs: Array<{
  key: LaneKey
  titleKey: string
  descriptionKey: string
  placeholder: string
}> = [
  {
    key: 'completion',
    titleKey: 'Completion price',
    descriptionKey: 'Output token price for generated tokens.',
    placeholder: '15',
  },
  {
    key: 'cache',
    titleKey: 'Cache read price',
    descriptionKey: 'Token price for cache reads.',
    placeholder: '0.3',
  },
  {
    key: 'createCache',
    titleKey: 'Cache write price',
    descriptionKey: 'Token price for creating cache entries.',
    placeholder: '3.75',
  },
  {
    key: 'image',
    titleKey: 'Image input price',
    descriptionKey: 'Token price for image input.',
    placeholder: '2.5',
  },
  {
    key: 'audioInput',
    titleKey: 'Audio input price',
    descriptionKey: 'Token price for audio input.',
    placeholder: '3.81',
  },
  {
    key: 'audioOutput',
    titleKey: 'Audio output price',
    descriptionKey: 'Token price for audio output.',
    placeholder: '15.11',
  },
]

function hasValue(value: unknown): boolean {
  return (
    value !== '' && value !== null && value !== undefined && value !== false
  )
}

function toNumberOrNull(value: unknown): number | null {
  if (!hasValue(value) && value !== 0) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function ratioToBasePrice(ratio: unknown): string {
  const num = toNumberOrNull(ratio)
  if (num === null) return ''
  return formatPricingNumber(num * 2)
}

function deriveLanePrice(
  ratio: unknown,
  denominator: unknown,
  fallback = ''
): string {
  const ratioNumber = toNumberOrNull(ratio)
  const denominatorNumber = toNumberOrNull(denominator)
  if (ratioNumber === null || denominatorNumber === null) return fallback
  return formatPricingNumber(ratioNumber * denominatorNumber)
}

function createInitialLaneState(data?: ModelRatioData | null) {
  if (!data) {
    return {
      promptPrice: '',
      prices: { ...EMPTY_LANE_PRICES },
      enabled: { ...EMPTY_LANE_ENABLED },
    }
  }

  const promptPrice = ratioToBasePrice(data.ratio)
  const audioInputPrice = deriveLanePrice(data.audioRatio, promptPrice)
  const prices: Record<LaneKey, string> = {
    completion: deriveLanePrice(data.completionRatio, promptPrice),
    cache: deriveLanePrice(data.cacheRatio, promptPrice),
    createCache: deriveLanePrice(data.createCacheRatio, promptPrice),
    image: deriveLanePrice(data.imageRatio, promptPrice),
    audioInput: audioInputPrice,
    audioOutput: deriveLanePrice(data.audioCompletionRatio, audioInputPrice),
  }

  return {
    promptPrice,
    prices,
    enabled: {
      completion: hasValue(data.completionRatio),
      cache: hasValue(data.cacheRatio),
      createCache: hasValue(data.createCacheRatio),
      image: hasValue(data.imageRatio),
      audioInput: hasValue(data.audioRatio),
      audioOutput: hasValue(data.audioCompletionRatio),
    },
  }
}

function getModeLabel(mode: PricingMode) {
  if (mode === 'per-request') return 'Per-request'
  if (mode === 'tiered_expr') return 'Expression'
  return 'Per-token'
}

function getModeBadgeVariant(
  mode: PricingMode
): 'default' | 'secondary' | 'outline' {
  if (mode === 'per-request') return 'secondary'
  if (mode === 'tiered_expr') return 'default'
  return 'outline'
}

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

function isLikelyImageModelName(name: string) {
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

function formatImageBillingRule(value?: ImageBillingRule) {
  if (!value) return ''
  return JSON.stringify(value, null, 2)
}

function parseImageBillingRuleJson(
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

function buildPreviewRows(
  values: ModelPricingFormValues,
  mode: PricingMode,
  billingExpr: string,
  requestRuleExpr: string,
  imageBillingRuleJson: string,
  promptPrice: string,
  lanePrices: Record<LaneKey, string>,
  laneEnabled: Record<LaneKey, boolean>,
  t: (key: string) => string
): PreviewRow[] {
  if (mode === 'tiered_expr') {
    const effectiveExpr = combineBillingExpr(billingExpr, requestRuleExpr)
    return [
      { key: 'mode', label: 'BillingMode', value: 'tiered_expr' },
      {
        key: 'expr',
        label: t('Expression'),
        value: effectiveExpr || t('Empty'),
        multiline: true,
      },
    ]
  }

  if (mode === 'per-request') {
    const rows: PreviewRow[] = [
      {
        key: 'price',
        label: 'ModelPrice',
        value: values.price || t('Empty'),
      },
    ]
    if (imageBillingRuleJson.trim()) {
      rows.push({
        key: 'imageBillingRule',
        label: t('Image billing rules'),
        value: imageBillingRuleJson,
        multiline: true,
      })
    }
    return rows
  }

  return [
    {
      key: 'inputPrice',
      label: t('Input price'),
      value: promptPrice ? `$${promptPrice}` : t('Empty'),
    },
    {
      key: 'completion',
      label: t('Completion price'),
      value:
        laneEnabled.completion && lanePrices.completion
          ? `$${lanePrices.completion}`
          : t('Empty'),
    },
    {
      key: 'cache',
      label: t('Cache read price'),
      value:
        laneEnabled.cache && lanePrices.cache
          ? `$${lanePrices.cache}`
          : t('Empty'),
    },
    {
      key: 'createCache',
      label: t('Cache write price'),
      value:
        laneEnabled.createCache && lanePrices.createCache
          ? `$${lanePrices.createCache}`
          : t('Empty'),
    },
    {
      key: 'image',
      label: t('Image input price'),
      value:
        laneEnabled.image && lanePrices.image
          ? `$${lanePrices.image}`
          : t('Empty'),
    },
    {
      key: 'audio',
      label: t('Audio input price'),
      value:
        laneEnabled.audioInput && lanePrices.audioInput
          ? `$${lanePrices.audioInput}`
          : t('Empty'),
    },
    {
      key: 'audioCompletion',
      label: t('Audio output price'),
      value:
        laneEnabled.audioOutput && lanePrices.audioOutput
          ? `$${lanePrices.audioOutput}`
          : t('Empty'),
    },
  ]
}

function ImageBillingRuleEditor(props: {
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

export function ModelPricingSheet({
  open,
  onOpenChange,
  onSave,
  onCancel,
  editData,
  selectedTargetCount = 0,
}: ModelPricingSheetProps) {
  const { t } = useTranslation()
  const title = editData ? t('Edit model pricing') : t('Add model pricing')
  const description = editData?.name || t('New model')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side='right'
        className={sideDrawerContentClassName('sm:max-w-2xl')}
      >
        <SheetHeader className='sr-only'>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <ModelPricingEditorPanel
          onSave={onSave}
          editData={editData}
          selectedTargetCount={selectedTargetCount}
          onCancel={() => {
            onCancel?.()
            onOpenChange(false)
          }}
          className='h-full rounded-none border-0'
        />
      </SheetContent>
    </Sheet>
  )
}

export function ModelPricingEditorPanel({
  onSave,
  editData,
  selectedTargetCount = 0,
  onCancel,
  className,
}: ModelPricingEditorPanelProps) {
  const { t } = useTranslation()
  const [pricingMode, setPricingMode] = useState<PricingMode>('per-token')
  const [promptPrice, setPromptPrice] = useState('')
  const [lanePrices, setLanePrices] = useState<Record<LaneKey, string>>({
    ...EMPTY_LANE_PRICES,
  })
  const [laneEnabled, setLaneEnabled] = useState<Record<LaneKey, boolean>>({
    ...EMPTY_LANE_ENABLED,
  })
  const [billingExpr, setBillingExpr] = useState('')
  const [requestRuleExpr, setRequestRuleExpr] = useState('')
  const [imageBillingRuleJson, setImageBillingRuleJson] = useState('')
  const [previewOpen, setPreviewOpen] = useState(true)
  const isEditMode = !!editData

  const form = useForm<ModelPricingFormValues>({
    resolver: zodResolver(createModelPricingSchema(t)),
    defaultValues: {
      name: '',
      price: '',
      ratio: '',
      cacheRatio: '',
      createCacheRatio: '',
      completionRatio: '',
      imageRatio: '',
      audioRatio: '',
      audioCompletionRatio: '',
    },
  })

  useEffect(() => {
    const nextLaneState = createInitialLaneState(editData)

    if (editData) {
      form.reset({
        name: editData.name,
        price: editData.price || '',
        ratio: editData.ratio || '',
        cacheRatio: editData.cacheRatio || '',
        createCacheRatio: editData.createCacheRatio || '',
        completionRatio: editData.completionRatio || '',
        imageRatio: editData.imageRatio || '',
        audioRatio: editData.audioRatio || '',
        audioCompletionRatio: editData.audioCompletionRatio || '',
      })
      setPricingMode(
        editData.billingMode === 'tiered_expr'
          ? 'tiered_expr'
          : editData.price
            ? 'per-request'
            : 'per-token'
      )
      setBillingExpr(editData.billingExpr || '')
      setRequestRuleExpr(editData.requestRuleExpr || '')
      setImageBillingRuleJson(formatImageBillingRule(editData.imageBillingRule))
    } else {
      form.reset({
        name: '',
        price: '',
        ratio: '',
        cacheRatio: '',
        createCacheRatio: '',
        completionRatio: '',
        imageRatio: '',
        audioRatio: '',
        audioCompletionRatio: '',
      })
      setPricingMode('per-token')
      setBillingExpr('')
      setRequestRuleExpr('')
      setImageBillingRuleJson('')
    }

    setPromptPrice(nextLaneState.promptPrice)
    setLanePrices(nextLaneState.prices)
    setLaneEnabled(nextLaneState.enabled)
    setPreviewOpen(true)
  }, [editData, form])

  const setFormValue = (field: keyof ModelPricingFormValues, value: string) => {
    form.setValue(field, value, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  const deriveLaneRatio = (
    lane: LaneKey,
    price: string,
    nextPromptPrice = promptPrice,
    nextLanePrices = lanePrices
  ) => {
    const priceNumber = toNumberOrNull(price)
    if (priceNumber === null) return ''

    if (lane === 'audioOutput') {
      const audioInputPrice = toNumberOrNull(nextLanePrices.audioInput)
      if (audioInputPrice === null || audioInputPrice === 0) return ''
      return formatPricingNumber(priceNumber / audioInputPrice)
    }

    const inputPrice = toNumberOrNull(nextPromptPrice)
    if (inputPrice === null || inputPrice === 0) return ''
    return formatPricingNumber(priceNumber / inputPrice)
  }

  const syncLaneRatios = (
    nextPromptPrice = promptPrice,
    nextLanePrices = lanePrices,
    nextLaneEnabled = laneEnabled
  ) => {
    const inputPrice = toNumberOrNull(nextPromptPrice)
    setFormValue(
      'ratio',
      inputPrice !== null ? formatPricingNumber(inputPrice / 2) : ''
    )

    laneConfigs.forEach(({ key }) => {
      const ratioField = ratioFieldByLane[key]
      if (!nextLaneEnabled[key]) {
        setFormValue(ratioField, '')
        return
      }
      setFormValue(
        ratioField,
        deriveLaneRatio(
          key,
          nextLanePrices[key],
          nextPromptPrice,
          nextLanePrices
        )
      )
    })
  }

  const handlePromptPriceChange = (value: string) => {
    if (!numericDraftRegex.test(value)) return
    setPromptPrice(value)
    syncLaneRatios(value, lanePrices, laneEnabled)
  }

  const handleLanePriceChange = (lane: LaneKey, value: string) => {
    if (!numericDraftRegex.test(value)) return
    const nextLanePrices = { ...lanePrices, [lane]: value }
    setLanePrices(nextLanePrices)

    if (laneEnabled[lane]) {
      setFormValue(
        ratioFieldByLane[lane],
        deriveLaneRatio(lane, value, promptPrice, nextLanePrices)
      )
    }

    if (lane === 'audioInput' && laneEnabled.audioOutput) {
      setFormValue(
        'audioCompletionRatio',
        deriveLaneRatio(
          'audioOutput',
          nextLanePrices.audioOutput,
          promptPrice,
          nextLanePrices
        )
      )
    }
  }

  const handleLaneToggle = (lane: LaneKey, checked: boolean) => {
    const nextEnabled = { ...laneEnabled, [lane]: checked }
    let nextPrices = lanePrices

    if (!checked) {
      nextPrices = { ...nextPrices, [lane]: '' }
      setFormValue(ratioFieldByLane[lane], '')
      if (lane === 'audioInput') {
        nextEnabled.audioOutput = false
        nextPrices.audioOutput = ''
        setFormValue('audioCompletionRatio', '')
      }
    }

    setLaneEnabled(nextEnabled)
    setLanePrices(nextPrices)

    if (checked) {
      setFormValue(
        ratioFieldByLane[lane],
        deriveLaneRatio(lane, nextPrices[lane], promptPrice, nextPrices)
      )
    }
  }

  const handleModeChange = (value: string) => {
    const nextMode = value as PricingMode
    setPricingMode(nextMode)
    if (nextMode === 'tiered_expr' && !billingExpr) {
      setBillingExpr('tier("base", p * 0 + c * 0)')
    }
  }

  const watchedValues = form.watch()
  const previewRows = useMemo(
    () =>
      buildPreviewRows(
        watchedValues,
        pricingMode,
        billingExpr,
        requestRuleExpr,
        imageBillingRuleJson,
        promptPrice,
        lanePrices,
        laneEnabled,
        t
      ),
    [
      billingExpr,
      imageBillingRuleJson,
      laneEnabled,
      lanePrices,
      pricingMode,
      promptPrice,
      requestRuleExpr,
      t,
      watchedValues,
    ]
  )

  const warnings = useMemo(() => {
    const nextWarnings: string[] = []
    const hasConflict =
      !!editData?.price &&
      [
        editData.ratio,
        editData.completionRatio,
        editData.cacheRatio,
        editData.createCacheRatio,
        editData.imageRatio,
        editData.audioRatio,
        editData.audioCompletionRatio,
      ].some(hasValue)

    if (hasConflict) {
      nextWarnings.push(
        t(
          'This model has both fixed-price and token-price settings. Saving the current mode will rewrite the conflicting fields.'
        )
      )
    }

    if (
      pricingMode === 'per-token' &&
      toNumberOrNull(promptPrice) === null &&
      laneConfigs.some(
        ({ key }) => laneEnabled[key] && hasValue(lanePrices[key])
      )
    ) {
      nextWarnings.push(
        t('Input price is required before saving dependent prices.')
      )
    }

    if (
      pricingMode === 'per-token' &&
      laneEnabled.audioOutput &&
      !hasValue(lanePrices.audioInput)
    ) {
      nextWarnings.push(t('Audio output price requires an audio input price.'))
    }

    return nextWarnings
  }, [editData, laneEnabled, lanePrices, pricingMode, promptPrice, t])

  const handleSubmit = (values: ModelPricingFormValues) => {
    if (
      pricingMode === 'per-token' &&
      toNumberOrNull(promptPrice) === null &&
      laneConfigs.some(
        ({ key }) => laneEnabled[key] && hasValue(lanePrices[key])
      )
    ) {
      form.setError('ratio', {
        message: t('Input price is required before saving dependent prices.'),
      })
      return
    }

    if (
      pricingMode === 'per-token' &&
      laneEnabled.audioOutput &&
      !hasValue(lanePrices.audioInput)
    ) {
      form.setError('audioRatio', {
        message: t('Audio output price requires an audio input price.'),
      })
      return
    }

    const data: ModelRatioData = {
      name: values.name.trim(),
      billingMode: pricingMode,
      price: values.price || '',
      ratio: values.ratio || '',
      cacheRatio: values.cacheRatio || '',
      createCacheRatio: values.createCacheRatio || '',
      completionRatio: values.completionRatio || '',
      imageRatio: values.imageRatio || '',
      audioRatio: values.audioRatio || '',
      audioCompletionRatio: values.audioCompletionRatio || '',
    }

    if (pricingMode === 'tiered_expr') {
      data.billingExpr = billingExpr
      data.requestRuleExpr = requestRuleExpr
    }

    if (pricingMode === 'per-request' && imageBillingRuleJson.trim()) {
      try {
        data.imageBillingRule = parseImageBillingRuleJson(imageBillingRuleJson)
      } catch (error) {
        form.setError('price', {
          message:
            error instanceof Error
              ? t(error.message)
              : t('Image billing rule must be a JSON object.'),
        })
        return
      }
    }

    onSave(data)
    form.reset()
    onCancel?.()
  }

  const activeName = watchedValues.name || editData?.name || t('New model')
  const showImageBillingRuleEditor =
    pricingMode === 'per-request' &&
    (Boolean(imageBillingRuleJson.trim()) || isLikelyImageModelName(activeName))

  return (
    <div
      className={cn(
        'bg-background flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border',
        className
      )}
    >
      <div className='border-b p-4'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <h3 className='truncate text-base font-medium'>
              {isEditMode ? t('Edit model pricing') : t('Add model pricing')}
            </h3>
            <p className='text-muted-foreground truncate text-sm'>
              {activeName}
            </p>
          </div>
          <Badge variant={getModeBadgeVariant(pricingMode)}>
            {t(getModeLabel(pricingMode))}
          </Badge>
        </div>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className='flex min-h-0 flex-1 flex-col'
          autoComplete='off'
        >
          <div className='min-h-0 flex-1 overflow-y-auto p-4'>
            <FieldGroup>
              {warnings.length > 0 && (
                <Alert variant='destructive'>
                  <AlertTriangle data-icon='inline-start' />
                  <AlertDescription>
                    <div className='flex flex-col gap-1'>
                      {warnings.map((warning) => (
                        <span key={warning}>{warning}</span>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Model name')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('gpt-4')}
                        {...field}
                        disabled={isEditMode}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('The exact model identifier as used in API requests.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Tabs value={pricingMode} onValueChange={handleModeChange}>
                <TabsList className='grid w-full grid-cols-3'>
                  <TabsTrigger value='per-token'>{t('Per-token')}</TabsTrigger>
                  <TabsTrigger value='per-request'>
                    {t('Per-request')}
                  </TabsTrigger>
                  <TabsTrigger value='tiered_expr'>
                    {t('Expression')}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value='per-token' className='flex flex-col gap-5'>
                  <FieldGroup>
                    <Field>
                      <FieldLabel>{t('Input price')}</FieldLabel>
                      <PriceInput
                        value={promptPrice}
                        placeholder='3'
                        onChange={handlePromptPriceChange}
                      />
                      <FieldDescription>
                        {t('USD price per 1M input tokens.')}
                      </FieldDescription>
                    </Field>

                    <div className='grid gap-3 sm:grid-cols-2'>
                      {laneConfigs.map((lane) => {
                        const disabled =
                          lane.key === 'audioOutput' &&
                          (!laneEnabled.audioInput ||
                            !hasValue(lanePrices.audioInput))
                        return (
                          <PriceLane
                            key={lane.key}
                            title={t(lane.titleKey)}
                            description={t(lane.descriptionKey)}
                            placeholder={lane.placeholder}
                            value={lanePrices[lane.key]}
                            enabled={laneEnabled[lane.key]}
                            disabled={disabled}
                            onEnabledChange={(checked) =>
                              handleLaneToggle(lane.key, checked)
                            }
                            onChange={(value) =>
                              handleLanePriceChange(lane.key, value)
                            }
                          />
                        )
                      })}
                    </div>
                  </FieldGroup>
                </TabsContent>

                <TabsContent
                  value='per-request'
                  className='flex flex-col gap-5'
                >
                  <FormField
                    control={form.control}
                    name='price'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Fixed price')}</FormLabel>
                        <FormControl>
                          <InputGroup>
                            <InputGroupAddon>$</InputGroupAddon>
                            <InputGroupInput
                              inputMode='decimal'
                              placeholder='0.01'
                              {...field}
                              onChange={(event) => {
                                const value = event.target.value
                                if (numericDraftRegex.test(value)) {
                                  field.onChange(value)
                                }
                              }}
                            />
                            <InputGroupAddon align='inline-end'>
                              {t('per request')}
                            </InputGroupAddon>
                          </InputGroup>
                        </FormControl>
                        <FormDescription>
                          {t('Base USD cost per request before group ratio.')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {showImageBillingRuleEditor && (
                    <Field>
                      <FieldLabel>
                        {t('Image request parameter multipliers')}
                      </FieldLabel>
                      <ImageBillingRuleEditor
                        value={imageBillingRuleJson}
                        onChange={setImageBillingRuleJson}
                      />
                      <FieldDescription>
                        {t(
                          'Leave disabled to use only the fixed request price. Enable this when size, quality, or resolution should multiply the base request price.'
                        )}
                      </FieldDescription>
                    </Field>
                  )}
                </TabsContent>

                <TabsContent
                  value='tiered_expr'
                  className='flex flex-col gap-5'
                >
                  <TieredPricingEditor
                    modelName={watchedValues.name}
                    billingExpr={billingExpr}
                    requestRuleExpr={requestRuleExpr}
                    onBillingExprChange={setBillingExpr}
                    onRequestRuleExprChange={setRequestRuleExpr}
                  />
                </TabsContent>
              </Tabs>

              <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
                <CollapsibleTrigger
                  render={
                    <Button
                      type='button'
                      variant='outline'
                      className='flex w-full justify-between'
                    />
                  }
                >
                  <span>{t('Save preview')}</span>
                  <ChevronDown
                    className={cn(
                      'transition-transform',
                      previewOpen && 'rotate-180'
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className='pt-3'>
                  <div className='rounded-lg border'>
                    {previewRows.map((row) => (
                      <div
                        key={row.key}
                        className='grid grid-cols-[140px_1fr] gap-3 border-b px-3 py-2 text-sm last:border-b-0'
                      >
                        <span className='text-muted-foreground text-xs'>
                          {row.label}
                        </span>
                        <span
                          className={cn(
                            'min-w-0',
                            row.multiline
                              ? 'font-mono text-xs leading-5 break-words whitespace-pre-wrap'
                              : 'truncate'
                          )}
                        >
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </FieldGroup>
          </div>

          <SheetFooter
            className={sideDrawerFooterClassName(
              'grid-cols-1 sm:items-center sm:justify-between'
            )}
          >
            <div className='text-muted-foreground text-xs'>
              {selectedTargetCount > 0
                ? t('{{count}} selected targets available for bulk copy.', {
                    count: selectedTargetCount,
                  })
                : t('Changes are written to the settings draft on save.')}
            </div>
            <div className='flex justify-end gap-2'>
              <Button type='button' variant='outline' onClick={onCancel}>
                {t('Cancel')}
              </Button>
              <Button type='submit'>
                {isEditMode ? t('Update') : t('Add')}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </Form>
    </div>
  )
}

function PriceInput(props: {
  value: string
  placeholder?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <InputGroup>
      <InputGroupAddon>$</InputGroupAddon>
      <InputGroupInput
        inputMode='decimal'
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <InputGroupAddon align='inline-end'>$/1M</InputGroupAddon>
    </InputGroup>
  )
}

function PriceLane(props: {
  title: string
  description: string
  placeholder: string
  value: string
  enabled: boolean
  disabled?: boolean
  onEnabledChange: (checked: boolean) => void
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const effectiveDisabled = props.disabled || !props.enabled

  return (
    <SettingsControlGroup
      className={cn('space-y-3', effectiveDisabled && 'opacity-75')}
      data-disabled={effectiveDisabled || undefined}
    >
      <SettingsSwitchField
        checked={props.enabled}
        disabled={props.disabled}
        onCheckedChange={props.onEnabledChange}
        label={props.title}
        description={props.description}
        aria-label={props.title}
      />
      <PriceInput
        value={props.value}
        placeholder={props.placeholder}
        disabled={effectiveDisabled}
        onChange={props.onChange}
      />
      <p className='text-muted-foreground text-xs'>
        {props.enabled
          ? t('USD price per 1M tokens.')
          : t('Disabled lanes are omitted on save.')}
      </p>
    </SettingsControlGroup>
  )
}
