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
import type { ReactNode } from 'react'
import { z } from 'zod'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const schema = z.object({
  enabled: z.boolean(),
  dailyCheckinEnabled: z.boolean(),
  dailyCheckinMinRewardQuota: z.coerce.number().int().min(0),
  dailyCheckinMaxRewardQuota: z.coerce.number().int().min(0),
  firstAPIKeyRewardQuota: z.coerce.number().int().min(0),
  firstAPIRequestRewardQuota: z.coerce.number().int().min(0),
  firstTopUpRewardQuota: z.coerce.number().int().min(0),
  threeDayUsageRewardQuota: z.coerce.number().int().min(0),
  monthlySpendRewardQuota: z.coerce.number().int().min(0),
  monthlySpendTargetQuota: z.coerce.number().int().min(0),
  inviteRebatePercentage: z.coerce.number().min(0),
  inviteFirstRequestRewardQuota: z.coerce.number().int().min(0),
  inviteFirstTopUpRewardQuota: z.coerce.number().int().min(0),
  rebateFreezeDays: z.coerce.number().int().min(0),
  userDailyRewardLimitQuota: z.coerce.number().int().min(0),
  siteDailyBudgetQuota: z.coerce.number().int().min(0),
  submissionEnabled: z.boolean(),
  submissionMinRewardQuota: z.coerce.number().int().min(0),
  submissionMaxRewardQuota: z.coerce.number().int().min(0),
})

type Values = z.infer<typeof schema>
type NumberFieldName = Exclude<
  keyof Values,
  'enabled' | 'dailyCheckinEnabled' | 'submissionEnabled'
>

const optionKeys: Record<keyof Values, string> = {
  enabled: 'growth_setting.enabled',
  dailyCheckinEnabled: 'growth_setting.daily_checkin_enabled',
  dailyCheckinMinRewardQuota: 'growth_setting.daily_checkin_min_reward_quota',
  dailyCheckinMaxRewardQuota: 'growth_setting.daily_checkin_max_reward_quota',
  firstAPIKeyRewardQuota: 'growth_setting.first_api_key_reward_quota',
  firstAPIRequestRewardQuota: 'growth_setting.first_api_request_reward_quota',
  firstTopUpRewardQuota: 'growth_setting.first_topup_reward_quota',
  threeDayUsageRewardQuota: 'growth_setting.three_day_usage_reward_quota',
  monthlySpendRewardQuota: 'growth_setting.monthly_spend_reward_quota',
  monthlySpendTargetQuota: 'growth_setting.monthly_spend_target_quota',
  inviteRebatePercentage: 'InviteRebatePercentage',
  inviteFirstRequestRewardQuota:
    'growth_setting.invite_first_request_reward_quota',
  inviteFirstTopUpRewardQuota: 'growth_setting.invite_first_topup_reward_quota',
  rebateFreezeDays: 'growth_setting.rebate_freeze_days',
  userDailyRewardLimitQuota: 'growth_setting.user_daily_reward_limit_quota',
  siteDailyBudgetQuota: 'growth_setting.site_daily_budget_quota',
  submissionEnabled: 'growth_setting.submission_enabled',
  submissionMinRewardQuota: 'growth_setting.submission_min_reward_quota',
  submissionMaxRewardQuota: 'growth_setting.submission_max_reward_quota',
}

const automationFields: Array<{
  name: NumberFieldName
  label: string
  description: string
}> = [
  {
    name: 'firstAPIKeyRewardQuota',
    label: 'First API key reward',
    description: 'Quota awarded after the user creates an API key.',
  },
  {
    name: 'firstAPIRequestRewardQuota',
    label: 'First API request reward',
    description: 'Quota awarded after the user completes the first request.',
  },
  {
    name: 'firstTopUpRewardQuota',
    label: 'First top-up reward',
    description: 'Quota awarded after the user completes the first top-up.',
  },
  {
    name: 'threeDayUsageRewardQuota',
    label: 'Three-day usage reward',
    description: 'Quota reserved for the consecutive usage reward item.',
  },
  {
    name: 'monthlySpendRewardQuota',
    label: 'Monthly spend reward',
    description: 'Quota awarded after the monthly spend target is reached.',
  },
  {
    name: 'monthlySpendTargetQuota',
    label: 'Monthly spend target',
    description: 'Monthly consumed quota required for the spend reward item.',
  },
]

