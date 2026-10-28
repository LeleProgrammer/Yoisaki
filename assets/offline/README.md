# 本地媒体目录

运行 `python scripts/download_assets.py` 后，资源会按在线镜像的相对路径存放在这里。
网站按“本地下载 → 随包样本（如有）→ 在线镜像”的顺序读取；在资源设置中可关闭在线回退。

本目录的下载文件默认由 `.gitignore` 排除，不随普通 `git add`、提交和推送上传。
仅本说明文件保留在仓库中。本地资源读取和下载器使用不受影响。
若旧版已跟踪或暂存资源，按项目 README 的步骤执行 `git rm --cached` 解除跟踪，
文件仍会保存在本机。

例如：

```text
assets/offline/character/member/res017_no046/card_normal.webp
assets/offline/thumbnail/chara/res017_no046_normal.webp
assets/offline/music/jacket/jacket_s_001/jacket_s_001.webp
assets/offline/music/long/0001_01/0001_01.mp3
assets/offline/music/music_score/0001_01/expert.txt
```

`download-manifest.json` 记录完成的大小、SHA-256 和本次失败清单；`.part`、`.part.json`
是续传文件。不要把未完成的 `.part` 文件改名成成品。网站本身不依赖下载清单，手工按路径
放入有效文件也能使用；下载新文件后刷新页面，以清除该页面先前缓存的“本地缺失”结果。

更多用法见项目根目录的 `docs/OFFLINE_ASSETS.md`。本目录的游戏素材版权属于各自权利人，
不因下载而变更，也不适用程序代码的 GPL 授权。
