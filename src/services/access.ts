import { supabase } from '../lib/supabase'
import { apiPost } from './api'
export async function identify(descriptor: number[], laboratoryId: string) {
  if (!supabase) throw new Error('Configura Supabase para habilitar la identificación.')
  return apiPost<{ result: 'authorized'|'denied'|'unknown'|'additional_check'; reason: string }>('/api/identify-access', { descriptor, laboratory_id: laboratoryId })
}
