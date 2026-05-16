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
import { z } from 'zod'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
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
import { Switch } from '@/components/ui/switch'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const schema = z.object({
  enabled: z.boolean(),
  firstAPIKeyRewardQuota: z.coerce.number().int().min(0),
  firstAPIRequestRewardQuota: z.coerce.number().int().min(0),
  firstTopUpRewardQuota: z.coerce.number().int().min(0),
  threeDayUsageRewardQuota: z.coerce.number().int().min(0),
  monthlySpendRewardQuota: z.coerce.number().int().min(0),
  monthlySpendTargetQuota: z.coerce.number().int().min(0),
  inviteRebatePercentage: z.coerce.number().min(0),
  rebateFreezeDays: z.coerce.number().int().min(0),
  userDailyRewardLimitQuota: z.coerce.number().int().min(0),
  siteDailyBudgetQuota: z.coerce.number().int().min(0),
  submissionEnabled: z.boolean(),
  submissionMinRewardQuota: z.coerce.number().int().min(0),
  submissionMaxRewardQuota: z.coerce.number().int().min(0),
})

type Values = z.infer<typeof schema>
type NumberFieldName = Exclude<keyof Values, 'enabled' | 'submissionEnabled'>

const optionKeys: Record<keyof Values, string> = {
  enabled: 'growth_setting.enabled',
  firstAPIKeyRewardQuota: 'growth_setting.first_api_key_reward_quota',
  firstAPIRequestRewardQuota: 'growth_setting.first_api_request_reward_quota',
  firstTopUpRewardQuota: 'growth_setting.first_topup_reward_quota',
  threeDayUsageRewardQuota: 'growth_setting.three_day_usage_reward_quota',
  monthlySpendRewardQuota: 'growth_setting.monthly_spend_reward_quota',
  monthlySpendTargetQuota: 'growth_setting.monthly_spend_target_quota',
  inviteRebatePercentage: 'growth_setting.invite_rebate_percentage',
  rebateFreezeDays: 'growth_setting.rebate_freeze_days',
  userDailyRewardLimitQuota: 'growth_setting.user_daily_reward_limit_quota',
  siteDailyBudgetQuota: 'growth_setting.site_daily_budget_quota',
  submissionEnabled: 'growth_setting.submission_enabled',
  submissionMinRewardQuota: 'growth_setting.submission_min_reward_quota',
  submissionMaxRewardQuota: 'growth_setting.submission_max_reward_quota',
}

const rewardFields: Array<{
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

const controlFields: Array<{
  name: NumberFieldName
  label: string
  description: string
}> = [
  {
    name: 'inviteRebatePercentage',
    label: 'Invitation rebate percentage',
    description: 'Percentage used for future invitation rebate rules.',
  },
  {
    name: 'rebateFreezeDays',
    label: 'Rebate freeze days',
    description: 'Days before future rebates become settleable.',
  },
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
  const submissionEnabled = form.watch('submissionEnabled')

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
          className='space-y-6'
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
                      disabled={updateOption.isPending || isSubmitting}
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
                      disabled={updateOption.isPending || isSubmitting}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          {enabled ? (
            <div className='grid gap-6 md:grid-cols-2 xl:grid-cols-3'>
              {rewardFields.map((item) => (
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
            </div>
          ) : null}

          <div className='grid gap-6 md:grid-cols-2 xl:grid-cols-3'>
            {controlFields.map((item) => {
              const disabled =
                item.name === 'submissionMinRewardQuota' ||
                item.name === 'submissionMaxRewardQuota'
                  ? !submissionEnabled
                  : false
              return (
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
                          disabled={disabled}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>{t(item.description)}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )
            })}
          </div>

          <Button
            type='submit'
            disabled={!isDirty || updateOption.isPending || isSubmitting}
          >
            {updateOption.isPending || isSubmitting
              ? t('Saving...')
              : t('Save growth settings')}
          </Button>
        </form>
      </Form>
    </SettingsSection>
  )
}
