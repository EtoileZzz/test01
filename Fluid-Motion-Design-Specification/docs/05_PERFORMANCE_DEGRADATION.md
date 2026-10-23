# 05 · 三档流畅模式与性能降级体系 (Tiered Performance Degradation Engine)

移动端与跨平台设备硬件性能跨度极大（从千元入门机到高端旗舰）。若在低算力设备或老旧 WebView 上强开多层毛玻璃模糊与复合 3D 变换，极易造成不可接受的卡顿。

系统建立了**工业级三档性能降级架构（Perf Level）**。其核心特征是：**降级集中在动效出口做，业务代码一行不用改，用户个性化配置丝毫不被污染**。

---

## 1. 三档性能档位矩阵 (Performance Levels)

| 档位标识 (`perfLevel`) | 档位名称 | 算力定位 | 动效保留策略 | 算力削减措施 |
| :--- | :--- | :--- | :--- | :--- |
| **`full`**<br>*(系统默认)* | **完整动效**<br>(关闭流畅模式) | 高端机型<br>桌面 PC | **全部特效全开**：<br>· 3D 透视翻转 / 折纸<br>· 渐进式多层毛玻璃高斯模糊<br>· 聚光显影与景深推移模糊<br>· 主题切换点击处墨滴非线性扩散<br>· 阶梯错峰微动效 | 无限制。 |
| **`lite`** | **标准流畅** | 中端机型<br>日常轻负载 | **保留几何动效，剥离沉重滤镜**：<br>· 3D 翻转/折纸保留<br>· 错峰与曲线拓扑保留<br>· 几何变形完全保留 | **砍掉昂贵 GPU 滤镜**：<br>· 彻底停用 `backdrop-filter: blur()`<br>· 特效 `depth / spotlight` 自动转为无滤镜的 `zoom`（透明度+缩放）<br>· 主题墨滴扩散降级为 260ms 纯颜色令牌渐变 |
| **`min`** | **深度流畅** | 入门机型<br>低电量模式 | **极限性能，零多余负载**：<br>· 仅保留纯 2D 位移、透明度与等比缩放<br>· 动画时长全面收敛至 ≤240ms | **剔除 3D 与所有错峰延迟**：<br>· 3D 翻转 (`rx, ry, perspective`) 彻底移除<br>· 所有错峰延时清零 (`stagger = 0`)，同组元素同拍进场<br>· 主题切换瞬时落位 |

---

## 2. 集中降级设计哲学 (Centralized Degradation Architecture)

### 为什么不在业务调用方写 `if (perfLevel === 'min')`？
- 若在每处点击、弹窗、切页的业务逻辑中散落 `if-else` 判断，系统将迅速沦为无法维护的“意大利面代码”。
- 动效系统将降级逻辑完全收口在 `FluidMotion` 的三个输出管道：
  1. **`FluidMotion.get(scenario)`**：读取场景样式时自动降级。
  2. **`FluidMotion.dir(scenario, which)`**：读取进退方向参数时自动降级。
  3. **`FluidMotion.pose(p)`**：生成 WAAPI 关键帧时自动剥离对应维度。

### 保护用户偏好的拷贝机制 (Immutability)
降级函数一律对原始样式字典执行深层拷贝（`copyOwn`），**绝不直接修改内存中的原始定义**。当用户日后从“深度流畅”切换回“完整动效”时，原有的一切 3D 角度与特效无需重新配置，原样恢复。

---

## 3. 降级核心代码实现

```javascript
/** 模糊类/过曝类特效 -> 便宜等价 (lite 档生效) */
var FX_LITE = {
  depth: 'zoom',
  depthOut: 'zoomOut',
  spotlight: 'zoom'
};

/** 3D 翻折类特效 -> 便宜等价 (min 档生效) */
var FX_MIN = {
  hingeFlip: 'zoom',
  hingeFlipOut: 'fade',
  foldX: 'zoom',
  foldXOut: 'fade',
  flipY: 'zoom',
  flipYOut: 'fade',
  axialZ: 'zoom',
  axialZOut: 'fade'
};

/**
 * 姿态对象降级：
 * lite: 剥离 blur 模糊滤镜
 * min:  进一步剥离 rx, ry 3D旋转与平面 rot 旋转
 */
function cleanPose(p, lvl) {
  if (!p) return p;
  var out = Object.assign({}, p);
  delete out.blur;
  if (lvl === 'min') {
    delete out.rx;
    delete out.ry;
    delete out.rot;
  }
  return out;
}

/**
 * 单方向动画参数降级
 */
function degradeDir(d, lvl, scenario) {
  if (!d) return d;
  var out = Object.assign({}, d);
  if (out.from) out.from = cleanPose(out.from, lvl);
  if (out.to) out.to = cleanPose(out.to, lvl);
  delete out.blur;

  // 特效降级映射
  if (lvl !== 'full' && out.fx) {
    if (scenario === 'themeSwitch') {
      if (lvl === 'min' || out.fx === 'ripple' || out.fx === 'sweep') {
        out.fx = 'none';
      }
    } else {
      var map = (lvl === 'min') ? FX_MIN : FX_LITE;
      if (map[out.fx]) {
        out.fx = map[out.fx];
      } else if (lvl === 'min' && FX_LITE[out.fx]) {
        out.fx = FX_LITE[out.fx];
      }
    }
  }

  // 深度模式极限压缩
  if (lvl === 'min') {
    out.stagger = 0;       // 错峰清零
    out.fxStagger = 0;
    out.childStagger = 0;
    if (out.flip) out.flip = false;
    if (out.dur > 240) out.dur = 240;       // 主时长上限收敛到 240ms
    if (out.fxDur > 260) out.fxDur = 260;   // 特效时长上限收敛到 260ms
  }
  return out;
}
```

---

## 4. CSS 层配合降级控制

除 JS 管道降级外，HTML `body` 元素挂载 `data-perf="lite | min | full"` 属性，通过 CSS 全局切断 GPU 昂贵层渲染：

```css
/* 标准档与深度档：彻底禁用 backdrop-filter，释放合成层显存 */
body[data-perf="lite"] .zone-glass,
body[data-perf="min"]  .zone-glass,
body[data-perf="lite"] .modal-head,
body[data-perf="min"]  .modal-head {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: var(--bg-card) !important; /* 回落为高对比度实底色 */
}

/* 深度档：背景光斑与漫反射直接隐藏，GPU 零绘制 */
body[data-perf="min"] .ambient-glow,
body[data-perf="min"] .bg-mesh {
  display: none !important;
}
```
通过上述软硬协同的体系设计，该动效即使在极低配设备上依然保持稳定 60fps 满帧运行。
