import { createFileRoute } from '@tanstack/react-router'
import { Main } from '@/components/layout'
import { CreationLauncher } from '@/features/creation'

export const Route = createFileRoute('/_authenticated/creation/')({
  component: CreationPage,
})

function CreationPage() {
  return (
    <Main className='p-0'>
      <CreationLauncher />
    </Main>
  )
}
