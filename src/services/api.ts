import { supabase } from '../lib/supabase'

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  if (!supabase) throw new Error('Configura Supabase para continuar.')
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.access_token) throw new Error('Inicia sesión nuevamente para realizar esta operación.')
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(data.error || `La API de Vercel respondió HTTP ${response.status}.`)
  return data
}
