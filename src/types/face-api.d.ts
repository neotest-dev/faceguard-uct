declare module 'face-api.js' {
  export const nets: { tinyFaceDetector: { loadFromUri(uri: string): Promise<void> }; faceLandmark68Net: { loadFromUri(uri: string): Promise<void> }; faceRecognitionNet: { loadFromUri(uri: string): Promise<void> } }
  export class TinyFaceDetectorOptions { constructor(options?: { inputSize?: number; scoreThreshold?: number }) }
  export function detectAllFaces(input: HTMLVideoElement, options?: TinyFaceDetectorOptions): { withFaceLandmarks(): { withFaceDescriptors(): Promise<Array<{ detection: { score: number; box: { x: number; y: number; width: number; height: number } }; descriptor: Float32Array }>> } }
}