const dailyCheckinFields: Array<{
  name: NumberFieldName
  label: string
  description: string
}> = [
  {
    name: 'dailyCheckinMinRewardQuota',
    label: 'Minimum check-in quota',
    description: 'Minimum quota amount awarded for check-in',
  },
  {
    name: 'dailyCheckinMaxRewardQuota',
    label: 'Maximum check-in quota',
    description: 'Maximum quota amount awarded for check-in',
  },
]

const invitationFields: Array<{
  name: NumberFieldName
  label: string
  description: string
}> = [
  {
    name: 'inviteRebatePercentage',
    label: 'Invitation rebate percentage',
    description: 'Percentage awarded to inviters from invited user top-ups.',
  },
  {
    name: 'inviteFirstRequestRewardQuota',
    label: 'Inviter first request reward',
    description:
      'Quota awarded to the inviter when an invited user completes the first API request.',
  },
  {
    name: 'inviteFirstTopUpRewardQuota',
    label: 'Inviter first top-up reward',
    description:
      'Quota awarded to the inviter when an invited user completes the first top-up.',
  },
  {
    name: 'rebateFreezeDays',
    label: 'Rebate freeze days',
    description: 'Days before future rebates become settleable.',
  },
]

const budgetFields: Array<{
  name: NumberFieldName
  label: string
  description: string
}> = [
  {
    name: 'userDailyRewardLimitQuota',
    label: 'User daily reward limit',
    description:
      'Maximum growth reward quota per user per day. Zero means unlimited.',
  },
  {
    name: 'siteDailyBudgetQuota',
    label: 'Site daily reward budget',
    description:
      'Maximum growth reward quota for the whole site per day. Zero means unlimited.',
  },
]

const submissionFields: Array<{
  name: NumberFieldName
  label: string
  description: string
}> = [
  {
    name: 'submissionMinRewardQuota',
    label: 'Submission minimum reward',
    description: 'Default minimum quota for approved content submissions.',
  },
  {
    name: 'submissionMaxRewardQuota',
    label: 'Submission maximum reward',
    description: 'Suggested maximum quota for approved content submissions.',
  },
]

