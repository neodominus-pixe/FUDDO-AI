import { z } from 'zod'
import { apiError, apiSuccess, readJson, route } from '@/lib/api-response'
import { guard } from '@/lib/auth'
import { backend } from '@/lib/backend'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/policy'
import { ROLES } from '@/lib/roles'

export const runtime = 'nodejs'

export const GET = route(async (req: Request) => {
  const g = await guard(req, { admin: true })
  if ('response' in g) return g.response
  return apiSuccess(await backend.adminOverview())
})

const Name = z.string().trim().min(1).max(100)
const Email = z.string().trim().toLowerCase().max(254).email()
const Role = z.enum(ROLES)
const Password = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX)
const Id = z.string().uuid()

// One schema per action: the shape of the request decides what it may do, and unknown actions are refused.
const Action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('createUser'), name: Name, email: Email, role: Role, password: Password }),
  z.object({ action: z.literal('updateUser'), id: Id, name: Name, email: Email, role: Role, disabled: z.boolean() }),
  z.object({ action: z.literal('setPassword'), id: Id, password: Password }),
  z.object({ action: z.literal('revokeSessions'), id: Id }),
  z.object({ action: z.literal('unlockUser'), id: Id }),
  z.object({ action: z.literal('settings'), registrationOpen: z.boolean() }),
  z.object({ action: z.literal('updateProject'), id: Id, name: z.string().trim().min(1).max(200), ownerId: Id }),
  z.object({ action: z.literal('rotateShare'), id: Id, confirm: z.string().max(200) }),
])

export const POST = route(async (req: Request) => {
  const g = await guard(req, { admin: true })
  if ('response' in g) return g.response

  const parsed = Action.safeParse(await readJson(req, 16_000))
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join('.')
    if (field === 'password') return apiError(`Use a password of ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`, 400)
    if (field === 'email') return apiError('Enter a valid email address.', 400)
    return apiError('Invalid request.', 400, 'VALIDATION_ERROR')
  }

  const a = parsed.data
  switch (a.action) {
    case 'createUser':
      await backend.adminCreateUser({ name: a.name, email: a.email, password: a.password, role: a.role })
      await backend.adminRecord('Created account', a.email)
      break
    case 'updateUser':
      await backend.adminUpdateUser({ id: a.id, name: a.name, email: a.email, role: a.role, disabled: a.disabled })
      break
    case 'setPassword':
      // The new password is never logged or returned. The database function ends the account's sessions.
      await backend.adminSetPassword(a.id, a.password)
      await backend.adminRecord('Changed password', a.id)
      break
    case 'revokeSessions':
      await backend.adminRevokeSessions(a.id)
      break
    case 'unlockUser':
      await backend.adminClearAttempts(a.id)
      break
    case 'settings':
      await backend.adminSetRegistration(a.registrationOpen)
      break
    case 'updateProject':
      await backend.adminUpdateProject({ id: a.id, name: a.name, ownerId: a.ownerId })
      break
    case 'rotateShare':
      await backend.adminRotateShare(a.id, a.confirm)
      break
  }
  return apiSuccess({ ok: true })
})
