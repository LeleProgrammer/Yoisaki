# 国服谱面与媒体资源

采集日期：2026-10-27。此目录的 `.sus` 均来自国服资源镜像，未经修改；不是演示生成谱面。

## 资源路径

已验证主资源根地址：`https://storage.exmeaning.com/sekai-cn-assets`。2026-10-27 实测以下资源返回 HTTP 200 和 `Access-Control-Allow-Origin: *`：

- 谱面：`music/music_score/{歌曲 ID，四位补零}_01/{难度}.txt`
- 歌曲音频：`music/long/{musicVocals.assetbundleName}/{musicVocals.assetbundleName}.mp3`
- 曲绘：`music/jacket/{musics.assetbundleName}/{musics.assetbundleName}.webp`
- 卡面：`character/member/{cards.assetbundleName}/card_normal.webp` 和 `card_after_training.webp`
- 卡牌缩略图：`thumbnail/chara/{cards.assetbundleName}_normal.webp` 和 `_after_training.webp`

完整源地址及本地文件记录在 `sources.json`、`asset-sources.json` 中。随包两首音频转换为 96 kbps MP3，以减小体积，未裁剪，保留原来的前置静音。

以上是第三方维护的公开游戏资源镜像；后续可用性和更新速度由上游决定。国服元数据与国服谱面配对，不能静默使用日服调整过的谱面代替。

## 音画对齐

游戏音频包含前置静音，谱面从音乐有效部分的零点开始。`musics.fillerSec`（有 `filterSec` 时优先）给出音频相对谱面的偏移秒数。例如歌曲 1 的 `fillerSec = 9`，实测音频前约 8.98 秒静音，SUS 第一个音符在谱面时间 0。

因此通常 `谱面时间 = audio.currentTime - fillerSec`；跳转到谱面零点应跳至音频的 `fillerSec`。

## SUS 格式参考

解析信息交叉参考了真实国服 SUS 与 Uni PJSK Viewer 的 GPL-3.0 开源解析器：

- <https://github.com/watagashi-uni/Uni-PJSK-Viewer-Frontend/blob/main/src/vendor/sekai-sus2img/parser.ts>
- <https://github.com/watagashi-uni/Uni-PJSK-Viewer-Frontend/blob/main/src/vendor/sekai-sus2img/model.ts>
- <https://github.com/StarMoe-org/Moesekai/blob/main/web/src/lib/assets.ts>

基本语义：

- `#mmm02: N` 是每小节拍数，默认 4，持续生效；不是 BMS 的小节比例。
- `#BPMxx: N` 定义 BPM；`#mmm08: xx...` 在小节中的对应均分位置应用 BPM。
- `#mmm1L: TW...` 为 TAP；`#mmm3LC: TW...` 为 SLIDE；`#mmm5L: TW...` 为方向标记；`#mmm9LC: TW...` 为无判定装饰 SLIDE。
- `mmm` 是十进制小节，`L` 是 base36 轨道、`C` 是 base36 滑条通道；可玩轨道是 L=2..13，对应内部 0..11；W 为 base36 宽度。
- 数据每两字符为一格，`00` 为空格，所有格在一小节中等分。支持带逗号的单音符速率扩展时，要按格计数，不能把倍率字符串计入格数。
- TAP 类型 1 普通、2 金键、3 Flick、4 Damage、5/6 Trace/金 Trace、7/8 隐去/金隐去标记。
- 方向类型 1 上、2 下、3 左上、4 右上、5 左下、6 右下。
- SLIDE 类型 1 开始、2 结束、3 中继、5 隐藏控制点。按通道连接，到类型 2 结束后通道可重用。
- 同一小节位置、轨道、宽度的 TAP、方向与 SLIDE 标记需要合并，从 TAP 继承金键等信息，避免绘制重复音符。
- `#TILxx` 提供 `小节'tick:倍率` 的变速事件；`ticks_per_beat` 通常为 480。
- 将小节位置换算为秒时，在 BPM／每小节拍数事件处分段积分：小节增量 × 当前每小节拍数 × 60 / 当前 BPM。

## 权属

本站程序的开源许可不改变游戏音频、卡面、曲绘和谱面的原有权属；这些资源归 SEGA、Colorful Palette、Crypton 及相应权利人所有。
