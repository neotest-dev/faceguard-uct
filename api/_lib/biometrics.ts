import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function encryptionKey() {
  const value = process.env.BIOMETRIC_ENCRYPTION_KEY
  if (!value) throw new Error('Configura BIOMETRIC_ENCRYPTION_KEY como variable privada de Vercel.')
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32) throw new Error('BIOMETRIC_ENCRYPTION_KEY debe ser base64 de 32 bytes.')
  return key
}
export function encryptDescriptor(descriptor: number[]) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(descriptor), 'utf8'), cipher.final(), cipher.getAuthTag()])
  return `${iv.toString('base64')}.${encrypted.toString('base64')}`
}
export function decryptDescriptor(value: string) {
  const [ivText, ciphertext] = value.split('.')
  if (!ivText || !ciphertext) throw new Error('Formato de plantilla cifrada inválido.')
  const iv = Buffer.from(ivText, 'base64')
  const bytes = Buffer.from(ciphertext, 'base64')
  if (iv.length !== 12 || bytes.length < 17) throw new Error('Plantilla cifrada incompleta.')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  decipher.setAuthTag(bytes.subarray(bytes.length - 16))
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString('utf8')) as number[]
}
export function distance(a: number[], b: number[]) {
  return Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0))
}
export function validDescriptor(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 128 && value.every(n => typeof n === 'number' && Number.isFinite(n) && n >= -2 && n <= 2)
}
