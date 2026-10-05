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

設定はElectronのuserDataフォルダ内のsettings.jsonに保存します。Macの標準位置は `~/Library/Application Support/YuiTracking/settings.json` です。前回のVRM・表示位置・拡大率・滑らかさ・顔の強さ・口と揺れものの調整を復元します。

## Mac配布ファイル

Mac上で次を実行すると、`dist/electron/` にarm64のDMGとZIPを生成します。

```sh
cd electron
npm run package:mac
```

Apple Developer署名・公証用の環境がない場合、署名・公証済みの配布アプリにはなりません。Mac実機での起動・カメラ認識・トラッキング品質は未検証です。Windows上でのElectron起動・描画・設定保存を確認しています。

**この版は仮想カメラ未対応です。** OBSの映像キャプチャデバイスへの出力は、Mac用ネイティブカメラ拡張を後から追加する予定です。Windows版の仮想カメラDLLは同梱しません。
