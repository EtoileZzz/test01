import { NativeBridgeService } from '../services/nativeBridge';

export interface SwipeOptions {
  threshold?: number;
  onSwipeComplete?: () => void;
  onSwipeCancel?: () => void;
}

/**
 * 极速 1:1 跟手左右双向滑动划除控制器：
 * 1. 极致跟手：去除任何阻尼幂次滞后，手指移动多少像素，卡片就瞬时移动多少像素 (1:1 响应)
 * 2. 左右双向均可划去：左划或右划达到阈值均可完成核验划除
 * 3. 动态展示左右两侧对应的完成指示器
 * 4. 完美兼顾垂直滚动意图与水平划除意图
 */
export function bindCardSwipe(cardEl: HTMLElement, options: SwipeOptions): () => void {
  const contentEl = cardEl.querySelector('.item-content-wrapper') as HTMLElement;
  const backdropEl = cardEl.querySelector('.swipe-backdrop') as HTMLElement;
  if (!contentEl) return () => {};

  const threshold = options.threshold || 68;
  let startX = 0;
  let startY = 0;
  let currentDx = 0;
  let isTracking = false;
  let isHorizontalIntent = false;
  let hasThresholdVibrated = false;

  const leftHint = backdropEl?.querySelector('.swipe-hint-left') as HTMLElement;
  const rightHint = backdropEl?.querySelector('.swipe-hint-right') as HTMLElement;

  function onPointerDown(e: PointerEvent) {
    // 忽略直接点击控件（复选框、折叠按钮、图片缩略图、删除按钮、细分子项等）
    const target = e.target as HTMLElement;
    if (
      target.closest('.item-checkbox') ||
      target.closest('.subitems-toggle-btn') ||
      target.closest('.photo-thumb-box') ||
      target.closest('.add-photo-btn') ||
      target.closest('.item-edit-btn') ||
      target.closest('.subitem-checkbox') ||
      target.closest('.subitem-row') ||
      target.closest('.subitem-row-wrapper') ||
      target.closest('.subitems-list') ||
      target.closest('button') ||
      target.closest('input')
    ) {
      return;
    }

    startX = e.clientX;
    startY = e.clientY;
    currentDx = 0;
    isTracking = true;
    isHorizontalIntent = false;
    hasThresholdVibrated = false;

    // 瞬时移除 transition，确保 1:1 零延迟直接跟随手指
    contentEl.style.transition = 'none';
  }

  function onPointerMove(e: PointerEvent) {
    if (!isTracking) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // 意图锁定：优先区分是上下滚动页面还是左右划去条目
    if (!isHorizontalIntent) {
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        isHorizontalIntent = true;
        try {
          cardEl.setPointerCapture(e.pointerId);
        } catch (err) {}
      } else if (Math.abs(dy) > 7) {
        // 用户意图为纵向滚动，释放滑动追踪
        isTracking = false;
        return;
      }
    }

    if (!isHorizontalIntent) return;

    // 阻止浏览器默认水平手势
    e.preventDefault();

    // 1:1 极致跟手无延迟直接渲染
    currentDx = dx;
    contentEl.style.transform = `translate3d(${currentDx}px, 0, 0)`;

    const absDx = Math.abs(currentDx);

    if (backdropEl) {
      const opacity = Math.min(1, absDx / (threshold * 0.85));
      backdropEl.style.opacity = `${opacity}`;

      // 根据滑动方向分别点亮左侧或右侧的核验提示
      if (leftHint && rightHint) {
        if (currentDx > 0) {
          leftHint.style.opacity = '1';
          rightHint.style.opacity = '0';
          leftHint.style.transform = `scale(${Math.min(1.15, 0.85 + (absDx / threshold) * 0.3)})`;
        } else {
          leftHint.style.opacity = '0';
          rightHint.style.opacity = '1';
          rightHint.style.transform = `scale(${Math.min(1.15, 0.85 + (absDx / threshold) * 0.3)})`;
        }
      }
    }

    // 越过划去阈值时触发单次轻微触感提示
    if (absDx >= threshold && !hasThresholdVibrated) {
      hasThresholdVibrated = true;
      NativeBridgeService.triggerLightHaptic();
    } else if (absDx < threshold && hasThresholdVibrated) {
      hasThresholdVibrated = false;
    }
  }

  function finishSwipe(e?: PointerEvent) {
    if (!isTracking) return;
    isTracking = false;

    if (e && cardEl.hasPointerCapture(e.pointerId)) {
      try {
        cardEl.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }

    const absDx = Math.abs(currentDx);

    if (absDx >= threshold) {
      // 达到划除阈值：左右双向飞出并完成核验
      NativeBridgeService.triggerCompleteHaptic();
      contentEl.style.transition = 'transform 200ms cubic-bezier(.16, 1, .3, 1)';
      const flyOutX = currentDx > 0 ? '120%' : '-120%';
      contentEl.style.transform = `translate3d(${flyOutX}, 0, 0)`;

      setTimeout(() => {
        if (options.onSwipeComplete) {
          options.onSwipeComplete();
        }
        contentEl.style.transition = 'none';
        contentEl.style.transform = 'translate3d(0, 0, 0)';
        if (backdropEl) backdropEl.style.opacity = '0';
      }, 200);
    } else {
      // 未达到阈值：丝滑弹簧复位
      contentEl.style.transition = 'transform 240ms cubic-bezier(.18, .9, .3, 1)';
      contentEl.style.transform = 'translate3d(0, 0, 0)';
      if (backdropEl) {
        backdropEl.style.opacity = '0';
      }
      if (options.onSwipeCancel) {
        options.onSwipeCancel();
      }
    }
  }

  cardEl.addEventListener('pointerdown', onPointerDown);
  cardEl.addEventListener('pointermove', onPointerMove);
  cardEl.addEventListener('pointerup', finishSwipe);
  cardEl.addEventListener('pointercancel', finishSwipe);

  return () => {
    cardEl.removeEventListener('pointerdown', onPointerDown);
    cardEl.removeEventListener('pointermove', onPointerMove);
    cardEl.removeEventListener('pointerup', finishSwipe);
    cardEl.removeEventListener('pointercancel', finishSwipe);
  };
}

