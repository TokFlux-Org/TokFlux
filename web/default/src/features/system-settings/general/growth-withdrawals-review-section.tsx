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
import { Banknote, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  formatCashCents,
  formatTime,
  getItems,
  statusVariant,
  type PromotionWithdrawal,
} from '@/features/growth/shared'
import { SettingsSection } from '../components/settings-section'

type AdminPromotionWithdrawal = PromotionWithdrawal & {
  user_id: number
  reviewer_id?: number
  payout_account_snapshot?: string
}

function getPayoutAccount(withdrawal: AdminPromotionWithdrawal) {
  if (!withdrawal.payout_account_snapshot) return '-'
  try {
    const snapshot = JSON.parse(withdrawal.payout_account_snapshot) as {
      payout_account?: string
    }
    return snapshot.payout_account || '-'
  } catch {
    return '-'
  }
}

export function GrowthWithdrawalsReviewSection() {
  const { t } = useTranslation()
  const [withdrawals, setWithdrawals] = useState<AdminPromotionWithdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState<number | null>(null)
  const [tradeNoById, setTradeNoById] = useState<Record<number, string>>({})
  const [noteById, setNoteById] = useState<Record<number, string>>({})

  const pendingReviewCount = useMemo(
    () => withdrawals.filter((item) => item.status === 'pending_review').length,
    [withdrawals]
  )
  const approvedCount = useMemo(
    () => withdrawals.filter((item) => item.status === 'approved').length,
    [withdrawals]
  )

  const loadWithdrawals = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/api/growth/admin/withdrawals', {
        params: { page_size: 100 },
      })
      setWithdrawals(getItems<AdminPromotionWithdrawal>(res.data))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWithdrawals()
  }, [loadWithdrawals])

  const updateTradeNo = (id: number, value: string) => {
    setTradeNoById((current) => ({ ...current, [id]: value }))
  }

  const updateNote = (id: number, value: string) => {
    setNoteById((current) => ({ ...current, [id]: value }))
  }

  const approveWithdrawal = async (withdrawal: AdminPromotionWithdrawal) => {
    try {
      setReviewingId(withdrawal.id)
      const res = await api.post(
        `/api/growth/admin/withdrawals/${withdrawal.id}/approve`,
        {
          review_note: noteById[withdrawal.id] || '',
        }
      )
      if (res.data?.success) {
        toast.success(t('Withdrawal request approved'))
        await loadWithdrawals()
      }
    } finally {
      setReviewingId(null)
    }
  }

  const rejectWithdrawal = async (withdrawal: AdminPromotionWithdrawal) => {
    const note = noteById[withdrawal.id]?.trim()
    if (!note) {
      toast.error(t('Review note is required'))
      return
    }
    try {
      setReviewingId(withdrawal.id)
      const res = await api.post(
        `/api/growth/admin/withdrawals/${withdrawal.id}/reject`,
        {
          review_note: note,
        }
      )
      if (res.data?.success) {
        toast.success(t('Withdrawal request rejected'))
        await loadWithdrawals()
      }
    } finally {
      setReviewingId(null)
    }
  }

  const markWithdrawalPaid = async (withdrawal: AdminPromotionWithdrawal) => {
    const tradeNo = tradeNoById[withdrawal.id]?.trim()
    if (!tradeNo) {
      toast.error(t('Trade no is required'))
      return
    }
    try {
      setReviewingId(withdrawal.id)
      const res = await api.post(
        `/api/growth/admin/withdrawals/${withdrawal.id}/paid`,
        {
          trade_no: tradeNo,
          review_note: noteById[withdrawal.id] || '',
        }
      )
      if (res.data?.success) {
        toast.success(t('Withdrawal marked paid'))
        await loadWithdrawals()
      }
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <SettingsSection
      title={t('Withdrawal Reviews')}
      description={t(
        'Review submitted cash withdrawal requests and mark paid after offline settlement.'
      )}
    >
      <div className='space-y-4 rounded-lg border p-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant={pendingReviewCount > 0 ? 'secondary' : 'outline'}>
              {t('Pending review')}: {pendingReviewCount}
            </Badge>
            <Badge variant={approvedCount > 0 ? 'secondary' : 'outline'}>
              {t('Approved awaiting payout')}: {approvedCount}
            </Badge>
            <span className='text-muted-foreground text-xs'>
              {t('Latest withdrawal requests are shown first.')}
            </span>
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={loadWithdrawals}
            disabled={loading}
          >
            <RefreshCw className='size-4' />
            {t('Refresh')}
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Withdrawal')}</TableHead>
              <TableHead>{t('Payout')}</TableHead>
              <TableHead>{t('Review')}</TableHead>
              <TableHead className='text-right'>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {withdrawals.length > 0 ? (
              withdrawals.map((withdrawal) => {
                const isPendingReview = withdrawal.status === 'pending_review'
                const isApproved = withdrawal.status === 'approved'
                const canReview = isPendingReview || isApproved
                const isReviewing = reviewingId === withdrawal.id
                return (
                  <TableRow key={withdrawal.id}>
                    <TableCell className='min-w-64 whitespace-normal'>
                      <div className='space-y-1'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <span className='font-medium'>
                            {formatCashCents(
                              withdrawal.net_amount_cents,
                              withdrawal.currency
                            )}
                          </span>
                          <Badge variant={statusVariant(withdrawal.status)}>
                            {t(withdrawal.status)}
                          </Badge>
                        </div>
                        <div className='text-muted-foreground text-xs'>
                          {t('User ID')}: {withdrawal.user_id} ·{' '}
                          {t('Applied at')}: {formatTime(withdrawal.applied_at)}
                        </div>
                        {withdrawal.trade_no ? (
                          <div className='text-muted-foreground text-xs'>
                            {t('Trade no')}: {withdrawal.trade_no}
                          </div>
                        ) : null}
                        {withdrawal.review_note ? (
                          <div className='text-muted-foreground text-xs'>
                            {t('Review note')}: {withdrawal.review_note}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className='min-w-72 whitespace-normal'>
                      <div className='space-y-1.5 text-xs'>
                        <div>
                          {t('Payout method')}: {withdrawal.payout_method || '-'}
                        </div>
                        <div className='text-muted-foreground break-all'>
                          {t('Payout account')}: {getPayoutAccount(withdrawal)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className='min-w-72 whitespace-normal'>
                      {canReview ? (
                        <div className='grid gap-2'>
                          {isApproved ? (
                            <Input
                              value={tradeNoById[withdrawal.id] || ''}
                              onChange={(event) =>
                                updateTradeNo(
                                  withdrawal.id,
                                  event.target.value
                                )
                              }
                              placeholder={t('Trade no')}
                            />
                          ) : null}
                          <Textarea
                            value={noteById[withdrawal.id] || ''}
                            onChange={(event) =>
                              updateNote(withdrawal.id, event.target.value)
                            }
                            placeholder={t('Review note')}
                            className='min-h-16'
                          />
                        </div>
                      ) : (
                        <div className='text-muted-foreground text-xs'>
                          {withdrawal.paid_at
                            ? formatTime(withdrawal.paid_at)
                            : withdrawal.reviewed_at
                              ? formatTime(withdrawal.reviewed_at)
                              : '-'}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className='text-right'>
                      {canReview ? (
                        <div className='flex flex-wrap justify-end gap-2'>
                          {isPendingReview ? (
                            <Button
                              type='button'
                              size='sm'
                              onClick={() => approveWithdrawal(withdrawal)}
                              disabled={isReviewing}
                            >
                              <CheckCircle2 className='size-4' />
                              {t('Approve request')}
                            </Button>
                          ) : null}
                          {isApproved ? (
                            <Button
                              type='button'
                              size='sm'
                              onClick={() => markWithdrawalPaid(withdrawal)}
                              disabled={isReviewing}
                            >
                              <Banknote className='size-4' />
                              {t('Mark paid')}
                            </Button>
                          ) : null}
                          <Button
                            type='button'
                            variant='destructive'
                            size='sm'
                            onClick={() => rejectWithdrawal(withdrawal)}
                            disabled={isReviewing}
                          >
                            <XCircle className='size-4' />
                            {t('Reject')}
                          </Button>
                        </div>
                      ) : (
                        <span className='text-muted-foreground text-xs'>
                          {t('Reviewed')}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className='text-muted-foreground py-10 text-center'
                >
                  {loading
                    ? t('Loading...')
                    : t('No withdrawal requests to review')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className='text-muted-foreground text-xs'>
          {t(
            'Paid withdrawals close the linked cash commission ledgers and rejected requests return them to withdrawable status.'
          )}
        </div>
      </div>
    </SettingsSection>
  )
}
