import { beforeEach, describe, expect, it } from 'vitest'
import { decryptDescriptor, encryptDescriptor, validDescriptor } from './biometrics'

beforeEach(() => { process.env.BIOMETRIC_ENCRYPTION_KEY = Buffer.alloc(32, 19).toString('base64') })

describe('plantillas biométricas en Vercel', () => {
  it('cifra y descifra descriptor AES-GCM sin alterarlo', () => {
    const input = Array.from({ length: 128 }, (_, index) => (index - 64) / 128)
    const ciphertext = encryptDescriptor(input)
    expect(ciphertext).not.toContain(JSON.stringify(input))
    expect(decryptDescriptor(ciphertext)).toEqual(input)
  })
  it('rechaza modificaciones del descriptor cifrado', () => {
    const [iv, encoded] = encryptDescriptor(Array(128).fill(0.1)).split('.')
    const bytes = Buffer.from(encoded, 'base64'); bytes[0] ^= 0x40
    expect(() => decryptDescriptor(`${iv}.${bytes.toString('base64')}`)).toThrow()
  })
  it('valida la dimensión y rango esperado del descriptor', () => {
    expect(validDescriptor(Array(128).fill(0))).toBe(true)
    expect(validDescriptor(Array(127).fill(0))).toBe(false)
    expect(validDescriptor([ ...Array(127).fill(0), 9 ])).toBe(false)
  })
})
