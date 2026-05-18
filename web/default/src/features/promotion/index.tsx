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
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BadgeCheck,
  Banknote,
  BookOpenText,
  Check,
  Coins,
  Copy,
  Gift,
  History,
  LinkIcon,
  Megaphone,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
  Users,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api, getSelf } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { CopyButton } from '@/components/copy-button'
import { SectionPageLayout } from '@/components/layout'
import {
  formatTime,
  formatCashCents,
  getItems,
  type GrowthSummary,
  type InvitationRebate,
  type InvitationRecord,
  type PromotionCommissionLedger,
  type PromotionEvent,
  type PromotionWithdrawal,
  statusVariant,
} from '@/features/growth/shared'
import { TransferDialog } from '@/features/wallet/components/dialogs/transfer-dialog'
import { useAffiliate } from '@/features/wallet/hooks'
import type { UserWalletData } from '@/features/wallet/types'

const COPY_TEMPLATES = [
  {
    key: 'community',
    title: 'Community copy',
    text: 'I am using this API aggregation service. It supports unified API keys, OpenAI-compatible calls, multi-provider routing, and balance management. Register with my referral link: {{link}}',
  },
  {
    key: 'article',
    title: 'Article copy',
    text: 'This article uses this API service as the example platform. It supports OpenAI-compatible APIs, multi-model access, and unified billing. You can register and create an API key here: {{link}}',
  },
  {
    key: 'video',
    title: 'Video copy',
    text: 'API platform used in this video: {{link}}. Register, create an API key, and test models through the unified API interface.',
  },
] as const

const PROMOTION_CASES = [
  'Write a tutorial that shows how to create an API key and complete the first request.',
  'Publish a video walkthrough and place the referral link in the video description.',
  'Add the referral link to a project README or integration documentation.',
  'Submit the site to navigation directories, tool lists, or friendly links.',
] as const

const PROMOTION_RULES = [
  'Users must register through your referral link or referral code to become promotion customers.',
  'Self-invites, abnormal same-device registrations, refunded orders, and risk-control orders do not generate valid rebates.',
  'Rebates enter pending settlement first and can be transferred to balance after settlement.',
  'Early promotion rewards only support transfer to site balance and do not support withdrawal.',
] as const

const STATUS_GUIDE = [
  [
    'pending',
    'Waiting for settlement or risk review, cannot be transferred yet.',
  ],
  ['settled', 'Settled and ready to transfer to site balance.'],
  ['transferred', 'Already transferred to site balance.'],
  ['frozen', 'Temporarily frozen because the account or order needs review.'],
  ['reversed', 'Reversed because the related order was refunded.'],
  ['rejected', 'Rejected because it does not meet promotion rules.'],
] as const

const PROMOTION_EVENT_TITLES: Record<string, string> = {
  invitation_register_reward: 'Invitation registration reward',
  invitation_first_request_reward: 'Invitation first request reward',
  invitation_first_topup_reward: 'Invitation first top-up reward',
  commission_pending: 'Cash commission pending settlement',
  commission_settled: 'Cash commission settled',
  commission_transferred: 'Cash commission transferred to balance',
  promotion_reward_transferred: 'Promotion reward transferred to balance',
  commission_withdraw_submitted: 'Cash withdrawal request submitted',
  commission_withdraw_approved: 'Cash withdrawal request approved',
  commission_withdraw_rejected: 'Cash withdrawal request rejected',
  commission_withdraw_paid: 'Cash withdrawal paid',
  commission_reversed: 'Cash commission reversed',
  growth_reward_settled: 'Growth reward settled',
}

function formatPercentage(value: number | string | undefined) {
  const percentage = Number.parseFloat(String(value ?? 0))
  if (!Number.isFinite(percentage)) return '0%'
  return `${percentage.toFixed(2).replace(/\.?0+$/, '')}%`
}

function getRebateActionLabel(rebate: InvitationRebate) {
  if (!rebate.reward_type) return 'Ongoing rebate'
  if (rebate.reward_type === 'register') return 'Registered'
  if (rebate.reward_type === 'first_request') return 'First API request reward'
  if (rebate.reward_type === 'first_topup') return 'First top-up reward'
  return rebate.reward_type
}

