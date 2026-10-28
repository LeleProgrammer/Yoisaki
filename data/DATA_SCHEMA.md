# Yoisaki 国服主数据

网页通过 `data/master.js` 加载 `globalThis.YOISAKI_MASTER`。顶层为 `{meta,tables}`，`tables` 的名称及数值字段沿用国服游戏主数据，便于核对。

## 来源与版本

- 资料来源：<https://github.com/Sekai-World/sekai-master-db-cn-diff>。
- 本次固定提交：`f3082761851bc75bf67c5eafdec7576ae95ab3a2`。
- 上游提交时间：2026-08-20 16:00:17 UTC；上游主数据版本：`6.4.1.3`。
- 本次收集日期：2026-10-27（北京时间）。收集日期与上游更新时间含义不同，不将收集日期宣称为游戏数据的最新更新日期。
- 每个源文件的固定 URL、SHA-256、字节数以及生成文件校验值记录在 `SOURCE_MANIFEST.json`。
- 国服镜像 `https://metadata.exmeaning.com/cn/master/cards.json` 的卡牌数量也抽查为 1345；本包仍使用上述固定提交保证可复现。

完整源表含尚未到发布时间的条目。展示“国服已实装”时，卡牌以 `releaseAt <= 当前时间`、歌曲以 `publishedAt <= 当前时间` 筛选，不能把完整条目数当成已实装数量。本次北京时间 2026-10-27 截止日统计：登记卡牌 1345 张，其中已到发布时间 1249 张；登记歌曲 655 首，其中已到发布时间 641 首。

## 卡牌与综合力输入

- `cards`：`id/characterId/cardRarityType/attr/supportUnit/skillId/prefix/assetbundleName/releaseAt` 等字段。
- `cards[].cardParameters`：`{param1:[每级数值],param2:[每级数值],param3:[每级数值]}`；数组下标为 `level - 1`，不是按最高值线性插值。
- `cards[].specialTrainingPower{1,2,3}BonusFixed`：特训三维固定加成。特训状态与卡面显示状态应独立保存。
- `cardRarities`：`maxLevel` 为未特训等级上限；有 `trainingMaxLevel` 时才可特训。普通 1★/2★ 为 20/30，3★ 为 40→50，4★ 为 50→60，生日卡为 60 且没有特训。
- `masterLessons`：按 `cardRarityType/masterRank` 匹配，每行是**该次专家训练增加**的三维固定值，计算专家 0→5 时需逐级求和。
- `cardEpisodes`：按 `cardId` 匹配，`cardEpisodePartType` 为 `first_part/second_part`，解锁并阅读后增加对应三维固定值。`releaseConditionId` 可查 `releaseConditions`。
- `cardMysekaiCanvasBonuses`：按卡牌稀有度匹配。画布加成在该国服版本中计入三维基础值，再计算比例加成。
- `characterRanks`：按 `characterId/characterRank` 匹配三维角色等级百分比；完整保留游戏的浮点数，客户端应采用 float32 相应计算与取整，而不是随意四舍五入百分比。
- `areaItemLevels`：逐级角色、组合、属性加成，含普通与全员匹配倍率。`targetUnit/targetCardAttr` 为 `any` 时不限制该字段。`targetGameCharacterId` 有值时需匹配角色。
- `honors`：仅保留具有 `levels[].bonus > 0` 的 44 个称号。该字段为综合力固定加成，按持有称号的已达到最高等级取一次，不能把同一称号各级重复相加。

技能升级消耗和技能效果单独处理，技能等级不作为固定综合力的直接加项。

## 道具与经验

`resourceType` 必须与 `resourceId` 一起作为库存主键；不同资源表可有相同 ID。

| 资源类型 | 对应表 | 备注 |
| --- | --- | --- |
| `material` | `materials` | 15 心愿碎片，16 心愿结晶；特训、剧情和区域道具所需材料也在此表 |
| `coin` | 无 | 货币 ID 通常为 0 |
| `practice_ticket` | `practiceTickets` | 普通 ID 1/2/3 分别为 200/10000/50000 卡牌经验；带 `characterId` 的材料限定角色 |
| `skill_practice_ticket` | `skillPracticeTickets` | 普通 ID 1/2/3/4 分别为 1/50/250/10000 技能经验 |
| `mysekai_material` | `mysekaiMaterials` | 画布、大门和家具配方使用 |

`levels` 按 `levelType + level` 查找，`totalExp` 为到达该等级的累计经验：`card`、`card_skill_1`、`card_skill_2`、`card_skill_3`、`card_skill_4`、`card_skill_birthday`。两状态所需经验为目标累计经验减当前累计经验。角色等级由多种角色任务经验推动，不能仅从两个等级直接推导固定的道具配方；其增加应作为手动设定的加成条件。