export interface SubItemSwipeOptions {
  threshold?: number;
  onSwipeComplete?: () => void;
}

/**
 * 细分子条目 1:1 跟手左右双向划除手势追踪器
 */
export function bindSubItemSwipe(rowWrapperEl: HTMLElement, options: SubItemSwipeOptions): () => void {
  const contentEl = (rowWrapperEl.querySelector('.subitem-row') || rowWrapperEl) as HTMLElement;
  const backdropEl = rowWrapperEl.querySelector('.subitem-swipe-backdrop') as HTMLElement;
  const threshold = options.threshold || 42;

  let startX = 0;
  let startY = 0;
  let currentDx = 0;
  let isTracking = false;
  let isHorizontal = false;
  let hasVibrated = false;

  function onPointerDown(e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('.subitem-checkbox')) {
      return;
    }

    startX = e.clientX;
    startY = e.clientY;
    currentDx = 0;
    isTracking = true;
    isHorizontal = false;
    hasVibrated = false;
    contentEl.style.transition = 'none';
  }

  function onPointerMove(e: PointerEvent) {
    if (!isTracking) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!isHorizontal) {
      if (Math.abs(dx) > 5 && Math.abs(dx) > Math.abs(dy)) {
        isHorizontal = true;
        try {
          rowWrapperEl.setPointerCapture(e.pointerId);
        } catch (_) {}
      } else if (Math.abs(dy) > 6) {
        isTracking = false;
        return;
      }
    }

    if (!isHorizontal) return;
    e.preventDefault();
    e.stopPropagation();

    currentDx = dx;
    contentEl.style.transform = `translate3d(${currentDx}px, 0, 0)`;

    if (backdropEl) {
      const opacity = Math.min(1, Math.abs(currentDx) / threshold);
      backdropEl.style.opacity = `${opacity}`;
    }

    if (Math.abs(currentDx) >= threshold && !hasVibrated) {
      hasVibrated = true;
      NativeBridgeService.triggerLightHaptic();
    } else if (Math.abs(currentDx) < threshold && hasVibrated) {
      hasVibrated = false;
    }
  }

  function onPointerUp(e?: PointerEvent) {
    if (!isTracking) return;
    isTracking = false;

    if (e && rowWrapperEl.hasPointerCapture(e.pointerId)) {
      try {
        rowWrapperEl.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }

    const absDx = Math.abs(currentDx);
    if (absDx >= threshold) {
      NativeBridgeService.triggerLightHaptic();
      contentEl.style.transition = 'transform 180ms cubic-bezier(.16, 1, .3, 1)';
      const flyX = currentDx > 0 ? '110%' : '-110%';
      contentEl.style.transform = `translate3d(${flyX}, 0, 0)`;

      setTimeout(() => {
        if (options.onSwipeComplete) options.onSwipeComplete();
        contentEl.style.transition = 'none';
        contentEl.style.transform = 'translate3d(0, 0, 0)';
        if (backdropEl) backdropEl.style.opacity = '0';
      }, 180);
    } else {
      contentEl.style.transition = 'transform 200ms cubic-bezier(.18, .9, .3, 1)';
      contentEl.style.transform = 'translate3d(0, 0, 0)';
      if (backdropEl) backdropEl.style.opacity = '0';
    }
  }

  rowWrapperEl.addEventListener('pointerdown', onPointerDown);
  rowWrapperEl.addEventListener('pointermove', onPointerMove);
  rowWrapperEl.addEventListener('pointerup', onPointerUp);
  rowWrapperEl.addEventListener('pointercancel', onPointerUp);

  return () => {
    rowWrapperEl.removeEventListener('pointerdown', onPointerDown);
    rowWrapperEl.removeEventListener('pointermove', onPointerMove);
    rowWrapperEl.removeEventListener('pointerup', onPointerUp);
    rowWrapperEl.removeEventListener('pointercancel', onPointerUp);
  };
}
