'use client'

import TextureLibrary from './TextureLibrary'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { AdminData, AdminProject, AdminUser } from '@/lib/admin-types'
import { ROLES, ROLE_LABELS } from '@/lib/roles'
import ThemeToggle from './ThemeToggle'

type Tab = 'Accounts' | 'Projects' | 'Activity' | 'Textures' | 'Settings'
const date = (value: string | null) => value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC' : 'No sign-in recorded'

function Modal({ title, children, close, busy }: { title: string; children: ReactNode; close: () => void; busy: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
    ref.current?.querySelector<HTMLInputElement>('input')?.focus()
  }, [])
  return <dialog className="admin-modal" ref={ref} aria-labelledby="admin-dialog-title" onCancel={e => { e.preventDefault(); if (!busy) close() }}><div className="admin-modal-head"><h2 id="admin-dialog-title">{title}</h2><button type="button" aria-label="Close dialog" disabled={busy} onClick={close}>✕</button></div>{children}</dialog>
}

export default function AdminDashboard({ initial, currentId }: { initial: AdminData; currentId: string }) {
  const router = useRouter()
  const [data, setData] = useState(initial)
  const [tab, setTab] = useState<Tab>('Accounts')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null)
  const [project, setProject] = useState<AdminProject | null>(null)
  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null)

  async function refresh() {
    const response = await fetch('/api/admin', { cache: 'no-store' })
    if (response.status === 401) { router.push('/auth'); return }
    if (response.status === 403) { router.push('/studio'); return }
    if (!response.ok) throw new Error('Could not refresh the dashboard. Please try again.')
    setData(await response.json())
  }
  async function run(body: Record<string, unknown>, success: string) {
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not save changes.')
      setNotice(success)
      try { await refresh() } catch (err) { setError(err instanceof Error ? `Changes saved. ${err.message}` : 'Changes saved. Refresh to see them.') }
      return true
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to connect. Please try again.'); return false }
    finally { setBusy(false) }
  }
  const changeTab = (next: Tab) => { setTab(next); setSearch(''); setFilter('all'); setPage(0) }
  const openEditor = (user: AdminUser | 'new') => { setError(''); setEditing(user) }
  const matches = (text: string) => text.toLowerCase().includes(search.toLowerCase().trim())
  const users = data.users.filter(u => matches(`${u.name} ${u.email}`) && (filter === 'all' || (filter.startsWith('role:') ? u.role === filter.slice(5) : filter === 'suspended' ? !!u.disabled : !u.disabled)))
  const projects = data.projects.filter(p => matches(`${p.name} ${data.users.find(u => u.id === p.ownerId)?.email || 'Unassigned'}`) && (filter === 'all' || (filter === 'reviewed' ? p.reviewed : filter === 'unassigned' ? !data.users.some(u => u.id === p.ownerId) : !p.reviewed)))
  const events = data.events.filter(e => matches(`${e.actorName} ${e.action} ${e.target}`))
  const count = tab === 'Accounts' ? users.length : tab === 'Projects' ? projects.length : events.length
  const pages = Math.max(1, Math.ceil(count / 12)), currentPage = Math.min(page, pages - 1)
  const slice = <T,>(rows: T[]) => rows.slice(currentPage * 12, (currentPage + 1) * 12)

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const disabled = form.get('status') === 'suspended'
    if (editing !== 'new' && editing && !editing.disabled && disabled && !confirm(`Suspend ${editing.email}? They will be signed out immediately.`)) return
    const body = { action: editing === 'new' ? 'createUser' : 'updateUser', id: editing === 'new' ? undefined : editing?.id,
      name: form.get('name'), email: form.get('email'), role: form.get('role'), disabled, ...(editing === 'new' ? { password: form.get('password') } : {}) }
    if (await run(body, editing === 'new' ? 'Account created.' : 'Account updated.')) setEditing(null)
  }

  return <main className="admin-shell">
    <header className="admin-heading"><div><p className="eyebrow">FUDDO AI / ADMIN</p><h1 className="text-2xl md:text-4xl font-extrabold tracking-tight">Workspace management</h1><p className="text-sm text-muted mt-1">Manage your chefs, their access, and the work they create.</p></div><div className="flex items-center gap-3"><button className="btn btn-secondary btn-sm" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await refresh(); setNotice('Dashboard refreshed.') } catch (err) { setError((err as Error).message) } finally { setBusy(false) } }}>↻ Refresh</button><ThemeToggle/></div></header>
    <section className="admin-stats" aria-label="Workspace statistics">{[
      ['Accounts', data.users.length, `${data.users.filter(u => !u.disabled).length} active`],
      ['Administrators', data.users.filter(u => u.role === 'admin' && !u.disabled).length, 'With active access'],
      ['Active sessions', data.users.reduce((sum, u) => sum + u.sessions, 0), 'Unexpired sign-ins'],
      ['Saved projects', data.projects.length, `${data.projects.filter(p => p.reviewed).length} reviewed`],
    ].map(([label, number, detail]) => <article key={label}><p className="text-xs text-muted">{label}</p><strong className="text-3xl font-semibold tabular-nums text-brand-ink my-2 block">{number}</strong><small className="text-xs text-faint">{detail}</small></article>)}</section>
    <nav className="admin-tabs" aria-label="Admin sections">{(['Accounts', 'Projects', 'Activity', 'Textures', 'Settings'] as Tab[]).map(item => <button key={item} aria-current={tab === item ? 'page' : undefined} onClick={() => changeTab(item)}>{item}</button>)}</nav>
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {error && !editing && !passwordUser && !project && <p className="admin-error" role="alert">{error}</p>}
    <section className="admin-panel" aria-label={tab}>
      {tab !== 'Settings' && tab !== 'Textures' && <div className="admin-toolbar"><label className="admin-search"><span className="sr-only">Search {tab.toLowerCase()}</span><input className="text-base md:text-sm" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} placeholder={`Search ${tab.toLowerCase()}…`} /></label>{tab !== 'Activity' && <label><span className="sr-only">Filter {tab.toLowerCase()}</span><select className="text-base md:text-sm" value={filter} onChange={e => { setFilter(e.target.value); setPage(0) }}><option value="all">All {tab.toLowerCase()}</option>{tab === 'Accounts' ? <><option value="active">Active</option><option value="suspended">Suspended</option>{ROLES.map(r => <option key={r} value={`role:${r}`}>{ROLE_LABELS[r]}s</option>)}</> : <><option value="reviewed">Reviewed</option><option value="pending">Awaiting review</option><option value="unassigned">Unassigned</option></>}</select></label>}{tab === 'Accounts' && <button className="admin-primary btn-sm" disabled={busy} onClick={() => openEditor('new')}>+ Add account</button>}</div>}
      {tab === 'Accounts' && <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0"><table><thead><tr><th className="text-xs uppercase tracking-wide">Account</th><th className="text-xs uppercase tracking-wide">Access</th><th className="text-xs uppercase tracking-wide">Last sign-in</th><th className="text-xs uppercase tracking-wide">Sessions</th><th className="text-xs uppercase tracking-wide">Projects</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{slice(users).map(u => <tr key={u.id}><td><strong>{u.name} {u.id === currentId && <small>(you)</small>}</strong><span>{u.email}</span><small>Joined {u.createdAt.slice(0, 10)}</small></td><td><b className={`admin-badge ${u.disabled ? 'suspended' : u.role}`}>{u.disabled ? 'Suspended' : u.role === 'admin' ? 'Admin' : 'Active'}</b></td><td>{date(u.lastLoginAt)}</td><td>{u.sessions}</td><td>{u.projects}</td><td><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => openEditor(u)} aria-label={`Manage ${u.email}`}>Manage →</button></td></tr>)}</tbody></table></div>}
      {tab === 'Projects' && <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0"><table><thead><tr><th className="text-xs uppercase tracking-wide">Project</th><th className="text-xs uppercase tracking-wide">Owner</th><th className="text-xs uppercase tracking-wide">Review</th><th className="text-xs uppercase tracking-wide">Updated</th><th className="text-xs uppercase tracking-wide">Actions</th></tr></thead><tbody>{slice(projects).map(p => <tr key={p.id}><td><strong>{p.name}</strong><span>{p.platings} plating concepts</span></td><td>{data.users.find(u => u.id === p.ownerId)?.email || 'Unassigned'}</td><td><b className={`admin-badge ${p.reviewed ? 'user' : ''}`}>{p.reviewed ? 'Reviewed' : 'Pending'}</b></td><td>{date(p.updatedAt)}</td><td><div className="admin-row-actions"><Link href={`/card/${p.id}`}>View card ↗</Link><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setError(''); setProject(p) }}>Edit</button></div></td></tr>)}</tbody></table></div>}
      {tab === 'Activity' && <><p className="admin-help">The latest 100 administrative changes. Passwords and session tokens are never included.</p><div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0"><table><thead><tr><th className="text-xs uppercase tracking-wide">When</th><th className="text-xs uppercase tracking-wide">Administrator</th><th className="text-xs uppercase tracking-wide">Change</th><th className="text-xs uppercase tracking-wide">Account / project</th></tr></thead><tbody>{slice(events).map(e => <tr key={e.id}><td>{date(e.createdAt)}</td><td>{e.actorName}</td><td>{e.action}</td><td className="admin-event-target">{e.target}</td></tr>)}</tbody></table></div></>}
      {tab !== 'Settings' && tab !== 'Textures' && <>{count === 0 && <div className="admin-empty"><h2>No {tab.toLowerCase()} found</h2><p>{search || filter !== 'all' ? 'Try another search or filter.' : tab === 'Activity' ? 'Changes made here will appear in this log.' : 'New records will appear here.'}</p></div>}<footer className="admin-pagination"><span>{count} results · Page {currentPage + 1} of {pages}</span><div><button className="btn btn-secondary btn-sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="btn btn-secondary btn-sm" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></footer></>}
      {tab === 'Textures' && <TextureLibrary />}
      {tab === 'Settings' && <div className="admin-settings"><section><h2>Account registration</h2><p>Control whether visitors can create accounts. Existing members can still sign in, and administrators can add accounts here.</p><label className="admin-toggle"><input type="checkbox" checked={data.registrationOpen} disabled={busy} onChange={e => void run({ action: 'settings', registrationOpen: e.target.checked }, e.target.checked ? 'Public registration opened.' : 'Public registration closed.')} /> Allow public signups</label></section><section><h2>Studio services</h2><dl><div><dt>Image provider</dt><dd>{data.imageProvider}</dd></div><div><dt>3D provider</dt><dd>{data.modelProvider}</dd></div><div><dt>Password recovery email</dt><dd>Not configured</dd></div></dl><p>Provider configuration is managed on the server. You can set a new account password from Manage → Change password.</p></section></div>}
    </section>

    {editing && <Modal title={editing === 'new' ? 'Add account' : `Manage ${editing.name}`} busy={busy} close={() => { setEditing(null); setError('') }}>
      <form className="admin-form" onSubmit={saveUser}><fieldset disabled={busy}>
        <label>Full name<input className="text-base md:text-sm" autoFocus name="name" required maxLength={100} defaultValue={editing === 'new' ? '' : editing.name} autoComplete="off" /></label>
        <label>Email address<input className="text-base md:text-sm" name="email" type="email" required maxLength={254} defaultValue={editing === 'new' ? '' : editing.email} autoComplete="off" /></label>
        <label>Role<select className="text-base md:text-sm" name="role" defaultValue={editing === 'new' ? 'user' : editing.role}>{ROLES.map(r => <option key={r} value={r} disabled={editing !== 'new' && editing.id === currentId && r !== 'admin'}>{ROLE_LABELS[r]}</option>)}</select></label>
        {editing !== 'new' && <label>Status<select className="text-base md:text-sm" name="status" defaultValue={editing.disabled ? 'suspended' : 'active'}><option value="active">Active</option><option value="suspended" disabled={editing.id === currentId}>Suspended</option></select></label>}
        {editing === 'new' && <label>Initial password<input className="text-base md:text-sm" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /><small>12–128 characters. Share it with the account owner securely; no email is sent.</small></label>}
        {editing !== 'new' && <p className="admin-help">Changing email, role or suspending an account signs it out everywhere. Your own admin access cannot be removed here.</p>}
        {error && <p className="admin-error" role="alert">{error}</p>}
        <button className="admin-primary btn-md" type="submit">{busy ? 'Saving…' : editing === 'new' ? 'Create account' : 'Save changes'}</button>
      </fieldset></form>
      {editing !== 'new' && <section className="admin-security"><h3>Account security</h3><p>Manage sign-in access without removing saved projects.</p><div className="admin-row-actions"><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setPasswordUser(editing); setEditing(null); setError('') }}>Change password</button><button className="btn btn-secondary btn-sm" disabled={busy} onClick={async () => { if (confirm(`Sign ${editing.email} out of all devices?`)) await run({ action: 'revokeSessions', id: editing.id }, 'All sessions revoked.') }}>Sign out everywhere</button><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void run({ action: 'unlockUser', id: editing.id }, 'Sign-in attempt limit cleared.')}>Unlock sign-in attempts</button></div></section>}
    </Modal>}
    {passwordUser && <Modal title={`Change password for ${passwordUser.name}`} busy={busy} close={() => { setPasswordUser(null); setError('') }}><form className="admin-form" onSubmit={async e => { e.preventDefault(); const form = new FormData(e.currentTarget); if (form.get('password') !== form.get('confirm')) { setError('Passwords do not match.'); return } if (await run({ action: 'setPassword', id: passwordUser.id, password: form.get('password') }, 'Password changed. All sessions revoked.')) setPasswordUser(null) }}><fieldset disabled={busy}><p>The account will be signed out on all devices. Share the new password with its owner securely.</p><label>New password<input className="text-base md:text-sm" autoFocus name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label><label>Confirm password<input className="text-base md:text-sm" name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>{error && <p className="admin-error" role="alert">{error}</p>}<button className="admin-primary btn-md">{busy ? 'Saving…' : 'Change password and sign out'}</button></fieldset></form></Modal>}
    {project && <Modal title="Edit project" busy={busy} close={() => { setProject(null); setError('') }}><form className="admin-form" onSubmit={async e => { e.preventDefault(); const form = new FormData(e.currentTarget); if (await run({ action: 'updateProject', id: project.id, name: form.get('name'), ownerId: form.get('ownerId') }, 'Project updated.')) setProject(null) }}><fieldset disabled={busy}><label>Project name<input className="text-base md:text-sm" autoFocus name="name" defaultValue={project.name} maxLength={200} required /></label><label>Owner<select className="text-base md:text-sm" name="ownerId" defaultValue={project.ownerId} required><option value="">Choose an active owner</option>{data.users.filter(u => !u.disabled).map(u => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}</select></label><p>Transferring a project gives the new owner access and removes the previous owner’s access.</p>{error && <p className="admin-error" role="alert">{error}</p>}<button className="admin-primary btn-md">{busy ? 'Saving…' : 'Save project'}</button></fieldset></form><section className="admin-security"><h3>Review link</h3><p>Replace the link if it was shared with the wrong person. Previous links will stop working; existing feedback stays saved.</p><button className="btn btn-secondary btn-sm" disabled={busy} onClick={async () => { const typed = prompt(`Type “${project.name}” to invalidate the old review link.`); if (typed === null) return; if (await run({ action: 'rotateShare', id: project.id, confirm: typed }, 'Review link replaced. Open the project again to get the new link.')) setProject(null) }}>Replace review link</button><Link href={`/review/${project.shareId}`} target="_blank" rel="noreferrer">Open current review ↗</Link></section></Modal>}
  </main>
}
