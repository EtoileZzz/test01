# 流体物理动效系统设计规范 (Fluid Motion Design Specification)

> **规范定位**：本规范是一套完全**脱敏、抽象且业务无关（Domain-Agnostic）**的前端物理动效与图形渲染标准。它系统化定义了 Web Animations API (WAAPI) 驱动下的非线性数学缓动模型、DOM 真实几何补间管线、GPU 滤镜单次光栅化优化、物理交互空间锚点、连续微交互状态机与分级性能降级机制。  
> **使用指南**：任何 AI Agent、UI/UX 动效设计师或前端工程师在实现任何富交互应用（如控制台、数据分析仪表板、折叠分栏应用、卡片式工具）时，均可直接基于本规范独立落地 100% 流畅、具备物理质感且零掉帧的动效体验。本规范完全自包含，无任何外部项目依赖。

---

## 1. 动效架构全景与三大工程突破

本动效系统构建于严格的物理运动学与现代浏览器合成器管道之上，包含三大底层工程突破：

```
                              ┌──────────────────────────────────┐
                              │      流体物理动效核心架构体系     │
                              └────────────────┬─────────────────┘
                                               │
         ┌─────────────────────────────────────┼─────────────────────────────────────┐
         ▼                                     ▼                                     ▼
┌──────────────────┐                 ┌──────────────────┐                  ┌──────────────────┐
│  物理拓扑与连贯性  │                 │  DOM 与 GPU 架构 │                  │  分级性能降级    │
├──────────────────┤                 ├──────────────────┤                  ├──────────────────┤
│· 进出物理同一性  │                 │· 真实几何物理补间│                  │· full (完整动效) │
│· 触控点锚定 3D 轴│                 │· 内容冻结无重排  │                  │· lite (去除滤镜) │
│· 时间轴方向感知  │                 │· 毛玻璃并集冻结  │                  │· min  (去3D/零延)│
└──────────────────┘                 └──────────────────┘                  └──────────────────┘
```

### 突破 1：真实几何补间与“内容冻结”架构 (Freeze-Inner Geometry Tweening)
- **解决痛点**：传统卡片缩放采用 `transform: scale()` 会导致文字与图标发生几何扭曲拉伸；若补间 `width / height`，浏览器每一帧均对容器内文字排版进行流式重排（Reflow Storm），引发高频掉帧与文字换行跳动。
- **创新解法**：外框执行真实几何物理补间（`left, top, width, height`）；内层内容容器在补间第 1 帧被**绝对定位锁定在目标终点绝对宽高**。外框通过 `overflow: hidden` 随几何外扩自然揭示内容。文字**全程不拉伸、不重排、零抖动**。

### 突破 2：毛玻璃层并集冻结渲染 (Union Bounding Box Glass Optimization)
- **解决痛点**：在移动端或跨平台 WebView 环境中，对应用了 `backdrop-filter: blur(...)` 的元素直接补间尺寸，会导致 GPU 在每一帧重新分配纹理并执行全屏多通道高斯模糊卷积，帧率暴跌至 20fps 乃至卡死。
- **创新解法**：预先计算起点与终点矩形的外接**最小并集包围盒（Union Bounding Box + 6px）**，将毛玻璃层固定为该并集尺寸。补间期间毛玻璃层宽高绝对静止，仅随外框相对滑动。高斯模糊计算**全局仅发生一次**，每帧 GPU 开销等同于普通位移，彻底消除渲染瓶颈。

### 突破 3：进退对称性与物理交互锚点 (In-and-Out Symmetry & Spatial Anchoring)
- **对称同一性**：展开与收起、打开与关闭在规范内由**同一个样式的 `in` / `out` 成对描述**，确保物理加速减速规律天然连贯。
- **空间铰链轴心 (`hingeSide`)**：3D 翻转动效根据用户手指或鼠标的点击坐标，动态将旋转轴心锁定在触控点所在的边缘（左侧触控以左边缘为轴向内翻开，右侧触控以右边缘为轴向内翻开）。
- **非线性墨滴扩散 (`themeSwitch`)**：主题明暗切换以触控点为圆心，利用合成器管线优化的 `transform: scale()` 线性扩散（透明度从 0.35 线性增加至 1.0），铺满后执行 140ms 优雅淡出，杜绝每帧生成全屏遮罩蒙版的 GPU 负担。

---

## 2. 规范交付文件结构说明

本规范包采用模块化组织，分为技术规格书、独立纯动效代码库与独立可运行实验台：

