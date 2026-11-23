import type { VercelRequest, VercelResponse } from './_lib/vercel-types'
import { authorize, bodyOf, cors, rateLimit, send } from './_lib/auth'

type ManageBody = { action?: unknown; template_id?: unknown }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })
  try {
    const context = await authorize(req, res); if (!context) return
    const body = bodyOf<ManageBody>(req)
    if (body.action === 'list') {
      if (!await rateLimit(context.admin, context.user.id, 'template_list', 30)) return send(res, 429, { error: 'Límite de consultas alcanzado. Espera un minuto.' })
      const { data, error } = await context.admin.from('biometric_templates').select('id,student_id,created_at,model_version,students!inner(full_name,student_code)').order('created_at', { ascending: false })
      if (error) throw error
      const templates = (data ?? []).map((row: any) => ({ id: row.id, student_id: row.student_id, created_at: row.created_at, model_version: row.model_version, student_name: row.students.full_name, student_code: row.students.student_code }))
      return send(res, 200, { templates })
    }
    if (body.action === 'delete' && typeof body.template_id === 'string') {
      if (!await rateLimit(context.admin, context.user.id, 'template_delete', 15)) return send(res, 429, { error: 'Límite de eliminaciones alcanzado. Espera un minuto.' })
      const { data: template, error: lookupError } = await context.admin.from('biometric_templates').select('id,consent_reference').eq('id', body.template_id).maybeSingle()
      if (lookupError) throw lookupError
      if (!template) return send(res, 404, { error: 'Plantilla no encontrada.' })
      const { error } = await context.admin.from('biometric_templates').delete().eq('id', body.template_id)
      if (error) throw error
      const { count, error: countError } = await context.admin.from('biometric_templates').select('*', { count: 'exact', head: true }).eq('consent_reference', template.consent_reference)
      if (countError) throw countError
      if (!count) await context.admin.from('biometric_consents').update({ revoked_at: new Date().toISOString() }).eq('id', template.consent_reference)
      return send(res, 200, { ok: true })
    }
    return send(res, 400, { error: 'Acción inválida.' })
  } catch (error) {
    console.error('Vercel manage-templates error:', error)
    return send(res, 500, { error: error instanceof Error ? error.message : 'No se pudo gestionar las plantillas.' })
  }
}
