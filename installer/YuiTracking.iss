#define AppVersion "0.1.2"
#define CameraClass "{5C2CD55C-92AD-4999-8666-912BD3E7003B}"
#define CameraCategory "{860BB310-5D01-11D0-BD3B-00A0C911CE86}"

[Setup]
AppId={{A4A68FE9-BAEA-4CBB-A7DD-877B688187BD}
AppName=YuiTracking
AppVersion={#AppVersion}
AppVerName=YuiTracking {#AppVersion}
AppPublisher=YuiTracking
DefaultDirName={localappdata}\Programs\YuiTracking
DefaultGroupName=YuiTracking
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
MinVersion=10.0.19041
OutputDir=..\dist\installer
OutputBaseFilename=YuiTracking-Setup-{#AppVersion}-x64
SetupIconFile=..\src\HoloTrack.App\Assets\Branding\YuiTracking.ico
UninstallDisplayIcon={app}\YuiTracking.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
AppMutex=Local\HoloTrack.App.SingleInstance
CloseApplications=yes
RestartApplications=no
UninstallLogMode=append
VersionInfoVersion={#AppVersion}.0
VersionInfoProductName=YuiTracking
InfoBeforeFile=install-notes.txt

[Languages]
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "デスクトップにショートカットを作成する"; Flags: unchecked

[Files]
Source: "..\dist\YuiTracking\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pdb,*.map,README.md"
; Shared with the portable app; retain the single stable native filter on uninstall.
Source: "..\src\HoloTrack.App\Assets\VirtualCamera\UnityCaptureFilter64.dll"; DestDir: "{localappdata}\HoloTrack\VirtualCamera"; Flags: onlyifdoesntexist uninsneveruninstall
Source: "..\.tools\MicrosoftEdgeWebview2Setup.exe"; Flags: dontcopy

Source: "install-notes.txt"; DestDir: "{app}"; DestName: "Readme.txt"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\YuiTracking"; Filename: "{app}\YuiTracking.exe"; WorkingDir: "{app}"; IconFilename: "{app}\YuiTracking.exe"
Name: "{autodesktop}\YuiTracking"; Filename: "{app}\YuiTracking.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
Root: HKCU64; Subkey: "Software\Classes\CLSID\{{5C2CD55C-92AD-4999-8666-912BD3E7003B}\InprocServer32"; ValueType: string; ValueName: ""; ValueData: "{localappdata}\HoloTrack\VirtualCamera\UnityCaptureFilter64.dll"
Root: HKCU64; Subkey: "Software\Classes\CLSID\{{5C2CD55C-92AD-4999-8666-912BD3E7003B}\InprocServer32"; ValueType: string; ValueName: "ThreadingModel"; ValueData: "Both"
Root: HKCU64; Subkey: "Software\Classes\CLSID\{{860BB310-5D01-11D0-BD3B-00A0C911CE86}\Instance\{{5C2CD55C-92AD-4999-8666-912BD3E7003B}"; ValueType: string; ValueName: "CLSID"; ValueData: "{{5C2CD55C-92AD-4999-8666-912BD3E7003B}"
Root: HKCU64; Subkey: "Software\Classes\CLSID\{{860BB310-5D01-11D0-BD3B-00A0C911CE86}\Instance\{{5C2CD55C-92AD-4999-8666-912BD3E7003B}"; ValueType: string; ValueName: "FriendlyName"; ValueData: "YuiTracking Camera"
Root: HKCU64; Subkey: "Software\Classes\CLSID\{{860BB310-5D01-11D0-BD3B-00A0C911CE86}\Instance\{{5C2CD55C-92AD-4999-8666-912BD3E7003B}"; ValueType: string; ValueName: "DevicePath"; ValueData: "holotrack:avatar:42"

[Run]
Filename: "{app}\YuiTracking.exe"; Description: "YuiTrackingを起動する"; Flags: nowait postinstall skipifsilent

[Code]
const
  WebViewKey = 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  CameraServer = 'Software\Classes\CLSID\{#CameraClass}\InprocServer32';

function HasRuntimeAt(Root: Integer): Boolean;
var Version: String;
begin
  Result := RegQueryStringValue(Root, WebViewKey, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0');
end;

function HasWebView: Boolean;
begin
  Result := HasRuntimeAt(HKCU32) or HasRuntimeAt(HKLM32) or HasRuntimeAt(HKCU64) or HasRuntimeAt(HKLM64);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var Existing: String; ExitCode: Integer;
begin
  Result := '';
  if RegQueryStringValue(HKCU64, CameraServer, '', Existing) then
    if CompareText(Existing, ExpandConstant('{localappdata}\HoloTrack\VirtualCamera\UnityCaptureFilter64.dll')) <> 0 then begin
      Result := '仮想カメラのスロットは別の登録に使用されています。既存の登録は変更しません。';
      Exit;
    end;
  if not HasWebView then begin
    ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
    if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'), '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then begin
      Result := 'WebView2のセットアップを起動できませんでした。';
      Exit;
    end;
    if not HasWebView then
      Result := 'WebView2のインストールを確認できませんでした。インターネット接続を確認し、Microsoft WebView2 Runtimeをインストールしてから再実行してください。';
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var Existing: String;
begin
  if CurUninstallStep = usUninstall then
    if RegQueryStringValue(HKCU64, CameraServer, '', Existing) then
      if CompareText(Existing, ExpandConstant('{localappdata}\HoloTrack\VirtualCamera\UnityCaptureFilter64.dll')) = 0 then begin
        RegDeleteKeyIncludingSubkeys(HKCU64, 'Software\Classes\CLSID\{#CameraCategory}\Instance\{#CameraClass}');
        RegDeleteKeyIncludingSubkeys(HKCU64, 'Software\Classes\CLSID\{#CameraClass}');
      end;
  { User VRMs, settings and logs are retained. }
end;
