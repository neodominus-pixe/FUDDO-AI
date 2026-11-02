import { buildPlatingModel } from '../model3d'
import { MODEL_PRICING } from '../pricing'
import type { ModelProvider, ModelRequest, ModelResult } from './types'

// Builds a real glTF from the layout engine, so the viewer loads it exactly the
// way it will load a file from Meshy or Tripo.
//
// Be aware this flatters the real thing. The mock knows where every component
// actually is; a paid service only sees one picture, so it invents the back of
// the plate and smears thin garnish. Treat the mock as a shape-of-the-pipeline
// preview, not as a quality preview.
export const mock3dProvider: ModelProvider = {
  id: 'mock-3d',
  async generate(req: ModelRequest): Promise<ModelResult> {
    const started = Date.now()
    const { gltf, parts, plateRadius } = buildPlatingModel(req.dish, req.spec)
    return {
      gltf,
      url: null,
      costUsd: MODEL_PRICING['mock-3d'].usdPerModel,
      latencyMs: Date.now() - started,
      parts,
      plateRadius,
    }
  },
}
