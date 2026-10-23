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
    // 忽略直接点击控件（复选框、折叠按钮、图片缩略图、删除按钮等）
    const target = e.target as HTMLElement;
    if (
      target.closest('.item-checkbox') ||
      target.closest('.subitems-toggle-btn') ||
      target.closest('.photo-thumb-box') ||
      target.closest('.add-photo-btn') ||
      target.closest('.item-edit-btn') ||
      target.closest('.subitem-checkbox') ||
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
