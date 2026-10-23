# 03 · 七大动效场景全量参数规范与物理交互定义 (The Seven Motion Scenarios Spec)

在流体物理动效体系中，所有界面过渡被严格正交分解为 **7 大核心场景（Scenarios）**。总计 50 余种精心校准的过渡样式，全部遵循统一的数据契约。

---

## 核心设计法则：进退统一性（In and Out as One）

传统动效设计中，放大与缩小、打开与关闭往往由两个独立的配置项控制，极易导致进出风格割裂（例如进场是 3D 翻转，退场却是侧滑）。

流体物理动效的核心原则是：**进和出是同一物理实体的双向运动**。每个样式在注册表内必须同时定义对称的 `in` 和 `out` 参数：
- `in`: 正向展开/呈现动作（速度稍缓，赋予结构细节展开感）。
- `out`: 逆向折叠/收起动作（速度稍快，一般为 `in` 的 65%~75% 时长，利落收尾）。

---

## 场景 1：多栏容器 · 聚焦放大 / 缩小 (`zoneFocus`)

控制多栏界面中某一栏被点击聚焦展开，以及再次点击收起的全套物理姿态。外框几何走 `morphRects`，内容层则叠加以下姿态特效：

| 样式标识 (`k`) | 名称与视觉特征 | In 阶段参数 (时长/曲线/特效/内容) | Out 阶段参数 (时长/曲线/特效/内容) |
| :--- | :--- | :--- | :--- |
| **`rippleSpring`**<br>*(系统默认)* | **点击处扩散 + 回弹放大**<br>以触控点为原点水波放大，带轻微 spring 回弹 | dur: 460ms, ease: `back`<br>fx: `ripple`, fxDur: 500ms<br>content: `none` | dur: 300ms, ease: `soft`<br>fx: `depthOut`, fxDur: 300ms<br>content: `settle` |
| **`tileFlip`**<br>*(磁贴旗舰)* | **磁贴翻转（从触控边翻入）**<br>以触控侧边缘为 3D 轴心，绕 Y 轴翻入 | dur: 520ms, ease: `tile`<br>fx: `hingeFlip`, fxDur: 640ms<br>content: `none`, tile: `true` | dur: 380ms, ease: `tile`<br>fx: `hingeFlipOut`, fxDur: 420ms<br>content: `none` |
| **`tileMosaic`** | **磁贴拼合**<br>子卡片带微角度旋转逐块拼装落位 | dur: 420ms, ease: `quartOut`<br>fx: `mosaic`, fxDur: 460ms, fxStagger: 55ms | dur: 260ms, ease: `soft`<br>fx: `fade`, fxDur: 220ms |
| **`origami`** | **折纸展开**<br>以顶边为轴沿 X 轴 3D 翻下折叠 | dur: 460ms, ease: `expo`<br>fx: `foldX`, fxDur: 520ms, fxStagger: 45ms | dur: 330ms, ease: `expoIn`<br>fx: `foldXOut`, fxDur: 320ms |
| **`depth`** | **景深推移**<br>由远景缩放+模糊逐渐聚焦清晰 | dur: 440ms, ease: `ios`<br>fx: `depth`, fxDur: 520ms | dur: 320ms, ease: `soft`<br>fx: `depthOut`, fxDur: 320ms |
| **`spotlight`** | **聚光显影**<br>高曝光模糊瞬间收缩聚焦至原色 | dur: 420ms, ease: `emphasized`<br>fx: `spotlight`, fxDur: 560ms | dur: 260ms, ease: `soft`<br>fx: `fade` |
| **`cascade`** | **瀑布逐条**<br>子条目由上向下依次掉落吸附 | dur: 380ms, ease: `quint`<br>fx: `cascade`, fxDur: 420ms, fxStagger: 70ms | dur: 240ms, ease: `soft`<br>fx: `fade` |
| **`sharedAxis`**| **共享轴推进**<br>沿 Z 轴深度穿透拉近（-260px 推进） | dur: 420ms, ease: `emphasized`<br>fx: `axialZ`, fxDur: 460ms | dur: 320ms, ease: `emphasized`<br>fx: `axialZOut`, fxDur: 340ms |
| **`spring`** | **回弹放大**<br>纯 2D 平面尺度 overshoot 物理放大 | dur: 520ms, ease: `back`<br>fx: `settle`, content: `settle` | dur: 300ms, ease: `soft`<br>content: `settle` |
| **`ios`** | **顺滑展开**<br>经典平滑弹射与渐隐收缩 | dur: 460ms, ease: `ios`<br>content: `rise` | dur: 330ms, ease: `ios`<br>content: `fade` |
| **`fadeThrough`**| **淡出淡入**<br>最克制的平滑交叉淡化 | dur: 340ms, ease: `emphasized`<br>content: `fade` | dur: 260ms, ease: `emphasized`<br>content: `fade` |
| **`stagger`** | **错峰推进**<br>多栏依次以 45ms 延迟阶梯变形 | dur: 420ms, ease: `expo`<br>content: `rise`, stagger: 45ms | dur: 300ms, ease: `emphasized`<br>content: `fade`, stagger: 35ms |
| **`snap`** | **快速吸附**<br>240ms 高敏捷响应吸附 | dur: 240ms, ease: `snappy`<br>content: `none` | dur: 200ms, ease: `snappy`<br>content: `none` |
| **`instant`** | **瞬切**<br>零毫秒直接落位 | dur: 0ms, ease: `linear` | dur: 0ms, ease: `linear` |