export function PromotionCenter() {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()
  const [summary, setSummary] = useState<GrowthSummary | null>(null)
  const [user, setUser] = useState<UserWalletData | null>(null)
  const [inviteRecords, setInviteRecords] = useState<InvitationRecord[]>([])
  const [rebates, setRebates] = useState<InvitationRebate[]>([])
  const [commissionLedgers, setCommissionLedgers] = useState<
    PromotionCommissionLedger[]
  >([])
  const [withdrawals, setWithdrawals] = useState<PromotionWithdrawal[]>([])
  const [promotionEvents, setPromotionEvents] = useState<PromotionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [transferOpen, setTransferOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [cashActionLoading, setCashActionLoading] = useState(false)
  const [payoutMethod, setPayoutMethod] = useState('alipay')
  const [payoutAccount, setPayoutAccount] = useState('')
  const [payoutRemark, setPayoutRemark] = useState('')
  const { affiliateCode, affiliateLink, transferQuota, transferring } =
    useAffiliate()

  const effectiveCustomers = useMemo(
    () =>
      inviteRecords.filter(
        (record) =>
          record.first_request_completed ||
          record.first_topup_completed ||
          Number(record.total_contribution_rebate || 0) > 0
      ).length,
    [inviteRecords]
  )

  const pendingRebateQuota = useMemo(
    () =>
      rebates
        .filter((rebate) => rebate.status === 'pending')
        .reduce(
          (sum, rebate) =>
            sum + Number(rebate.rebate_quota || rebate.reward_quota || 0),
          0
        ),
    [rebates]
  )

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [
        userRes,
        summaryRes,
        inviteRecordsRes,
        rebatesRes,
        rewardsRes,
        commissionRes,
        withdrawalRes,
        eventRes,
      ] = await Promise.all([
        getSelf(),
        api.get('/api/growth/summary'),
        api.get('/api/user/aff/records', { params: { page_size: 20 } }),
        api.get('/api/user/aff/rebates', { params: { page_size: 20 } }),
        api.get('/api/user/aff/rewards', { params: { page_size: 20 } }),
        api.get('/api/growth/commissions', { params: { page_size: 20 } }),
        api.get('/api/growth/withdrawals', { params: { page_size: 20 } }),
        api.get('/api/growth/events', { params: { page_size: 30 } }),
      ])
      if (userRes.success && userRes.data) {
        setUser(userRes.data as UserWalletData)
      }
      setSummary(summaryRes.data?.data || null)
      setInviteRecords(getItems<InvitationRecord>(inviteRecordsRes.data))
      setRebates(
        [
          ...getItems<InvitationRebate>(rebatesRes.data),
          ...getItems<InvitationRebate>(rewardsRes.data),
        ].sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))
      )
      setCommissionLedgers(
        getItems<PromotionCommissionLedger>(commissionRes.data)
      )
      setWithdrawals(getItems<PromotionWithdrawal>(withdrawalRes.data))
      setPromotionEvents(getItems<PromotionEvent>(eventRes.data))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const copyTemplate = async (template: string) => {
    await copyToClipboard(t(template, { link: affiliateLink || '-' }))
  }

  const handleTransfer = async (quota: number) => {
    const ok = await transferQuota(quota)
    if (ok) await loadData()
    return ok
  }

  const cashSummary = summary?.cash_commission
  const availableCashCents = cashSummary?.available_amount_cents || 0
  const cashCurrency = cashSummary?.currency || 'CNY'

  const handleTransferCash = async () => {
    try {
      setCashActionLoading(true)
      const res = await api.post('/api/growth/commissions/transfer')
      if (res.data?.success) {
        toast.success(t('Cash commission transferred to balance'))
        await loadData()
      }
    } finally {
      setCashActionLoading(false)
    }
  }

  const handleSubmitWithdrawal = async () => {
    try {
      setCashActionLoading(true)
      const res = await api.post('/api/growth/withdrawals', {
        payout_method: payoutMethod,
        payout_account: payoutAccount,
        remark: payoutRemark,
      })
      if (res.data?.success) {
        toast.success(t('Withdrawal request submitted'))
        setWithdrawOpen(false)
        setPayoutAccount('')
        setPayoutRemark('')
        await loadData()
      }
    } finally {
      setCashActionLoading(false)
    }
  }

  const stats = [
    [
      t('Monthly rebate'),
      formatQuota(summary?.monthly_rebate_quota || 0),
      Coins,
    ],
    [
      t('Total rebate'),
      formatQuota(user?.aff_history_quota ?? summary?.total_rebate_quota ?? 0),
      Gift,
    ],
    [t('Pending rebate'), formatQuota(pendingRebateQuota), ShieldCheck],
    [
      t('Withdrawable cash'),
      formatCashCents(availableCashCents, cashCurrency),
      Banknote,
    ],
    [t('Transferable rebate'), formatQuota(user?.aff_quota ?? 0), Wallet],
    [
      t('Invited users'),
      String(user?.aff_count ?? summary?.invite_count ?? 0),
      Users,
    ],
    [t('Effective customers'), String(effectiveCustomers), BadgeCheck],
  ] as const

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {t('Promotion Center')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Description>
          {t('Manage your referral link, rewards, and rebate records.')}
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
          <div className='mx-auto grid w-full max-w-7xl items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]'>
            <aside className='grid gap-3 xl:sticky xl:top-0 xl:self-start'>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='flex items-center gap-2 text-base'>
                    <Wallet className='text-muted-foreground size-4' />
                    {t('My promotion income')}
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div>
                    <div className='text-muted-foreground text-xs'>
                      {t('Transferable rebate')}
                    </div>
                    <div className='mt-1 text-2xl font-semibold tabular-nums'>
                      {formatQuota(user?.aff_quota ?? 0)}
                    </div>
                    <p className='text-muted-foreground mt-1 text-xs'>
                      {t(
                        'Settled rebates can be transferred to site balance for API usage.'
                      )}
                    </p>
                  </div>
                  <div className='grid grid-cols-2 gap-3 text-sm'>
                    <SideMetric
                      label={t('Pending rebate')}
                      value={formatQuota(pendingRebateQuota)}
                    />
                    <SideMetric
                      label={t('Total rebate')}
                      value={formatQuota(user?.aff_history_quota ?? 0)}
                    />
                    <SideMetric
                      label={t('Withdrawable cash')}
                      value={formatCashCents(availableCashCents, cashCurrency)}
                    />
                    <SideMetric
                      label={t('Invited users')}
                      value={String(user?.aff_count ?? 0)}
                    />
                    <SideMetric
                      label={t('Effective customers')}
                      value={String(effectiveCustomers)}
                    />
                  </div>
                  <Button
                    type='button'
                    className='w-full'
                    onClick={() => setTransferOpen(true)}
                    disabled={(user?.aff_quota ?? 0) <= 0}
                  >
                    <Wallet className='size-4' />
                    {t('Transfer to Balance')}
                  </Button>
                  <div className='grid grid-cols-2 gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={handleTransferCash}
                      disabled={availableCashCents <= 0 || cashActionLoading}
                    >
                      <Wallet className='size-4' />
                      {t('Cash to Balance')}
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => setWithdrawOpen(true)}
                      disabled={availableCashCents <= 0 || cashActionLoading}
                    >
                      <Banknote className='size-4' />
                      {t('Withdraw cash')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='flex items-center gap-2 text-base'>
                    <LinkIcon className='text-muted-foreground size-4' />
                    {t('My promotion link')}
                  </CardTitle>
                </CardHeader>
                <CardContent className='grid gap-3'>
                  <FieldWithCopy
                    label={t('Referral link')}
                    value={affiliateLink}
                    tooltip={t('Copy referral link')}
                  />
                  <FieldWithCopy
                    label={t('Referral code')}
                    value={affiliateCode || summary?.aff_code || '-'}
                    tooltip={t('Copy referral code')}
                  />
                  <div className='grid grid-cols-2 gap-2'>
                    {COPY_TEMPLATES.slice(0, 2).map((template) => (
                      <Button
                        key={template.key}
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => copyTemplate(template.text)}
                        disabled={!affiliateLink}
                      >
                        <Copy className='size-4' />
                        {t(template.title)}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <InfoCard
                icon={BookOpenText}
                title={t('Quick notes')}
                items={[
                  t(
                    'Settled rebates can be transferred to site balance for API usage.'
                  ),
                  t(
                    'Promotion records help you track customers, rebates, and review progress.'
                  ),
                ]}
              />
            </aside>

            <main className='min-w-0 space-y-4'>
              <Card>
                <CardContent className='space-y-5 p-4 sm:p-5'>
                  <div className='space-y-2'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Badge variant='secondary' className='gap-1.5'>
                        <Megaphone className='size-3.5' />
                        {t('Promotion and membership')}
                      </Badge>
                      {summary?.invite_rebate_percent ? (
                        <Badge variant='outline'>
                          {t('Rebate rate {{rate}}%', {
                            rate: summary.invite_rebate_percent,
                          })}
                        </Badge>
                      ) : null}
                    </div>
                    <h2 className='text-lg font-semibold sm:text-xl'>
                      {t(
                        'Invite real users and help them complete their first API call.'
                      )}
                    </h2>
                    <p className='text-muted-foreground text-sm leading-6'>
                      {t(
                        'Users who register through your link become your promotion customers. When they complete valid usage or payments, eligible rebates enter settlement and can later be transferred to your account balance.'
                      )}
                    </p>
                  </div>

                  <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
                    {stats.map(([label, value, Icon]) => (
                      <div
                        key={label}
                        className='bg-muted/20 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border p-3'
                      >
                        <div className='bg-background flex size-9 items-center justify-center rounded-lg border'>
                          <Icon className='text-muted-foreground size-4' />
                        </div>
                        <div className='min-w-0'>
                          <div className='text-muted-foreground truncate text-xs'>
                            {label}
                          </div>
                          <div className='truncate text-sm font-semibold tabular-nums'>
                            {value}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <Tabs defaultValue='info'>
                  <CardHeader className='gap-3 border-b pb-3'>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                      <CardTitle>{t('Promotion workspace')}</CardTitle>
                      <TabsList className='w-full flex-wrap justify-start sm:w-fit'>
                        <TabsTrigger value='info'>
                          {t('Promotion info')}
                        </TabsTrigger>
                        <TabsTrigger value='rebates'>
                          {t('Rebate details')}
                        </TabsTrigger>
                        <TabsTrigger value='cash'>
                          {t('Cash ledger')}
                        </TabsTrigger>
                        <TabsTrigger value='timeline'>
                          {t('Reward timeline')}
                        </TabsTrigger>
                        <TabsTrigger value='withdrawals'>
                          {t('Withdrawals')}
                        </TabsTrigger>
                        <TabsTrigger value='customers'>
                          {t('My customers')}
                        </TabsTrigger>
                      </TabsList>
                    </div>
                  </CardHeader>
                  <CardContent className='min-h-[560px] p-4 sm:p-5'>
                    <TabsContent value='info' className='m-0 space-y-5'>
                      <SectionBlock
                        icon={ShieldCheck}
                        title={t('Promotion rules')}
                      >
                        <ol className='text-muted-foreground list-decimal space-y-1.5 ps-5 text-sm leading-6'>
                          {PROMOTION_RULES.map((rule) => (
                            <li key={rule}>{t(rule)}</li>
                          ))}
                        </ol>
                      </SectionBlock>

                      <SectionBlock
                        icon={Sparkles}
                        title={t('Excellent promotion examples')}
                      >
                        <ul className='text-muted-foreground list-disc space-y-1.5 ps-5 text-sm leading-6'>
                          {PROMOTION_CASES.map((item) => (
                            <li key={item}>{t(item)}</li>
                          ))}
                        </ul>
                      </SectionBlock>

                      <SectionBlock
                        icon={MessageSquareText}
                        title={t('Common promotion methods')}
                      >
                        <ul className='text-muted-foreground list-disc space-y-1.5 ps-5 text-sm leading-6'>
                          <li>
                            {t(
                              'Place the referral link in API tutorials, usage notes, and integration articles.'
                            )}
                          </li>
                          <li>
                            {t(
                              'Put the link in video descriptions, pinned comments, and course materials.'
                            )}
                          </li>
                          <li>
                            {t(
                              'Share real usage experience in developer communities and private groups.'
                            )}
                          </li>
                          <li>
                            {t(
                              'Add the link to README files, product docs, navigation sites, or backlink pages.'
                            )}
                          </li>
                        </ul>
                      </SectionBlock>

                      <SectionBlock icon={Copy} title={t('Promotion copy')}>
                        <div className='grid gap-3'>
                          {COPY_TEMPLATES.map((template) => (
                            <div
                              key={template.key}
                              className='rounded-lg border p-3'
                            >
                              <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                                <div className='text-sm font-medium'>
                                  {t(template.title)}
                                </div>
                                <Button
                                  type='button'
                                  size='sm'
                                  variant='outline'
                                  onClick={() => copyTemplate(template.text)}
                                  disabled={!affiliateLink}
                                >
                                  <Copy className='size-4' />
                                  {t('Copy')}
                                </Button>
                              </div>
                              <p className='text-muted-foreground bg-muted/40 rounded-md p-2 text-xs leading-5'>
                                {t(template.text, {
                                  link: affiliateLink || '-',
                                })}
                              </p>
                            </div>
                          ))}
                        </div>
                      </SectionBlock>
                    </TabsContent>

                    <TabsContent value='rebates' className='m-0 space-y-4'>
                      <StatusGuide />
                      <div className='divide-y rounded-lg border'>
                        {rebates.length > 0 ? (
                          rebates.map((rebate) => (
                            <div
                              key={`${rebate.reward_type || 'rebate'}-${rebate.id}`}
                              className='grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center'
                            >
                              <div className='min-w-0'>
                                <div className='truncate text-sm font-medium'>
                                  {rebate.invitee_name ||
                                    (rebate.invitee_id
                                      ? `#${rebate.invitee_id}`
                                      : '-')}
                                </div>
                                <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs'>
                                  <span>{formatTime(rebate.created_at)}</span>
                                  {rebate.top_up_money ? (
                                    <span>
                                      {t('Top-up')}:{' '}
                                      {Number(rebate.top_up_money || 0).toFixed(2)}
                                    </span>
                                  ) : null}
                                  {rebate.rebate_percentage ? (
                                    <span>
                                      {t('Rate')}:{' '}
                                      {formatPercentage(rebate.rebate_percentage)}
                                    </span>
                                  ) : null}
                                  {rebate.payment_provider ? (
                                    <span>
                                      {t('Payment')}: {rebate.payment_provider}
                                    </span>
                                  ) : null}
                                  {rebate.status === 'pending' ? (
                                    <span>
                                      {t('Settle after')}:{' '}
                                      {formatTime(rebate.settle_after)}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <Badge variant='outline'>
                                {t(getRebateActionLabel(rebate))}
                              </Badge>
                              <Badge variant={statusVariant(rebate.status || '')}>
                                {t(rebate.status || '-')}
                              </Badge>
                              <div className='text-sm font-semibold tabular-nums'>
                                {formatQuota(
                                  Number(
                                    rebate.rebate_quota ||
                                      rebate.reward_quota ||
                                      0
                                  )
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <EmptyText text={t('No rebate records')} />
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value='cash' className='m-0 space-y-3'>
                      <div className='divide-y rounded-lg border'>
                        {commissionLedgers.length > 0 ? (
                          commissionLedgers.map((ledger) => (
                            <div
                              key={ledger.id}
                              className='grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center'
                            >
                              <div className='min-w-0'>
                                <div className='truncate text-sm font-medium'>
                                  {t('Top-up rebate cash commission')}
                                </div>
                                <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs'>
                                  <span>{formatTime(ledger.created_at)}</span>
                                  {ledger.source_trade_no ? (
                                    <span className='font-mono'>
                                      {ledger.source_trade_no}
                                    </span>
                                  ) : null}
                                  <span>
                                    {t('Quota equivalent')}:{' '}
                                    {formatQuota(ledger.quota_equivalent || 0)}
                                  </span>
                                </div>
                              </div>
                              <Badge variant={statusVariant(ledger.status)}>
                                {t(ledger.status)}
                              </Badge>
                              <div className='text-sm font-semibold tabular-nums'>
                                {formatCashCents(
                                  ledger.net_amount_cents,
                                  ledger.currency
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <EmptyText text={t('No cash commission records')} />
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value='timeline' className='m-0 space-y-3'>
                      <div className='divide-y rounded-lg border'>
                        {promotionEvents.length > 0 ? (
                          promotionEvents.map((event) => (
                            <PromotionEventRow key={event.id} event={event} />
                          ))
                        ) : (
                          <EmptyText text={t('No reward events')} />
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value='withdrawals' className='m-0 space-y-3'>
                      <div className='divide-y rounded-lg border'>
                        {withdrawals.length > 0 ? (
                          withdrawals.map((withdrawal) => (
                            <div
                              key={withdrawal.id}
                              className='grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center'
                            >
                              <div className='min-w-0'>
                                <div className='truncate text-sm font-medium'>
                                  {withdrawal.payout_method || '-'}
                                </div>
                                <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs'>
                                  <span>{formatTime(withdrawal.applied_at)}</span>
                                  {withdrawal.trade_no ? (
                                    <span className='font-mono'>
                                      {withdrawal.trade_no}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <Badge variant={statusVariant(withdrawal.status)}>
                                {t(withdrawal.status)}
                              </Badge>
                              <div className='text-sm font-semibold tabular-nums'>
                                {formatCashCents(
                                  withdrawal.net_amount_cents,
                                  withdrawal.currency
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <EmptyText text={t('No withdrawal records')} />
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value='customers' className='m-0 space-y-3'>
                      <div className='grid gap-3'>
                        {inviteRecords.length > 0 ? (
                          inviteRecords.map((record) => (
                            <CustomerJourneyCard
                              key={record.user_id}
                              record={record}
                            />
                          ))
                        ) : (
                          <EmptyText text={t('No referral records')} />
                        )}
                      </div>
                    </TabsContent>

                  </CardContent>
                </Tabs>
              </Card>
            </main>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        onConfirm={handleTransfer}
        availableQuota={user?.aff_quota ?? 0}
        transferring={transferring}
      />

      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Withdraw cash commission')}</DialogTitle>
            <DialogDescription>
              {t('All settled cash commission will be locked for review.')}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-3'>
            <div className='rounded-lg border p-3'>
              <div className='text-muted-foreground text-xs'>
                {t('Withdrawable cash')}
              </div>
              <div className='mt-1 text-lg font-semibold tabular-nums'>
                {formatCashCents(availableCashCents, cashCurrency)}
              </div>
            </div>
            <div className='grid gap-1.5'>
              <label className='text-sm font-medium'>{t('Payout method')}</label>
              <Input
                value={payoutMethod}
                onChange={(event) => setPayoutMethod(event.target.value)}
                placeholder='alipay / wechat / bank'
              />
            </div>
            <div className='grid gap-1.5'>
              <label className='text-sm font-medium'>{t('Payout account')}</label>
              <Input
                value={payoutAccount}
                onChange={(event) => setPayoutAccount(event.target.value)}
              />
            </div>
            <div className='grid gap-1.5'>
              <label className='text-sm font-medium'>{t('Remark')}</label>
              <Textarea
                value={payoutRemark}
                onChange={(event) => setPayoutRemark(event.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setWithdrawOpen(false)}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='button'
              onClick={handleSubmitWithdrawal}
              disabled={
                cashActionLoading ||
                availableCashCents <= 0 ||
                !payoutMethod.trim() ||
                !payoutAccount.trim()
              }
            >
              {t('Submit withdrawal')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function SideMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className='bg-muted/20 rounded-lg border p-2'>
      <div className='text-muted-foreground truncate text-xs'>{label}</div>
      <div className='mt-1 truncate text-sm font-semibold tabular-nums'>
        {value}
      </div>
    </div>
  )
}

function FieldWithCopy({
  label,
  value,
  tooltip,
}: {
  label: string
  value: string
  tooltip: string
}) {
  return (
    <div className='grid gap-1.5'>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div className='flex gap-2'>
        <Input value={value} readOnly className='font-mono text-xs' />
        <CopyButton
          value={value}
          variant='outline'
          className='size-9 shrink-0'
          tooltip={tooltip}
          aria-label={tooltip}
        />
      </div>
    </div>
  )
}

function InfoCard({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof BookOpenText
  title: string
  items: string[]
}) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='flex items-center gap-2 text-base'>
          <Icon className='text-muted-foreground size-4' />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className='text-muted-foreground list-decimal space-y-1.5 ps-4 text-xs leading-5'>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

function SectionBlock({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof BookOpenText
  title: string
  children: ReactNode
}) {
  return (
    <div className='rounded-lg border p-4'>
      <div className='mb-3 flex items-center gap-2 text-sm font-semibold'>
        <Icon className='text-muted-foreground size-4' />
        {title}
      </div>
      {children}
    </div>
  )
}

function StatusGuide() {
  const { t } = useTranslation()
  return (
    <div className='bg-muted/20 grid gap-2 rounded-lg border p-3 sm:grid-cols-2'>
      {STATUS_GUIDE.map(([status, description]) => (
        <div key={status} className='flex items-start gap-2'>
          <Badge variant={statusVariant(status)}>{t(status)}</Badge>
          <p className='text-muted-foreground text-xs leading-5'>
            {t(description)}
          </p>
        </div>
      ))}
    </div>
  )
}

function PromotionEventRow({ event }: { event: PromotionEvent }) {
  const { t } = useTranslation()
  const quotaDelta = Number(event.quota_delta || 0)
  const cashAmountCents = Number(event.cash_amount_cents || 0)
  const title = PROMOTION_EVENT_TITLES[event.event_type] || event.title || event.event_type
  const amountParts = [
    quotaDelta !== 0
      ? `${quotaDelta > 0 ? '+' : ''}${formatQuota(quotaDelta)}`
      : '',
    cashAmountCents !== 0
      ? `${cashAmountCents > 0 ? '+' : ''}${formatCashCents(
          cashAmountCents,
          event.currency || 'CNY'
        )}`
      : '',
  ].filter(Boolean)

  return (
    <div className='grid gap-2 p-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start'>
      <div className='bg-muted/30 flex size-9 items-center justify-center rounded-lg border'>
        <History className='text-muted-foreground size-4' />
      </div>
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2'>
          <div className='truncate text-sm font-medium'>{t(title)}</div>
          {event.status ? (
            <Badge variant={statusVariant(event.status)}>
              {t(event.status)}
            </Badge>
          ) : null}
        </div>
        <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs'>
          <span>{formatTime(event.created_at)}</span>
          {event.source_table ? (
            <span>
              {event.source_table}
              {event.source_id ? ` #${event.source_id}` : ''}
            </span>
          ) : null}
          {event.remark ? <span>{event.remark}</span> : null}
        </div>
      </div>
      <div className='text-sm font-semibold tabular-nums md:text-right'>
        {amountParts.length > 0 ? amountParts.join(' / ') : '-'}
      </div>
    </div>
  )
}

function CustomerJourneyCard({ record }: { record: InvitationRecord }) {
  const { t } = useTranslation()
  const displayName = record.display_name || record.username || '-'
  const userHandle =
    record.display_name && record.username ? `@${record.username}` : `#${record.user_id}`
  const firstRequestReward = Number(record.first_request_reward_quota || 0)
  const firstTopUpReward = Number(record.first_topup_reward_quota || 0)
  const registerRuleReward = Number(record.register_reward_quota || 0)
  const firstRequestRuleReward = Number(
    record.first_request_rule_reward_quota || firstRequestReward || 0
  )
  const firstTopUpRuleReward = Number(
    record.first_topup_rule_reward_quota || firstTopUpReward || 0
  )
  const inviteRebatePercentage = Number(record.invite_rebate_percentage || 0)
  const totalRebateQuota = Number(record.total_rebate_quota || 0)
  const totalPromotionQuota =
    firstRequestReward + firstTopUpReward + totalRebateQuota
  const steps = [
    {
      key: 'registered',
      label: t('Registered'),
      done: true,
      value: formatQuota(registerRuleReward),
      configured: registerRuleReward > 0,
    },
    {
      key: 'first_request',
      label: t('First API request'),
      done: Boolean(record.first_request_completed),
      value: formatQuota(firstRequestRuleReward),
      configured: firstRequestRuleReward > 0,
    },
    {
      key: 'first_topup',
      label: t('First top-up'),
      done: Boolean(record.first_topup_completed),
      value: formatQuota(firstTopUpRuleReward),
      configured: firstTopUpRuleReward > 0,
    },
    {
      key: 'rebate',
      label: t('Ongoing rebate'),
      done: totalRebateQuota > 0,
      value: t('{{rate}}% rebate', { rate: inviteRebatePercentage }),
      configured: inviteRebatePercentage > 0,
    },
  ].filter((step) => step.configured)
  const stepGridColumnsClass =
    {
      1: 'sm:grid-cols-1',
      2: 'sm:grid-cols-2',
      3: 'sm:grid-cols-3',
      4: 'sm:grid-cols-4',
    }[steps.length] || 'sm:grid-cols-4'

  return (
    <div className='bg-card rounded-lg border p-3 shadow-xs sm:p-4'>
      <div className='grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='truncate text-sm font-semibold'>{displayName}</div>
            <Badge variant='outline' className='font-mono text-[11px]'>
              {userHandle}
            </Badge>
          </div>
          <div className='text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
            <span>
              {t('Top-up amount')}: {Number(record.total_topup_amount || 0).toFixed(2)}
            </span>
            <span>
              {t('Requests')}: {record.request_count || 0}
            </span>
            <span>{formatTime(record.created_at)}</span>
          </div>
        </div>

        <div className='grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:min-w-80'>
          <JourneyMetric
            label={t('Conversion rewards')}
            value={formatQuota(firstRequestReward + firstTopUpReward)}
          />
          <JourneyMetric
            label={t('Rebate contribution')}
            value={formatQuota(totalRebateQuota)}
          />
          <JourneyMetric
            label={t('Total contribution')}
            value={formatQuota(totalPromotionQuota)}
          />
        </div>
      </div>

      {steps.length > 0 ? (
        <div className='mt-4 flex justify-center'>
          <div
            className={[
              'grid w-full gap-2 sm:w-5/6 md:w-4/5 xl:w-3/4',
              stepGridColumnsClass,
            ].join(' ')}
          >
            {steps.map((step, index) => (
              <div
                key={step.key}
                className='relative grid grid-cols-[auto_minmax(0,1fr)] gap-2 sm:block'
              >
                {index > 0 ? (
                  <div className='bg-border absolute top-4 right-[calc(50%+1rem)] left-[-50%] hidden h-px sm:block' />
                ) : null}
                <div
                  className={[
                    'relative z-10 flex size-8 items-center justify-center rounded-full border text-xs sm:mx-auto',
                    step.done
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  {step.done ? (
                    <Check className='size-4' />
                  ) : (
                    <Zap className='size-4' />
                  )}
                </div>
                <div className='min-w-0 sm:mt-2 sm:text-center'>
                  <div className='truncate text-xs font-medium'>
                    {step.label}
                  </div>
                  <div className='text-muted-foreground mt-0.5 truncate text-[11px]'>
                    {step.value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function JourneyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className='bg-muted/20 rounded-lg border p-2'>
      <div className='text-muted-foreground truncate'>{label}</div>
      <div className='mt-1 truncate font-semibold tabular-nums'>{value}</div>
    </div>
  )
}

function EmptyText({ text }: { text: string }) {
  return (
    <div className='text-muted-foreground p-8 text-center text-sm'>{text}</div>
  )
}
