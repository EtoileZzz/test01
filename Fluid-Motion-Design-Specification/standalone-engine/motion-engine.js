/**
 * Fluid Motion Standalone Engine (FluidMotion)
 * 纯动效注册表、数学缓动求解器与 WAAPI 关键帧生成器
 * 零业务逻辑依赖，可直接接入任意前端框架 (Vue, React, Svelte, 原生 JS)
 */

(function (global) {
  'use strict';

  /** 缓动贝塞尔曲线家族 */
  var EASE = {
    quint: 'cubic-bezier(.18,1,.28,1)',        // 强缓出，默认容器几何变形
    expo: 'cubic-bezier(.16,1,.30,1)',         // 急迫缓出，快速吸附
    soft: 'cubic-bezier(.40,0,.20,1)',         // 柔和进出，退场与淡入淡出
    emphasized: 'cubic-bezier(.05,.70,.10,1)', // 戏剧性强调
    ios: 'cubic-bezier(.32,.72,0,1)',          // iOS 平滑展开
    snappy: 'cubic-bezier(.20,.90,.10,1)',     // 快速响应
    spring: 'cubic-bezier(.34,1.42,.52,1)',    // 轻微物理回弹
    back: 'cubic-bezier(.28,1.30,.46,1)',      // 显著回弹
    gentle: 'cubic-bezier(.25,.80,.35,1)',     // 沉稳优雅，整屏上浮
    tile: 'cubic-bezier(.20,.80,.20,1)',       // 磁贴专用，快加速稳收尾
    reveal: 'cubic-bezier(.45,0,.55,1)',       // S型波前扫过
    quartOut: 'cubic-bezier(.17,.84,.44,1)',   // 四次平滑减速
    expoIn: 'cubic-bezier(.70,0,.84,0)',       // 缓入提前离场
    overshoot: 'cubic-bezier(.22,1.35,.36,1)', // 重力落体反弹
    linear: 'linear'
  };

  /**
   * 七大场景全量参数规范表
   */
  var SCENARIOS = {
    zoneFocus: {
      name: '多栏容器 · 聚焦放大 / 缩小',
      default: 'rippleSpring',
      styles: [
        {
          k: 'rippleSpring', name: '点击处扩散 + 回弹放大（默认）',
          in: { dur: 460, ease: 'back', fx: 'ripple', fxDur: 500, content: 'none' },
          out: { dur: 300, ease: 'soft', fx: 'depthOut', fxDur: 300, content: 'settle' }
        },
        {
          k: 'tileFlip', name: '磁贴翻转（从点击处翻入）', tile: true,
          in: { dur: 520, ease: 'tile', fx: 'hingeFlip', fxDur: 640, content: 'none' },
          out: { dur: 380, ease: 'tile', fx: 'hingeFlipOut', fxDur: 420, content: 'none' }
        },
        {
          k: 'tileMosaic', name: '磁贴拼合',
          in: { dur: 420, ease: 'quartOut', fx: 'mosaic', fxDur: 460, fxStagger: 55, content: 'none' },
          out: { dur: 260, ease: 'soft', fx: 'fade', fxDur: 220, content: 'none' }
        },
        {
          k: 'origami', name: '折纸展开',
          in: { dur: 460, ease: 'expo', fx: 'foldX', fxDur: 520, fxStagger: 45, content: 'none' },
          out: { dur: 330, ease: 'expoIn', fx: 'foldXOut', fxDur: 320, content: 'none' }
        },
        {
          k: 'depth', name: '景深推移',
          in: { dur: 440, ease: 'ios', fx: 'depth', fxDur: 520, content: 'none' },
          out: { dur: 320, ease: 'soft', fx: 'depthOut', fxDur: 320, content: 'none' }
        },
        {
          k: 'spotlight', name: '聚光显影',
          in: { dur: 420, ease: 'emphasized', fx: 'spotlight', fxDur: 560, content: 'none' },
          out: { dur: 260, ease: 'soft', fx: 'fade', content: 'none' }
        },
        {
          k: 'cascade', name: '瀑布逐条',
          in: { dur: 380, ease: 'quint', fx: 'cascade', fxDur: 420, fxStagger: 70, content: 'none' },
          out: { dur: 240, ease: 'soft', fx: 'fade', content: 'none' }
        },
        {
          k: 'sharedAxis', name: '共享轴推进',
          in: { dur: 420, ease: 'emphasized', fx: 'axialZ', fxDur: 460, content: 'none' },
          out: { dur: 320, ease: 'emphasized', fx: 'axialZOut', fxDur: 340, content: 'none' }
        },
        {
          k: 'spring', name: '回弹放大',
          in: { dur: 520, ease: 'back', fx: 'settle', content: 'settle' },
          out: { dur: 300, ease: 'soft', content: 'settle' }
        },
        {
          k: 'ios', name: '顺滑展开',
          in: { dur: 460, ease: 'ios', fx: 'settle', content: 'rise' },
          out: { dur: 330, ease: 'ios', content: 'fade' }
        },
        {
          k: 'fadeThrough', name: '淡出淡入',
          in: { dur: 340, ease: 'emphasized', content: 'fade' },
          out: { dur: 260, ease: 'emphasized', content: 'fade' }
        },
        {
          k: 'stagger', name: '错峰推进',
          in: { dur: 420, ease: 'expo', content: 'rise', stagger: 45 },
          out: { dur: 300, ease: 'emphasized', content: 'fade', stagger: 35 }
        },
        {
          k: 'snap', name: '快速吸附',
          in: { dur: 240, ease: 'snappy', content: 'none' },
          out: { dur: 200, ease: 'snappy', content: 'none' }
        },
        {
          k: 'instant', name: '无动画（瞬切）',
          in: { dur: 0, ease: 'linear', content: 'none' },
          out: { dur: 0, ease: 'linear', content: 'none' }
        }
      ]
    },
    contentIn: {
      name: '卡片内容 · 浮入',
      default: 'settle',
      styles: [
        { k: 'settle', name: '上浮落定（默认）', dur: 300, ease: 'expo', y: 10, s: 0.986, hold: 0.45 },
        { k: 'rise', name: '纯上浮', dur: 300, ease: 'quint', y: 16, s: 1.0, hold: 0.5 },
        { k: 'fade', name: '只淡入', dur: 240, ease: 'soft', y: 0, s: 1.0, hold: 0.6 },
        { k: 'zoom', name: '轻微放大', dur: 340, ease: 'back', y: 0, s: 0.92, hold: 0.45 },
        { k: 'slide', name: '侧向滑入', dur: 320, ease: 'ios', x: 28, y: 0, s: 1.0, hold: 0.5 },
        { k: 'blurIn', name: '模糊聚焦', dur: 340, ease: 'expo', y: 6, s: 1.02, blur: 10, hold: 0.55 },
        { k: 'tileFlip', name: '磁贴翻转（从点击处翻入）', tile: true, dur: 420, ease: 'tile', fx: 'hingeFlip', fxDur: 560, content: 'none' },
        { k: 'none', name: '不要内容动画', dur: 0 }
      ]
    },
    modal: {
      name: '弹窗 · 进入 / 退出',
      default: 'tileFlip',
      styles: [
        {
          k: 'tileFlip', name: '磁贴翻转（默认）', tile: true,
          in: { dur: 460, ease: 'tile', from: { o: 0, ry: 94, s: 0.94 }, origin: 'click', childStagger: 40 },
          out: { dur: 320, ease: 'tile', to: { o: 0, ry: 88, s: 0.96 }, origin: 'click' }
        },
        {
          k: 'cascade', name: '内容逐条拼合',
          in: { dur: 320, ease: 'quint', from: { o: 0, y: 18, s: 0.985 }, childStagger: 45 },
          out: { dur: 200, ease: 'soft', to: { o: 0, y: 8, s: 0.98 } }
        },
        {
          k: 'pop', name: '弹起',
          in: { dur: 300, ease: 'expo', from: { o: 0, y: 14, s: 0.94 } },
          out: { dur: 190, ease: 'soft', to: { o: 0, y: 6, s: 0.975 } }
        },
        {
          k: 'unfold', name: '自上而下展开',
          in: { dur: 420, ease: 'expo', from: { o: 0, rx: -70, y: -8 }, origin: 'center top', childStagger: 38 },
          out: { dur: 300, ease: 'expoIn', to: { o: 0, rx: -64, y: -10 }, origin: 'center bottom' }
        },
        {
          k: 'dropIn', name: '落体回弹',
          in: { dur: 520, ease: 'overshoot', from: { o: 0, y: -46, s: 1 } },
          out: { dur: 320, ease: 'emphasized', to: { o: 0, y: 64, s: 0.96 } }
        },
        {
          k: 'spin', name: '旋入放大',
          in: { dur: 400, ease: 'back', from: { o: 0, s: 0.72, rot: -6 } },
          out: { dur: 280, ease: 'emphasized', to: { o: 0, s: 0.72, rot: 5 } }
        },
        {
          k: 'slideUp', name: '底部推入',
          in: { dur: 340, ease: 'emphasized', from: { o: 0, y: 52, s: 1 } },
          out: { dur: 240, ease: 'emphasized', to: { o: 0, y: 60, s: 1 } }
        },
        {
          k: 'sheet', name: '底部抽屉',
          in: { dur: 400, ease: 'ios', from: { o: 0, y: 120, s: 1 }, childStagger: 40 },
          out: { dur: 300, ease: 'emphasized', to: { o: 0, y: 130, s: 1 } }
        },
        {
          k: 'slideSide', name: '侧向滑入 / 滑出',
          in: { dur: 320, ease: 'ios', from: { o: 0, x: 60, s: 1 } },
          out: { dur: 240, ease: 'emphasized', to: { o: 0, x: 70, s: 1 } }
        },
        {
          k: 'blurIn', name: '模糊聚焦',
          in: { dur: 360, ease: 'expo', from: { o: 0, s: 1.03, blur: 14 }, childStagger: 35 },
          out: { dur: 260, ease: 'soft', to: { o: 0, s: 1.02, blur: 10 } }
        },
        {
          k: 'zoomIn', name: '从零放大',
          in: { dur: 300, ease: 'back', from: { o: 0, s: 0.78 } },
          out: { dur: 200, ease: 'emphasized', to: { o: 0, s: 0.88 } }
        },
        {
          k: 'none', name: '无动画',
          in: { dur: 0 }, out: { dur: 0 }
        }
      ]
    },
    viewIn: {
      name: '视图切换 · 模块入场',
      default: 'rise',
      styles: [
        { k: 'rise', name: '错峰上浮（默认）', dur: 500, ease: 'gentle', y: 12, headY: -24, stagger: 60, s: 0.97 },
        { k: 'tile', name: '磁贴翻入', dur: 460, ease: 'tile', y: 0, headY: 0, stagger: 55, s: 1, rx: -82, origin: 'center top', tile: true },
        { k: 'cascade', name: '逐块落下', dur: 380, ease: 'expo', y: -22, headY: -22, stagger: 70, s: 1 },
        { k: 'depth', name: '景深推近', dur: 480, ease: 'ios', y: 0, headY: 0, stagger: 40, s: 0.90, blur: 12 },
        { k: 'fade', name: '只淡入', dur: 260, ease: 'soft', y: 0, headY: 0, stagger: 0, s: 1 },
        { k: 'slideLeft', name: '右侧滑入', dur: 380, ease: 'ios', x: 26, y: 0, headY: 0, stagger: 30, s: 1 },
        { k: 'slideUp', name: '整屏上移', dur: 420, ease: 'emphasized', y: 26, headY: 0, stagger: 0, s: 1 },
        { k: 'zoom', name: '轻微放大', dur: 380, ease: 'back', y: 6, headY: 0, stagger: 0, s: 0.96 },
        { k: 'none', name: '无动画', dur: 0 }
      ]
    },
    listIn: {
      name: '列表 · 逐条入场',
      default: 'fade',
      styles: [
        { k: 'fade', name: '逐条淡入（默认）', dur: 180, ease: 'quint', stagger: 30, y: 0, s: 1 },
        { k: 'tile', name: '逐条翻转', dur: 320, ease: 'tile', stagger: 45, y: 0, s: 1, rx: -78, origin: 'center top', tile: true },
        { k: 'cascade', name: '逐条落下', dur: 300, ease: 'expo', stagger: 60, y: -26, s: 1 },
        { k: 'depth', name: '逐条推近', dur: 340, ease: 'ios', stagger: 40, y: 0, s: 0.88, blur: 10 },
        { k: 'rise', name: '逐条上浮', dur: 260, ease: 'expo', stagger: 36, y: 12, s: 0.99 },
        { k: 'slide', name: '逐条侧入', dur: 260, ease: 'ios', stagger: 30, x: 22, s: 1 },
        { k: 'zoom', name: '逐条放大', dur: 260, ease: 'back', stagger: 30, s: 0.94 },
        { k: 'none', name: '无动画', dur: 0 }
      ]
    },
    dateSwitch: {
      name: '时间轴 / 步进平移',
      default: 'settle',
      styles: [
        { k: 'settle', name: '沉稳落定（默认）', dir: true, dur: 440, ease: 'gentle', x: 12, y: 8, s: 0.994, o: 0.42 },
        { k: 'slideDir', name: '随方向滑入', dir: true, dur: 380, ease: 'expo', x: 26, s: 0.992, o: 0.20 },
        { k: 'slideSoft', name: '轻柔侧移', dir: true, dur: 300, ease: 'ios', x: 18, s: 1 },
        { k: 'tile', name: '磁贴翻转（从滑动方向翻入）', dir: true, flip: true, dur: 380, ease: 'tile', x: 8, s: 0.99, tile: true },
        { k: 'rise', name: '上浮落定', dir: false, dur: 320, ease: 'gentle', x: 0, y: 14, s: 0.994 },
        { k: 'zoom', name: '轻微放大', dir: false, dur: 300, ease: 'back', x: 0, y: 0, s: 0.96 },
        { k: 'fade', name: '原地淡入', dir: false, dur: 240, ease: 'soft', x: 0, y: 0, s: 1 },
        { k: 'none', name: '无动画', dir: false, dur: 0 }
      ]
    },
    themeSwitch: {
      name: '切换主题 · 亮 / 暗',
      default: 'auto',
      styles: [
        { k: 'auto', name: '自动（点按=扩散 / 系统=顶部下扫）', dur: 420, ease: 'linear', fx: 'auto' },
        { k: 'ripple', name: '点击处扩散', dur: 420, ease: 'linear', fx: 'ripple', feather: 96 },
        { k: 'sweepTop', name: '顶部整条下扫', dur: 460, ease: 'linear', fx: 'sweep', feather: 96 },
        { k: 'colorOnly', name: '只渐变色', dur: 420, ease: 'quint', fx: 'none' },
        { k: 'cross', name: '整页交叉淡入', dur: 380, ease: 'soft', fx: 'cross' },
        { k: 'none', name: '无动画（瞬切）', dur: 0, ease: 'linear', fx: 'none' }
      ]
    }
  };

  /** 降级映射表 */
  var FX_LITE = { depth: 'zoom', depthOut: 'zoomOut', spotlight: 'zoom' };
  var FX_MIN = {
    hingeFlip: 'zoom', hingeFlipOut: 'fade',
    foldX: 'zoom', foldXOut: 'fade',
    flipY: 'zoom', flipYOut: 'fade',
    axialZ: 'zoom', axialZOut: 'fade'
  };

  var currentPerfLevel = 'full';
  var userStyleOverrides = {};
  var speedMultiplier = 1.0;

  function setPerfLevel(lvl) {
    if (lvl === 'full' || lvl === 'lite' || lvl === 'min') {
      currentPerfLevel = lvl;
    }
  }

  function setSpeedMultiplier(scale) {
    speedMultiplier = Math.max(0.1, Number(scale) || 1.0);
  }

  function getSpeedMultiplier() {
    return speedMultiplier;
  }

  /** 深浅拷贝助手 */
  function copyOwn(src) {
    var out = {};
    for (var k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) {
        out[k] = (src[k] && typeof src[k] === 'object') ? copyOwn(src[k]) : src[k];
      }
    }
    return out;
  }

  /** 姿势对象降级 */
  function cleanPose(p, lvl) {
    if (!p) return p;
    var out = copyOwn(p);
    delete out.blur;
    if (lvl === 'min') {
      delete out.rx;
      delete out.ry;
      delete out.rot;
    }
    return out;
  }

  /** 方向定义降级 */
  function degradeDir(d, lvl, scenario) {
    if (!d) return d;
    var out = copyOwn(d);
    if (out.from) out.from = cleanPose(out.from, lvl);
    if (out.to) out.to = cleanPose(out.to, lvl);
    delete out.blur;

    if (lvl !== 'full' && out.fx) {
      if (scenario === 'themeSwitch') {
        if (lvl === 'min' || out.fx === 'ripple' || out.fx === 'sweep') out.fx = 'none';
      } else {
        var map = (lvl === 'min') ? FX_MIN : FX_LITE;
        if (map[out.fx]) out.fx = map[out.fx];
        else if (lvl === 'min' && FX_LITE[out.fx]) out.fx = FX_LITE[out.fx];
      }
    }

    if (lvl === 'min') {
      out.stagger = 0;
      out.fxStagger = 0;
      out.childStagger = 0;
      if (out.flip) out.flip = false;
      if (out.dur > 240) out.dur = 240;
      if (out.fxDur > 260) out.fxDur = 260;
    }
    return out;
  }

  /** 整个样式降级 */
  function degrade(st, lvl, scenario) {
    if (!st || lvl === 'full') return st;
    var out = copyOwn(st);
    if (st.in) out.in = degradeDir(st.in, lvl, scenario);
    if (st.out) out.out = degradeDir(st.out, lvl, scenario);
    out = degradeDir(out, lvl, scenario);
    return out;
  }

  /** 数值贝塞尔求解器 */
  function cubicAt(nameOrCurve, p) {
    if (!(p > 0)) return 0;
    if (p >= 1) return 1;
    var str = EASE[nameOrCurve] || nameOrCurve || 'linear';
    var m = /cubic-bezier\(([^)]+)\)/.exec(str);
    if (!m) return p;
    var v = m[1].split(',').map(function (s) { return parseFloat(s); });
    if (v.length < 4) return p;

    function bez(t, a, b) {
      var u = 1 - t;
      return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
    }

    var lo = 0, hi = 1, mid = p;
    for (var i = 0; i < 24; i++) {
      mid = (lo + hi) / 2;
      if (bez(mid, v[0], v[2]) < p) lo = mid; else hi = mid;
    }
    return bez(mid, v[1], v[3]);
  }

  /** 姿势对象 -> WAAPI 关键帧 */
  function pose(p) {
    p = p || {};
    var lvl = currentPerfLevel;
    var tf = [];
    var x = p.x || 0, y = p.y || 0;
    if (x || y) tf.push('translate3d(' + x + 'px,' + y + 'px,0)');
    if (p.rx && lvl !== 'min') tf.push('perspective(900px) rotateX(' + p.rx + 'deg)');
    if (p.ry && lvl !== 'min') tf.push('perspective(760px) rotateY(' + p.ry + 'deg)');
    if (p.rot && lvl !== 'min') tf.push('rotate(' + p.rot + 'deg)');
    if (p.s != null && p.s !== 1) tf.push('scale(' + p.s + ')');
    if (!tf.length) tf.push('none');

    var out = { opacity: p.o == null ? 1 : p.o, transform: tf.join(' ') };
    out.filter = (p.blur && lvl === 'full') ? ('blur(' + p.blur + 'px)') : 'none';
    return out;
  }

  /** 获取场景当前生效样式 */
  function get(scenario) {
    var sc = SCENARIOS[scenario];
    if (!sc) return null;
    var key = userStyleOverrides[scenario] || sc.default;
    var st = null;
    for (var i = 0; i < sc.styles.length; i++) {
      if (sc.styles[i].k === key) { st = sc.styles[i]; break; }
    }
    if (!st) st = sc.styles[0];
    return degrade(st, currentPerfLevel, scenario);
  }

  /** 获取场景进退参数 (结合速度倍率缩放) */
  function dir(scenario, which) {
    var st = get(scenario);
    if (!st) return null;
    var d = st[which] || st[which === 'out' ? 'in' : 'out'] || null;
    if (!d) return null;
    var out = copyOwn(d);
    if (out.dur) out.dur = Math.round(out.dur / speedMultiplier);
    if (out.fxDur) out.fxDur = Math.round(out.fxDur / speedMultiplier);
    if (out.stagger) out.stagger = Math.round(out.stagger / speedMultiplier);
    if (out.fxStagger) out.fxStagger = Math.round(out.fxStagger / speedMultiplier);
    if (out.childStagger) out.childStagger = Math.round(out.childStagger / speedMultiplier);
    return out;
  }

  /** 动态轴心判断算法 */
  function hingeSide(element, lastPointer) {
    var r = element.getBoundingClientRect();
    if (!r.width) return 'right';
    var px = (lastPointer && lastPointer.x != null ? lastPointer.x : 0) - r.left;
    if (px < -4 || px > r.width + 4) {
      return (r.left + r.width / 2) >= (window.innerWidth / 2) ? 'right' : 'left';
    }
    return px < r.width / 2 ? 'left' : 'right';
  }

  var FluidMotion = {
    easeTable: EASE,
    ease: function (name) { return EASE[name] || EASE.quint; },
    cubicAt: cubicAt,
    pose: pose,
    scenarios: SCENARIOS,
    get: get,
    dir: dir,
    setStyle: function (scenario, key) { userStyleOverrides[scenario] = key; },
    setPerfLevel: setPerfLevel,
    getPerfLevel: function () { return currentPerfLevel; },
    setSpeedMultiplier: setSpeedMultiplier,
    getSpeedMultiplier: getSpeedMultiplier,
    hingeSide: hingeSide
  };

  global.FluidMotion = FluidMotion;
  // 保持兼容别名
  global.ARMotion = FluidMotion;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FluidMotion;
  }
})(typeof window !== 'undefined' ? window : this);
