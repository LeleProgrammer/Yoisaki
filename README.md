# Yoisaki

**国服 PJSK 卡牌图鉴、谱面研究室与养成规划工具。**

纯 HTML、CSS、JavaScript，普通脚本加载，无前端框架、无 npm 运行依赖、无后端。可直接部署到 GitHub Pages 的仓库根目录。

GitHub Description 建议：

> A Project SEKAI CN companion for card art, interactive chart playback, team growth planning, and beautiful PNG reports.

## 已实现的功能

### 卡牌图鉴

- 搜索卡名、角色和卡牌 ID，按角色、组合、属性、稀有度和卡牌类型筛选。
- 切换特训前／后高清卡面，收藏卡牌、下载原图、导出精美资料卡 PNG。
- 查阅逐级卡牌数值、满配基础综合力与技能等级 1～4 的说明。
- 对有特训追加技能的卡牌，分开展示原始与追加技能，并可设置技能参照角色等级。
- 所有检索均基于内置国服数据；未来发布条目不会提前作为“已实装”展示。

### 谱面研究室

- 查询国服歌曲及 EASY／NORMAL／HARD／EXPERT／MASTER／APPEND 难度，实际可选项取决于国服资料。
- 解析真实国服 SUS，生成完整静态谱面，支持缩放、浅深底色和 PNG 下载。
- 动态透视轨道预览，显示普通键、金键、方向滑键、滑条与装饰轨迹。
- 支持音频播放／暂停、音符流速 1.0～12.0、播放速度 0.25～2.0×、音频校准和进度条跳转。
- 可切换演唱版本，使用 `fillerSec` 对齐音频留白；音源暂不可用时可进行无声预览。
- 快捷键：空格播放／暂停，左右方向键前后跳转 5 秒；输入框、选择框、对话框内不拦截快捷键。
- 随包内置六张真实谱面、两首保留原始开头留白的音源；其他谱面与音源优先读取本地下载，缺失时可在线回退。

静态谱面按列从左至右、每列从上至下阅读。动态模式用于观察和练习，不实现游戏判定与打击输入。谱面的“绘制对象数”和游戏物量不是同一概念；页面中的物量读取国服原表，滑条中间判定点不会被误当成独立绘制对象总数。

### 单卡与五人队伍养成

- 单卡与五人编组有独立草稿，切换模式不会把整队替换成单卡。
- 每张卡分别设置当前和目标：等级、特训、专家等级、技能等级、前后篇剧情、对应装饰画。
- 自动计算普通编组的同组合／同属性全员匹配、虚拟歌手原组合与应援组合取优。
- 分别设置 55 件区域道具的当前／目标等级，提供相关道具筛选与批量设置。
- 设置角色等级、持有称号综合力、MySEKAI 大门等级与家具合计加成。
- 显示基础、区域道具、角色等级、家具、大门、称号及逐卡综合力明细。
- 汇总等级练习、特训、专家训练、技能升级、剧情、装饰画、区域道具和大门升级材料。
- 同一公共道具按全局升级计算一次，不会因队伍里有五张卡重复收费。
- 支持填写每种材料库存，实时显示扣减后的缺口。
- 可选练习乐谱规格、技能支付方式、专家训练支付方式与装饰画尺寸配方。

### 保存与分享

- 自动保存两种模式的草稿，收藏卡牌，命名保存多套方案。
- 单个方案或全部已保存方案可导出／导入 JSON。
- 养成报告、卡牌资料卡均支持夜间紫、浅色纸张、薄荷绿三种 PNG 风格。
- 养成报告包含目标综合力、当前对比、五张卡牌设置和完整材料／库存／缺口清单。
- 默认深色，支持浅色；桌面、窄屏和触屏布局均有适配。

## GitHub Pages 部署

1. 新建一个 GitHub 仓库，名称可用 `Yoisaki`。
2. 解压完整包，把 **`index.html` 所在目录里面的文件**上传到仓库根目录。不要让仓库结构变成 `Yoisaki/Yoisaki/index.html`。
3. 确认根目录能直接看到 `index.html`、`assets/`、`data/` 和 `.nojekyll`。
4. 在仓库 `Settings → Pages` 中选择 `Deploy from a branch`。
5. 分支选择你的默认分支（通常是 `main`），目录选择 `/(root)`，保存。
6. 等待 Pages 发布完成，再打开 Pages 设置页给出的站点地址。

不需要设置 API Key、账号密码、环境变量或后端服务。图片与媒体使用相对本地路径或 HTTPS 国服镜像地址，支持 GitHub Pages 的项目子路径。

