import 'server-only'
import { supabaseBackend } from './supabase'
import type { Backend } from './types'

// The one place the app picks its data store. Tests replace it with setBackend().
let current: Backend = supabaseBackend

export const backend = new Proxy({} as Backend, {
  get: (_target, prop) => Reflect.get(current, prop),
})

export function setBackend(next: Backend) {
  current = next
}

export * from './types'