### 成本字段的两种形式

`cardEpisodes[].costs` 已是 `{resourceId,resourceType,quantity}`。

`cards[].specialTrainingCosts[].cost` 和 `shopItems[].costs[].cost` 是国服紧凑资源元组：

```js
// [resourceId, resourceType, resourceLevel, quantity]
const [resourceId, resourceType, resourceLevel, quantity] = cost;
```

`masterLessons[].costs` 是**可替代支付方案**，不是同时支付所有记录！例如普通 4★ 每级可支付 2000 通用心愿碎片（材料 15），或 1 心愿结晶（材料 16）；其中还含角色、组合限定材料的替代项，需校验 `characterId` 或 `unit`。不能把两类货币与所有角色代币全部加进消耗。

`cardSkillCosts` 记录材料提供的技能经验（`materialId/exp`），而技能每级累计经验来自 `levels`。

### 区域道具升级成本

`areaItemCosts` 是本项目由真实主表关联生成的便捷表：

```js
{
  areaItemId: 1, level: 1,
  shopItemId: 1001, resourceBoxId: 1001,
  releaseConditionId: 1, startAt: 1556683200000,
  costs: [
    {resourceId: 2, resourceType: "material", resourceLevel: 0, quantity: 100},
    {resourceId: 0, resourceType: "coin", resourceLevel: 0, quantity: 20000}
  ]
}
```

来源关联严格筛选 `compactResourceBoxDetails.resourceBoxPurpose=shop_item`、`resourceType=area_item`，再连接 `shopItems.resourceBoxId`。资源箱 ID 在不同用途间会重复，不能只凭 ID 或自行假定编号公式关联。

该快照 55 件区域道具各有 20 级，共 1100 条数值和成本，覆盖集合完全一致。抽查 Lv20 对应商店记录的 `releaseConditionId=1`（初始持有），未发现额外发布日期锁。实际升级需逐级累计成本；整队引用同一公共区域道具时，只计算一次升级费用。

## MySEKAI

- `canvasRecipes`：6 种装饰画配方，包含 `blueprintId/name/costs`，成本已规范为带资源类型的对象。小号 439/442 分别为挂壁/台式，成本为 `mysekai_material:3 ×2` 与 `mysekai_material:14 ×2`；M/L 分别 ×3/×4。尺寸不改变该张卡只计一次的画布加成。
- `mysekaiBlueprintMysekaiCanvasRelations`：各配方支持的卡牌稀有度。
- `mysekaiBlueprints`、`mysekaiBlueprintMysekaiMaterialCosts`：通用家具与画布配方及材料成本；`mysekaiBlueprintTerms` 保留开放条件。
- `mysekaiGateLevels`：`mysekaiGateId/level/powerBonusRate/mysekaiGateMaterialGroupId`；材料从 `mysekaiGateMaterialGroups` 按 `groupId` 获取。
- `mysekaiFixtures[].mysekaiFixtureGameCharacterGroupPerformanceBonusId` → `mysekaiFixtureGameCharacterGroupPerformanceBonuses` → `mysekaiFixtureGameCharacterGroups` 给出玩偶等家具的角色加成对象，单位为 0.1%；全局上限来自 `mysekaiFixtureGameCharacterPerformanceBonusLimit.bonusRateLimit`。

画布与玩偶的加成不是同一个字段，不能混为同一开关。

## 歌曲与公开资源

- `musics`：中文歌曲名、日文读音、作曲作词、`assetbundleName`、`publishedAt/releasedAt`，以及谱面与音频对齐所需的 `fillerSec`（若主表含有，则原样保留）。
- `musicDifficulties`：`musicId/musicDifficulty/playLevel/totalNoteCount`，按国服原表读取，不套用日服最新标级。
- `musicVocals`：`musicId/musicVocalType/assetbundleName/characters` 等，提供原唱与翻唱可用音频目录。
- 已验证的国服资源根：`https://storage.exmeaning.com/sekai-cn-assets/`。图片与音频为外部资源，实际使用依赖资源主机可用性，不能把联网成功等同于所有曲目资源都已验证。

## 更新

```bash
python3 scripts/refresh_data.py
```

默认固定一次当前上游提交 SHA 后并行下载，生成新的 `master.js` 和 `SOURCE_MANIFEST.json`，写入前校验卡牌等级数组、区域升级成本覆盖和装饰画配方。脚本只用 Python 标准库，不需要安装第三方依赖；`--ref <SHA>` 可复现固定快照。

原始 JSON 缓存仅用于开发与更新，不随网页运行，也无需上传 GitHub Pages。游戏数值与素材的权利属于相应权利人；本项目程序的 GPL-3.0 不改变原始游戏素材的归属。
