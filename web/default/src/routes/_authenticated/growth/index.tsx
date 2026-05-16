import { createFileRoute } from '@tanstack/react-router'
import { Growth } from '@/features/growth'

export const Route = createFileRoute('/_authenticated/growth/')({
  component: Growth,
})
