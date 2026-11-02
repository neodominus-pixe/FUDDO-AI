import type { Role } from './roles'
export type AdminUser = {
  id: string; name: string; email: string; role: Role; disabled: number
  createdAt: string; lastLoginAt: string | null; sessions: number; projects: number
}
export type AdminProject = {
  id: string; name: string; ownerId: string; shareId: string; platings: number
  reviewed: boolean; updatedAt: string
}
export type AdminEvent = { id: number; actorName: string; action: string; target: string; createdAt: string }
export type AdminData = {
  users: AdminUser[]; projects: AdminProject[]; events: AdminEvent[]
  registrationOpen: boolean; imageProvider: string; modelProvider: string
}
