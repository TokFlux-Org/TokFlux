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
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ClipboardList,
  Coins,
  Gift,
  RefreshCw,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { useStatus } from '@/hooks/use-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SectionPageLayout } from '@/components/layout'
import { NotFoundError } from '@/features/errors/not-found-error'
import {
  formatTime,
  getItems,
  rewardItemCopy,
  statusVariant,
  type GrowthReward,
  type GrowthRewardItem,
  type GrowthSummary,
} from './shared'

export function Growth() {
  const { t } = useTranslation()
  const { status, loading: statusLoading } = useStatus()
  const [summary, setSummary] = useState<GrowthSummary | null>(null)
  const [rewardItems, setRewardItems] = useState<GrowthRewardItem[]>([])
  const [rewards, setRewards] = useState<GrowthReward[]>([])
  const [loading, setLoading] = useState(true)
  const [claimingCode, setClaimingCode] = useState('')

  const automaticRewardItems = useMemo(
    () => rewardItems.filter((item) => item.item_type === 'auto'),
    [rewardItems]
  )

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [summaryRes, rewardItemsRes, rewardsRes] = await Promise.all([
        api.get('/api/growth/summary'),
        api.get('/api/growth/items'),
        api.get('/api/growth/rewards', { params: { page_size: 20 } }),
      ])
      setSummary(summaryRes.data?.data || null)
      setRewardItems(rewardItemsRes.data?.data || [])
      setRewards(getItems<GrowthReward>(rewardsRes.data))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (statusLoading || status?.growth_rewards_enabled !== true) return
    loadData()
  }, [loadData, status?.growth_rewards_enabled, statusLoading])

  const claimRewardItem = async (code: string) => {
    try {
      setClaimingCode(code)
      const res = await api.post(`/api/growth/items/${code}/claim`)
      if (res.data?.success) {
        toast.success(t('Reward claimed'))
        await loadData()
      }
    } finally {
      setClaimingCode('')
    }
  }

  const summaryItems = [
    [t('Available Rewards'), summary?.available_reward_quota || 0, Gift],
    [t('Pending Rewards'), summary?.pending_reward_quota || 0, ClipboardList],
    [t('Total Rewards'), summary?.total_reward_quota || 0, Coins],
  ] as const

  const rewardItemTitle = useCallback(
    (itemOrCode: GrowthRewardItem | string) => {
      const code = typeof itemOrCode === 'string' ? itemOrCode : itemOrCode.code
      const fallback =
        typeof itemOrCode === 'string' ? itemOrCode : itemOrCode.title
      return t(rewardItemCopy[code]?.title || fallback)
    },
    [t]
  )

  const rewardItemDescription = useCallback(
    (item: GrowthRewardItem) =>
      t(rewardItemCopy[item.code]?.description || item.description),
    [t]
  )

  if (!statusLoading && status?.growth_rewards_enabled !== true) {
    return <NotFoundError />
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Reward Center')}</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t('Your activation rewards and reward records in one place.')}
      </SectionPageLayout.Description>
      <SectionPageLayout.Actions>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw className='size-4' />
          {t('Refresh')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-7xl flex-col gap-4'>
          <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
            {summaryItems.map(([label, value, Icon]) => (
              <Card key={label} className='py-0'>
                <CardContent className='flex items-center gap-3 p-4'>
                  <div className='bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg'>
                    <Icon className='text-muted-foreground size-4' />
                  </div>
                  <div className='min-w-0'>
                    <div className='text-muted-foreground truncate text-xs'>
                      {label}
                    </div>
                    <div className='truncate text-sm font-semibold tabular-nums'>
                      {formatQuota(value)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className='grid gap-4'>
            {automaticRewardItems.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t('Activation Rewards')}</CardTitle>
                </CardHeader>
                <CardContent className='grid gap-3'>
                  {automaticRewardItems.map((item) => (
                    <div
                      key={item.code}
                      className='grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center'
                    >
                      <div className='min-w-0'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <h3 className='text-sm font-medium'>
                            {rewardItemTitle(item)}
                          </h3>
                          <Badge variant={statusVariant(item.status)}>
                            {t(item.status)}
                          </Badge>
                        </div>
                        <p className='text-muted-foreground mt-1 line-clamp-2 text-xs'>
                          {rewardItemDescription(item)}
                        </p>
                        {item.reason ? (
                          <p className='text-muted-foreground mt-1 text-xs'>
                            {t(item.reason)}
                          </p>
                        ) : null}
                      </div>
                      <div className='flex items-center justify-between gap-2 md:justify-end'>
                        <span className='text-sm font-semibold tabular-nums'>
                          {formatQuota(item.reward_quota || 0)}
                        </span>
                        <Button
                          type='button'
                          size='sm'
                          disabled={
                            !item.claimable || claimingCode === item.code
                          }
                          onClick={() => claimRewardItem(item.code)}
                        >
                          <CheckCircle2 className='size-4' />
                          {t('Claim')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className='grid gap-4'>
            <Card>
              <CardHeader>
                <CardTitle>{t('Reward Records')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='divide-y rounded-lg border'>
                  {rewards.length > 0 ? (
                    rewards.map((reward) => (
                      <div
                        key={reward.id}
                        className='grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center'
                      >
                        <div className='min-w-0'>
                          <div className='truncate text-sm font-medium'>
                            {rewardItemTitle(reward.item_code)}
                          </div>
                          <div className='text-muted-foreground truncate text-xs'>
                            {reward.remark || '-'}
                          </div>
                        </div>
                        <span className='text-sm font-semibold tabular-nums'>
                          {formatQuota(reward.reward_quota)}
                        </span>
                        <div className='flex items-center gap-2'>
                          <Badge variant={statusVariant(reward.status)}>
                            {t(reward.status)}
                          </Badge>
                          <span className='text-muted-foreground text-xs'>
                            {formatTime(reward.created_at)}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className='text-muted-foreground p-8 text-center text-sm'>
                      {t('No reward records')}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
