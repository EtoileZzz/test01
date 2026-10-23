import { NativeBridgeService } from '../services/nativeBridge';

export interface SwipeOptions {
  threshold?: number;
  onSwipeComplete?: () => void;
  onSwipeCancel?: () => void;
}

export function bindCardSwipe(cardEl: HTMLElement, options: SwipeOptions): () => void {
  const contentEl = cardEl.querySelector('.item-content-wrapper') as HTMLElement;
  const backdropEl = cardEl.querySelector('.swipe-backdrop') as HTMLElement;
  if (!contentEl) return () => {};

  const threshold = options.threshold || 75;
  let startX = 0;
  let startY = 0;
  let currentDx = 0;
  let isTracking = false;
  let isHorizontalIntent = false;
  let hasThresholdVibrated = false;

  function onPointerDown(e: PointerEvent) {
    // 忽略点击按钮、复选框或图片面板的直接交互
    const target = e.target as HTMLElement;
    if (target.closest('.item-checkbox') || target.closest('.subitems-toggle-btn') || target.closest('.photo-thumb-box') || target.closest('.add-photo-btn')) {
      return;
    }

    startX = e.clientX;
    startY = e.clientY;
    currentDx = 0;
    isTracking = true;
    isHorizontalIntent = false;
    hasThresholdVibrated = false;

    contentEl.style.transition = 'none';
  }

  function onPointerMove(e: PointerEvent) {
    if (!isTracking) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // 意图锁定：区分上下滚动还是左右滑动
    if (!isHorizontalIntent) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        isHorizontalIntent = true;
        try { cardEl.setPointerCapture(e.pointerId); } catch (err) {}
      } else if (Math.abs(dy) > 10) {
        // 用户想纵向滚动页面，释放手势
        isTracking = false;
        return;
      }
    }

    if (!isHorizontalIntent) return;

    // 仅支持向右滑动划去核验（带物理弹性阻尼系数 0.65）
    if (dx > 0) {
      currentDx = Math.pow(dx, 0.88);
      contentEl.style.transform = `translate3d(${currentDx}px, 0, 0)`;

      if (backdropEl) {
        const opacity = Math.min(1, currentDx / threshold);
        backdropEl.style.opacity = `${opacity}`;
      }

      // 超过阈值触发单次触感确认
      if (currentDx >= threshold && !hasThresholdVibrated) {
        hasThresholdVibrated = true;
        NativeBridgeService.triggerLightHaptic();
      } else if (currentDx < threshold && hasThresholdVibrated) {
        hasThresholdVibrated = false;
      }
    }
  }

  function onPointerUp() {
    if (!isTracking) return;
    isTracking = false;

    contentEl.style.transition = 'transform 300ms cubic-bezier(.16, 1, .30, 1)';

    if (currentDx >= threshold) {
      // 成功划去
      NativeBridgeService.triggerCompleteHaptic();
      contentEl.style.transform = 'translate3d(120%, 0, 0)';
      setTimeout(() => {
        if (options.onSwipeComplete) {
          options.onSwipeComplete();
        }
        contentEl.style.transition = 'none';
        contentEl.style.transform = 'translate3d(0, 0, 0)';
        if (backdropEl) backdropEl.style.opacity = '0';
      }, 260);
    } else {
      // 弹性回弹复位
      contentEl.style.transform = 'translate3d(0, 0, 0)';
      if (backdropEl) {
        backdropEl.style.transition = 'opacity 200ms ease';
        backdropEl.style.opacity = '0';
      }
      if (options.onSwipeCancel) options.onSwipeCancel();
    }
  }

  cardEl.addEventListener('pointerdown', onPointerDown);
  cardEl.addEventListener('pointermove', onPointerMove);
  cardEl.addEventListener('pointerup', onPointerUp);
  cardEl.addEventListener('pointercancel', onPointerUp);

  return () => {
    cardEl.removeEventListener('pointerdown', onPointerDown);
    cardEl.removeEventListener('pointermove', onPointerMove);
    cardEl.removeEventListener('pointerup', onPointerUp);
    cardEl.removeEventListener('pointercancel', onPointerUp);
  };
}
