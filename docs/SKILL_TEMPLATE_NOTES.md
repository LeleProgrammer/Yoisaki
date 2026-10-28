# 国服技能文本模板核对

## 一级来源

1. [Uni PJSK Viewer 的 CardDetailView.vue](https://github.com/watagashi-uni/Uni-PJSK-Viewer-Frontend/blob/c1dbeb40986bf66af01d1925b2e9f4598533c6c9/src/views/CardDetailView.vue)，对应模板渲染约272～387行。提供单参数 `d/v/e/m/c` 与角色等级相关 `r/s/v` 的实际实现。
2. [Moesekai 的 web/src/lib/skill.ts](https://github.com/StarMoe-org/Moesekai/blob/79dbc4a21555e5ff7dfe04a45f96ba19f4793995/web/src/lib/skill.ts)，`formatSkillDescription()`，正确区分参考比例和参考增量上限 `activateEffectValue2`。
3. [sekai-calculator 的 CardSkillCalculator](https://github.com/xfl03/sekai-calculator/blob/bee3aefa1c123c80e13782a1728a2aa5e4bc10b5/src/card-information/card-skill-calculator.ts)，`getSkillDetail()` 和 `updateSkillDetailMap()`：组分最大附加为5倍；吸取技能的 rate 来自 `activateEffectValue`，max 增量来自 `activateEffectValue2`；角色等级从条件表选择。
4. [同一提交的 DeckCalculator](https://github.com/xfl03/sekai-calculator/blob/bee3aefa1c123c80e13782a1728a2aa5e4bc10b5/src/deck-information/deck-calculator.ts)：参考技能的最后效果为 `base + floor(otherMax * rate / 100)`，再由含基础的上限封顶。
5. 本包的原始国服 `tables.skills`、`tables.cards`，来源与哈希见 `data/SOURCE_MANIFEST.json`。

注意各项目的旧实现不一定全对：Uni 上述版本的 `o` 直接相加两个 `activateEffectValue`，把参考比例当成了参考增量上限；这会使技能23的最大值错误。应以国服 `activateEffectValue2` 字段及参考技能实际算法为依据。

## 本快照所有模板类型

单参数仅有 `d/v/e/m/c`，双参数仅有 `r/s/v/o/u`。没有需要凭空补出的其他类型。所有数值必须从当前技能等级对应的 `skillEffectDetails` 获取。

| 模板 | 精确含义 |
| --- | --- |
| `{{id;d}}` | effect[id] 当前技能等级的 `activateEffectDuration` |
| `{{id;v}}` | 当前等级的 `activateEffectValue` |
| `{{id;e}}` | effect[id].`skillEnhance.activateEffectValue`，组分每人附加值 |
| `{{id;m}}` | 当前 `activateEffectValue + 5 × skillEnhance.activateEffectValue`；四位队友再加全员同团奖励一次 |
| `{{0;c}}` | 当前卡牌所属角色的完整姓名；`0` 不是一个技能效果 ID |
| `{{a,b;r}}` | 在 a～b 的角色等级条件效果中，取满足 `activateCharacterRank <= 当前角色等级` 的最高阈值效果的当前等级数值；低于最低阈值时实际附加为0 |
| `{{a,b;s}}` | effect[a] 基础值 + 在(a,b]区间按当前角色等级满足的最大条件附加；用于“目前合计” |
| `{{a,b;v}}` | effect[a] 基础值 + effect[b] 最高角色等级条件附加；用于“最多” |
| `{{a,b;o}}` | effect[a].当前等级 `activateEffectValue` + effect[b].当前等级 **`activateEffectValue2`**；不是加effect[b]的参考比例 |
| `{{a,b;u}}` | effect[a] 基础值 + effect[b] 的最高异组数量累计附加；本模板用于“最多”，应取端点最大附加 |

`r/s` 若需要展示“当前”数值，就必须有明确角色等级上下文；图鉴可使用明确标注的默认角色等级1。不能把上限冒充当前角色等级的结果。当前技能22的附加表从角色等级2开始，每2级+1，100级封顶50；应仍通过条件表查找，避免为未来技能硬编码同一公式。

`u` 在实际演出中的异组累计效果会随0/1/2种异组变化，但本模板的措辞是“最多”，端点effect108已经给出累计+60，不应再把+30和+60相加为+90。

## 完整示例

### 卡牌1253「永不止步」：原始技能23

Lv1：

> 5秒内，得分提高60%，并从编组中随机选择其他1名成员，提高其得分提高技能最大值的50%（最多合计提高120%）。

Lv4：

> 5秒内，得分提高80%，并从编组中随机选择其他1名成员，提高其得分提高技能最大值的50%（最多合计提高150%）。

参考比例始终是50%，而吸取增量上限随等级为60/65/70/70，因此总上限为120/130/140/150。

### 卡牌1195「伙伴的意义」：原始技能24

Lv1：

> 5秒内，得分提高70%，与自身不同组合编组时，每编组1种得分提高自身30%，最多2种有效(最多130%)。

Lv4：

> 5秒内，得分提高90%，与自身不同组合编组时，每编组1种得分提高自身30%，最多2种有效(最多150%)。

### 卡牌1215「两人的悄悄话」：技能17

Lv1：

> 5秒内，得分提高80%。
> 除自身以外，每编组1名“Vivid BAD SQUAD”成员，得分提高10%，若所有成员所属组合相同则再提高10%（最多130%）。

Lv4：

> 5秒内，得分提高100%。
> 除自身以外，每编组1名“Vivid BAD SQUAD”成员，得分提高10%，若所有成员所属组合相同则再提高10%（最多150%）。

## 特训追加技能

卡牌1253和1195均有 `specialTrainingSkillId=22`，不能只显示 `skillId` 而遗漏。可分别展示“原始技能”与“特训追加技能”，并为后者标注角色等级上下文。

例如1253、技能Lv4、角色等级50的特训追加技能：

> 5秒内，得分提高110%，并根据“东云彰人”的角色等级再提高25%（角色等级每2级+1%，目前合计135%/最多160%）。

原始技能与追加技能不能把效果相加。上游实际计算在已特训时同时考虑两种方案，取符合当前条件的有效效果；此资料站若只展示文本，可将两者分开展示。

本说明另附 `tests/skill-description-fixtures.json`，涵盖上述卡牌、4档技能等级及角色等级边界，供实际 formatter 对照。
