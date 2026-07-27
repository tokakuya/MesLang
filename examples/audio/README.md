# 音声作品の見本

`profile: audio`（または省略時の既定）の原稿です。  
`$`（音）と `!`（位置）の書き方の目安は、[語彙ガイド](../../docs/spec/03-media-profiles.md#音と位置の語彙ガイドよく使う書き方) にまとめています。  
字幕や尺が必要なときだけの `&` も、同じ節に短く書いてあります。

## station.mes — 駅前の二人

ソース: [station.mes](./station.mes)

オープニングの会話に、BGM・環境音・左右・遠近のメモを足した見本です。  
セリフの流れは止めず、音まわりだけあとから厚くしています。  
かぎかっこ速記（`@にか[焦り]` / `@にか[思索][ヒソヒソ]`）は、音声では 2 個目が **声質** になります。

## 旧 Mes 取り込みの前後

- [mes-import-before.mes](./mes-import-before.mes) … ヘッダー `$title`、行頭 `○`、旧流儀の `$ヒソヒソ声` が残ったままの例
- [mes-import-after.mes](./mes-import-after.mes) … 互換レイヤで `#` にし、話者の声を `:声質` へ移したあとの例

手順は [06-mes-compat.md](../../docs/spec/06-mes-compat.md)、`$` と `:声質` の分け方は [音声プロファイル](../../docs/spec/03-media-profiles.md#音声作品profile-audio) をどうぞ。  
ヘッダーの `$title` は変数で、本文の `$音` とは別ものです（[コア仕様](../../docs/spec/01-core.md#ヘッダー変数任意)）。
