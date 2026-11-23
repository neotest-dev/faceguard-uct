import { supabase } from '../lib/supabase'
export async function identify(descriptor: number[], laboratoryId: string) {
  if (!supabase) throw new Error('Configura Supabase para habilitar la identificación.')
  const { data, error } = await supabase.functions.invoke('identify-access', { body: { descriptor, laboratory_id: laboratoryId } })
  if (error) throw new Error(error.message)
  return data as { result: 'authorized'|'denied'|'unknown'|'additional_check'; reason: string }
}