### 提交 Git 时跳过离线下载资源

项目的 `.gitignore` 默认忽略 `assets/offline/` 中所有下载的卡面、曲绘、音频、谱面、续传文件与下载清单，仅保留该目录的 `README.md`。普通 `git add .` 会跳过这些资源目录，下载文件仍保存在本机，网页照常优先读取。

如果此前已经对离线资源执行过 `git add`，或已经把它们纳入 Git 跟踪，在项目根目录执行一次：

```bash
git rm -r --cached --ignore-unmatch -- assets/offline
git add .
```

`--cached` 只从 Git 索引移除，不删除本地文件。确认暂存内容后再按平常流程提交和推送。若 `git add` 仍在运行，请先按 Ctrl+C 结束它，再执行上面的命令。此处理会从后续版本中移除资源，但不会清除已有提交历史中的大文件；本地目录保留以供离线使用。

检查某个下载文件是否被忽略：

```bash
git check-ignore -v assets/offline/music/long/0001_01/0001_01.mp3
```

官方操作说明：<https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site>。

## 本地使用

推荐在项目根目录运行：

```bash
python -m http.server 8000
```

然后打开 <http://localhost:8000/>。Windows 也可以使用 `py -m http.server 8000`。

不需要安装额外 Python 包。网页本身也不依赖 Python：Python 在这里仅提供静态文件访问。通过 HTTP 或 GitHub Pages 使用可以避免本地 `file://` 的浏览器图片下载／Canvas 导出限制。

直接打开 `index.html` 可以读取内置主数据与内置谱面，但不同浏览器对本地文件媒体与图片导出限制不同，推荐采用上面的 HTTP 方式。

## 数据版本与更新

当前内置主数据：

| 项目 | 值 |
| --- | --- |
| 服务器 | 中国大陆 CN |
| 主数据版本 | `6.4.1.3` |
| 上游快照更新 | 2026-08-20 |
| 本次收集 | 2026-10-27（北京时间） |
| 登记卡牌 | 1345 张 |
| 按截止日已发布卡牌 | 1249 张 |
| 登记歌曲 | 655 首 |
| 已发布歌曲 | 641 首，其中可查询列表排除已下架项目 |

**收集日期不等于游戏数据更新日期。** 上游当前公开快照可能落后于游戏，界面会同时标明这两个日期，不把旧资料伪装成最新游戏数据。

使用 Python 3.8+ 在根目录执行：

```bash
python scripts/refresh_data.py
```

脚本会固定一次上游提交、下载并验证公开国服表，更新 `data/master.js` 和来源清单。更新后，把这些文件提交回仓库，Pages 即会使用新资料。脚本不会自动向你的 GitHub 账号提交，也不需要填写账号凭证。

如果上游仍是旧版本，脚本只会取得同一快照，不能生成上游尚未提供的新卡牌或新歌曲。数值规则有较大更新时还应核对计算器规则。可用 `--ref <提交 SHA>` 复现固定版本。

主数据来源与逐表哈希：[`data/SOURCE_MANIFEST.json`](data/SOURCE_MANIFEST.json)。字段说明：[`data/DATA_SCHEMA.md`](data/DATA_SCHEMA.md)。

## 计算口径

- 卡牌等级使用三维逐级数组，不做最高数值的线性插值。
- 特训、专家训练、已读剧情、装饰画先按该版本规则计入基础三维。
- 区域道具与角色等级按各维计算，采用 float32 相应的计算与向下取整；称号固定加成对整队只加一次。
- 技能等级影响技能效果与培养成本，不直接增加固定综合力。
- 单卡模式没有完整的五人同组合／同属性加成；要模拟全员匹配，请配置五人队伍。
- 角色等级、称号、手动家具百分比属于外部已达成条件。取得它们的途径不唯一，不能仅按两个等级或百分比之差推算固定材料。
- 家具加成填写的是游戏内已取得的合计百分比；其制作费用未纳入。装饰画与大门的材料会按具体配方和等级纳入。
- 等级经验按当前等级起点到目标等级的累计经验差计算，不扣除当前等级条中尚未升级的部分经验。乐谱按所选规格逐卡向上取整，会提示溢出经验。
- 专家训练的碎片、结晶和限定材料属于可替代支付方式，不会全部叠加。本版选择通用碎片或可用的通用结晶；没有自动优化混合支付。
- 库存只扣减当前选定支付方案的道具，不擅自把一种库存转换为另一种。

## 资源设置与离线范围