---

## 场景 2：卡片内容 · 浮入 (`contentIn`)

当容器展开或刷新完成后，内部的具体图元从背景中浮现出来的微观姿势：

| 样式标识 (`k`) | 名称 | 时长 (`dur`) | 曲线 (`ease`) | 物理关键帧形态与 Hold 点 |
| :--- | :--- | :--- | :--- | :--- |
| **`settle`**<br>*(系统默认)* | **上浮落定** | 300ms | `expo` | `y: 10px, s: 0.986, hold: 0.45`<br>透明度在 45% 进度时即冲到 1.0，后 55% 时间纯位移减速，绝不灰蒙 |
| **`rise`** | **纯上浮** | 300ms | `quint` | `y: 16px, s: 1.0, hold: 0.50` |
| **`fade`** | **只淡入** | 240ms | `soft` | `y: 0, s: 1.0, hold: 0.60` |
| **`zoom`** | **轻微放大** | 340ms | `back` | `y: 0, s: 0.92, hold: 0.45` |
| **`slide`** | **侧向滑入** | 320ms | `ios` | `x: 28px, y: 0, s: 1.0, hold: 0.50` |
| **`blurIn`** | **模糊聚焦** | 340ms | `expo` | `y: 6px, s: 1.02, blur: 10px, hold: 0.55` |
| **`tileFlip`** | **磁贴翻转** | 420ms | `tile` | 挂载 `hingeFlip` 特效，绕触控边翻转 |
| **`none`** | **无内容动画** | 0ms | - | 直接渲染 |

### 网格按列错峰特性 (`playGridColumns`)
- 在多列数据表格展开时，数据块**按列错峰（Stagger by Column）**浮入，每列递延 34ms。
- **重活避让机制**：整组错峰推迟 70ms 启动，避开第一帧容器几何重排的 CPU 高峰，丝滑感明显提升。

---

## 场景 3：弹窗 · 进入 / 退出 (`modal`)

模态弹窗与全屏背景遮罩（Scrim）的联锁动效。遮罩与弹窗卡片严格使用相同曲线并保持等比例时长：

| 样式标识 (`k`) | 名称 | In 参数 (起点姿势与错峰) | Out 参数 (终点姿势) |
| :--- | :--- | :--- | :--- |
| **`tileFlip`**<br>*(系统默认)* | **磁贴翻转**<br>从触控点所在边为轴翻入 | dur: 460ms, ease: `tile`<br>from: `{ o: 0, ry: ±96deg, s: 0.92 }`<br>origin: `'click'`, childStagger: 40ms | dur: 320ms, ease: `tile`<br>to: `{ o: 0, ry: ±88deg, s: 0.96 }`<br>origin: `'click'` |
| **`cascade`** | **内容逐条拼合** | dur: 320ms, ease: `quint`<br>from: `{ o: 0, y: 18px, s: 0.985 }`<br>childStagger: 45ms | dur: 200ms, ease: `soft`<br>to: `{ o: 0, y: 8px, s: 0.98 }` |
| **`pop`** | **弹起** | dur: 300ms, ease: `expo`<br>from: `{ o: 0, y: 14px, s: 0.94 }` | dur: 190ms, ease: `soft`<br>to: `{ o: 0, y: 6px, s: 0.975 }` |
| **`unfold`** | **自上而下展开** | dur: 420ms, ease: `expo`<br>from: `{ o: 0, rx: -70deg, y: -8px }`, origin: `'top'` | dur: 300ms, ease: `expoIn`<br>to: `{ o: 0, rx: -64deg, y: -10px }`, origin: `'bottom'` |
| **`dropIn`** | **落体回弹** | dur: 520ms, ease: `overshoot`<br>from: `{ o: 0, y: -46px, s: 1.0 }` | dur: 320ms, ease: `emphasized`<br>to: `{ o: 0, y: 64px, s: 0.96 }` |
| **`spin`** | **旋入放大** | dur: 400ms, ease: `back`<br>from: `{ o: 0, s: 0.72, rot: -6deg }` | dur: 280ms, ease: `emphasized`<br>to: `{ o: 0, s: 0.72, rot: 5deg }` |
| **`slideUp`** | **底部推入** | dur: 340ms, ease: `emphasized`<br>from: `{ o: 0, y: 52px }` | dur: 240ms, ease: `emphasized`<br>to: `{ o: 0, y: 60px }` |
| **`sheet`** | **底部抽屉** | dur: 400ms, ease: `ios`<br>from: `{ o: 0, y: 120px }`, childStagger: 40ms | dur: 300ms, ease: `emphasized`<br>to: `{ o: 0, y: 130px }` |
| **`slideSide`** | **侧向滑入** | dur: 320ms, ease: `ios`<br>from: `{ o: 0, x: 60px }` | dur: 240ms, ease: `emphasized`<br>to: `{ o: 0, x: 70px }` |
| **`blurIn`** | **模糊聚焦** | dur: 360ms, ease: `expo`<br>from: `{ o: 0, s: 1.03, blur: 14px }`, childStagger: 35ms | dur: 260ms, ease: `soft`<br>to: `{ o: 0, s: 1.02, blur: 10px }` |
| **`zoomIn`** | **从零放大** | dur: 300ms, ease: `back`<br>from: `{ o: 0, s: 0.78 }` | dur: 200ms, ease: `emphasized`<br>to: `{ o: 0, s: 0.88 }` |
| **`none`** | **瞬开瞬闭** | dur: 0ms | dur: 0ms |

