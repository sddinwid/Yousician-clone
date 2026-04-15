const DEFAULT_BASE_URL = 'http://127.0.0.1:8000'

export function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL
}

export async function fetchJson(path, { method = 'GET', body } = {}) {
  const url = `${getApiBaseUrl()}${path}`
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    const message = data?.detail || `Request failed: ${res.status}`
    throw new Error(message)
  }
  return data
}

