import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { backend } from '@/lib/backend'
import AccountNav from '@/components/AccountNav'
import AdminDashboard from '@/components/AdminDashboard'
import './admin.css'

// Depends on who is signed in, so it can never be prerendered (a build must not need the database).
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const user = await currentUser()
  if (!user) redirect('/auth?next=/admin')
  if (user.role !== 'admin') redirect('/studio')
  return (
    <>
      <AccountNav name={user.name} admin />
      <AdminDashboard initial={await backend.adminOverview()} currentId={user.id} />
    </>
  )
}
