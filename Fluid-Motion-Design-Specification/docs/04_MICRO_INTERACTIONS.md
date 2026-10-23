# 04 · 微交互动效规范与状态机实现 (Micro-Interactions & State Machines)

在流体物理动效系统中，微交互绝不是随意的“装饰动画”，而是**承载用户物理心智、提供确定性操作反馈的关键设计**。

---

## 1. 按钮实心均匀高光 (`flashButton`)

### 设计规范原则
- **禁止使用涟漪（Ripple）**：涟漪扩散容易产生廉价的“水波泛滥”视觉噪音，且波前扩散方向与按钮文字几何结构冲突。
- **禁止使用外发光（Outer Glow）**：外发光会破坏现代卡片与面板严格的边界裁切（Clipping Bounds）。
- **统一采用“全钮实心瞬时高光”**：
  - **光色定义**：92% 纯白 + 8% 主题强调色（手算加权，确保浅色暗色下均清澈透亮）。
  - **衰减模型**：单次衰减，峰值不透明度 **0.30** 落在前 **12%** 时长处（约 60ms 瞬间亮起），后 440ms 平滑衰减至 0。
  - **缓动曲线**：`cubic-bezier(.22, 1, .36, 1)`（500ms）。

### 严格的“重启动画协议”
为了避免用户快速连点按钮时产生闪烁冲突或动画丢帧，底层必须严格执行**四步协议**：
1. **取消（Cancel）**：取消当前正在运行的旧动画。
2. **复位（Reset）**：强制将元素样式归零 (`opacity = '0'`)。
3. **强制重排刷新（Force Reflow）**：读取 `void el.offsetWidth`，强迫浏览器清空并同步绘制上下文。
4. **启动（Start）**：创建新的 WAAPI 动画。

```javascript
/**
 * 按钮点击实心均匀高光微交互
 */
function flashButton(btnEl, accentHex) {
  if (!btnEl) return;
  var flash = btnEl.__flash;
  if (!flash || !flash.isConnected) {
    flash = document.createElement('span');
    flash.className = 'btn-flash';
    btnEl.appendChild(flash);
    btnEl.__flash = flash;
  }

  // 1. 取消旧动画
  if (flash.getAnimations) {
    flash.getAnimations().forEach(function(anim) { anim.cancel(); });
  }

  // 2. 复位样式
  flash.style.opacity = '0';

  // 3. 强制重排刷新 (Force Reflow)
  void flash.offsetWidth;

  // 4. 92% 白 + 8% 主题色混合
  flash.style.background = mixWithWhite(accentHex || '#5B8DEF', 0.08);

  // 5. 启动 WAAPI 高光衰减补间
  if (flash.animate) {
    flash.animate(
      [
        { opacity: 0, offset: 0 },
        { opacity: 0.30, offset: 0.12 },
        { opacity: 0, offset: 1 }
      ],
      {
        duration: 500,
        easing: 'cubic-bezier(.22, 1, .36, 1)',
        fill: 'none'
      }
    );
  }
}

function mixWithWhite(hex, t) {
  var h = hex.replace('#', '');
  var r = parseInt(h.substring(0, 2), 16) || 0;
  var g = parseInt(h.substring(2, 4), 16) || 0;
  var b = parseInt(h.substring(4, 6), 16) || 0;
  var m = function(c) { return Math.round(255 * (1 - t) + c * t); };
  return 'rgba(' + m(r) + ',' + m(g) + ',' + m(b) + ', 1)';
}
```

---

## 2. 连续胶囊滑块状态机 (`slidePill` & `enhanceSegmented`)

分段控制器（Segmented Control）、导航指示器中，均存在一个“连续滑动的小胶囊（Pill Slider）”。

### 解决传统实现的严重 Bug
1. **抵御 3D 投影失真**：若使用 `getBoundingClientRect()`，当外层卡片在播放 3D 翻转或缩放动画时，测量到的矩形尺寸是被透视缩放后的“畸变值”，导致滑块严重缩成一团并发生错位。
   - **对策**：全局统一改用 **DOM 布局树 Offset 偏移链（`offsetLeft / offsetTop / offsetWidth / offsetHeight`）**，彻底免疫祖先节点的任何 Transform / Perspective 干扰！
2. **三态状态机（State Machine）**：
   - `落位态 (Direct Placement)`：组件挂载初次呈现、页面切换入场、屏幕旋转、面板 Resize 时，滑块**直接落位，零毫秒补间**（避免用户看到莫名其妙的滑块飘移）。
   - `滑动态 (Smooth Slide)`：**只有且仅当选中项索引（Index）发生实际变化时**，才触发 360ms `expo` 曲线的平滑位移。
   - `续播态 (Continuous Retargeting)`：若上一段滑动未结束用户再次点选新项，自动以当前实时坐标为起点平滑转向新目标。

