import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const answer = (result: string, reason: string, studentId: string | null = null) => ({ result, reason, student_id: studentId })

async function decrypt(ciphertext: string, key: CryptoKey) {
  const [iv64, data64] = ciphertext.split('.')
  if (!iv64 || !data64) throw new Error('Invalid encrypted template')
  const decode = (str: string) => Uint8Array.from(atob(str), c => c.charCodeAt(0))
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv64) }, key, decode(data64))
  return JSON.parse(new TextDecoder().decode(plaintext)) as number[]
}
async function encryptKey(secret: string) {
  const bytes = Uint8Array.from(atob(secret), c => c.charCodeAt(0))
  if (bytes.byteLength !== 32) throw new Error('BIOMETRIC_ENCRYPTION_KEY must be base64-encoded 32 bytes')
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt'])
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Invalid session' }, 401)
  const admin = createClient(url, serviceKey)
  const { data: profile } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle()
  if (!profile || !['teacher', 'admin'].includes(profile.role)) return json({ error: 'Staff access required' }, 403)
  let body: { descriptor?: unknown; laboratory_id?: unknown }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!Array.isArray(body.descriptor) || body.descriptor.length !== 128 || !body.descriptor.every(n => typeof n === 'number' && Number.isFinite(n)) || typeof body.laboratory_id !== 'string') return json({ error: 'Invalid descriptor or laboratory' }, 400)
  const descriptor = body.descriptor as number[]
  if (descriptor.some(n => n < -2 || n > 2)) return json({ error: 'Descriptor out of range' }, 400)
  const log = async (value: ReturnType<typeof answer>) => {
    await admin.from('access_logs').insert({ student_id: value.student_id, laboratory_id: body.laboratory_id as string, result: value.result, reason: value.reason })
    return json(value)
  }
  // PAD/liveness is not implemented. Fail closed until a separately validated PAD is integrated.
  const secret = Deno.env.get('BIOMETRIC_ENCRYPTION_KEY')
  const threshold = Number(Deno.env.get('FACE_MATCH_THRESHOLD'))
  if (!secret || !Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) return log(answer('additional_check', 'Reconocimiento no autorizado: falta calibración biométrica y detección de vida validada.'))
  try {
    const key = await encryptKey(secret)
    const { data: templates, error } = await admin.from('biometric_templates').select('student_id,encrypted_descriptor,model_version,consent_reference,biometric_consents!inner(revoked_at)').is('biometric_consents.revoked_at', null)
    if (error) throw error
    let best: { studentId: string; distance: number } | null = null
    let second = Infinity
    for (const template of templates ?? []) {
      if (template.model_version !== 'faceapi-tiny-128-v1') continue
      const vector = await decrypt(template.encrypted_descriptor as string, key)
      if (vector.length !== descriptor.length) continue
      const distance = Math.sqrt(vector.reduce((sum, v, i) => sum + (v - descriptor[i]) ** 2, 0))
      if (!best || distance < best.distance) { if (best) second = best.distance; best = { studentId: template.student_id, distance } }
      else if (distance < second) second = distance
    }
    if (!best || best.distance > threshold) return log(answer('unknown', 'Rostro no reconocido.'))
    if (second - best.distance < Number(Deno.env.get('FACE_AMBIGUITY_MARGIN') ?? '0.05')) return log(answer('additional_check', 'Coincidencia ambigua; requiere verificación presencial.'))
    const { data: student } = await admin.from('students').select('id,status').eq('id', best.studentId).maybeSingle()
    if (!student || student.status !== 'active') return log(answer('denied', 'Estudiante no activo.', best.studentId))
    const now = new Date(); const peru = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }))
    const date = `${peru.getFullYear()}-${String(peru.getMonth()+1).padStart(2,'0')}-${String(peru.getDate()).padStart(2,'0')}`
    const weekday = peru.getDay() === 0 ? 64 : 2 ** (peru.getDay()-1)
    const time = `${String(peru.getHours()).padStart(2,'0')}:${String(peru.getMinutes()).padStart(2,'0')}:00`
    // allowed_days is a bit mask; evaluate it in JS, not with numeric SQL comparison.
    const { data: permissions } = await admin.from('access_permissions').select('allowed_days,start_time,end_time').eq('student_id',student.id).eq('laboratory_id',body.laboratory_id).eq('status','active').lte('valid_from',date).gte('valid_until',date)
    const allowed = permissions?.some(p => (p.allowed_days & weekday) !== 0 && p.start_time <= time && p.end_time > time)
    if (!allowed) return log(answer('denied', 'Permiso no vigente para este laboratorio u horario.', student.id))
    // Recognition alone is deliberately insufficient: PAD is not implemented, so never authorize automatically.
    return log(answer('additional_check', 'Identidad coincidente; falta verificación de vida validada. Solicita comprobación presencial.', student.id))
  } catch (error) { console.error('identify-access failed', error); return json({ error: 'Verification unavailable' }, 500) }
})
