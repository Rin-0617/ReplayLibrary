# ReplayLibrary

Dalamud プラグイン **ReplayToolbox** の共有リプレイ・ライブラリ（公開配布用）。

- ReplayToolbox で「変換」または「プルとして書き出し」したリプレイを Discord に共有すると、
  その匿名化済みファイル（キャラ名→英語ジョブ名）がこのリポジトリに自動で取り込まれます。
- ReplayToolbox の「ライブラリ」タブから一覧を見て、他の人のリプレイをダウンロードして再生できます。
- 共有されるファイルはすべて**匿名化済み**で、本名・キャラ名は含まれません。

## 構成

| パス | 内容 |
|---|---|
| `index.json` | ライブラリ一覧（メタ情報） |
| `library/<共有ID>.dat` | 匿名化済みリプレイ本体 |
| `.github/workflows/ingest.yml` | Discord 共有チャンネルから自動取り込みする Action |
| `scripts/ingest.mjs` | 取り込みスクリプト |

## `index.json` の各エントリ

```json
{
  "id": "9f3e21bc",
  "content": "極○○討滅戦",
  "kind": "変換",
  "recordedAt": "2026/10/26 21:30",
  "build": 14155597,
  "sharer": "a1b2c3d4",
  "file": "library/9f3e21bc.dat",
  "size": 60864,
  "uploadedAt": "2026-11-01T12:34:56.000Z"
}
```

`sharer` は共有者の擬名ハッシュ（先頭8桁）、`id` は共有ID。生の Discord ID や実名は保存しません。

## 取り込みのしくみ

共有チャンネルを **Discord bot**（読み取り専用）で定期的に見て、新規の `.dat` 添付と
メッセージのメタ情報を解析し、`library/` にコミットして `index.json` を更新します。
bot トークンは GitHub Actions のシークレットにのみ置き、プラグインには含まれません。

必要なシークレット: `DISCORD_BOT_TOKEN`, `CHANNEL_ID`。
