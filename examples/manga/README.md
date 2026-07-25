# 漫画ネーム サンプル

`profile: manga` の1ページ分ネーム。本文は `.mes`、コマの感触は参考画像で補う。

参考画像は原稿の一部ではない（[ADR 0004](../../docs/decisions/0004-manga-reference-images.md)）。  
仕様書の漫画プロファイル・サンプルと同じ原稿を使う。

## station-name.mes — 駅前の二人（1ページ / 5コマ）

ソース: [station-name.mes](./station-name.mes)  
仕様書: [03-media-profiles.md](../../docs/spec/03-media-profiles.md)

```mes
profile: manga
title: 駅前の二人（ネーム）
----
== 1ページ

%1
^俯瞰ぎみ・広目
#夕方の改札前。人波。にかが焦って入ってくる
$雑踏（小さく）
```

![%1 参考画像](./refs/station-name-1.jpg)

```mes
%2
^にかバストアップ
@にか :表情 焦り
おくれた……！
```

![%2 参考画像](./refs/station-name-2.jpg)

```mes
%3
^二人を入れる引き
#こいとが柱の陰から半歩出る
@こいと :表情 呆れ
そういうニカちゃんも、ついさっき来たばかりじゃないですか。
```

![%3 参考画像](./refs/station-name-3.jpg)

```mes
%4
^にか寄り（汗）
@にか :表情 苦笑
#視線を逸らしながらボソッ
そういう時は……ランチを奢らせるのがだな…
```

![%4 参考画像](./refs/station-name-4.jpg)

```mes
%5
^こいと寄り
@こいと :表情 真顔
今日はだめです。
```

![%5 参考画像](./refs/station-name-5.jpg)

## refs/

| ファイル | 対応コマ |
|----------|----------|
| `refs/station-name-1.jpg` … `5.jpg` | `%1` … `%5`（仕様書サンプルと共通） |
