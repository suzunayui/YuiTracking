# YuiTracking Electron版

Apple Silicon（M1〜M4など）向けのデスクトップ版です。既存のVRM描画・顔・上半身・手・指の認識を共有しています。WindowsのWinUI版は引き続き利用できます。

## 開発起動

Node.jsとnpmをインストールして、リポジトリのルートから実行します。

```sh
cd renderer
npm ci
cd ../electron
npm ci
npm start
```

「カメラを開始」を押したときにカメラを使用します。Macではカメラの利用を許可してください。モデル・認識処理はローカルで動き、音声入力は使いません。

設定はElectronのuserDataフォルダ内のsettings.jsonに保存します。Macの標準位置は `~/Library/Application Support/YuiTracking/settings.json` です。前回のVRM・表示位置・拡大率・滑らかさ・顔の強さ・口と揺れものの調整・Syphon出力のオン／オフを復元します。

## OBSへのSyphon出力

1. Macで「Syphon出力を開始」を押します。
2. OBSのソース追加から「Syphonクライアント」（Syphon Client / Syphon Source）を選びます。
3. 送信元 `YuiTracking` を選びます。緑背景を抜く場合はクロマキーフィルターを追加します。

1280×720のアバターと背景だけを、最大60回／秒で送信します。操作画面・ファイル選択・実写カメラは出力に含めません。緊急待機画面とモデル読み込み中は送信側でも待機画像に差し替え、描画フレームが700ms以上途切れた場合も待機画像になります。アプリ終了時は送信元を解除します。アプリ強制終了後の表示はOBS側の挙動に依存します。

この版はcanvasの画素をIPCで渡してSyphon Metalへアップロードします。GPUの直接共有ではないため、実FPSはモデル・Macの負荷に依存します。OBSでの長時間動作・M4実機の性能確認は未実施です。

Syphonは仮想カメラではありません。OBSの「映像キャプチャデバイス」への出力や、Web会議アプリでのカメラ選択には対応しません。Syphonの利用にApple Developer Programの有料登録は不要です。

## Mac配布ファイル

Mac上で次を実行すると、`dist/electron/` にarm64のDMGとZIPを生成します。

```sh
cd electron
npm run package:mac
```

配布ファイルは有料Developer ID署名・Apple公証を付けていない試用版です。ネイティブライブラリには無料のアドホック署名を付けます。この署名はAppleによる開発元の認証ではなく、Gatekeeperの警告を解消するものでもありません。Mac実機での起動・実カメラ認識・トラッキング品質は未検証です。

検証用に `npm test` で描画・テスト映像による認識・設定復元を確認します。Mac上ではネイティブSyphon受信器を作り、アバター背景・色順・待機画像・停止の受信も確認します。実Webカメラを自動で起動しないテストです。Windows版の仮想カメラDLLは同梱しません。
