import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from './vercel-types'

export const cors = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
}
export const send = (res: VercelResponse, status: number, body: unknown) => res.status(status).json(body)
export const bodyOf = <T>(req: VercelRequest): T => typeof req.body === 'string' ? JSON.parse(req.body) as T : req.body as T

export async function authorize(req: VercelRequest, res: VercelResponse) {
  const header = req.headers.authorization
  const authorization = Array.isArray(header) ? header[0] : header
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) {
    send(res, 500, { error: 'Faltan variables server-side de Supabase en Vercel: SUPABASE_URL, SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY.' })
    return null
  }
  if (!token) { send(res, 401, { error: 'Inicia sesión para continuar.' }); return null }
  const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) { send(res, 401, { error: 'Sesión no válida. Vuelve a iniciar sesión.' }); return null }
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  return { admin, user: data.user }
}

export async function rateLimit(admin: SupabaseClient, userId: string, event: 'enroll'|'scan'|'template_list'|'template_delete', limit: number) {
  const { error: insertError } = await admin.from('staff_request_events').insert({ staff_id: userId, event_type: event })
  if (insertError) throw new Error(`No se pudo registrar el límite de solicitudes (${insertError.message}). Aplica la migración de tablas de FACEGUARD.`)
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count, error } = await admin.from('staff_request_events').select('*', { count: 'exact', head: true }).eq('staff_id', userId).eq('event_type', event).gte('created_at', since)
  if (error) throw new Error(`No se pudo verificar el límite de solicitudes (${error.message}).`)
  return (count ?? 0) <= limit
}
