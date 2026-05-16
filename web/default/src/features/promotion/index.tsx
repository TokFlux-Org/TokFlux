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
import type { ReactNode } from 'react'
import {
  BadgeCheck,
  BookOpenText,
  Coins,
  Copy,
  FileText,
  Gift,
  LinkIcon,
  Megaphone,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api, getSelf } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useStatus } from '@/hooks/use-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { CopyButton } from '@/components/copy-button'
import { SectionPageLayout } from '@/components/layout'
import {
  formatTime,
  getItems,
  rewardItemCopy,
  statusVariant,
  type GrowthRewardItem,
  type GrowthSubmission,
  type GrowthSummary,
  type InvitationRebate,
  type InvitationRecord,
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
  'Content promotion rewards require manual review before they are issued.',
] as const

const STATUS_GUIDE = [
  [
    'pending',
    'Waiting for settlement or risk review, cannot be transferred yet.',
  ],
  ['settled', 'Settled and ready to transfer to site balance.'],
  ['transferred', 'Already transferred to site balance.'],
  ['frozen', 'Temporarily frozen because the account or order needs review.'],
  ['rejected', 'Rejected because it does not meet promotion rules.'],
] as const

export function PromotionCenter() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { copyToClipboard } = useCopyToClipboard()
  const [summary, setSummary] = useState<GrowthSummary | null>(null)
  const [user, setUser] = useState<UserWalletData | null>(null)
  const [rewardItems, setRewardItems] = useState<GrowthRewardItem[]>([])
  const [submissions, setSubmissions] = useState<GrowthSubmission[]>([])
  const [inviteRecords, setInviteRecords] = useState<InvitationRecord[]>([])
  const [rebates, setRebates] = useState<InvitationRebate[]>([])
  const [loading, setLoading] = useState(true)
  const [submissionCode, setSubmissionCode] = useState('')
  const [submissionPlatform, setSubmissionPlatform] = useState('')
  const [submissionUrl, setSubmissionUrl] = useState('')
  const [submissionRemark, setSubmissionRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const { affiliateCode, affiliateLink, transferQuota, transferring } =
    useAffiliate()

  const promotionItems = useMemo(
    () =>
      rewardItems.filter(
        (item) => item.item_type !== 'auto' && item.status !== 'completed'
      ),
    [rewardItems]
  )

  const effectiveCustomers = useMemo(
    () =>
      inviteRecords.filter(
        (record) => Number(record.total_contribution_rebate || 0) > 0
      ).length,
    [inviteRecords]
  )

  const pendingRebateQuota = useMemo(
    () =>
      rebates
        .filter((rebate) => rebate.status === 'pending')
        .reduce((sum, rebate) => sum + Number(rebate.rebate_quota || 0), 0),
    [rebates]
  )

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [
        userRes,
        summaryRes,
        rewardItemsRes,
        submissionsRes,
        inviteRecordsRes,
        rebatesRes,
      ] = await Promise.all([
        getSelf(),
        api.get('/api/growth/summary'),
        api.get('/api/growth/items'),
        api.get('/api/growth/submissions', { params: { page_size: 20 } }),
        api.get('/api/user/aff/records', { params: { page_size: 20 } }),
        api.get('/api/user/aff/rebates', { params: { page_size: 20 } }),
      ])
      if (userRes.success && userRes.data) {
        setUser(userRes.data as UserWalletData)
      }
      setSummary(summaryRes.data?.data || null)
      setRewardItems(rewardItemsRes.data?.data || [])
      setSubmissions(getItems<GrowthSubmission>(submissionsRes.data))
      setInviteRecords(getItems<InvitationRecord>(inviteRecordsRes.data))
      setRebates(getItems<InvitationRebate>(rebatesRes.data))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

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

  const copyTemplate = async (template: string) => {
    await copyToClipboard(t(template, { link: affiliateLink || '-' }))
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

  const handleTransfer = async (quota: number) => {
    const ok = await transferQuota(quota)
    if (ok) await loadData()
    return ok
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
          {t(
            'A promotion workspace for referral links, content rewards, rebate records, and customer conversion.'
          )}
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
          <div className='mx-auto grid w-full max-w-7xl gap-4 xl:grid-cols-[360px_minmax(0,1fr)]'>
            <aside className='grid h-fit gap-3 xl:sticky xl:top-4'>
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
                title={t('What promotion rewards can do')}
                items={[
                  t(
                    'Referral rebates can be transferred to site balance after settlement.'
                  ),
                  t('Balance can be used for API calls and model usage.'),
                  t(
                    'Content rewards encourage tutorials, videos, backlinks, and useful external exposure.'
                  ),
                  t(
                    'Promotion records help you track customers, rebates, and review progress.'
                  ),
                ]}
              />

              <InfoCard
                icon={Sparkles}
                title={t('How to earn promotion rewards')}
                items={[
                  t(
                    'Share your referral link in tutorials, videos, communities, or documents.'
                  ),
                  t(
                    'Guide new users to register, create an API key, and complete the first successful request.'
                  ),
                  t(
                    'Referred users generate rebates after valid usage or payments.'
                  ),
                  t(
                    'Submit content promotion proof and wait for manual review.'
                  ),
                ]}
              />

              <InfoCard
                icon={Megaphone}
                title={t('Excellent promotion examples')}
                items={PROMOTION_CASES.map((item) => t(item))}
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
                        'Users who register through your link become your promotion customers. Qualified usage and payments generate rebates, while high-quality tutorials, videos, and backlinks can receive additional promotion rewards.'
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

                  <div className='rounded-lg border p-3'>
                    <div className='mb-2 flex items-center gap-2 text-sm font-medium'>
                      <ShieldCheck className='text-muted-foreground size-4' />
                      {t('Promotion rules')}
                    </div>
                    <ol className='text-muted-foreground list-decimal space-y-1.5 ps-5 text-xs leading-5'>
                      {PROMOTION_RULES.map((rule) => (
                        <li key={rule}>{t(rule)}</li>
                      ))}
                    </ol>
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
                        <TabsTrigger value='content'>
                          {t('Content rewards')}
                        </TabsTrigger>
                        <TabsTrigger value='rebates'>
                          {t('Rebate details')}
                        </TabsTrigger>
                        <TabsTrigger value='customers'>
                          {t('My customers')}
                        </TabsTrigger>
                        <TabsTrigger value='submissions'>
                          {t('My submissions')}
                        </TabsTrigger>
                      </TabsList>
                    </div>
                  </CardHeader>
                  <CardContent className='p-4 sm:p-5'>
                    <TabsContent value='info' className='m-0 space-y-5'>
                      <div className='grid gap-3 lg:grid-cols-2'>
                        <FieldWithCopy
                          label={t('Promotion link')}
                          value={affiliateLink}
                          tooltip={t('Copy referral link')}
                        />
                        <FieldWithCopy
                          label={t('Referral code')}
                          value={affiliateCode || summary?.aff_code || '-'}
                          tooltip={t('Copy referral code')}
                        />
                      </div>

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

                    <TabsContent value='content' className='m-0 space-y-4'>
                      <p className='text-muted-foreground text-sm leading-6'>
                        {status?.growth_submission_enabled === true
                          ? t(
                              'Publish tutorials, videos, backlinks, or directory listings, then submit the URL for review. Approved submissions receive rewards according to site rules.'
                            )
                          : t(
                              'The referral link remains available, but content promotion proof cannot be submitted right now.'
                            )}
                      </p>
                      <div className='space-y-3'>
                        {promotionItems.length > 0 ? (
                          promotionItems.map((item) => (
                            <button
                              type='button'
                              key={item.code}
                              onClick={() => setSubmissionCode(item.code)}
                              className='bg-background hover:bg-muted/40 grid w-full gap-3 rounded-lg border p-4 text-start transition-colors md:grid-cols-[minmax(0,1fr)_auto] md:items-start'
                            >
                              <div className='min-w-0 space-y-2'>
                                <div className='flex flex-wrap items-center gap-2'>
                                  <h3 className='text-sm font-semibold'>
                                    {rewardItemTitle(item)}
                                  </h3>
                                  <Badge variant={statusVariant(item.status)}>
                                    {t(item.status)}
                                  </Badge>
                                </div>
                                <p className='text-muted-foreground text-xs leading-5'>
                                  {rewardItemDescription(item)}
                                </p>
                                {item.reason ? (
                                  <p className='text-muted-foreground text-xs'>
                                    {t(item.reason)}
                                  </p>
                                ) : null}
                              </div>
                              <div className='text-right text-sm font-semibold tabular-nums'>
                                {formatQuota(item.reward_quota || 0)}
                              </div>
                            </button>
                          ))
                        ) : (
                          <EmptyText text={t('No promotion items')} />
                        )}
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
                            <option value=''>
                              {t('Select a promotion item')}
                            </option>
                            {promotionItems.map((item) => (
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
                            onChange={(event) =>
                              setSubmissionUrl(event.target.value)
                            }
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
                    </TabsContent>

                    <TabsContent value='rebates' className='m-0 space-y-4'>
                      <StatusGuide />
                      <div className='divide-y rounded-lg border'>
                        {rebates.length > 0 ? (
                          rebates.map((rebate) => (
                            <div
                              key={rebate.id}
                              className='grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center'
                            >
                              <div className='min-w-0'>
                                <div className='truncate text-sm font-medium'>
                                  {rebate.invitee_name ||
                                    (rebate.invitee_id
                                      ? `#${rebate.invitee_id}`
                                      : '-')}
                                </div>
                                <div className='text-muted-foreground mt-1 text-xs'>
                                  {formatTime(rebate.created_at)}
                                </div>
                              </div>
                              <Badge
                                variant={statusVariant(rebate.status || '')}
                              >
                                {t(rebate.status || '-')}
                              </Badge>
                              <div className='text-sm font-semibold tabular-nums'>
                                {formatQuota(Number(rebate.rebate_quota || 0))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <EmptyText text={t('No rebate records')} />
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value='customers' className='m-0'>
                      <div className='divide-y rounded-lg border'>
                        {inviteRecords.length > 0 ? (
                          inviteRecords.map((record) => (
                            <div
                              key={record.user_id}
                              className='grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center'
                            >
                              <div className='min-w-0'>
                                <div className='truncate text-sm font-medium'>
                                  {record.display_name ||
                                    record.username ||
                                    '-'}
                                </div>
                                {record.display_name && record.username ? (
                                  <div className='text-muted-foreground mt-1 truncate text-xs'>
                                    @{record.username}
                                  </div>
                                ) : null}
                              </div>
                              <div className='text-sm font-semibold tabular-nums'>
                                {formatQuota(
                                  Number(record.total_contribution_rebate || 0)
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <EmptyText text={t('No referral records')} />
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value='submissions' className='m-0'>
                      <div className='divide-y rounded-lg border'>
                        {submissions.length > 0 ? (
                          submissions.map((submission) => (
                            <div
                              key={submission.id}
                              className='grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center'
                            >
                              <div className='min-w-0'>
                                <div className='truncate text-sm font-medium'>
                                  {rewardItemTitle(submission.item_code)}
                                </div>
                                <div className='text-muted-foreground mt-1 truncate text-xs'>
                                  {submission.platform || '-'} ·{' '}
                                  {formatTime(submission.created_at)}
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
                          ))
                        ) : (
                          <EmptyText text={t('No submissions')} />
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

function EmptyText({ text }: { text: string }) {
  return (
    <div className='text-muted-foreground p-8 text-center text-sm'>{text}</div>
  )
}
