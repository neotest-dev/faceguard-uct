const MODEL_PATH = '/models'
let ready: Promise<void> | undefined
export function loadFaceModels() {
  ready ??= import('face-api.js').then(faceapi => Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_PATH), faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_PATH), faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_PATH)])).then(() => undefined)
  return ready
}
export async function captureDescriptor(video: HTMLVideoElement) {
  await loadFaceModels()
  const faceapi = await import('face-api.js')
  const faces = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.65 })).withFaceLandmarks().withFaceDescriptors()
  return validateFaces(faces)
}
export function validateFaces(faces: Array<{ detection: { score: number }; descriptor: Float32Array }>) {
  if (faces.length !== 1) throw new Error(faces.length === 0 ? 'No detectamos un rostro. Centra tu cara y mejora la iluminación.' : 'Detectamos más de un rostro. Asegúrate de estar a solas frente a la cámara.')
  if (faces[0].detection.score < 0.75) throw new Error('La calidad de captura es insuficiente. Acércate y mira al frente.')
  return Array.from(faces[0].descriptor)
}
