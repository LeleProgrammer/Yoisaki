# 下载媒体与离线使用

本功能需要 **Python 3.8 或更高版本**，仅使用标准库，不需要 `pip install`。
网站本身仍是纯静态 HTML、CSS、普通 JavaScript。

## 从哪里开始

解压新版完整项目包，进入能看到 `index.html`、`assets/`、`data/` 和 `scripts/` 的目录。
在该目录打开终端。Windows 可把下面的 `python` 换成 `py`，macOS/Linux 可换成 `python3`。

先查看将下载多少文件，这条命令不会联网或写入文件：

```bash
python scripts/download_assets.py --dry-run
```

下载全部已收录且截至快照截止时间已发布的国服媒体：

```bash
python scripts/download_assets.py
```

默认下载高清卡面、缩略图、曲绘、全部演唱版本音频与谱面。以随包数据为例，清单有约
9,700 个文件，完整音频与高清图片需要较大的磁盘空间；实际大小取决于镜像文件，脚本不
编造总容量估计。可以先按下面的方法下载少量资源，确认网络和使用效果。

下载器会：

- 使用 4 个并发任务；支持 `--workers 1` 到 `--workers 16`。
- 跳过已完成文件；文件长度或基础格式异常时重新下载。
- 使用 `.part` 保存中断文件；镜像提供 ETag 或 Last-Modified 时通过 Range / If-Range
  续传。服务器不支持续传、版本改变或断点失效时从头下载，避免拼接错误文件。
- 失败时额外重试 3 次；404、403 等明确不可用的条目直接记录失败。
- 校验文件基础格式与长度，对下载完成的文件记录 SHA-256；写入成功后才替换最终文件。
- 把完成记录及本次失败清单保存到 `assets/offline/download-manifest.json`。部分失败时
  返回非零退出码；已成功的资源仍可使用。

关闭终端或按 Ctrl+C 后，再次运行**同一条命令**即可继续。Ctrl+C 会等待当前网络读取退出，
通常受 `--timeout` 控制；新文件的下载进度保存在临时文件中。

## 只下载需要的部分

只下载全部卡面、缩略图和曲绘，不下载音频与谱面：

```bash
python scripts/download_assets.py --types cards thumbnails jackets
```

只下载指定卡牌的特训前后高清图与缩略图：

```bash
python scripts/download_assets.py --types cards thumbnails --card-ids 1185,1253
```

只下载指定歌曲的曲绘、全部演唱版本和全部已收录难度谱面：

```bash
python scripts/download_assets.py --types jackets audio charts --music-ids 1,2,3
```

每首歌只下载列表中的第一个演唱版本，减少音频体积：

```bash
python scripts/download_assets.py --types audio --audio-mode first
```

选择其他未下载的演唱版本时，网页会按当前资源设置在线回退或提示音源不可用。

`--card-ids` **只限制卡牌类资源**；`--music-ids` **只限制歌曲类资源**。例如，只写
`--music-ids 1` 而不写 `--types`，仍会下载全部卡牌。要下载小范围，请同时指定类别。

完整选项：

```bash
python scripts/download_assets.py --help
```

| 参数 | 作用 |
| --- | --- |
| `--types cards thumbnails jackets audio charts` | 指定一个或多个类别，默认全部 |
| `--card-ids 1185,1253` | 限制卡牌 ID，自动区分可否特训 |
| `--music-ids 1,2` | 限制歌曲 ID |
| `--audio-mode all` / `first` | 全部演唱版本或每曲第一个，默认 all |
| `--project-root "D:/Tools/Yoisaki"` | 指定项目目录，适用于从其他目录启动或单独下载脚本 |
| `--workers 4` | 并发数，默认 4 |
| `--timeout 30` | 单次网络读写超时秒数，默认 30 |
| `--retries 3` | 失败后额外重试次数，默认 3 |
| `--source https://example.com/sekai-cn-assets` | 使用同路径结构的其他国服镜像 |
| `--dry-run` | 显示数量，不联网、不写文件 |
| `--check` | 仅检查选定资源是否齐全，不联网；缺失时退出码为 1 |
| `--verify` | 对已完成文件额外重算 SHA-256，与记录比较；可与 `--check` 合用 |
| `--force` | 重新下载选定资源；完整成功后替换旧文件 |

脚本只读取本项目 `data/master.js` 的 JSON 数据，不执行其中的 JavaScript，不需要账号、
UID 或游戏登录信息。下载前应先解压完整项目；单独的脚本也需要该主数据文件。
单独下载的 `download_assets.py` 可放到项目根目录或 `scripts/` 中运行；也可以用
`--project-root` 明确指定项目路径。

## 文件放在哪里

脚本固定把媒体写入该项目的 `assets/offline/`，保留镜像相对路径：

