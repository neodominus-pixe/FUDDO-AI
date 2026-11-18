import type { Component, ComponentRole } from '../types'

// The dish a visitor put together on the landing page, carried through sign-in to the studio. It lives in this tab's
// session storage and is read once: what arrives is only ever a starting point the chef can edit.

const KEY = 'fuddo-dish'
const ROLES: ComponentRole[] = ['hero', 'support', 'sauce', 'garnish']

export type DishHandoff = { name: string; components: Array<{ name: string; role: ComponentRole }> }

/** What was stored, or null if it is missing or is not a dish. It came from storage, so nothing about it is assumed. */
export function parseHandoff(raw: string | null): DishHandoff | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as { name?: unknown; components?: unknown }
    if (typeof value.name !== 'string' || !Array.isArray(value.components)) return null
    const components = value.components
      .filter((c): c is DishHandoff['components'][number] => typeof c?.name === 'string' && c.name.trim() !== '' && ROLES.includes(c.role))
      .slice(0, 12)
      .map((c) => ({ name: c.name.trim().slice(0, 60), role: c.role }))
      .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role))
    return { name: value.name.trim().slice(0, 80), components }
  } catch {
    return null
  }
}

export function saveHandoff(dish: DishHandoff) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(dish))
  } catch {
    // Storage can be switched off. The studio then simply opens on its usual starter dish.
  }
}

/** Reads the dish and clears it, so a later visit to the studio does not bring it back. */
export function takeHandoff(): DishHandoff | null {
  try {
    const dish = parseHandoff(sessionStorage.getItem(KEY))
    sessionStorage.removeItem(KEY)
    return dish
  } catch {
    return null
  }
}

export const handoffComponents = (dish: DishHandoff): Component[] =>
  dish.components.map((c, i) => ({ id: `c${i + 1}`, name: c.name, role: c.role, imagePath: null }))
