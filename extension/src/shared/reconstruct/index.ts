/**
 * Public surface of the reconstruction engine (Phase 3).
 *
 * Consumers (popup preview, tests, later export phases) should import from
 * this module only — internal files are implementation details.
 */
export { reconstructCapture, resolveReconstructionOptions } from './reconstruct';
export { validateReconstructionResult } from './validation/validate';
export { compareStructure } from './validation/parity';
export { ReconstructionInputError } from '../types/reconstruct';
export type { StructureParityReport } from './validation/parity';
export { utf8ByteLength } from './bytes';
export {
  DEFAULT_RECONSTRUCTION_OPTIONS,
  RECONSTRUCTION_LIMITS,
  RECONSTRUCTION_RESULT_VERSION,
  generatedClassName,
} from '@/shared/constants/reconstruct';
