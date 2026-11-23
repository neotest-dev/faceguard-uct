import { describe, expect, it } from 'vitest'
import { validateFaces } from './camera'

describe('validación de captura', () => {
  it('rechaza ningún rostro y rostros múltiples', () => {
    expect(() => validateFaces([])).toThrow(/No detectamos un rostro/)
    expect(() => validateFaces([{ detection: { score: 0.9 }, descriptor: new Float32Array(128) }, { detection: { score: 0.9 }, descriptor: new Float32Array(128) }])).toThrow(/más de un rostro/)
  })
  it('rechaza calidad baja y devuelve el descriptor solo para una detección confiable', () => {
    expect(() => validateFaces([{ detection: { score: 0.5 }, descriptor: new Float32Array(128) }])).toThrow(/calidad/)
    const descriptor = new Float32Array(128).fill(0.25)
    expect(validateFaces([{ detection: { score: 0.8 }, descriptor }])).toHaveLength(128)
  })
})
