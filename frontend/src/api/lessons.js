import { fetchJson } from './http'

export async function getLessons() {
  return fetchJson('/lessons')
}

