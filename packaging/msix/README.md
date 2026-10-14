# MSIX build and Store submission

The same self-contained Windows x64 app can be distributed as an EXE installer or an MSIX package. The MSIX contains the WinUI/.NET runtime, renderer, recognition models, sample VRMs and third-party notices. WebView2 Runtime must already be installed on the device.

## Development package

Run `powershell -ExecutionPolicy Bypass -File scripts/build-msix.ps1`. Use `-SkipAppBuild` only after publishing the matching app version. Windows SDK MakeAppx is required. No certificate is created or trusted, and the script does not install the package.

The build includes `resources.pri` for packaged WinUI startup. Simply wrapping the unpackaged EXE without that primary XAML resource index causes a startup crash.

The unsigned package is written to `dist/msix/YuiTracking-<version>-x64-development.msix`. The printed development layout can be registered with `Add-AppxPackage -Register <layout>/AppxManifest.xml` on a machine where Developer Mode is already enabled. Direct distribution of the `.msix` to users requires an appropriately trusted signature. Microsoft signing applies to packages distributed through Microsoft Store.

## Store package

Reserve an **MSIX or PWA app** in Partner Center, then copy the exact package identity name, publisher and publisher display name from its identity details. An EXE/MSI product's GUID is not an MSIX package identity. Do not invent these values or submit the development identity.

```powershell
./scripts/build-msix.ps1 -Store -IdentityName '<Partner Center package name>' -Publisher '<Partner Center publisher>' -PublisherDisplayName '<display name>'
```

The unsigned Store package is written to `dist/msix/YuiTracking-<version>-x64-store.msix`. Store replaces the package signature during publishing. Application version `year.MMdd.counter` becomes MSIX version `year.MMdd.counter.0`; every component must fit in an unsigned 16-bit integer and the final component remains zero.

YuiTracking's MSIX registration is Store ID `9N5SV0WQDD07`. Its identity was verified in Partner Center on 2026-10-15 and saved in `store-identity.json`. Build for this registration with:

```powershell
./scripts/build-msix.ps1 -Store -IdentityFile packaging/msix/store-identity.json
```

The earlier unpublished EXE/MSI registration was deleted to release the reserved name; this is a new MSIX product. Its Japanese listing text was exported before deletion, and Store artwork remains available locally for the new submission.

## Virtual camera and shared settings

The app runs as full-trust desktop code, preserving the existing named mutex/events/shared-memory protocol. Starting virtual output or using the registration button registers the user-level DirectShow COM filter; no kernel driver or service is installed. There is no installer hook in MSIX, so registration occurs through the app.

OBS runs outside the MSIX package and must read the camera's registry entries and load its DLL. The manifest therefore requests `unvirtualizedResources`:

- Windows 11 excludes only `%LOCALAPPDATA%/YuiTracking` and the two camera CLSID/category keys from virtualization.
- Windows 10 uses the documented legacy declarations to disable HKCU/AppData write virtualization for compatibility.
- Settings, WebView profile/logs and the stable camera DLL remain in the same user folder as the EXE edition. This preserves migration and prevents registered DLL paths from pointing to a package version that an update removes.
- Single-instance mutexes prevent EXE and MSIX editions from concurrently opening the camera or writing settings.
- As with the EXE edition, uninstall does not delete shared user settings/logs or the stable camera DLL. `scripts/unregister-camera.ps1` can remove an unused registration after all editions are closed.

`runFullTrust` and `unvirtualizedResources` are restricted capabilities. Store approval is required; a successfully built or locally registered package does not confirm certification. Suggested justification: “YuiTracking exports a virtual camera to independent desktop applications such as OBS. These consumers require access to the user's DirectShow COM registration and stable filter DLL. Windows 11 exceptions are scoped to two camera keys and the YuiTracking AppData folder; no HKLM changes, kernel drivers or NT services are used.”

Verify the package in a clean user profile, including startup, webcam recognition, file pickers, global calibration, restart recovery, OBS discovery, frames/alpha, update and uninstall behavior. An existing EXE camera registration alone does not prove MSIX registration works.

After building, run `./scripts/test-msix.ps1 -DevelopmentLayout '<printed development layout>'` from PowerShell 7. On an already enabled Developer Mode machine, this builds and registers a temporary test-only app with the same runtime/capability declarations. It writes random values in the camera's two registration keys and a fresh AppData file, then checks them and named shared memory from an independent unpackaged process launched through Explorer. The producer deletes its own test values and the test unregisters its fixture in `finally`. No camera configuration or user settings are replaced. This test catches false results from terminals that themselves run inside an MSIX registry view. It verifies the loose development layout; it does not substitute for a signed package install/update/uninstall test on Windows 10 and 11.

Validated locally on Windows 11: MakeAppx schema/package validation, development registration, independent registry/AppData/memory/event probe, application startup, existing VRM display and virtual output while OBS is connected. Retail signed installation and clean-profile webcam/OBS/update/uninstall checks remain release checks.

References: [Store distribution](https://learn.microsoft.com/en-us/windows/apps/distribute-through-store/how-to-distribute-your-win32-app-through-microsoft-store), [flexible virtualization](https://learn.microsoft.com/en-us/windows/msix/desktop/flexible-virtualization), [full-trust IPC](https://learn.microsoft.com/en-us/windows/apps/develop/communication/interprocess-communication).
