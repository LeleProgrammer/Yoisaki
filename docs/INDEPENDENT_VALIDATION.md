# 计算器独立基准验证

`tests/power-fixtures.json` 包含 24 个综合力基准和 12 个材料消耗基准。每个基准均有完整输入 `plan` 与明确的预期结果，不依赖测试时重新运行同一实现生成预期值。

## 综合力预期值来源

预期值直接执行开源项目 `xfl03/sekai-calculator` 的固定提交：

- 提交：`bee3aefa1c123c80e13782a1728a2aa5e4bc10b5`
- 提交时间：2026-10-27 02:35:21 UTC
- 软件版本：`0.19.1`
- 原始算法：<https://github.com/xfl03/sekai-calculator/tree/bee3aefa1c123c80e13782a1728a2aa5e4bc10b5>

实际使用的上游源码为：

1. `src/card-information/card-power-calculator.ts`
2. `src/card-information/card-service.ts`
3. `src/card-information/card-detail-map.ts`
4. `src/card-information/card-detail-map-power.ts`
5. `src/deck-information/deck-calculator.ts`
6. `src/util/collection-util.ts`

六个原始文件的 SHA-256 已写入 JSON 的 `provenance.sourceSha256`。生成过程采用 Node 的 `module.stripTypeScriptTypes` 执行这些原始 TypeScript，仅移除模块导入导出并提供独立的数据读取器；与综合力无关的技能、活动接口使用空桩。没有加载或调用 Yoisaki 的 `core.js` 生成综合力预期值。

输入主数据来自本项目固定国服提交 `f3082761851bc75bf67c5eafdec7576ae95ab3a2`，与 `data/SOURCE_MANIFEST.json` 一致。角色等级、区域道具、大门、画布、卡牌每一级的三维参数均查真实国服记录。

## 覆盖内容

| 类别 | 验证点 |
| --- | --- |
| 基础参数 | 一星 Lv1/Lv20、三星特训前后、四星特训前后、生日卡 |
| 固定加成 | 专家0与5、前后篇剧情、画布先加入基础三维 |
| 浮点与取整 | 分维 float32 百分比、真实边界值，不能统一改用 double |
| 区域道具 | 不匹配道具排除、混组混属性、同团五人、同属性五人、两者同时满足 |
| 虚拟歌手 | 应援组合与 piapro 取更高的区域加成；五人VS组合倍率；初音五件个人道具累计 |
| MySEKAI | 无应援VS大门取最高、有应援VS只匹配应援门、家具0.1%单位与国服上限 |
| 队伍固定加成 | 两枚真实称号合计仅在整队计算一次 |

一个实际浮点边界为：卡牌 `#1`、卡牌 Lv4、角色等级25，其角色加成的正确 float32 结果为 **91**；直接用 double 算各维比例会得到 **92**。正确整卡综合力为 **3838**。

五人同团同属性综合场景（卡牌 `290/209/208/207/579`，完整输入见 JSON）预期整队综合力 **336586**。两枚真实称号 `105/106` 的整队基准为 **155874**，可检验称号是否被错误地按五张卡重复累加。

上游 `MysekaiService` 中存在较早的画布注释；本基准执行 `CardPowerCalculator` 的实际代码，该代码从5.1版规则开始将画布加入基础三维，再计算比例加成。本国服数据版本为6.4.1.3。

## 材料预期值来源

12 个材料基准从以下国服真实表独立读取、汇总，不调用 Yoisaki 的 `calculate()` 生成预期值：

- 单次特训：`cards[].specialTrainingCosts`
- 专家训练：`masterLessons[].costs` 中选择一个通用支付分支，比较碎片与结晶两种互斥方案
- 装饰画：`mysekaiBlueprintMysekaiMaterialCosts` 的439与441配方
- 共享区域道具：由实际资源箱关联生成的 `areaItemCosts`，只累加需要升级的等级一次
- 大门：`mysekaiGateLevels.mysekaiGateMaterialGroupId` → `mysekaiGateMaterialGroups`
- 剧情：`cardEpisodes[].costs`
- 卡牌练习与技能：`levels.totalExp`、`practiceTickets.exp`、`skillPracticeTickets.exp`、`cardSkillCosts.exp`

另含库存扣除和完全不变状态的零消耗场景。库存主键始终由 `resourceType:resourceId` 组成，不混淆普通材料与 MySEKAI 同编号材料。

## 验证结论与边界

2026-10-27 对本项目计算核心执行对照：**24/24 综合力基准、12/12 材料基准通过，差异数为0**。队伍各分项及逐卡分项均对照，不仅比较总和；材料同时比较需求、库存和缺口。

这些基准验证本项目与固定版本独立开源算法、国服主数据的吻合程度；未替代游戏客户端逐个场景的人工实测。后续游戏调整算法或主数据时，应更新快照并复核相应基准，不能仅因旧测试通过而宣称适配未来所有版本。