---

## 场景 4：视图切换 · 模块入场 (`viewIn`)

控制不同大视图切换时的整屏模块级联进场：

| 样式标识 (`k`) | 名称 | 时长 (`dur`) | 曲线 (`ease`) | 进场几何配置与位移 |
| :--- | :--- | :--- | :--- | :--- |
| **`rise`**<br>*(系统默认)* | **错峰上浮** | 500ms | `gentle` | `headY: -24px, y: 12px, s: 0.97, stagger: 60ms`<br>头部模块自 -24px 优雅下落，其余卡片自 +12px 上浮 |
| **`tile`** | **磁贴翻入** | 460ms | `tile` | `rx: -82deg, origin: 'center top', stagger: 55ms` |
| **`cascade`** | **逐块落下** | 380ms | `expo` | `headY: -22px, y: -22px, stagger: 70ms` |
| **`depth`** | **景深推近** | 480ms | `ios` | `s: 0.90, blur: 12px, stagger: 40ms` |
| **`fade`** | **纯淡入** | 260ms | `soft` | `y: 0, s: 1.0, stagger: 0ms` |
| **`slideLeft`** | **右侧滑入** | 380ms | `ios` | `x: 26px, y: 0, stagger: 30ms` |
| **`slideUp`** | **整屏上移** | 420ms | `emphasized`| `y: 26px, stagger: 0ms` |
| **`zoom`** | **轻微放大** | 380ms | `back` | `y: 6px, s: 0.96, stagger: 0ms` |
| **`none`** | **无动画** | 0ms | - | 直接渲染 |

---

## 场景 5：列表 · 逐条入场 (`listIn`)

控制菜单、分类列表、条目清单、配置面板等大量子列表的错峰进场：

| 样式标识 (`k`) | 名称 | 时长 (`dur`) | 步长 (`stagger`) | 姿态位移与形态 |
| :--- | :--- | :--- | :--- | :--- |
| **`fade`** *(默认)* | **逐条淡入** | 180ms | 30ms | `y: 0, s: 1.0`（纯透明度淡入，高频场景最舒适） |
| **`tile`** | **逐条翻转** | 320ms | 45ms | `rx: -78deg, origin: 'center top'` |
| **`cascade`** | **逐条落下** | 300ms | 60ms | `y: -26px, s: 1.0` |
| **`depth`** | **逐条推近** | 340ms | 40ms | `s: 0.88, blur: 10px` |
| **`rise`** | **逐条上浮** | 260ms | 36ms | `y: 12px, s: 0.99` |
| **`slide`** | **逐条侧入** | 260ms | 30ms | `x: 22px, s: 1.0` |
| **`zoom`** | **逐条放大** | 260ms | 30ms | `s: 0.94` |
| **`none`** | **无动画** | 0ms | 0ms | 一次性全部渲染 |

---

## 场景 6：时间轴 / 步进平移 (`temporalShift` / `dateSwitch`)