| 资源 | 本地路径示例 |
| --- | --- |
| 高清卡面 | `assets/offline/character/member/res017_no046/card_normal.webp` |
| 特训后卡面 | `assets/offline/character/member/res017_no046/card_after_training.webp` |
| 缩略图 | `assets/offline/thumbnail/chara/res017_no046_normal.webp` |
| 曲绘 | `assets/offline/music/jacket/jacket_s_001/jacket_s_001.webp` |
| 音频 | `assets/offline/music/long/0001_01/0001_01.mp3` |
| 谱面 | `assets/offline/music/music_score/0001_01/expert.txt` |

网站通过与页面同源的相对路径读取这些文件，在 GitHub Pages 仓库子路径下也能使用。
网页不依赖下载记录才能找到文件，手工按正确路径放入有效图片、音频、SUS 同样可用。
不要把 `.part` 或 `.part.json` 改名成最终资源。

## 网页如何选择资源

图片、音频的读取顺序是：

1. `assets/offline/` 中对应的有效文件。
2. 随项目附带的样本（仅部分条目有）。
3. 资源设置中的在线镜像（默认开启）。

卡牌列表、首页、详情页、队伍头像、卡面下载与 PNG 报告都使用相同的优先顺序。本地图片
存在且可解码时，不会请求在线图片；本地缺失或损坏时自动尝试下一来源。音频采用同样的
顺序，并在切换来源时保持谱面进度；在线音频仍需要镜像提供浏览器跨域许可。

六张随包谱面直接读取内置 JS 数据；其他谱面先读取 `assets/offline/`，再按设置在线回退。
HTTP 200 但内容是错误页面的本地谱面也会被拒绝，不会作为假谱面显示。

页面会记住本次访问中已经失败的本地路径，减少重复的 404 请求。**在网页打开期间下载了
新文件后，请刷新页面**；修改资源设置也会重置失败记录。修改过同名媒体仍显示旧图时，可
使用浏览器强制刷新以避开旧缓存。

## 彻底离线使用

1. 联网时完成希望使用的资源下载。
2. 在项目根目录启动本地静态服务：

   ```bash
   python -m http.server 8000 --bind 127.0.0.1
   ```

3. 打开 `http://127.0.0.1:8000/`。
4. 点击右上角“资源设置”，勾选“仅使用本地资源”，保存。

这个模式不会自动访问在线媒体镜像。未下载的图片显示占位图；无音源的谱面可以无声预览；
没有本地或内置谱面的条目会提示读取失败。数值、材料与方案功能本来就在本地执行。
PNG 导出同样会从本地加载卡面。为保证图片导出和谱面读取，请使用本地 HTTP 服务，
不要仅用 `file://` 双击打开页面。静态服务只提供本地文件，不需要业务后端。

## 与 GitHub Pages 一起使用

下载到你电脑上的资源默认仅在本机使用。`.gitignore` 忽略 `assets/offline/` 下全部内容，
仅保留目录说明 `README.md`；普通 `git add .`、提交和推送不会包含这些新下载的媒体。
Git 会跳过已忽略的资源子目录，避免逐个读取大文件。图片、音频、谱面仍保留在本机，
供本地网站读取；Pages 上没有对应文件时按网页设置在线回退。

如果下载文件已经暂存或被跟踪，仅修改 `.gitignore` 不能解除跟踪。先结束仍在执行的
`git add`，再在项目根目录执行一次：

```bash
git rm -r --cached --ignore-unmatch -- assets/offline
git add .
```

`--cached` 不删除工作区文件。第二条命令会保留目录的 README，并跳过下载的资源。
确认暂存内容后再提交、推送即可；这不会移除过去提交历史中的大文件。

可使用 `git check-ignore -v <下载文件的相对路径>` 检查忽略规则。不要使用 `git add -f`
强制添加下载目录；该选项会绕过忽略规则。

可选的 `scripts/build.py` 面向本地或手工分发，仍把已下载的最终资源复制到 `dist/`，
并排除未完成的 `.part`、临时状态和下载清单。`dist/` 本身也被 Git 忽略；Pages 从
仓库根目录部署时不需要运行构建脚本。

完整媒体适合在本机保存；GitHub 官方目前规定已发布的 Pages 站点大小不超过 **1 GB**，
见 [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)。
因此本项目默认保留线上小体积版本，本机另外保存下载资源。

## 更新数据或处理失败

- 游戏新增内容后，先按 README 使用 `scripts/refresh_data.py` 刷新国服主数据，再运行下载器。
  下载器只能补齐主数据中已有的路径，不会发现镜像未收录的新歌或卡面。
- 同名文件若被镜像替换，默认跳过逻辑不会主动联网比较版本；对相应 ID 使用 `--force` 更新。
- 404、403、超时会写入本次失败清单，不会生成虚假的完成文件。再次运行会跳过已完成条目，
  重试仍缺失的资源；镜像确实缺失的文件需要等待补齐或换兼容来源。
- 下载器的 `--source` 与网页的“在线回退根地址”分别设置；下载到标准本地路径后，网页
  不需要知道文件是从哪个兼容镜像取得的。

下载器不改变游戏素材的版权与使用条件，详见项目 `THIRD_PARTY.md`。
