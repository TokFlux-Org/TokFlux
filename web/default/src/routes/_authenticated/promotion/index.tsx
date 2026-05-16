import { createFileRoute } from '@tanstack/react-router'
import { PromotionCenter } from '@/features/promotion'

export const Route = createFileRoute('/_authenticated/promotion/')({
  component: PromotionCenter,
})
