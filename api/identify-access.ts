import type { VercelRequest, VercelResponse } from './_lib/vercel-types'
import { authorize, bodyOf, cors, rateLimit, send } from './_lib/auth'
import { decryptDescriptor, distance, validDescriptor } from './_lib/biometrics'

type IdentifyBody = { descriptor?: unknown; laboratory_id?: unknown }
type Result = { result: 'authorized'|'denied'|'unknown'|'additional_check'; reason: string; student_id: string|null }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })
  try {
    const context = await authorize(req, res); if (!context) return
    if (!await rateLimit(context.admin, context.user.id, 'scan', 20)) return send(res, 429, { error: 'Límite de verificaciones alcanzado. Espera un minuto.' })
    const body = bodyOf<IdentifyBody>(req)
    if (!validDescriptor(body.descriptor) || typeof body.laboratory_id !== 'string') return send(res, 400, { error: 'Descriptor o laboratorio inválido.' })
    const descriptor = body.descriptor
    const log = async (value: Result) => {
      const { error } = await context.admin.from('access_logs').insert({ student_id: value.student_id, laboratory_id: body.laboratory_id, result: value.result, reason: value.reason })
      if (error) console.error('Failed to write access log:', error)
      return send(res, 200, value)
    }
    // Recognition without validated PAD never authorizes access.
    const threshold = Number(process.env.FACE_MATCH_THRESHOLD)
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) return log({ result: 'additional_check', reason: 'Falta calibración biométrica documentada; requiere verificación presencial.', student_id: null })
    const { data: templates, error } = await context.admin.from('biometric_templates').select('student_id,encrypted_descriptor,model_version,biometric_consents!inner(revoked_at)').is('biometric_consents.revoked_at', null)
    if (error) throw error
    let best: { studentId: string; distance: number }|null = null; let second = Infinity
    for (const item of templates ?? []) {
      if (item.model_version !== 'faceapi-tiny-128-v1') continue
      const vector = decryptDescriptor(item.encrypted_descriptor)
      if (!validDescriptor(vector)) continue
      const score = distance(vector, descriptor)
      if (!best || score < best.distance) { if (best) second = best.distance; best = { studentId: item.student_id, distance: score } }
      else if (score < second) second = score
    }
    if (!best || best.distance > threshold) return log({ result: 'unknown', reason: 'Rostro no reconocido.', student_id: null })
    const margin = Number(process.env.FACE_AMBIGUITY_MARGIN ?? '0.05')
    if (second - best.distance < margin) return log({ result: 'additional_check', reason: 'Coincidencia facial ambigua; requiere verificación presencial.', student_id: best.studentId })
    const { data: student, error: studentError } = await context.admin.from('students').select('id,status').eq('id', best.studentId).maybeSingle()
    if (studentError) throw studentError
    if (!student || student.status !== 'active') return log({ result: 'denied', reason: 'Estudiante inactivo.', student_id: best.studentId })
    const { data: lab, error: labError } = await context.admin.from('laboratories').select('id').eq('id', body.laboratory_id).eq('status','active').maybeSingle()
    if (labError) throw labError
    if (!lab) return log({ result: 'denied', reason: 'Laboratorio no activo.', student_id: student.id })
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
    const get = (type: string) => parts.find(part => part.type === type)?.value ?? '00'
    const date = `${get('year')}-${get('month')}-${get('day')}`; const weekday = Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Lima',weekday:'short'}).format(new Date()).replace(/^Sun$/,'0').replace(/^Mon$/,'1').replace(/^Tue$/,'2').replace(/^Wed$/,'3').replace(/^Thu$/,'4').replace(/^Fri$/,'5').replace(/^Sat$/,'6'))
    const dayMask = weekday === 0 ? 64 : 2 ** (weekday - 1); const time = `${get('hour')}:${get('minute')}:00`
    const { data: permissions, error: permissionError } = await context.admin.from('access_permissions').select('allowed_days,start_time,end_time').eq('student_id',student.id).eq('laboratory_id',body.laboratory_id).eq('status','active').lte('valid_from',date).gte('valid_until',date)
    if (permissionError) throw permissionError
    const allowed = permissions?.some(item => (item.allowed_days & dayMask) !== 0 && item.start_time <= time && item.end_time > time)
    if (!allowed) return log({ result:'denied',reason:'Permiso no vigente para este laboratorio u horario.',student_id:student.id })
    return log({ result:'additional_check',reason:'Identidad y permiso coinciden, pero falta detección de vida validada. Confirma presencialmente.',student_id:student.id })
  } catch (error) {
    console.error('Vercel identify-access error:', error)
    return send(res, 500, { error: error instanceof Error ? error.message : 'No se pudo verificar el acceso.' })
  }
}
