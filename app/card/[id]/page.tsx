import { redirect, notFound } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { backend } from '@/lib/backend'
import CardClient from '@/components/CardClient'

// Depends on who is signed in, so it can never be prerendered (a build must not need the database).
export const dynamic = 'force-dynamic'

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await currentUser()
  if (!user) redirect(`/auth?next=/card/${id}`)
  // Row Level Security already limits this to the owner or an administrator.
  const project = await backend.getProject(id)
  if (!project) notFound()
  return <CardClient projectId={id} />
}
