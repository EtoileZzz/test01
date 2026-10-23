# 01 · 缓动曲线数学模型、时长与动效设计令牌 (Motion Tokens & Curves)

本文档定义流体物理动效系统的**数学缓动基础、时间基准与设计令牌**。所有参数均经过物理调校与逐帧比对，遵循严谨的非线性动力学体系。

---

## 1. 核心设计哲学与物理法则

1. **绝对非线性（Non-linear Only）**：
   - 真实物理世界中不存在瞬时恒速运动。除“无动画”瞬切与特殊线性墨滴扩散外，所有界面变换一律采用非线性三阶贝塞尔曲线（Cubic-Bezier）。
   - 曲线特征以**强缓出（Fast Takeoff, Long Tail / Slow Settling）**为主：前 20%~30% 时长完成主体位移（提供即时响应），后 70%~80% 时长用于平稳吸收能量（避免机械硬着陆）。

2. **单一运动源与动效缩放因子（Motion Scale）**：
   - 所有 CSS 动画时长令牌与 JS/WAAPI 毫秒数均绑定统一的速度倍率变量 `--motion-scale` / `speedMultiplier`。
   - 用户调节“动画速度”（如 0.5x、1.0x、1.5x、2.0x）时，全局所有补间时长按比例缩放，曲线形态与物理拓扑严格保持恒定。

3. **双重执行通道同源一致性（WAAPI & CSS Fallback）**：
   - 现代浏览器/WebView 统一由 Web Animations API (WAAPI) 驱动，保证高精度和可编程式取消/重接。
   - CSS 令牌与 JS 注册表定义**完全相同的毫秒数与贝塞尔参数**，避免不同执行环境产生快慢割裂。

---

## 2. 贝塞尔缓动曲线家族 (Easing Curves Family)

系统定义了 15 条严格收敛的非线性贝塞尔曲线（收录于 `FluidMotion.easeTable`）：

| 曲线标识 (`EASE[k]`) | Cubic-Bezier 参数 | 物理特征与适用场景 |
| :--- | :--- | :--- |
| **`quint`** (默认主曲线) | `cubic-bezier(.18, 1, .28, 1)` | **超强缓出**。起步极快、收尾平顺长拖尾。用于容器几何变形、主要内容淡入。 |
| **`expo`** | `cubic-bezier(.16, 1, .30, 1)` | **急迫缓出**。比 quint 起步更快，适合小元素快速归位、浮入落定、滑块滑动。 |
| **`soft`** | `cubic-bezier(.40, 0, .20, 1)` | **柔和进出**。对称 S 型，加减速平稳，用于退场、淡出、交叉淡入。 |
| **`emphasized`** | `cubic-bezier(.05, .70, .10, 1)` | **强调曲线** (Material Emphasized)。戏剧感强，用于共享轴推进、整屏位移。 |
| **`ios`** | `cubic-bezier(.32, .72, 0, 1)` | **iOS 风格缓动**。减速段持续有力，用于侧滑抽屉、顺滑展开。 |
| **`snappy`** | `cubic-bezier(.20, .90, .10, 1)` | **快速吸附**。极短减速行程，用于轻微提示与快速吸附。 |
| **`spring`** | `cubic-bezier(.34, 1.42, .52, 1)` | **轻微回弹**。Over-shoot 约为 42%，用于焦点卡片强化触感回弹。 |
| **`back`** | `cubic-bezier(.28, 1.30, .46, 1)` | **显著回弹**。Over-shoot 约为 30%，用于小卡片缩放浮入、旋入落定。 |
| **`gentle`** | `cubic-bezier(.25, .80, .35, 1)` | **沉稳优雅**。平缓减速，用于页面整体上浮（500ms）、条目沉稳切换。 |
| **`tile`** | `cubic-bezier(.20, .80, .20, 1)` | **磁贴专用**。先快加速后快速稳固入位。 |
| **`reveal`** | `cubic-bezier(.45, 0, .55, 1)` | **揭示式扩散**。S 型平稳扫过，用于波前扩散。 |
| **`quartOut`** | `cubic-bezier(.17, .84, .44, 1)` | **四次衰减**。用于拼图拼合等错峰落位。 |
| **`expoIn`** | `cubic-bezier(.70, 0, .84, 0)` | **缓入退场**。用于“先走一步”的退场动画，为新内容进场让位。 |
| **`overshoot`** | `cubic-bezier(.22, 1.35, .36, 1)` | **重力落体反弹**。用于落体式弹窗从顶部掉入并震动反弹。 |
| **`linear`** | `linear` | **线性插值**。仅用于瞬切（dur: 0）或搭配透明度变化的墨滴缩放。 |

---

## 3. 数值贝塞尔求解器 (`cubicAt`)

在处理非浏览器原生支持的补间（如：逐帧混合深浅色 CSS 变量、Canvas 逐帧渲染、状态机插值）时，系统采用自研高精度数值求解器：

```javascript
/**
 * 高精度贝塞尔曲线数值求值函数
 * @param {string} nameOrCurve - 曲线名称 (如 'quint') 或 cubic-bezier(x1,y1,x2,y2) 字符串
 * @param {number} p - 线性进度 0.0 ~ 1.0
 * @returns {number} 经过曲线映射后的物理进度 0.0 ~ 1.0
 */
function cubicAt(nameOrCurve, p) {
  if (!(p > 0)) { return 0; }
  if (p >= 1) { return 1; }
  var str = EASE[nameOrCurve] || nameOrCurve || 'linear';
  var m = /cubic-bezier\(([^)]+)\)/.exec(str);
  if (!m) { return p; } // linear
  var v = m[1].split(',').map(function (s) { return parseFloat(s); });
  if (v.length < 4) { return p; }

  // 1D 三阶贝塞尔方程：B(t) = 3*(1-t)^2*t*P1 + 3*(1-t)*t^2*P2 + t^3
  function bez(t, a, b) {
    var u = 1 - t;
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
  }

  // 24次二分法迭代求解 x(t) = p 的参数 t，误差 < 1e-6 (满足 60fps~144fps 亚像素级连续性)
  var lo = 0, hi = 1, mid = p;
  for (var i = 0; i < 24; i++) {
    mid = (lo + hi) / 2;
    if (bez(mid, v[0], v[2]) < p) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  // 代入 y 轴求值
  return bez(mid, v[1], v[3]);
}
```