控制具有序数或时间轴维度的主内容前移与后退（如“上一步/下一步”、“上一页/下一页”）。**方向感（Directionality）**是本场景的核心：
- 向前推进（+1 步）：内容由右向左滑入，位移 $dx = +1 \times x$。
- 向后回退（-1 步）：内容由左向右滑入，位移 $dx = -1 \times x$。

| 样式标识 (`k`) | 名称 | 时长 (`dur`) | 曲线 (`ease`) | 物理关键帧形态 |
| :--- | :--- | :--- | :--- | :--- |
| **`settle`** *(默认)* | **沉稳落定** | 440ms | `gentle` | `x: 12px * dir, y: 8px, s: 0.994, o: 0.42`（微侧移+微上浮，优雅沉稳） |
| **`slideDir`** | **随方向滑入** | 380ms | `expo` | `x: 26px * dir, s: 0.992, o: 0.20` |
| **`slideSoft`** | **轻柔侧移** | 300ms | `ios` | `x: 18px * dir, s: 1.0` |
| **`tile`** | **磁贴翻转** | 380ms | `tile` | `perspective(760px) rotateY(±64deg), x: 8px, s: 0.99` |
| **`rise`** | **上浮落定** | 320ms | `gentle` | `dir: false, x: 0, y: 14px, s: 0.994` |
| **`zoom`** | **轻微放大** | 300ms | `back` | `dir: false, s: 0.96` |
| **`fade`** | **原地淡入** | 240ms | `soft` | `dir: false, o: 1.0` |
| **`none`** | **瞬切** | 0ms | - | 直接换算 |

---

## 场景 7：切换主题 · 亮 / 暗 (`themeSwitch`)

深浅色主题切换是极具视觉冲击力的**全屏光效与色彩插值**场景：

| 样式标识 (`k`) | 视觉实现机制与渲染管线 | 时长 (`dur`) |
| :--- | :--- | :--- |
| **`auto`** *(默认)* | **智能来源分流**：<br>· 用户手动点击：触发 `ripple` 点击处墨滴扩散<br>· 系统深色广播：触发 `sweepTop` 顶部整条波前下扫 | 420ms |
| **`ripple`** | **点击处墨滴扩散**：<br>1. 瞬间克隆旧页面快照 `snap` 置顶，锁定旧主题变量；<br>2. 真实页面同时秒切新主题；<br>3. 在触控点 $(px, py)$ 放置新主题底色圆形墨滴，采用 `transform: scale()` 线性变大，透明度自 0.35 涨至 1.0；<br>4. 铺满瞬间移除快照，墨滴层平滑淡出 140ms。 | 420ms (扩散)<br>+140ms (淡出) |
| **`sweepTop`** | **顶部整条下扫**：<br>结构同上，但墨滴替换为横向贯通的渐变层，沿 Y 轴向下 `scaleY()` 扫过全屏。 | 460ms (下扫)<br>+140ms (淡出) |
| **`colorOnly`** | **全页纯颜色渐变**：<br>无几何快照，通过 `requestAnimationFrame` + `cubicAt('soft')` 在 420ms 内对背景、面板、文字等 18 个核心颜色令牌逐帧执行 RGB 线性插值。 | 420ms |
| **`cross`** | **整页交叉淡入**：<br>旧快照纯透明度 100% $\to$ 0% 淡出，揭示底层新页面。 | 380ms |
| **`none`** | **瞬间切换**：<br>直接修改 `data-theme` 属性并同步状态栏。 | 0ms |

---

## 8. 物理交互锚点算法：动态旋转轴心 (`hingeSide`)

在磁贴翻转动效中，旋转轴心绝非死板固定在居中位置，而是**实时由用户手指点击的位置决定**：

```javascript
/**
 * 依据用户最后一次触控坐标计算 3D 旋转铰链边：
 * 点在右半侧 -> 以右边为轴向左翻开；点在左半侧 -> 以左边为轴向右翻开。
 */
function hingeSide(element, lastPointer) {
  var r = element.getBoundingClientRect();
  if (!r.width) return 'right';
  var px = (lastPointer && lastPointer.x != null ? lastPointer.x : 0) - r.left;
  if (px < -4 || px > r.width + 4) {
    // 键盘回车或脚本触发：根据元素在屏幕上的中线位置判断
    return (r.left + r.width / 2) >= (window.innerWidth / 2) ? 'right' : 'left';
  }
  return px < r.width / 2 ? 'left' : 'right';
}
```
结合此算法，WAAPI 动态写入：
- `transformOrigin = (side === 'left' ? '0%' : '100%') + ' 50%'`
- 旋转角度符号反转：`sign = (side === 'left' ? 1 : -1)`，产生极其真实的“翻开卡片”物理触感。
