import { fetchJson } from './http'

export async function createAttempt(payload) {
  return fetchJson('/attempts', { method: 'POST', body: payload })
}

