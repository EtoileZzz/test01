/**
 * Fluid Motion Standalone Components (FluidMotionComponents)
 * 纯动效交互组件实现库：
 * 包含容器真实几何补间、内容冻结、毛玻璃优化、滑块状态机、按钮高光、3D铰链弹窗与主题墨滴扩散
 */

(function (global) {
  'use strict';

  var M = global.FluidMotion || global.ARMotion;
  if (!M) {
    throw new Error('FluidMotion 核心引擎未加载，请先引入 motion-engine.js');
  }

  /* ──────────────────────────────────────────────────────────────
     1. 容器几何补间与内容冻结架构 (Freeze-Inner Morphing)
     ────────────────────────────────────────────────────────────── */

  function freezeInner(node, targetRect) {
    var inner = node.querySelector('.zone-inner');
    if (!inner) return;
    var cs = getComputedStyle(node);
    var padL = parseFloat(cs.paddingLeft) || 0;
    var padT = parseFloat(cs.paddingTop) || 0;
    var bw = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
    var bh = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);

    inner.style.position = 'absolute';
    inner.style.left = padL + 'px';
    inner.style.top = padT + 'px';
    inner.style.width = Math.max(20, targetRect.w - bw - padL * 2) + 'px';
    inner.style.height = Math.max(20, targetRect.h - bh - padT * 2) + 'px';
    inner.style.flex = 'none';
    node.__frozenInner = inner;
  }

  function clearMorph(node) {
    if (!node) return;
    if (node.__morph) {
      try { node.__morph.cancel(); } catch (e) {}
      node.__morph = null;
    }
    if (node.__frozenInner) {
      var f = node.__frozenInner;
      node.__frozenInner = null;
      f.style.position = '';
      f.style.left = '';
      f.style.top = '';
      f.style.width = '';
      f.style.height = '';
      f.style.flex = '';
    }
    var gl = node.querySelector('.zone-glass');
    if (gl && gl.__glassAnim) {
      try { gl.__glassAnim.cancel(); } catch (e) {}
      gl.__glassAnim = null;
    }
  }

  function morphGlass(node, a, b, dur, ease, delay) {
    var gl = node.querySelector('.zone-glass');
    if (!gl || !gl.animate || M.getPerfLevel() !== 'full') return;
    var pad = 6;
    var ux = Math.min(a.x, b.x) - pad;
    var uy = Math.min(a.y, b.y) - pad;
    var uw = Math.max(a.x + a.w, b.x + b.w) + pad - ux;
    var uh = Math.max(a.y + a.h, b.y + b.h) + pad - uy;

    gl.style.width = uw + 'px';
    gl.style.height = uh + 'px';

    if (gl.__glassAnim) {
      try { gl.__glassAnim.cancel(); } catch (e) {}
      gl.__glassAnim = null;
    }

    gl.__glassAnim = gl.animate(
      [
        { left: (ux - a.x) + 'px', top: (uy - a.y) + 'px' },
        { left: (ux - b.x) + 'px', top: (uy - b.y) + 'px' }
      ],
      { duration: dur, delay: delay || 0, easing: ease, fill: 'both' }
    );
  }

  /**
   * 容器几何尺寸平滑补间
   * @param {HTMLElement} node - 容器外框元素
   * @param {Object} startRect - {x, y, w, h}
   * @param {Object} targetRect - {x, y, w, h}
   * @param {Object} [opts] - {collapse: boolean, onFinish: function}
   */
  function morphContainer(node, startRect, targetRect, opts) {
    opts = opts || {};
    var collapse = !!opts.collapse;
    var style = M.dir('zoneFocus', collapse ? 'out' : 'in');
    var dur = style ? style.dur : (collapse ? 300 : 380);
    var ease = M.ease(style ? style.ease : 'quint');

    if (!dur || !node.animate) {
      setNodeRect(node, targetRect);
      if (opts.onFinish) opts.onFinish();
      return;
    }

    clearMorph(node);
    if (Math.abs(targetRect.w - startRect.w) > 0.5 || Math.abs(targetRect.h - startRect.h) > 0.5) {
      freezeInner(node, targetRect);
    }

    node.__morph = node.animate(
      [
        { left: startRect.x + 'px', top: startRect.y + 'px', width: startRect.w + 'px', height: startRect.h + 'px' },
        { left: targetRect.x + 'px', top: targetRect.y + 'px', width: targetRect.w + 'px', height: targetRect.h + 'px' }
      ],
      { duration: dur, easing: ease, fill: 'both' }
    );

    morphGlass(node, startRect, targetRect, dur, ease, 0);

    node.__morph.onfinish = function () {
      setNodeRect(node, targetRect);
      if (opts.onFinish) opts.onFinish();
    };
  }

  function setNodeRect(node, r) {
    clearMorph(node);
    node.style.left = r.x + 'px';
    node.style.top = r.y + 'px';
    node.style.width = r.w + 'px';
    node.style.height = r.h + 'px';
    var gl = node.querySelector('.zone-glass');
    if (gl) {
      gl.style.left = '0px';
      gl.style.top = '0px';
      gl.style.width = r.w + 'px';
      gl.style.height = r.h + 'px';
    }
  }

  /* ──────────────────────────────────────────────────────────────
     2. 按钮实心均匀瞬时高光 (flashButton)
     ────────────────────────────────────────────────────────────── */

  function flashButton(btnEl, accentHex) {
    if (!btnEl) return;
    var flash = btnEl.__flash;
    if (!flash || !flash.isConnected) {
      flash = document.createElement('span');
      flash.className = 'btn-flash';
      btnEl.appendChild(flash);
      btnEl.__flash = flash;
    }

    if (flash.getAnimations) {
      flash.getAnimations().forEach(function (anim) { anim.cancel(); });
    }
    flash.style.opacity = '0';
    void flash.offsetWidth; // 强制同步重排

    var hex = (accentHex || '#5B8DEF').replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var r = parseInt(hex.substring(0, 2), 16) || 0;
    var g = parseInt(hex.substring(2, 4), 16) || 0;
    var b = parseInt(hex.substring(4, 6), 16) || 0;
    var bg = 'rgba(' + Math.round(255 * 0.92 + r * 0.08) + ','
                     + Math.round(255 * 0.92 + g * 0.08) + ','
                     + Math.round(255 * 0.92 + b * 0.08) + ', 1)';
    flash.style.background = bg;

    if (flash.animate) {
      flash.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 0.30, offset: 0.12 },
          { opacity: 0, offset: 1 }
        ],
        { duration: Math.round(500 / M.getSpeedMultiplier()), easing: 'cubic-bezier(.22,1,.36,1)', fill: 'none' }
      );
    }
  }

  /* ──────────────────────────────────────────────────────────────
     3. 连续胶囊滑块状态机 (syncSegPill)
     ────────────────────────────────────────────────────────────── */

  function syncSegPill(segContainer, animate) {
    var activeBtn = segContainer.querySelector('.seg-item.active');
    if (!activeBtn) return;

    var pill = segContainer.querySelector('.seg-pill');
    if (!pill) {
      pill = document.createElement('span');
      pill.className = 'seg-pill';
      segContainer.appendChild(pill);
    }

    var tx = activeBtn.offsetLeft;
    var ty = activeBtn.offsetTop;
    var tw = activeBtn.offsetWidth;
    var th = activeBtn.offsetHeight;

    var prev = segContainer.__pillMemo || { x: tx, y: ty, w: tw, h: th, item: null };
    var hasChanged = prev.item !== activeBtn;
    segContainer.__pillMemo = { x: tx, y: ty, w: tw, h: th, item: activeBtn };

    pill.style.width = tw + 'px';
    pill.style.height = th + 'px';
    pill.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0)';

    if (animate && hasChanged && pill.animate) {
      if (pill.__anim) {
        try { pill.__anim.cancel(); } catch (e) {}
      }
      pill.__anim = pill.animate(
        [
          { transform: 'translate3d(' + prev.x + 'px,' + prev.y + 'px,0)', width: prev.w + 'px', height: prev.h + 'px' },
          { transform: 'translate3d(' + tx + 'px,' + ty + 'px,0)', width: tw + 'px', height: th + 'px' }
        ],
        {
          duration: Math.round(360 / M.getSpeedMultiplier()),
          easing: M.ease('expo'),
          fill: 'none'
        }
      );
    }
  }

  /* ──────────────────────────────────────────────────────────────
     4. 长按蓄力微交互 (bindHoldToConfirm)
     ────────────────────────────────────────────────────────────── */

  function bindHoldToConfirm(btnNode, holdMs, onComplete) {
    var fill = btnNode.querySelector('.hold-fill');
    var timer = null;
    var startTime = 0;

    function cancel() {
      if (timer) {
        cancelAnimationFrame(timer);
        timer = null;
      }
      if (fill && fill.animate) {
        fill.animate([{ width: fill.style.width || '0%' }, { width: '0%' }], {
          duration: 160,
          easing: 'cubic-bezier(.22,1,.36,1)',
          fill: 'forwards'
        });
      } else if (fill) {
        fill.style.width = '0%';
      }
    }

    btnNode.addEventListener('pointerdown', function (e) {
      startTime = performance.now();
      function tick(now) {
        var p = Math.min(1, (now - startTime) / (holdMs || 2000));
        if (fill) fill.style.width = (p * 100) + '%';
        if (p < 1) {
          timer = requestAnimationFrame(tick);
        } else {
          timer = null;
          if (onComplete) onComplete();
        }
      }
      timer = requestAnimationFrame(tick);
    });

    btnNode.addEventListener('pointerup', cancel);
    btnNode.addEventListener('pointerleave', cancel);
    btnNode.addEventListener('pointercancel', cancel);
  }

  /* ──────────────────────────────────────────────────────────────
     5. 弹窗进出场控制器 (playModal & playModalChildren)
     ────────────────────────────────────────────────────────────── */

  function playModal(modalRoot, modalCard, modalScrim, dir, lastPointer) {
    var isOut = (dir === 'out');
    var m = M.dir('modal', isOut ? 'out' : 'in');
    var dur = m ? m.dur : (isOut ? 200 : 320);
    var ease = M.ease(m ? m.ease : (isOut ? 'soft' : 'tile'));

    if (!dur || !modalCard || !modalCard.animate) {
      if (isOut) {
        modalRoot.classList.remove('open');
      } else {
        modalRoot.classList.add('open');
      }
      return;
    }

    if (modalCard.__anim) try { modalCard.__anim.cancel(); } catch (e) {}
    if (modalScrim && modalScrim.__anim) try { modalScrim.__anim.cancel(); } catch (e) {}

    modalRoot.classList.add('open');

    var from = isOut ? M.pose(null) : M.pose(m && m.from);
    var to = isOut ? M.pose(m && m.to) : M.pose(null);

    // 触控锚点铰链轴心
    if (m && m.origin === 'click') {
      var side = M.hingeSide(modalCard, lastPointer || { x: window.innerWidth / 2 });
      modalCard.style.transformOrigin = (side === 'left' ? '0%' : '100%') + ' 50%';
      var sign = (side === 'left' ? -1 : 1);
      if (isOut) {
        to = M.pose({ o: 0, ry: sign * 88, s: 0.96 });
      } else {
        from = M.pose({ o: 0, ry: sign * 96, s: 0.92 });
        to = M.pose(null);
      }
    } else if (m && m.origin) {
      modalCard.style.transformOrigin = m.origin;
    }

    modalCard.__anim = modalCard.animate([from, to], {
      duration: dur,
      easing: ease,
      fill: isOut ? 'forwards' : 'both'
    });

    if (modalScrim) {
      modalScrim.__anim = modalScrim.animate(
        [{ opacity: isOut ? 1 : 0 }, { opacity: isOut ? 0 : 1 }],
        { duration: Math.round(dur * 0.9), easing: ease, fill: isOut ? 'forwards' : 'both' }
      );
    }

    if (!isOut && m && m.childStagger) {
      var kids = modalCard.querySelectorAll('.modal-head, .modal-body > *, .modal-actions');
      var gap = m.childStagger;
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (!k.animate) continue;
        k.animate(
          [{ opacity: 0, transform: 'translate3d(0,14px,0) scale(.985)' }, { opacity: 1, transform: 'none' }],
          { duration: Math.round(260 / M.getSpeedMultiplier()), delay: i * gap, easing: M.ease('expo'), fill: 'backwards' }
        );
      }
    }

    if (isOut) {
      modalCard.__anim.onfinish = function () {
        modalRoot.classList.remove('open');
      };
    }
  }

  /* ──────────────────────────────────────────────────────────────
     6. 视图整屏错峰进场 (playViewIn)
     ────────────────────────────────────────────────────────────── */

  function playViewIn(viewEl) {
    if (!viewEl || !viewEl.querySelectorAll) return;
    var m = M.get('viewIn');
    if (!m || !m.dur) return;
    var speed = M.getSpeedMultiplier();
    var dur = Math.round(m.dur / speed);
    var ease = M.ease(m.ease);
    var stagger = Math.round((m.stagger != null ? m.stagger : 60) / speed);

    var nodes = viewEl.querySelectorAll('.view-head, .card, .panel, .section-block');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n.animate) continue;
      var y = (i === 0) ? ((m.headY != null) ? m.headY : -24) : ((m.y != null) ? m.y : 12);
      var x = m.x || 0;
      var s = m.s != null ? m.s : 0.97;
      var tf = [];
      if (x || y) tf.push('translate3d(' + x + 'px,' + y + 'px,0)');
      if (s !== 1) tf.push('scale(' + s + ')');

      if (n.__rise) n.__rise.cancel();
      n.__rise = n.animate(
        [{ opacity: 0, transform: tf.length ? tf.join(' ') : 'none' }, { opacity: 1, transform: 'none' }],
        { duration: dur, delay: 50 + i * stagger, easing: ease, fill: 'backwards' }
      );
    }
  }

  /* ──────────────────────────────────────────────────────────────
     7. 切换日期/步进随方向滑入 (playDateShift)
     ────────────────────────────────────────────────────────────── */

  function playDateShift(nodes, dir) {
    if (!nodes || !nodes.length) return;
    var st = M.get('dateSwitch');
    var speed = M.getSpeedMultiplier();
    var dur = st ? Math.round((st.dur || 340) / speed) : 340;
    if (!dur) return;
    var ease = M.ease(st && st.ease);
    var d = dir > 0 ? 1 : (dir < 0 ? -1 : 0);
    var dx = ((st && st.x) || 0) * ((st && st.dir) ? d : 1);
    var dy = (st && st.y) || 0;
    var s0 = (st && st.s != null) ? st.s : 0.99;
    var flip = !!(st && st.flip && d);
    var o0 = (st && st.o != null) ? st.o : 0.2;

    var from = [];
    if (flip) from.push('perspective(760px) rotateY(' + (d > 0 ? -64 : 64) + 'deg)');
    if (dx || dy) from.push('translate3d(' + dx + 'px,' + dy + 'px,0)');
    if (s0 !== 1) from.push('scale(' + s0 + ')');

    var frames = [
      { opacity: o0, transform: from.length ? from.join(' ') : 'none' },
      { opacity: 1, transform: 'none' }
    ];

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n || !n.animate) continue;
      if (n.__dateAnim) try { n.__dateAnim.cancel(); } catch (e) {}
      n.__dateAnim = n.animate(frames, { duration: dur, easing: ease, fill: 'none' });
    }
  }

  /* ──────────────────────────────────────────────────────────────
     8. 全屏主题切换墨滴扩散 (playThemeSwitchSpread)
     ────────────────────────────────────────────────────────────── */

  function playThemeSwitchSpread(targetDark, targetBaseColor, lastPointer, onDone) {
    var w = window.innerWidth, h = window.innerHeight;
    var px = (lastPointer && lastPointer.x != null) ? lastPointer.x : Math.round(w / 2);
    var py = (lastPointer && lastPointer.y != null) ? lastPointer.y : Math.round(h / 2);
    var dx = Math.max(px, w - px), dy = Math.max(py, h - py);
    var maxRadius = Math.ceil(Math.sqrt(dx * dx + dy * dy));

    var ink = document.createElement('div');
    ink.className = 'theme-spread';
    ink.style.left = px + 'px';
    ink.style.top = py + 'px';
    ink.style.width = (maxRadius * 2) + 'px';
    ink.style.height = (maxRadius * 2) + 'px';
    ink.style.background = targetBaseColor || (targetDark ? '#0E1116' : '#FFFFFF');
    ink.style.transform = 'translate3d(-50%,-50%,0) scale(0)';
    ink.style.opacity = '0.35';
    document.body.appendChild(ink);

    var dur = Math.round(420 / M.getSpeedMultiplier());
    var t0 = performance.now();

    function frame(now) {
      var p = Math.min(1, (now - t0) / dur);
      ink.style.transform = 'translate3d(-50%,-50%,0) scale(' + p + ')';
      ink.style.opacity = String(0.35 + 0.65 * p);
      if (p < 1) {
        requestAnimationFrame(frame);
      } else {
        if (onDone) onDone();
        // 墨滴淡出 140ms
        if (ink.animate) {
          ink.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'linear', fill: 'forwards' })
            .onfinish = function () {
              if (ink.parentNode) ink.parentNode.removeChild(ink);
            };
        } else {
          if (ink.parentNode) ink.parentNode.removeChild(ink);
        }
      }
    }
    requestAnimationFrame(frame);
  }

  var FluidMotionComponents = {
    morphContainer: morphContainer,
    freezeInner: freezeInner,
    clearMorph: clearMorph,
    flashButton: flashButton,
    syncSegPill: syncSegPill,
    bindHoldToConfirm: bindHoldToConfirm,
    playModal: playModal,
    playViewIn: playViewIn,
    playDateShift: playDateShift,
    playThemeSwitchSpread: playThemeSwitchSpread
  };

  global.FluidMotionComponents = FluidMotionComponents;
  // 兼容别名
  global.ARMotionComponents = FluidMotionComponents;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FluidMotionComponents;
  }
})(typeof window !== 'undefined' ? window : this);
