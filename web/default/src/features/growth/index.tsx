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
  ExternalLink,
  FileText,
  Gift,
  Globe2,
  KeyRound,
  LinkIcon,
  RefreshCw,
  Send,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { useStatus } from '@/hooks/use-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Turnstile } from '@/components/turnstile'
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
  type GrowthSubmission,
} from './shared'

const JOIN_COMMUNITY_CODE = 'join_community'
const MONTHLY_SPEND_TARGET_CODE = 'monthly_spend_target'
const DAILY_CHECKIN_CODE = 'daily_checkin'

const CONTENT_REWARD_COPY: Record<
  string,
  {
    title: string
    badge?: string
    icon: LucideIcon
  }
> = {
  content_publish: {
    title: 'Publish an article, video, or tutorial',
    badge: 'Recommended',
    icon: FileText,
  },
  backlink_submission: {
    title: 'Submit a website backlink or directory listing',
    icon: Globe2,
  },
}

export function Growth() {
  const { t } = useTranslation()
  const { status, loading: statusLoading } = useStatus()
  const [summary, setSummary] = useState<GrowthSummary | null>(null)
  const [rewardItems, setRewardItems] = useState<GrowthRewardItem[]>([])
  const [rewards, setRewards] = useState<GrowthReward[]>([])
  const [submissions, setSubmissions] = useState<GrowthSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [claimingCode, setClaimingCode] = useState('')
  const [passwordDialogItem, setPasswordDialogItem] =
    useState<GrowthRewardItem | null>(null)
  const [taskPassword, setTaskPassword] = useState('')
  const [submissionCode, setSubmissionCode] = useState('')
  const [submissionPlatform, setSubmissionPlatform] = useState('')
  const [submissionUrl, setSubmissionUrl] = useState('')
  const [submissionRemark, setSubmissionRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [turnstileDialogItem, setTurnstileDialogItem] =
    useState<GrowthRewardItem | null>(null)
  const [turnstileWidgetKey, setTurnstileWidgetKey] = useState(0)

  const automaticRewardItems = useMemo(
    () => rewardItems.filter((item) => item.item_type === 'auto'),
    [rewardItems]
  )

  const contentRewardItems = useMemo(
    () =>
      rewardItems.filter(
        (item) => item.item_type !== 'auto' && item.code !== JOIN_COMMUNITY_CODE
      ),
    [rewardItems]
  )

  const docsLink = useMemo(() => {
    const value = status?.docs_link
    return typeof value === 'string' && value.trim() ? value : ''
  }, [status?.docs_link])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [summaryRes, rewardItemsRes, rewardsRes, submissionsRes] =
        await Promise.all([
          api.get('/api/growth/summary'),
          api.get('/api/growth/items'),
          api.get('/api/growth/rewards', { params: { page_size: 20 } }),
          api.get('/api/growth/submissions', { params: { page_size: 20 } }),
        ])
      setSummary(summaryRes.data?.data || null)
      setRewardItems(rewardItemsRes.data?.data || [])
      setRewards(getItems<GrowthReward>(rewardsRes.data))
      setSubmissions(getItems<GrowthSubmission>(submissionsRes.data))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (statusLoading || status?.growth_center_enabled !== true) return
    loadData()
  }, [loadData, status?.growth_center_enabled, statusLoading])

  const shouldTriggerTurnstile = useCallback(
    (message?: string) => {
      if (status?.turnstile_check !== true) return false
      if (typeof message !== 'string') return true
      return message.includes('Turnstile')
    },
    [status?.turnstile_check]
  )

  const claimRewardItem = async (
    code: string,
    password?: string,
    turnstileToken?: string
  ) => {
    try {
      setClaimingCode(code)
      const payload = password ? { password } : undefined
      const url = turnstileToken
        ? `/api/growth/items/${code}/claim?turnstile=${encodeURIComponent(
            turnstileToken
          )}`
        : `/api/growth/items/${code}/claim`
      const res = await api.post(url, payload)
      if (res.data?.success) {
        toast.success(t('Reward claimed'))
        setPasswordDialogItem(null)
        setTurnstileDialogItem(null)
        setTaskPassword('')
        await loadData()
      } else if (
        code === DAILY_CHECKIN_CODE &&
        !turnstileToken &&
        shouldTriggerTurnstile(res.data?.message)
      ) {
        if (!status?.turnstile_site_key) {
          toast.error(t('Turnstile is enabled but site key is empty.'))
          return
        }
        const item = rewardItems.find((rewardItem) => rewardItem.code === code)
        if (item) setTurnstileDialogItem(item)
      } else if (
        code === DAILY_CHECKIN_CODE &&
        turnstileToken &&
        shouldTriggerTurnstile(res.data?.message)
      ) {
        setTurnstileWidgetKey((value) => value + 1)
      }
    } finally {
      setClaimingCode('')
    }
  }

  const handleClaimClick = (item: GrowthRewardItem) => {
    if (item.code === JOIN_COMMUNITY_CODE) {
      setTaskPassword('')
      setPasswordDialogItem(item)
      return
    }
    if (item.code === DAILY_CHECKIN_CODE && status?.turnstile_check === true) {
      if (!status?.turnstile_site_key) {
        toast.error(t('Turnstile is enabled but site key is empty.'))
        return
      }
      setTurnstileDialogItem(item)
      return
    }
    claimRewardItem(item.code)
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

  const rewardItemIntroductionLines = (item: GrowthRewardItem) =>
    (item.introduction || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

  const formatRewardItemQuota = (item: GrowthRewardItem) => {
    const minQuota = item.reward_quota_min ?? item.reward_quota ?? 0
    const maxQuota = item.reward_quota_max ?? minQuota
    if (maxQuota > minQuota) {
      return `${formatQuota(minQuota)} - ${formatQuota(maxQuota)}`
    }
    return formatQuota(minQuota)
  }

  const rewardItemProgressDescription = (item: GrowthRewardItem) => {
    if (item.code !== MONTHLY_SPEND_TARGET_CODE) return ''
    const current = Number(item.progress_current_quota || 0)
    const target = Number(item.progress_target_quota || 0)
    if (target <= 0) return ''
    return t('Monthly consumed {{current}} / target {{target}}', {
      current: formatQuota(current),
      target: formatQuota(target),
    })
  }

  const shouldShowContentRewardStatus = (item: GrowthRewardItem) =>
    item.status !== 'available' && item.status !== 'completed'

  const rewardRemark = (reward: GrowthReward) => {
    const remark = reward.remark?.trim()
    if (!remark) return '-'
    return t(remark)
  }

  const submitProof = async () => {
    if (!submissionCode || !submissionUrl) return
    try {
      setSubmitting(true)
      const res = await api.post('/api/growth/submissions', {
        item_code: submissionCode,
        platform: submissionPlatform,
        url: submissionUrl,
        remark: submissionRemark,
      })
      if (res.data?.success) {
        toast.success(t('Submission created'))
        setSubmissionCode('')
        setSubmissionPlatform('')
        setSubmissionUrl('')
        setSubmissionRemark('')
        await loadData()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const selectSubmissionItem = (code: string) => {
    setSubmissionCode(code)
  }

  if (!statusLoading && status?.growth_center_enabled !== true) {
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
                  <CardTitle>{t('Incentive Rewards')}</CardTitle>
                </CardHeader>
                <CardContent className='grid gap-3'>
                  {automaticRewardItems.map((item) => {
                    const isJoinCommunity = item.code === JOIN_COMMUNITY_CODE
                    const progressDescription =
                      rewardItemProgressDescription(item)
                    const claimDisabled = isJoinCommunity
                      ? item.status === 'completed' ||
                        claimingCode === item.code
                      : !item.claimable || claimingCode === item.code
                    return (
                      <div
                        key={item.code}
                        role={
                          isJoinCommunity && !claimDisabled
                            ? 'button'
                            : undefined
                        }
                        tabIndex={
                          isJoinCommunity && !claimDisabled ? 0 : undefined
                        }
                        onClick={() => {
                          if (isJoinCommunity && !claimDisabled) {
                            handleClaimClick(item)
                          }
                        }}
                        onKeyDown={(event) => {
                          if (
                            isJoinCommunity &&
                            !claimDisabled &&
                            (event.key === 'Enter' || event.key === ' ')
                          ) {
                            event.preventDefault()
                            handleClaimClick(item)
                          }
                        }}
                        className={`grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${
                          isJoinCommunity && !claimDisabled
                            ? 'hover:bg-muted/40 cursor-pointer transition-colors'
                            : ''
                        }`}
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
                          {progressDescription ? (
                            <p className='text-muted-foreground mt-1 text-xs'>
                              {progressDescription}
                            </p>
                          ) : null}
                          {item.reason ? (
                            <p className='text-muted-foreground mt-1 text-xs'>
                              {t(item.reason)}
                            </p>
                          ) : null}
                        </div>
                        <div className='flex items-center justify-between gap-2 md:justify-end'>
                          <span className='text-sm font-semibold tabular-nums'>
                            {formatRewardItemQuota(item)}
                          </span>
                          <Button
                            type='button'
                            size='sm'
                            disabled={claimDisabled}
                            onClick={(event) => {
                              event.stopPropagation()
                              handleClaimClick(item)
                            }}
                          >
                            <CheckCircle2 className='size-4' />
                            {t('Claim')}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            ) : null}
          </div>

          {contentRewardItems.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('Content rewards')}</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-4'>
                <div className='grid gap-3'>
                  {contentRewardItems.map((item) => {
                    const enhanced = CONTENT_REWARD_COPY[item.code]
                    const Icon = enhanced?.icon || FileText
                    const introductionLines = rewardItemIntroductionLines(item)
                    return (
                      <div
                        key={item.code}
                        role='button'
                        tabIndex={0}
                        onClick={() => selectSubmissionItem(item.code)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            selectSubmissionItem(item.code)
                          }
                        }}
                        className={`bg-background hover:bg-muted/35 focus-visible:border-ring focus-visible:ring-ring/50 grid w-full gap-4 rounded-lg border p-4 text-start transition-colors focus-visible:ring-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start ${
                          submissionCode === item.code
                            ? 'border-primary/50 bg-primary/5'
                            : ''
                        }`}
                      >
                        <div className='min-w-0 space-y-3'>
                          <div className='flex flex-wrap items-start gap-3'>
                            <div className='bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg'>
                              <Icon className='text-muted-foreground size-4' />
                            </div>
                            <div className='min-w-0 flex-1 space-y-1.5'>
                              <div className='flex flex-wrap items-center gap-2'>
                                <h3 className='text-sm font-semibold'>
                                  {enhanced
                                    ? t(enhanced.title)
                                    : rewardItemTitle(item)}
                                </h3>
                                {enhanced?.badge ? (
                                  <Badge variant='secondary'>
                                    <Sparkles className='size-3' />
                                    {t(enhanced.badge)}
                                  </Badge>
                                ) : null}
                                {shouldShowContentRewardStatus(item) ? (
                                  <Badge variant={statusVariant(item.status)}>
                                    {t(item.status)}
                                  </Badge>
                                ) : null}
                              </div>
                              <p className='text-muted-foreground text-xs leading-5'>
                                {rewardItemDescription(item)}
                              </p>
                            </div>
                          </div>

                          {introductionLines.length > 0 ? (
                            <div className='space-y-2 border-l pl-4'>
                              <div className='text-xs font-medium'>
                                {t('Task introduction')}
                              </div>
                              <div className='text-muted-foreground space-y-1.5 text-xs leading-5'>
                                {introductionLines.map((line, index) => (
                                  <p key={`${line}-${index}`}>{t(line)}</p>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {item.reason ? (
                            <p className='text-muted-foreground text-xs'>
                              {t(item.reason)}
                            </p>
                          ) : null}

                          {docsLink ? (
                            <a
                              href={docsLink}
                              target='_blank'
                              rel='noreferrer'
                              onClick={(event) => event.stopPropagation()}
                              className='text-primary inline-flex w-fit items-center gap-1 text-xs font-medium hover:underline'
                            >
                              {t('Rules and examples')}
                              <ExternalLink className='size-3' />
                            </a>
                          ) : null}
                        </div>
                        <div className='flex items-center justify-between gap-3 md:flex-col md:items-end'>
                          <span className='text-muted-foreground text-xs'>
                            {t('Reward')}
                          </span>
                          <span className='text-sm font-semibold tabular-nums'>
                            {formatRewardItemQuota(item)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className='rounded-lg border p-4'>
                  <div className='mb-3 flex items-center gap-2 text-sm font-semibold'>
                    <FileText className='text-muted-foreground size-4' />
                    {t('Submit Promotion Proof')}
                  </div>
                  <div className='grid gap-3'>
                    <select
                      value={submissionCode}
                      onChange={(event) =>
                        setSubmissionCode(event.target.value)
                      }
                      className='border-input bg-background h-9 rounded-md border px-3 text-sm'
                    >
                      <option value=''>{t('Select a promotion item')}</option>
                      {contentRewardItems.map((item) => (
                        <option key={item.code} value={item.code}>
                          {rewardItemTitle(item)}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={submissionPlatform}
                      onChange={(event) =>
                        setSubmissionPlatform(event.target.value)
                      }
                      placeholder={t('Platform')}
                    />
                    <Input
                      value={submissionUrl}
                      onChange={(event) => setSubmissionUrl(event.target.value)}
                      placeholder={t('Content URL')}
                    />
                    <Textarea
                      value={submissionRemark}
                      onChange={(event) =>
                        setSubmissionRemark(event.target.value)
                      }
                      placeholder={t('Remark')}
                    />
                    <Button
                      type='button'
                      onClick={submitProof}
                      disabled={
                        status?.growth_submission_enabled !== true ||
                        !submissionCode ||
                        !submissionUrl ||
                        submitting
                      }
                    >
                      <Send className='size-4' />
                      {t('Submit for Review')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

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
                            {rewardRemark(reward)}
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

          {submissions.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('My submissions')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='divide-y rounded-lg border'>
                  {submissions.map((submission) => (
                    <div
                      key={submission.id}
                      className='grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'
                    >
                      <div className='min-w-0'>
                        <div className='truncate text-sm font-medium'>
                          {rewardItemTitle(submission.item_code)}
                        </div>
                        <div className='text-muted-foreground mt-1 flex min-w-0 items-center gap-1 truncate text-xs'>
                          <LinkIcon className='size-3 shrink-0' />
                          <span className='truncate'>
                            {submission.platform || '-'} ·{' '}
                            {formatTime(submission.created_at)}
                          </span>
                        </div>
                        {submission.review_note ? (
                          <div className='text-muted-foreground mt-1 text-xs'>
                            {submission.review_note}
                          </div>
                        ) : null}
                      </div>
                      <Badge variant={statusVariant(submission.status)}>
                        {t(submission.status)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
          <Dialog
            open={Boolean(passwordDialogItem)}
            onOpenChange={(open) => {
              if (!open) {
                setPasswordDialogItem(null)
                setTaskPassword('')
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('Enter task password')}</DialogTitle>
                <DialogDescription>
                  {t(
                    'Open the community link, complete the task, then enter the task password to claim the reward.'
                  )}
                </DialogDescription>
              </DialogHeader>
              <form
                className='grid gap-4'
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!passwordDialogItem || !taskPassword.trim()) return
                  claimRewardItem(passwordDialogItem.code, taskPassword.trim())
                }}
              >
                {passwordDialogItem?.action_url || docsLink ? (
                  <Button
                    variant='outline'
                    render={
                      <a
                        href={passwordDialogItem?.action_url || docsLink}
                        target='_blank'
                        rel='noreferrer'
                      />
                    }
                  >
                    <ExternalLink className='size-4' />
                    {t('Open community link')}
                  </Button>
                ) : null}
                <div className='relative'>
                  <KeyRound className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2' />
                  <Input
                    value={taskPassword}
                    onChange={(event) => setTaskPassword(event.target.value)}
                    placeholder={t('Enter the reward password after joining')}
                    className='pl-9'
                    autoFocus
                  />
                </div>
                <DialogFooter>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => {
                      setPasswordDialogItem(null)
                      setTaskPassword('')
                    }}
                    disabled={Boolean(claimingCode)}
                  >
                    {t('Cancel')}
                  </Button>
                  <Button
                    type='submit'
                    disabled={
                      !taskPassword.trim() ||
                      claimingCode === passwordDialogItem?.code
                    }
                  >
                    <CheckCircle2 className='size-4' />
                    {t('Confirm')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog
            open={Boolean(turnstileDialogItem)}
            onOpenChange={(open) => {
              if (!open) {
                setTurnstileDialogItem(null)
                setTurnstileWidgetKey((value) => value + 1)
              }
            }}
          >
            {turnstileDialogItem ? (
              <DialogContent className='sm:max-w-md'>
                <DialogHeader>
                  <DialogTitle>{t('Security Check')}</DialogTitle>
                  <DialogDescription>
                    {t('Please complete the security check to continue.')}
                  </DialogDescription>
                </DialogHeader>
                <div className='flex justify-center py-4'>
                  <Turnstile
                    key={turnstileWidgetKey}
                    siteKey={String(status?.turnstile_site_key || '')}
                    onVerify={(token) => {
                      claimRewardItem(
                        turnstileDialogItem.code,
                        undefined,
                        token
                      )
                    }}
                    onExpire={() => {
                      setTurnstileWidgetKey((value) => value + 1)
                    }}
                  />
                </div>
              </DialogContent>
            ) : null}
          </Dialog>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