export function GrowthSettingsSection({
  defaultValues,
}: {
  defaultValues: Values
}) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues,
  })

  const { isDirty, isSubmitting } = form.formState
  const enabled = form.watch('enabled')
  const dailyCheckinEnabled = form.watch('dailyCheckinEnabled')
  const submissionEnabled = form.watch('submissionEnabled')
  const saving = updateOption.isPending || isSubmitting

  async function onSubmit(values: Values) {
    const updates: Array<{ key: string; value: string }> = []

    for (const key of Object.keys(optionKeys) as Array<keyof Values>) {
      if (values[key] !== defaultValues[key]) {
        updates.push({ key: optionKeys[key], value: String(values[key]) })
      }
    }

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }

    form.reset(values)
  }

  return (
    <SettingsSection
      title={t('Promotion & Rewards')}
      description={t(
        'Configure activation, retention, referral, and content rewards.'
      )}
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          autoComplete='off'
          className='flex flex-col gap-6'
        >
          <div className='grid gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='enabled'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel>{t('Enable growth rewards')}</FormLabel>
                    <FormDescription>
                      {t('Allow users to claim automatic growth rewards.')}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={saving}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='submissionEnabled'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel>{t('Enable promotion submissions')}</FormLabel>
                    <FormDescription>
                      {t('Allow users to submit community and content proofs.')}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={saving}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <SettingsGroup
            title={t('Daily check-in rules')}
            description={t(
              'Allow users to claim a random quota reward once per day.'
            )}
            badge={
              dailyCheckinEnabled
                ? t('Daily check-in enabled')
                : t('Daily check-in disabled')
            }
          >
            <div className='flex flex-col gap-5'>
              <FormField
                control={form.control}
                name='dailyCheckinEnabled'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                    <div className='space-y-0.5'>
                      <FormLabel>{t('Enable daily check-in')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Allow users to check in daily for random quota rewards'
                        )}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={saving}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FieldGrid>
                {dailyCheckinFields.map((item) => (
                  <FormField
                    key={item.name}
                    control={form.control}
                    name={item.name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t(item.label)}</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            min={0}
                            disabled={!dailyCheckinEnabled}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>{t(item.description)}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </FieldGrid>
            </div>
          </SettingsGroup>

          <SettingsGroup
            title={t('Automatic reward rules')}
            description={t(
              'Global quota values used by one-time activation and retention tasks.'
            )}
            badge={
              enabled
                ? t('Growth rewards enabled')
                : t('Growth rewards disabled')
            }
          >
            <FieldGrid>
              {automationFields.map((item) => (
                <FormField
                  key={item.name}
                  control={form.control}
                  name={item.name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t(item.label)}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={0}
                          disabled={!enabled}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>{t(item.description)}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </FieldGrid>
          </SettingsGroup>

          <SettingsGroup
            title={t('Invitation rebate rules')}
            description={t(
              'Referral rebate and milestone rewards shared by the promotion center.'
            )}
          >
            <FieldGrid>
              {invitationFields.map((item) => (
                <FormField
                  key={item.name}
                  control={form.control}
                  name={item.name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t(item.label)}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={0}
                          disabled={!submissionEnabled}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>{t(item.description)}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </FieldGrid>
          </SettingsGroup>

          <SettingsGroup
            title={t('Content submission rules')}
            description={t(
              'Default reward range for reviewed promotion proof submissions.'
            )}
            badge={
              submissionEnabled
                ? t('Submissions enabled')
                : t('Submissions disabled')
            }
          >
            <FieldGrid>
              {submissionFields.map((item) => (
                <FormField
                  key={item.name}
                  control={form.control}
                  name={item.name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t(item.label)}</FormLabel>
                      <FormControl>
                        <Input type='number' min={0} {...field} />
                      </FormControl>
                      <FormDescription>{t(item.description)}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </FieldGrid>
          </SettingsGroup>

          <SettingsGroup
            title={t('Budget limits')}
            description={t(
              'Optional guardrails that cap rewards per user or across the site each day.'
            )}
          >
            <FieldGrid>
              {budgetFields.map((item) => (
                <FormField
                  key={item.name}
                  control={form.control}
                  name={item.name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t(item.label)}</FormLabel>
                      <FormControl>
                        <Input type='number' min={0} {...field} />
                      </FormControl>
                      <FormDescription>{t(item.description)}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </FieldGrid>
          </SettingsGroup>

          <Button type='submit' disabled={!isDirty || saving} className='w-fit'>
            {saving ? t('Saving...') : t('Save growth settings')}
          </Button>
        </form>
      </Form>
    </SettingsSection>
  )
}

function SettingsGroup({
  title,
  description,
  badge,
  children,
}: {
  title: string
  description: string
  badge?: string
  children: ReactNode
}) {
  return (
    <div className='rounded-lg border p-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex min-w-0 flex-col gap-1'>
          <h4 className='text-sm font-semibold'>{title}</h4>
          <p className='text-muted-foreground text-xs leading-5'>
            {description}
          </p>
        </div>
        {badge ? <Badge variant='outline'>{badge}</Badge> : null}
      </div>
      <Separator className='my-4' />
      {children}
    </div>
  )
}

function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <div className='grid gap-5 md:grid-cols-2 xl:grid-cols-3'>{children}</div>
  )
}
