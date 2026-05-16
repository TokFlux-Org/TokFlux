import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/invite/')({
  beforeLoad: () => {
    throw redirect({ to: '/promotion' })
  },
})
