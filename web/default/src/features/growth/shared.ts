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
import dayjs from '@/lib/dayjs'

export type GrowthSummary = {
  available_reward_quota: number
  pending_reward_quota: number
  total_reward_quota: number
  invite_count: number
  monthly_rebate_quota: number
  total_rebate_quota: number
  aff_code: string
  invite_rebate_percent: number
}

export type GrowthRewardItem = {
  id: number
  code: string
  title: string
  description: string
  reward_quota: number
  item_type: string
  status: string
  claimable: boolean
  reason?: string
}

export type GrowthReward = {
  id: number
  item_code: string
  reward_quota: number
  status: string
  created_at: number
  settled_at?: number
  remark?: string
}

export type GrowthSubmission = {
  id: number
  item_code: string
  platform?: string
  url?: string
  status: string
  created_at: number
  review_note?: string
}

export type InvitationRecord = {
  user_id: number
  username?: string
  display_name?: string
  total_topup_amount?: number | string
  total_contribution_rebate?: number | string
}

export type InvitationRebate = {
  id: number
  invitee_name?: string
  invitee_id?: number
  rebate_quota?: number | string
  status?: string
  created_at?: number | string
}

export const rewardItemCopy: Record<
  string,
  { title: string; description: string }
> = {
  daily_checkin: {
    title: 'Daily check-in',
    description: 'Check in once per day to keep your account active.',
  },
  create_first_api_key: {
    title: 'Create your first API key',
    description: 'Create an API key and prepare your first integration.',
  },
  first_api_request: {
    title: 'Complete your first API request',
    description: 'Send one successful API request through the gateway.',
  },
  first_topup: {
    title: 'Complete your first top-up',
    description: 'Add funds for the first time.',
  },
  three_day_usage: {
    title: 'Use the API for 3 consecutive days',
    description: 'Send requests on 3 consecutive days.',
  },
  monthly_spend_target: {
    title: "Reach this month's spend target",
    description: 'Reach the configured monthly consumption target.',
  },
  join_community: {
    title: 'Join the community',
    description: 'Submit your community account or proof for review.',
  },
  content_publish: {
    title: 'Publish an article, video, or tutorial',
    description: 'Share content that helps others use the API service.',
  },
  backlink_submission: {
    title: 'Submit a website backlink or directory listing',
    description: 'Submit an approved backlink or directory listing.',
  },
}

export function getItems<T>(payload: unknown): T[] {
  const data = payload as { data?: { items?: T[] } }
  return data?.data?.items || []
}

export function formatTime(value?: number | string) {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '-'
  return dayjs(timestamp * 1000).format('YYYY-MM-DD HH:mm')
}

export function statusVariant(status: string) {
  if (status === 'completed' || status === 'settled' || status === 'approved') {
    return 'default'
  }
  if (status === 'pending' || status === 'pending_review') return 'secondary'
  if (status === 'rejected' || status === 'frozen') return 'destructive'
  return 'outline'
}
