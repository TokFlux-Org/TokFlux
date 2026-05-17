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
import { CheckCircle2, ExternalLink, RefreshCw, XCircle } from 'lucide-react'
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
  formatTime,
  getItems,
  rewardItemCopy,
  statusVariant,
  type GrowthSubmission,
} from '@/features/growth/shared'
import { SettingsSection } from '../components/settings-section'

type AdminGrowthSubmission = GrowthSubmission & {
  user_id: number
  remark?: string
  reviewer_id?: number
  reviewed_at?: number
}

export function GrowthSubmissionsReviewSection({
  defaultRewardQuota,
}: {
  defaultRewardQuota: number
}) {
  const { t } = useTranslation()
  const [submissions, setSubmissions] = useState<AdminGrowthSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState<number | null>(null)
  const [rewardQuotaById, setRewardQuotaById] = useState<
    Record<number, string>
  >({})
  const [noteById, setNoteById] = useState<Record<number, string>>({})

  const pendingCount = useMemo(
    () => submissions.filter((item) => item.status === 'pending').length,
    [submissions]
  )

  const loadSubmissions = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/api/growth/admin/submissions', {
        params: { page_size: 100 },
      })
      const items = getItems<AdminGrowthSubmission>(res.data)
      setSubmissions(items)
      setRewardQuotaById((current) => {
        const next = { ...current }
        for (const item of items) {
          if (next[item.id] === undefined) {
            next[item.id] = String(defaultRewardQuota || '')
          }
        }
        return next
      })
    } finally {
      setLoading(false)
    }
  }, [defaultRewardQuota])

  useEffect(() => {
    loadSubmissions()
  }, [loadSubmissions])

  const rewardItemTitle = (code: string) =>
    t(rewardItemCopy[code]?.title || code)

  const updateNote = (id: number, value: string) => {
    setNoteById((current) => ({ ...current, [id]: value }))
  }

  const updateRewardQuota = (id: number, value: string) => {
    setRewardQuotaById((current) => ({ ...current, [id]: value }))
  }

  const approveSubmission = async (submission: AdminGrowthSubmission) => {
    const rewardQuota = Number(rewardQuotaById[submission.id] || 0)
    if (!Number.isFinite(rewardQuota) || rewardQuota <= 0) {
      toast.error(t('Reward quota is required'))
      return
    }
    try {
      setReviewingId(submission.id)
      const res = await api.post(
        `/api/growth/admin/submissions/${submission.id}/approve`,
        {
          reward_quota: rewardQuota,
          review_note: noteById[submission.id] || '',
        }
      )
      if (res.data?.success) {
        toast.success(t('Submission approved'))
        await loadSubmissions()
      }
    } finally {
      setReviewingId(null)
    }
  }

  const rejectSubmission = async (submission: AdminGrowthSubmission) => {
    const note = noteById[submission.id]?.trim()
    if (!note) {
      toast.error(t('Review note is required'))
      return
    }
    try {
      setReviewingId(submission.id)
      const res = await api.post(
        `/api/growth/admin/submissions/${submission.id}/reject`,
        {
          review_note: note,
        }
      )
      if (res.data?.success) {
        toast.success(t('Submission rejected'))
        await loadSubmissions()
      }
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <SettingsSection
      title={t('Content Reward Reviews')}
      description={t(
        'Review promotion proof submissions and settle approved rewards.'
      )}
    >
      <div className='space-y-4 rounded-lg border p-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant={pendingCount > 0 ? 'secondary' : 'outline'}>
              {t('Pending')}: {pendingCount}
            </Badge>
            <span className='text-muted-foreground text-xs'>
              {t('Latest submissions are shown first.')}
            </span>
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={loadSubmissions}
            disabled={loading}
          >
            <RefreshCw className='size-4' />
            {t('Refresh')}
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Submission')}</TableHead>
              <TableHead>{t('Proof')}</TableHead>
              <TableHead>{t('Review')}</TableHead>
              <TableHead className='text-right'>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.length > 0 ? (
              submissions.map((submission) => {
                const isPending = submission.status === 'pending'
                const isReviewing = reviewingId === submission.id
                return (
                  <TableRow key={submission.id}>
                    <TableCell className='min-w-64 whitespace-normal'>
                      <div className='space-y-1'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <span className='font-medium'>
                            {rewardItemTitle(submission.item_code)}
                          </span>
                          <Badge variant={statusVariant(submission.status)}>
                            {t(submission.status)}
                          </Badge>
                        </div>
                        <div className='text-muted-foreground text-xs'>
                          {t('User ID')}: {submission.user_id} ·{' '}
                          {formatTime(submission.created_at)}
                        </div>
                        {submission.review_note ? (
                          <div className='text-muted-foreground text-xs'>
                            {t('Review note')}: {submission.review_note}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className='min-w-72 whitespace-normal'>
                      <div className='space-y-1.5'>
                        <div className='text-xs'>
                          {submission.platform || t('Platform not provided')}
                        </div>
                        {submission.url ? (
                          <a
                            href={submission.url}
                            target='_blank'
                            rel='noreferrer'
                            className='text-primary inline-flex max-w-80 items-center gap-1 truncate text-xs font-medium hover:underline'
                          >
                            <span className='truncate'>{submission.url}</span>
                            <ExternalLink className='size-3 shrink-0' />
                          </a>
                        ) : (
                          <span className='text-muted-foreground text-xs'>
                            -
                          </span>
                        )}
                        {submission.remark ? (
                          <div className='text-muted-foreground text-xs'>
                            {submission.remark}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className='min-w-72 whitespace-normal'>
                      {isPending ? (
                        <div className='grid gap-2'>
                          <Input
                            type='number'
                            min={1}
                            value={rewardQuotaById[submission.id] || ''}
                            onChange={(event) =>
                              updateRewardQuota(
                                submission.id,
                                event.target.value
                              )
                            }
                            placeholder={t('Reward quota')}
                          />
                          <Textarea
                            value={noteById[submission.id] || ''}
                            onChange={(event) =>
                              updateNote(submission.id, event.target.value)
                            }
                            placeholder={t('Review note')}
                            className='min-h-16'
                          />
                        </div>
                      ) : (
                        <div className='text-muted-foreground text-xs'>
                          {submission.reviewed_at
                            ? formatTime(submission.reviewed_at)
                            : '-'}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className='text-right'>
                      {isPending ? (
                        <div className='flex justify-end gap-2'>
                          <Button
                            type='button'
                            size='sm'
                            onClick={() => approveSubmission(submission)}
                            disabled={isReviewing}
                          >
                            <CheckCircle2 className='size-4' />
                            {t('Approve')}
                          </Button>
                          <Button
                            type='button'
                            variant='destructive'
                            size='sm'
                            onClick={() => rejectSubmission(submission)}
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
                  {loading ? t('Loading...') : t('No submissions to review')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className='text-muted-foreground text-xs'>
          {t(
            'Approved rewards are settled immediately and added to the user balance.'
          )}
        </div>
      </div>
    </SettingsSection>
  )
}
