import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import AccountNav from '@/components/AccountNav'

// Depends on who is signed in, so it can never be prerendered (a build must not need the database).
export const dynamic = 'force-dynamic'

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()
  if (!user) redirect('/auth?next=/studio')
  return (
    <>
      <AccountNav name={user.name} admin={user.role === 'admin'} />
      {children}
    </>
  )
}
