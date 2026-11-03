/* SPDX-License-Identifier: MIT */
/* Missing entries inherit Standard. null means no software policy ceiling. */
const AkariFiniteProfileExample = {
  id: 'demo.roomy', version: '1.0.0',
  limits: { components: 600, sourceEach: 150000, listItems: 20000, functionOps: 2000000 },
};
const AkariUnlimitedProfileExample = {
  id: 'demo.unlimited', version: '1.0.0',
  limits: { components: null, sourceEach: null, listItems: null, functionOps: null },
};
if (typeof globalThis !== 'undefined') globalThis.AkariProfileExamples = [AkariFiniteProfileExample, AkariUnlimitedProfileExample];
if (typeof module !== 'undefined' && module.exports) module.exports = [AkariFiniteProfileExample, AkariUnlimitedProfileExample];
