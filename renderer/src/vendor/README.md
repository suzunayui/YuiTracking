# One Euro Filter

Unmodified JavaScript implementation by Gery Casiez, Copyright 2019 Inria.

- Source: https://github.com/casiez/OneEuroFilter/blob/d78925584245597f2aa9c4c01a802eb0f0b77fb9/javascript/OneEuroFilter.js
- Revision: `d78925584245597f2aa9c4c01a802eb0f0b77fb9`
- SHA-256: `5c3d876a98d1592aaedb85818b4a6102dd6a0c0e9237f19d584096d8924a02a7`
- License: BSD 3-Clause, preserved in the source and THIRD-PARTY-NOTICES.txt.

The upstream filter takes timestamps in seconds. Application wrappers convert
camera observation times from milliseconds, reject duplicate/invalid input,
and reset on explicit camera stop or calibration. Head quaternion components
use the same scalar filter, with sign alignment and unit normalization.
No dead zones, motion-intent gates, candidate confirmation or separate damping
are added. Render interpolation remains separate from observation filtering.