```
Fluid-Motion-Design-Specification/
├── README.md                          # 本文档：架构全景与第三方 Agent 复现标准
├── docs/                              # 5 份深度技术规格专篇
│   ├── 01_MOTION_TOKENS_AND_CURVES.md # 15 条非线性贝塞尔曲线、24次二分求解器 (cubicAt) 与时长令牌
│   ├── 02_CONTAINER_MORPH_AND_GLASS.md# 容器几何补间、内容冻结与毛玻璃并集优化完整实现
│   ├── 03_SEVEN_SCENARIOS_SPEC.md     # 七大场景 50+ 动效样式全量参数矩阵与物理交互定义
│   ├── 04_MICRO_INTERACTIONS.md       # 实心高光闪烁、连续滑块状态机与长按确认微交互
│   └── 05_PERFORMANCE_DEGRADATION.md  # full / lite / min 三档性能降级机制与拷贝隔离
├── standalone-engine/                 # 零业务依赖的纯动效独立实现
│   ├── motion-tokens.css              # 纯动效 CSS 变量与图层基础样式
│   ├── motion-engine.js               # 核心注册表、WAAPI 姿态生成器 (FluidMotion)
│   └── motion-components.js           # 可复用的独立动效组件控制器 (FluidMotionComponents)
└── demo/
    └── interactive-motion-lab.html    # 单文件交互式动效实验室 (双击在任何浏览器中直接运行)
```

---

## 3. 第三方 Agent 独立复现指南 (Step-by-Step Reproduction Guide)

任何代码生成 Agent 或开发团队在落地此动效系统时，应严格遵循以下六步标准流程，**无需依赖任何外部业务库**：

### 步骤 1：引入动效设计令牌与数学求解器
1. 导入 [motion-tokens.css](file:///standalone-engine/motion-tokens.css)，建立以 `--motion-scale` 为基准的全局时长缩放机制。
2. 引入 [motion-engine.js](file:///standalone-engine/motion-engine.js) 中收录的 15 条非线性贝塞尔曲线（默认主曲线为 `quint: cubic-bezier(.18, 1, .28, 1)`）。
3. 针对非 CSS 变量插值场景（如 Canvas 或 JS 逐帧动画），使用内嵌的 24 次二分迭代求解器 `FluidMotion.cubicAt(curve, progress)`。

### 步骤 2：建立多层解耦的容器 DOM 结构
为所有需要缩放、聚焦变形的卡片建立三层标准 DOM 结构：
```html
<div class="zone" style="overflow: hidden; position: absolute;">
  <!-- 第 1 层：毛玻璃优化层 (并集包围盒固定尺寸) -->
  <div class="zone-glass"></div>
  <!-- 第 2 层：内容冻结层 (动画期间绝对定位锁定) -->
  <div class="zone-inner">
    <!-- 第 3 层：具体呈现内容 (仅执行透明度与轻微位移浮入) -->
    <div class="zone-body">...</div>
  </div>
</div>
```

### 步骤 3：调用容器补间管线
在触发放大或收起时按标准时序调用：
```javascript
// 1. 计算终点几何 targetRect {x, y, w, h}
// 2. 冻结内容层
FluidMotionComponents.freezeInner(zoneEl, targetRect);
// 3. 启动外框与毛玻璃协同补间 (340ms, quint)
FluidMotionComponents.morphContainer(zoneEl, currentRect, targetRect, {
  collapse: isCollapsing,
  onFinish: function() {
    // 4. 精准落位并解冻内容层
    FluidMotionComponents.clearMorph(zoneEl);
  }
});
```

### 步骤 4：接入微交互（滑块与按钮高光）
- **分段控制滑块**：容器调用 `FluidMotionComponents.syncSegPill(segEl, animate)`。滑块坐标自动依据 `offsetLeft / offsetWidth` 布局树物理量算，杜绝 3D 透视变形。
- **按钮点击高光**：在触控事件中调用 `FluidMotionComponents.flashButton(btnEl, accentColor)`。通过“取消旧动画 $\to$ 复位 $\to$ 强制重排 `void f.offsetWidth` $\to$ 启动 WAAPI”协议，呈现 92% 白 + 8% 主题色的透亮闪烁。

### 步骤 5：接入 3D 铰链弹窗
在唤起模态弹窗时捕获指针坐标，调用 `FluidMotionComponents.playModal(root, card, scrim, 'in', lastPointer)`。卡片将自动以点击侧为 3D 翻转轴，且内部子组件带 40ms 错峰拼合。

### 步骤 6：配置三档性能降级
在低配环境或省电模式下，直接调用：
- `FluidMotion.setPerfLevel('lite')`：自动剥离所有 `blur` 滤镜，大模糊动效转为轻量 `zoom`。
- `FluidMotion.setPerfLevel('min')`：自动剥离所有 3D 旋转，错峰延时清零，时长上限收紧至 240ms。
业务逻辑无需任何改动，引擎自动无感降级。

---

## 4. 验证与验收基准 (Verification Protocol)

- **几何平滑性**：在放大缩小过程中，卡片内文本字体抗锯齿与排版换行应完全静止，无任何横向拉伸或重排跳动。
- **高负载掉帧**：连续快速点击多栏卡片，由于 `morphGlass` 并集冻结与 FLIP 接力，主线程帧间隔应恒定稳定在 16.7ms (60fps) 或更高。
- **触控方向性**：点击按钮右半侧打开弹窗，弹窗右边缘固定为铰链并向左翻开；点击左半侧则左边缘固定为铰链向右翻开。
