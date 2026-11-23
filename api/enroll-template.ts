import type { VercelRequest, VercelResponse } from './_lib/vercel-types'
import { authorize, bodyOf, cors, rateLimit, send } from './_lib/auth'
import { decryptDescriptor, distance, encryptDescriptor, validDescriptor } from './_lib/biometrics'

type EnrollmentBody = { student_id?: unknown; samples?: unknown; consent_version?: unknown; consent_accepted?: unknown; model_version?: unknown }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })
  try {
    const context = await authorize(req, res); if (!context) return
    if (!await rateLimit(context.admin, context.user.id, 'enroll', 8)) return send(res, 429, { error: 'Límite de registros alcanzado. Espera un minuto.' })
    const body = bodyOf<EnrollmentBody>(req)
    if (typeof body.student_id !== 'string' || body.consent_accepted !== true || body.consent_version !== 'FG-UCT-2026-01' || body.model_version !== 'faceapi-tiny-128-v1' || !Array.isArray(body.samples) || body.samples.length !== 3 || body.samples.some(sample => !validDescriptor(sample))) {
      return send(res, 400, { error: 'Selecciona un estudiante activo, acepta el consentimiento y envía tres muestras faciales válidas.' })
    }
    const { data: student, error: studentError } = await context.admin.from('students').select('id,status').eq('id', body.student_id).maybeSingle()
    if (studentError) throw studentError
    if (!student || student.status !== 'active') return send(res, 404, { error: 'Estudiante no encontrado o inactivo.' })

    const vectors = body.samples as number[][]
    const descriptor = Array.from({ length: 128 }, (_, i) => vectors.reduce((sum, vector) => sum + vector[i], 0) / vectors.length)
    const { data: existing, error: templatesError } = await context.admin.from('biometric_templates').select('encrypted_descriptor,model_version').eq('student_id', student.id)
    if (templatesError) throw templatesError
    let duplicateWarning = false
    const threshold = Number(process.env.FACE_MATCH_THRESHOLD)
    if (Number.isFinite(threshold) && threshold > 0 && threshold < 1) {
      for (const row of existing ?? []) {
        if (row.model_version === 'faceapi-tiny-128-v1' && distance(decryptDescriptor(row.encrypted_descriptor), descriptor) < threshold) { duplicateWarning = true; break }
      }
    }
    const { data: consent, error: consentError } = await context.admin.from('biometric_consents').insert({ student_id: student.id, consent_version: body.consent_version }).select('id').single()
    if (consentError) throw consentError
    const encrypted = encryptDescriptor(descriptor)
    const { error: insertError } = await context.admin.from('biometric_templates').insert({ student_id: student.id, encrypted_descriptor: encrypted, model_version: body.model_version, consent_reference: consent.id })
    if (insertError) { await context.admin.from('biometric_consents').delete().eq('id', consent.id); throw insertError }
    return send(res, 200, { ok: true, duplicate_warning: duplicateWarning })
  } catch (error) {
    console.error('Vercel enroll-template error:', error)
    return send(res, 500, { error: error instanceof Error ? error.message : 'No se pudo guardar la plantilla.' })
  }
}
