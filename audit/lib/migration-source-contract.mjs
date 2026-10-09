import {verifyCurrentAuditFile} from './current-audit-basis.cjs';
// Kept as an API name for existing validators. It returns checked CURRENT bytes.
// Historical metadata labels and playback/license hunks are never reapplied.
export function preservedCandidateBytes(file,bytes){
  verifyCurrentAuditFile(file,bytes);return bytes;
}