卡面、缩略图、曲绘、音频与谱面支持下载到项目目录。**Python 3.8+，无需安装依赖**，在项目根目录运行：

```bash
python scripts/download_assets.py --dry-run
python scripts/download_assets.py
```

第一条仅查看文件数量，第二条开始全量下载。资源保存到 `assets/offline/`，支持并发、断点续传、跳过已完成、失败记录与 SHA-256 校验。完整媒体体积较大，也可以只下载选定卡牌或歌曲：

```bash
python scripts/download_assets.py --types cards thumbnails --card-ids 1185,1253
python scripts/download_assets.py --types jackets audio charts --music-ids 1,2,3
```

网页按 **本地下载 → 随包样本（如有）→ 在线镜像** 的顺序读取图片与音频；有效本地文件不会请求 CDN。PNG 导出与卡面下载同样优先本地资源。六张内置谱面直接读取 JS 数据，其他谱面先本地再在线回退。下载器清单不是网页的必要条件，手工按路径放入文件同样可用。

页面右上角“资源设置”可勾选 **仅使用本地资源**，关闭所有自动在线媒体请求。未下载的图片显示占位图；未下载的音频可使用无声预览。下载新资源后刷新网页，即可重试之前缺失的路径。

完整说明、参数、续传规则、本地静态服务及 Pages 部署区别，见 **[`docs/OFFLINE_ASSETS.md`](docs/OFFLINE_ASSETS.md)**。

页面仍可设置兼容的 **国服** 在线回退镜像，默认：

```text
https://storage.exmeaning.com/sekai-cn-assets
```

镜像需要提供允许浏览器跨域读取的资源，路径详见 [`data/charts/RESOURCE_NOTES.md`](data/charts/RESOURCE_NOTES.md)。程序不会把日服调整过的谱面静默当成国服谱面。

图鉴数值、养成计算与本地方案无需联网。完整媒体没有全部打进压缩包，由你在本地按需下载。下载目录默认被 Git 忽略，不随普通提交与推送进入 Pages；线上缺失的媒体按资源设置回退到镜像，本机继续优先使用离线文件。全量媒体适合本机保存，Pages 容量限制及建议见离线说明。

## 验证与开发

Node.js 18+ 可运行计算和解析验证；不需要 `npm install`：

```bash
node tests/verify.js
node tests/verify-resources.js
python -m unittest discover -s tests -p test_downloader.py
```

综合力基准通过实际执行固定版本的外部原始计算库生成，包含 float32 取整边界、虚拟歌手组合、全员匹配、称号一次计入、装饰画、大门、家具等；材料另有独立原表金标。

可选的静态目录打包：

```bash
python scripts/build.py
```

生成 `dist/` 供其他静态托管使用。GitHub Pages 使用仓库根目录时不必运行此步骤。

SUS 解析器已经转换成浏览器可直接加载的普通 JS。只有修改 `vendor/src/` 时，才需要用 Node.js 24+ 执行 `node scripts/build_parser.mjs` 重新生成。

## 文件结构

```text
index.html                  网页入口
assets/css/style.css        深浅主题与响应式样式
assets/js/app.js            页面、交互、草稿与方案管理
assets/js/core.js           国服数值与材料计算
assets/js/resources.js      本地优先、在线回退、统一媒体读取
assets/js/chart.js          动静态谱面、音频与进度控制
assets/js/export.js         高清图片排版与下载
assets/js/vendor/           浏览器版 SUS 解析器
assets/audio/               两首内置体验音源
assets/samples/             内置图片样本
assets/offline/             下载器保存的图片、音频和谱面
data/master.js              国服主数据快照
data/charts/                六张真实国服谱面及来源
scripts/                    可选更新和构建脚本
scripts/download_assets.py  Python 离线资源下载器（无第三方依赖）
tests/                      独立基准与校验脚本
vendor/src/                 SUS 解析器原始 TypeScript
docs/                       验证、规则及使用文档
LICENSE                     GPL-3.0 全文
THIRD_PARTY.md              来源、署名及素材权属
```

## 许可

Yoisaki 程序采用 **GNU GPL v3.0**，见 [`LICENSE`](LICENSE)。第三方代码的原有署名与许可保留，见 [`THIRD_PARTY.md`](THIRD_PARTY.md)。

PJSK 的卡面、曲绘、歌曲、角色、谱面与游戏数据归 SEGA、Colorful Palette、Crypton 及相应权利人所有；程序的 GPL 许可不改变这些素材的权属。本项目是玩家制作的非官方工具。