---

## 4. 动效时长与延迟令牌规范 (Duration & Delay Tokens)

```css
:root {
  --motion-scale: 1;

  /* 基础曲线令牌 */
  --ease-cubic: cubic-bezier(.2, .8, .3, 1);        /* 进场 / 错峰上浮 */
  --ease-smooth: cubic-bezier(.22, .61, .36, 1);    /* 胶囊滑动 / 下划线滑块 */
  --ease-fade-out: cubic-bezier(.22, 1, .36, 1);    /* 一次性衰减 / 配色过渡 */
  --ease-dialog-in: cubic-bezier(.20, .90, .25, 1); /* 弹窗进场 (兼容类) */
  --ease-dialog-out: cubic-bezier(.40, 0, 1, 1);    /* 弹窗退场 (兼容类) */
  --ease-page-in: cubic-bezier(.1, 1, .3, 1);       /* 页面切换进场 */
  --ease-page-out: cubic-bezier(.3, 0, .7, 1);      /* 页面切换退场 */

  /* 阶梯时长令牌 (严格以 1.0x 基准推算) */
  --dur-press-in:    calc(90ms  * var(--motion-scale)); /* 按钮按压下陷 */
  --dur-press-out:   calc(260ms * var(--motion-scale)); /* 按钮抬起释放 */
  --dur-text-out:    calc(120ms * var(--motion-scale)); /* 文案速隐 */
  --dur-text-in:     calc(220ms * var(--motion-scale)); /* 文案速显 */
  --dur-tab-color:   calc(200ms * var(--motion-scale)); /* 选项卡文字变色 */
  --dur-list-item:   calc(180ms * var(--motion-scale)); /* 列表逐条淡入 */
  --dur-card-in:     calc(320ms * var(--motion-scale)); /* 卡片内容浮入 */
  --dur-zone:        calc(340ms * var(--motion-scale)); /* 容器展开收起 (几何补间) */
  --dur-ripple:      calc(380ms * var(--motion-scale)); /* 涟漪扩散基础 */
  --dur-pill:        calc(360ms * var(--motion-scale)); /* 滑块连续滑入目标 */
  --dur-dialog-in:   calc(460ms * var(--motion-scale)); /* 弹窗进场 (对齐 tileFlip) */
  --dur-dialog-out:  calc(320ms * var(--motion-scale)); /* 弹窗退场 (对齐 tileFlip) */
  --dur-block:       calc(500ms * var(--motion-scale)); /* 页面主块错峰上浮 */
  --dur-glow:        calc(500ms * var(--motion-scale)); /* 按钮点击高光衰减 */

  /* 错峰延迟步长 (Stagger Steps) */
  --stagger-list:    calc(30ms  * var(--motion-scale)); /* 列表子项错峰 */
  --stagger-modal:   calc(40ms  * var(--motion-scale)); /* 弹窗子组件逐条拼合错峰 */
  --stagger-view:    calc(60ms  * var(--motion-scale)); /* 页面主模块上浮错峰 */
  --stagger-column:  calc(34ms  * var(--motion-scale)); /* 数据网格按列错峰 */
}
```

---

## 5. WAAPI 关键帧姿势生成器 (`pose`)

将多维运动姿态对象转换为 WAAPI 关键帧：

```javascript
/**
 * 姿态对象定义
 * @typedef {Object} MotionPose
 * @property {number} [o=1] - 不透明度 (0.0 ~ 1.0)
 * @property {number} [x=0] - X轴水平位移 (px)
 * @property {number} [y=0] - Y轴垂直位移 (px)
 * @property {number} [s=1] - 等比缩放因子 (0.0 ~ N)
 * @property {number} [rot=0] - 2D平面旋转 (deg)
 * @property {number} [rx=0] - 3D绕X轴翻转角度 (deg)
 * @property {number} [ry=0] - 3D绕Y轴翻转角度 (deg)
 * @property {number} [blur=0] - 高斯模糊半径 (px)
 */

function pose(p, lvl) {
  p = p || {};
  lvl = lvl || 'full';
  var tf = [];
  var x = p.x || 0, y = p.y || 0;
  if (x || y) { tf.push('translate3d(' + x + 'px,' + y + 'px,0)'); }
  if (p.rx && lvl !== 'min') { tf.push('perspective(900px) rotateX(' + p.rx + 'deg)'); }
  if (p.ry && lvl !== 'min') { tf.push('perspective(760px) rotateY(' + p.ry + 'deg)'); }
  if (p.rot && lvl !== 'min') { tf.push('rotate(' + p.rot + 'deg)'); }
  if (p.s != null && p.s !== 1) { tf.push('scale(' + p.s + ')'); }
  if (!tf.length) { tf.push('none'); }
  
  var out = {
    opacity: p.o == null ? 1 : p.o,
    transform: tf.join(' ')
  };
  out.filter = (p.blur && lvl === 'full') ? ('blur(' + p.blur + 'px)') : 'none';
  return out;
}
```
