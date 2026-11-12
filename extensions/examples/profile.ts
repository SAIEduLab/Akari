/* SPDX-License-Identifier: MIT */
/* Missing entries inherit Standard. null means no software policy ceiling. */
export const finiteProfile = {
  id: 'demo.roomy', version: '1.0.0',
  limits: { components: 600, sourceEach: 150000, listItems: 20000, functionOps: 2000000 },
};
export const unlimitedProfile = {
  id: 'demo.unlimited', version: '1.0.0',
  limits: { components: null, sourceEach: null, listItems: null, functionOps: null },
};
export const profiles = [finiteProfile, unlimitedProfile];
