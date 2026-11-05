# YuiTracking's native DirectShow filter

Vendored from https://github.com/schellingb/UnityCapture at
`3ed54c325e0ad71afcf4f246c07e5e17b3d7f2d2` (MIT; notices preserved in source
and `THIRD-PARTY-NOTICES.txt`). `streams.cpp` / `streams.h` are upstream's
self-contained DirectShow support; no separate DirectShow base-class SDK is needed.

YuiTracking changes: `FillBuffer` clears the output when its producer has never
started or stopped sending. This emits transparent black for BGRA and black for
RGB, instead of the upstream test pattern and error text. Resolution mismatch
diagnostics and frame conversion are unchanged.

Build the bundled x64 DLL with `scripts/build-camera-filter.ps1` (Visual Studio
C++ tools and Windows SDK required). Output is also copied to the application's
existing `Assets/VirtualCamera/UnityCaptureFilter64.dll` path.

Installed revision: `VirtualCamera/quiet-v1/UnityCaptureFilter64.dll`. A separate
path permits an upgrade while OBS still has the old DLL loaded. Existing camera
CLSID, device name, DevicePath and shared-memory channel stay unchanged. Already
open receiver processes use their loaded DLL until they restart; no forced
receiver shutdown is performed. Increment this revision for future native changes.

Regression check: build `tests/native-camera-smoke.vcxproj` (Release/x64), then
run `dist/native-test/native-camera-smoke.exe <absolute DLL path>` and repeat
with `--rgb24`. This loads the real DLL without registration, uses an isolated
channel (slot 60, refusing an occupied channel), and checks cold-start blank
frames, unchanged live frames, timeout blanking and reconnection. It does not
touch the production slot 42 or OBS's configuration.