```javascript
/**
 * 分段滑块同步引擎
 */
function syncSegPill(segContainer, animate) {
  var activeBtn = segContainer.querySelector('.seg-item.active');
  if (!activeBtn) return;

  var pill = segContainer.querySelector('.seg-pill');
  if (!pill) {
    pill = document.createElement('span');
    pill.className = 'seg-pill';
    segContainer.appendChild(pill);
  }

  // 严格读取 offset 布局属性，免受 3D 动画缩放畸变
  var targetX = activeBtn.offsetLeft;
  var targetY = activeBtn.offsetTop;
  var targetW = activeBtn.offsetWidth;
  var targetH = activeBtn.offsetHeight;

  var prev = segContainer.__pillMemo || { x: targetX, y: targetY, w: targetW, h: targetH, item: null };

  // 检查是否发生实际项变化
  var hasChanged = prev.item !== activeBtn;
  segContainer.__pillMemo = { x: targetX, y: targetY, w: targetW, h: targetH, item: activeBtn };

  pill.style.width = targetW + 'px';
  pill.style.height = targetH + 'px';
  pill.style.transform = 'translate3d(' + targetX + 'px,' + targetY + 'px,0)';

  // 仅在真实换项且允许动画时滑动
  if (animate && hasChanged && pill.animate) {
    if (pill.__anim) {
      try { pill.__anim.cancel(); } catch (e) {}
    }
    pill.__anim = pill.animate(
      [
        { transform: 'translate3d(' + prev.x + 'px,' + prev.y + 'px,0)', width: prev.w + 'px', height: prev.h + 'px' },
        { transform: 'translate3d(' + targetX + 'px,' + targetY + 'px,0)', width: targetW + 'px', height: targetH + 'px' }
      ],
      {
        duration: 360,
        easing: 'cubic-bezier(.16, 1, .30, 1)', // expo 强缓出
        fill: 'none'
      }
    );
  }
}
```

---

## 3. 危险操作长按确认动效 (`dangerHold`)

针对不可逆操作（如“清空全部缓存”、“永久销毁敏感对象”），传统方案使用静态二次弹窗极易被机械手误点。

系统采用 **长按蓄力物理微交互**：
1. 用户在按钮上按下（`pointerdown`），按钮背景的 `.hold-fill` 进度层通过 CSS/WAAPI 匀速增长宽度（从 `0%` 涨至 `100%`），耗时通常为 2000ms。
2. 若用户中途松开手指（`pointerup / pointerleave / pointercancel`），进度条在 **160ms 内迅速弹性回缩至 0%**，操作安全取消。
3. 唯有进度条 100% 充满的瞬间，正式执行确认回调。

```javascript
/**
 * 长按蓄力微交互绑定
 */
function bindHoldToConfirm(btnNode, holdMs, onComplete) {
  var fill = btnNode.querySelector('.hold-fill');
  var timer = null;
  var startTime = 0;

  function cancelHold() {
    if (timer) {
      cancelAnimationFrame(timer);
      timer = null;
    }
    if (fill && fill.animate) {
      fill.animate([{ width: fill.style.width || '0%' }, { width: '0%' }], {
        duration: 160,
        easing: 'cubic-bezier(.22, 1, .36, 1)',
        fill: 'forwards'
      });
    } else if (fill) {
      fill.style.width = '0%';
    }
  }

  btnNode.addEventListener('pointerdown', function(e) {
    e.preventDefault();
    startTime = performance.now();
    
    function tick(now) {
      var progress = Math.min(1, (now - startTime) / holdMs);
      if (fill) fill.style.width = (progress * 100) + '%';
      if (progress < 1) {
        timer = requestAnimationFrame(tick);
      } else {
        timer = null;
        if (onComplete) onComplete();
      }
    }
    timer = requestAnimationFrame(tick);
  });

  btnNode.addEventListener('pointerup', cancelHold);
  btnNode.addEventListener('pointerleave', cancelHold);
  btnNode.addEventListener('pointercancel', cancelHold);
}
```

---

## 4. 指示器与标题微落定 (`playStepSwitch`)

在步进或时间轴切换时，主内容滑动的同时间，顶部的状态文本或指示器联动微落定动效：
- **指示器文本**：`opacity: 0.25 -> 1.0`, `translateY(7px) -> 0px`，时长 280ms，曲线 `expo`。
- **副标题文本**：`opacity: 0.25 -> 1.0`，时长 260ms。
- **效果**：强化“状态更新与刻度翻新”的心智模型，同时避免大面积文字闪动。
