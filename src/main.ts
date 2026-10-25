import './styles/app.css';
import { DutyStorage } from './storage/db';
import { NativeBridgeService } from './services/nativeBridge';
import { ModalManager } from './components/modals';
import { ItemModal } from './components/itemModal';
import { bindCardSwipe, bindSubItemSwipe } from './gestures/swipeTracker';
import type { DutyTask, DutyItem, InspectionPhoto } from './models/types';

interface UndoSnapshot {
  itemId: string;
  itemTitle: string;
  wasCompleted: boolean;
  completedAt: string | null;
  wasExpanded: boolean;
  subItems: Array<{ id: string; isCompleted: boolean; completedAt: string | null }>;
}

class OxherdApp {
  private currentTask: DutyTask | null = null;
  private pendingPhotoItemId: string | null = null;
  private undoTimer: any = null;
  private undoSnapshot: UndoSnapshot | null = null;
  private currentFilter: 'all' | 'pending' | 'photo' = 'all';

  constructor() {
    this.initApp();
  }

  private async initApp(): Promise<void> {
    this.initTheme();
    await DutyStorage.init();
    this.initTask();
    this.bindGlobalEvents();
    this.render();
  }

  // ── 主题模式初始化与跟随系统 ────────────────────────────────────
  private initTheme(): void {
    const settings = DutyStorage.getSettings();
    this.applyTheme(settings.theme);
    this.applyThemeColor(settings.themeColor);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const current = DutyStorage.getSettings();
      if (current.theme === 'system') {
        const newTheme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        NativeBridgeService.syncStatusBarTheme('system');
      }
    });
  }

  public applyTheme(theme: 'light' | 'dark' | 'system'): void {
    let resolved = theme;
    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
    NativeBridgeService.syncStatusBarTheme(theme);
  }

  public applyThemeColor(color?: string): void {
    if (!color) {
      document.documentElement.style.removeProperty('--accent');
      document.documentElement.style.removeProperty('--accent-light');
      document.documentElement.style.removeProperty('--border-focus');
      return;
    }
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--border-focus', color);
    const hex = color.replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      document.documentElement.style.setProperty('--accent-light', `rgba(${r}, ${g}, ${b}, 0.16)`);
    }
  }

  // ── 任务初始化（纯净空白初始态，零硬编码预设） ──────────────────
  private initTask(): void {
    let task = DutyStorage.getCurrentTask();
    if (!task) {
      task = DutyStorage.createEmptyTask('值班巡检');
    }
    this.currentTask = task;
  }

  // ── 全局事件绑定 ────────────────────────────────────────────
  private bindGlobalEvents(): void {
    // 1. 新建全新空白值班任务
    const newTaskBtn = document.getElementById('new-task-btn');
    newTaskBtn?.addEventListener('click', () => {
      NativeBridgeService.triggerLightHaptic();
      ModalManager.openCreateTaskModal((newTask) => {
        this.currentTask = newTask;
        this.render();
      });
    });

    // 2. 系统全参数设置（包含协同外链、JSON导入导出、通知唤醒、开机保活）
    const settingsBtn = document.getElementById('system-settings-btn');
    settingsBtn?.addEventListener('click', async () => {
      NativeBridgeService.triggerLightHaptic();
      await ModalManager.openSystemSettingsModal(this.currentTask, () => {
        this.initTheme();
        this.render();
      });
    });

    // 3. 底部主添加条目按钮（调用 ItemModal，支持时段、拍照、自动折叠与多行批量子项）
    const addItemBtn = document.getElementById('open-add-item-modal-btn');
    addItemBtn?.addEventListener('click', () => {
      if (!this.currentTask) return;
      const currentPost = this.currentTask.posts.find(p => p.id === this.currentTask?.currentPostId);
      NativeBridgeService.triggerLightHaptic();

      ItemModal.open({
        postName: currentPost?.name || '当前岗位',
        onSave: (result) => {
          if (!this.currentTask) return;
          const newItemId = `item_${this.currentTask.currentPostId}_${Date.now()}`;
          const newItem: DutyItem = {
            id: newItemId,
            postId: this.currentTask.currentPostId,
            title: result.title,
            itemType: result.itemType,
            startTime: result.startTime,
            endTime: result.endTime,
            requirePhoto: result.requirePhoto,
            autoFold: result.autoFold,
            photos: [],
            isCompleted: false,
            completedAt: null,
            subItems: result.subItems.map(s => ({
              id: s.id,
              itemId: newItemId,
              title: s.title,
              isCompleted: false,
              completedAt: null
            })),
            isExpanded: true
          };

          this.currentTask.items.push(newItem);
          DutyStorage.saveTask(this.currentTask);
          NativeBridgeService.triggerLightHaptic();
          this.render();
        }
      });
    });

    // 4. 长按 1 秒蓄力交班确认（用户特别指定：1 秒）
    this.bindHandoverHold();

    // 5. 撤销按钮交互（修复 touch / pointerdown 支持）
    const undoBtn = document.getElementById('undo-action-btn');
    const onUndoTrigger = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.performUndo();
    };
    undoBtn?.addEventListener('pointerdown', onUndoTrigger);
    undoBtn?.addEventListener('click', onUndoTrigger);

    // 7. 快捷视图筛选胶囊 (全部 / 待巡检 / 需拍照)
    const filterBar = document.getElementById('filter-pills-bar');
    filterBar?.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const filter = pill.getAttribute('data-filter') as 'all' | 'pending' | 'photo';
        if (this.currentFilter === filter) return;
        this.currentFilter = filter;
        filterBar.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        NativeBridgeService.triggerLightHaptic();
        this.render();
      });
    });

    // 8. 键盘 Space 空格快捷操作（支持巡检PDA实体按键/外接键盘：按空格自动完成或切换细项）
    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)) {
        return;
      }
      if (document.querySelector('.modal-sheet-overlay.open')) {
        return;
      }
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (!this.currentTask) return;
        const currentPostItems = this.currentTask.items.filter(i => i.postId === this.currentTask!.currentPostId);
        for (const item of currentPostItems) {
          if (!item.isCompleted) {
            const uncompletedSub = item.subItems.find(s => !s.isCompleted);
            if (uncompletedSub) {
              uncompletedSub.isCompleted = true;
              uncompletedSub.completedAt = new Date().toISOString();
              if (item.subItems.every(s => s.isCompleted)) {
                item.isCompleted = true;
                item.completedAt = new Date().toISOString();
                if (item.autoFold !== false) {
                  item.isExpanded = false;
                }
              }
              DutyStorage.saveTask(this.currentTask);
              NativeBridgeService.triggerLightHaptic();
              this.render();
              return;
            } else {
              this.completeItem(item);
              return;
            }
          }
        }
      }
    });
  }

  // ── 记录高精度撤销快照 ──────────────────────────────────────
  private recordUndoSnapshot(item: DutyItem): void {
    this.undoSnapshot = {
      itemId: item.id,
      itemTitle: item.title,
      wasCompleted: item.isCompleted,
      completedAt: item.completedAt,
      wasExpanded: item.isExpanded !== false,
      subItems: (item.subItems || []).map(s => ({
        id: s.id,
        isCompleted: s.isCompleted,
        completedAt: s.completedAt
      }))
    };
  }

  // ── 执行撤销操作（完美恢复主项及所有子项状态） ────────────────
  private performUndo(): void {
    if (!this.undoSnapshot || !this.currentTask) return;
    const snapshot = this.undoSnapshot;
    const item = this.currentTask.items.find(i => i.id === snapshot.itemId);
    if (item) {
      item.isCompleted = snapshot.wasCompleted;
      item.completedAt = snapshot.completedAt;
      item.isExpanded = snapshot.wasExpanded;

      snapshot.subItems.forEach(savedSub => {
        const sub = item.subItems.find(s => s.id === savedSub.id);
        if (sub) {
          sub.isCompleted = savedSub.isCompleted;
          sub.completedAt = savedSub.completedAt;
        }
      });

      DutyStorage.saveTask(this.currentTask);
      this.undoSnapshot = null;
      this.hideUndoToast();
      NativeBridgeService.triggerLightHaptic();
      this.render();
    }
  }

  // ── 标记条目完成（处理自动折叠与撤销捕获） ──────────────────
  private completeItem(item: DutyItem): void {
    if (!this.currentTask) return;
    this.recordUndoSnapshot(item);

    item.isCompleted = true;
    item.completedAt = new Date().toISOString();
    item.subItems.forEach(sub => {
      sub.isCompleted = true;
      sub.completedAt = item.completedAt;
    });

    // 核心要求：“拍照留痕那个可以自动折叠，默认折叠设置开，完成之后自动折叠设置也保留”
    if (item.autoFold !== false) {
      item.isExpanded = false;
    }

    DutyStorage.saveTask(this.currentTask);
    this.showUndoToast(item.title);
    this.render();
  }

  // ── 取消条目完成 ────────────────────────────────────────────
  private uncheckItem(item: DutyItem): void {
    if (!this.currentTask) return;
    this.recordUndoSnapshot(item);

    item.isCompleted = false;
    item.completedAt = null;
    item.subItems.forEach(sub => {
      sub.isCompleted = false;
      sub.completedAt = null;
    });
    item.isExpanded = true;

    DutyStorage.saveTask(this.currentTask);
    this.render();
  }

  // ── 绑定 1 秒长按蓄力交班（用户要求：设置为 1 秒） ─────────────
  private bindHandoverHold(): void {
    const handoverBtn = document.getElementById('handover-btn');
    const holdFill = document.getElementById('handover-hold-fill');
    if (!handoverBtn || !holdFill) return;

    let startTime = 0;
    let animFrame: any = null;
    const HOLD_DURATION = 1000; // 设定为精确 1 秒 (1000ms)

    const cancelHold = () => {
      if (animFrame) {
        cancelAnimationFrame(animFrame);
        animFrame = null;
      }
      holdFill.style.transition = 'width 140ms cubic-bezier(.22, 1, .36, 1)';
      holdFill.style.width = '0%';
    };

    handoverBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      startTime = performance.now();
      holdFill.style.transition = 'none';
      NativeBridgeService.triggerLightHaptic();

      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / HOLD_DURATION);
        holdFill.style.width = `${progress * 100}%`;

        if (progress < 1) {
          animFrame = requestAnimationFrame(tick);
        } else {
          animFrame = null;
          NativeBridgeService.triggerCompleteHaptic();
          this.triggerHandoverWithPreflightCheck();
          cancelHold();
        }
      };
      animFrame = requestAnimationFrame(tick);
    });

    handoverBtn.addEventListener('pointerup', cancelHold);
    handoverBtn.addEventListener('pointerleave', cancelHold);
    handoverBtn.addEventListener('pointercancel', cancelHold);
  }

  // ── 智能交班合规性拦截预检 ──────────────────────────────────────
  private triggerHandoverWithPreflightCheck(): void {
    if (!this.currentTask) return;

    const allItems = this.currentTask.items;
    const pendingItems = allItems.filter(i => !i.isCompleted);
    const missingPhotoItems = allItems.filter(i => i.requirePhoto && (!i.photos || i.photos.length === 0));

    if (pendingItems.length > 0 || missingPhotoItems.length > 0) {
      ModalManager.openHandoverPreflightModal({
        pendingItems,
        missingPhotoItems,
        onConfirmForceHandover: () => {
          this.executeHandover();
        }
      });
    } else {
      this.executeHandover();
    }
  }

  // ── 执行交班：专门打包现场照片归档并就绪下一班（完整保留条目） ──────
  private async executeHandover(): Promise<void> {
    if (!this.currentTask) return;

    // 协同外链：若预设了填报外链，提示跳转
    const settings = DutyStorage.getSettings();
    if (settings.handoverExternalUrl) {
      const openExternal = confirm(`是否跳转至预设的值班链接填写报告？\n\n${settings.handoverExternalUrl}`);
      if (openExternal) {
        window.open(settings.handoverExternalUrl, '_blank');
      }
    }

    const task = this.currentTask;
    const totalItemsCount = task.items.length;
    const completedItemsCount = task.items.filter(i => i.isCompleted).length;

    // 核心要求：“交班刷新之后条目就没有了，保留”
    // completeAndArchivePhotos 内部自动将照片打包归档，并为下一班克隆保留所有岗位与条目
    const archive = await DutyStorage.completeAndArchivePhotos(task);

    ModalManager.openPhotosArchiveCompletedModal({
      totalPhotos: archive.totalPhotos,
      postsCount: task.posts.length,
      totalItemsCount,
      completedItemsCount,
      shiftName: task.shiftName,
      onResetAndRestart: () => {
        // 核心要求：“交班刷新之后条目就没有了，保留”
        // 重新获取并渲染克隆好的新任务（条目全部完整保留，复位打卡）
        this.initTask();
        this.render();
      }
    });
  }

  // ── 撤销 Toast 提示 ──────────────────────────────────────────
  private showUndoToast(title: string): void {
    const toast = document.getElementById('undo-toast');
    const text = document.getElementById('undo-text');
    if (!toast || !text) return;

    text.textContent = `已完成：${title.substring(0, 10)}...`;
    toast.classList.add('show');

    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoTimer = setTimeout(() => {
      this.hideUndoToast();
    }, 4000);
  }

  private hideUndoToast(): void {
    const toast = document.getElementById('undo-toast');
    toast?.classList.remove('show');
  }

  // ── 界面全量流体渲染 ────────────────────────────────────────
  private render(): void {
    if (!this.currentTask) return;

    const task = this.currentTask;
    const currentPost = task.posts.find(p => p.id === task.currentPostId) || task.posts[0];
    if (!currentPost && task.posts.length > 0) {
      task.currentPostId = task.posts[0].id;
    }

    const taskTitleDisplay = document.getElementById('task-title-display');
    if (taskTitleDisplay) taskTitleDisplay.textContent = task.title.replace(/\s*\(\d{4}-\d{2}-\d{2}\)/g, '');

    const totalTaskItems = task.items.length;
    const totalCompleted = task.items.filter(i => i.isCompleted).length;
    const percentage = totalTaskItems > 0 ? Math.round((totalCompleted / totalTaskItems) * 100) : 0;

    const percentageDisplay = document.getElementById('task-percentage-display');
    if (percentageDisplay) {
      percentageDisplay.textContent = `${totalCompleted}/${totalTaskItems} 项已核验 (${percentage}%)`;
    }

    const progressFill = document.getElementById('task-progress-fill');
    if (progressFill) progressFill.style.width = `${percentage}%`;

    // 渲染顶栏水平滚动岗位胶囊
    this.renderPostsNavScroll(currentPost);

    const container = document.getElementById('items-list');
    if (!container) return;

    const currentPostItems = task.items.filter(i => i.postId === currentPost?.id);

    // 更新快捷视图筛选胶囊计数
    const countAll = currentPostItems.length;
    const countPending = currentPostItems.filter(i => !i.isCompleted).length;
    const countPhoto = currentPostItems.filter(i => i.requirePhoto).length;

    const countAllEl = document.getElementById('filter-count-all');
    const countPendingEl = document.getElementById('filter-count-pending');
    const countPhotoEl = document.getElementById('filter-count-photo');
    if (countAllEl) countAllEl.textContent = String(countAll);
    if (countPendingEl) countPendingEl.textContent = String(countPending);
    if (countPhotoEl) countPhotoEl.textContent = String(countPhoto);

    if (currentPostItems.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:70px 20px; color:var(--text-muted);">
          <div style="font-size:3rem; margin-bottom:12px;">🏮</div>
          <div style="font-weight:700; font-size:1.0625rem; color:var(--text-main);">当前岗位暂无巡检条目</div>
          <div style="font-size:0.8125rem; margin-top:6px; color:var(--text-muted);">
            点击下方「添加巡查条目」开始录入，支持时段巡查、拍照留痕与多行细项
          </div>
        </div>
      `;
      return;
    }

    const itemsToDisplay = currentPostItems.filter(item => {
      if (this.currentFilter === 'pending') return !item.isCompleted;
      if (this.currentFilter === 'photo') return !!item.requirePhoto;
      return true;
    });

    if (itemsToDisplay.length === 0) {
      const filterName = this.currentFilter === 'pending' ? '待巡检未完成项' : '需拍照凭证条目';
      container.innerHTML = `
        <div style="text-align:center; padding:50px 20px; color:var(--text-muted);">
          <div style="font-size:2.5rem; margin-bottom:8px;">✨</div>
          <div style="font-weight:700; font-size:0.9375rem; color:var(--text-main);">当前没有${filterName}</div>
          <div style="font-size:0.75rem; margin-top:4px; color:var(--text-muted);">
            本岗位共 ${countAll} 项，可切换上方「全部」查看完整条目
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = itemsToDisplay
      .map(item => this.renderItemCardHtml(item))
      .join('');

    // 绑定条目卡片交互（1:1 左右双向划除、复选框、编辑与拍照）
    itemsToDisplay.forEach(item => {
      const cardEl = container.querySelector(`[data-item-card-id="${item.id}"]`) as HTMLElement;
      if (!cardEl) return;

      // 1:1 跟手左右双向划去（仅未完成条目支持滑动；已完成条目禁止滑动，长按 450ms 撤销完成）
      if (!item.isCompleted) {
        bindCardSwipe(cardEl, {
          threshold: 65,
          onSwipeComplete: () => {
            this.completeItem(item);
          }
        });
      } else {
        // 已完成条目：长按卡片 450ms 撤销完成
        let longPressTimer: any = null;
        let startX = 0;
        let startY = 0;

        const onTouchStart = (e: TouchEvent | MouseEvent) => {
          const target = e.target as HTMLElement;
          if (
            target.closest('button') ||
            target.closest('.item-checkbox') ||
            target.closest('.photo-thumb-box') ||
            target.closest('.subitem-row')
          ) {
            return;
          }
          const pt = 'touches' in e ? e.touches[0] : (e as MouseEvent);
          startX = pt.clientX;
          startY = pt.clientY;

          longPressTimer = setTimeout(() => {
            longPressTimer = null;
            NativeBridgeService.triggerCompleteHaptic();
            this.uncheckItem(item);
          }, 450);
        };

        const onTouchMove = (e: TouchEvent | MouseEvent) => {
          if (!longPressTimer) return;
          const pt = 'touches' in e ? e.touches[0] : (e as MouseEvent);
          if (Math.abs(pt.clientX - startX) > 10 || Math.abs(pt.clientY - startY) > 10) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        };

        const onTouchEnd = () => {
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        };

        cardEl.addEventListener('touchstart', onTouchStart, { passive: true });
        cardEl.addEventListener('touchmove', onTouchMove, { passive: true });
        cardEl.addEventListener('touchend', onTouchEnd);
        cardEl.addEventListener('touchcancel', onTouchEnd);
        cardEl.addEventListener('mousedown', onTouchStart);
        cardEl.addEventListener('mousemove', onTouchMove);
        cardEl.addEventListener('mouseup', onTouchEnd);
        cardEl.addEventListener('mouseleave', onTouchEnd);
      }

      // 勾选主项复选框
      const checkbox = cardEl.querySelector('.item-checkbox') as HTMLElement;
      checkbox?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.isCompleted) {
          this.uncheckItem(item);
        } else {
          this.completeItem(item);
        }
      });

      // 编辑条目（点击编辑按钮或标题进入 ItemModal）
      const editBtn = cardEl.querySelector('.item-edit-btn') as HTMLElement;
      editBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        NativeBridgeService.triggerLightHaptic();
        ItemModal.open({
          item,
          postName: currentPost?.name || '当前岗位',
          onSave: (result) => {
            item.title = result.title;
            item.itemType = result.itemType;
            item.startTime = result.startTime;
            item.endTime = result.endTime;
            item.requirePhoto = result.requirePhoto;
            item.autoFold = result.autoFold;

            const existingSubMap = new Map(item.subItems.map(s => [s.id, s]));
            item.subItems = result.subItems.map(s => {
              const prev = existingSubMap.get(s.id);
              return {
                id: s.id,
                itemId: item.id,
                title: s.title,
                isCompleted: prev ? prev.isCompleted : false,
                completedAt: prev ? prev.completedAt : null
              };
            });

            if (item.subItems.length > 0 && item.subItems.every(s => s.isCompleted)) {
              item.isCompleted = true;
            }

            DutyStorage.saveTask(task);
            this.render();
          },
          onDelete: () => {
            task.items = task.items.filter(i => i.id !== item.id);
            DutyStorage.saveTask(task);
            NativeBridgeService.triggerLightHaptic();
            this.render();
          }
        });
      });

      // 展开/收起细分子项与拍照留痕（直接在当前卡片操作 DOM 类名，享受 CSS 物理动画，绝不整体销毁重建 DOM）
      const toggleSubBtn = cardEl.querySelector('.subitems-toggle-btn') as HTMLElement;
      const foldBtn = cardEl.querySelector('.item-fold-btn') as HTMLElement;
      const expandableSection = cardEl.querySelector('.item-expandable-section') as HTMLElement;

      const toggleFold = (e: Event) => {
        e.stopPropagation();
        const nextExpanded = item.isExpanded === false ? true : false;
        item.isExpanded = nextExpanded;
        DutyStorage.saveTask(task);
        NativeBridgeService.triggerLightHaptic();

        // 动效平滑切换：直接操作 DOM 切换样式类，避免重绘整个列表破坏 CSS 物理折叠动画
        cardEl.classList.toggle('is-folded', !nextExpanded);
        if (expandableSection) {
          expandableSection.classList.toggle('collapsed', !nextExpanded);
        }
        const foldSvg = foldBtn?.querySelector('svg');
        if (foldSvg) {
          foldSvg.style.transform = nextExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
        }
        if (foldBtn) {
          foldBtn.title = nextExpanded ? '收起拍照与细项' : '展开拍照留痕与细项';
        }
        if (toggleSubBtn) {
          const hasPhotos = item.photos && item.photos.length > 0;
          const subCount = item.subItems ? item.subItems.length : 0;
          const subDoneCount = item.subItems ? item.subItems.filter(s => s.isCompleted).length : 0;
          toggleSubBtn.innerHTML = `<span>${nextExpanded ? '▾ 收起细项与拍照' : '▸ 展开细项与拍照'} ${hasPhotos ? `(📷 ${item.photos.length}张照片)` : (item.requirePhoto ? '(需拍照)' : '')} ${subCount > 0 ? `(${subDoneCount}/${subCount}细项)` : ''}</span>`;
        }
      };

      toggleSubBtn?.addEventListener('click', toggleFold);
      foldBtn?.addEventListener('click', toggleFold);

      // 细分子项交互绑定（支持设置中配置：点击打勾划去 vs 左右手势滑动划去）
      const isSwipeSub = DutyStorage.getSettings().subItemCompleteMode === 'swipe';

      cardEl.querySelectorAll('.subitem-row-wrapper').forEach(subWrapper => {
        const subId = subWrapper.getAttribute('data-sub-id');
        const sub = item.subItems.find(s => s.id === subId);
        if (!sub) return;

        const toggleSub = () => {
          this.recordUndoSnapshot(item);
          sub.isCompleted = !sub.isCompleted;
          sub.completedAt = sub.isCompleted ? new Date().toISOString() : null;

          // 划完所有细项后，主条目自动设置为完成
          const allSubDone = item.subItems.every(s => s.isCompleted);
          if (allSubDone && !item.isCompleted) {
            item.isCompleted = true;
            item.completedAt = new Date().toISOString();
            if (item.autoFold !== false) {
              item.isExpanded = false;
            }
            this.showUndoToast(item.title);
          } else if (!sub.isCompleted && item.isCompleted) {
            item.isCompleted = false;
            item.completedAt = null;
            item.isExpanded = true;
          }

          DutyStorage.saveTask(task);
          NativeBridgeService.triggerLightHaptic();
          this.render();
        };

        // 点击复选框始终直接完成/撤销
        const checkbox = subWrapper.querySelector('.subitem-checkbox');
        checkbox?.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleSub();
        });

        if (isSwipeSub && !sub.isCompleted) {
          // 左右手势滑动划去模式
          bindSubItemSwipe(subWrapper as HTMLElement, {
            threshold: 40,
            onSwipeComplete: () => {
              toggleSub();
            }
          });
        } else {
          // 点击整行打勾划除模式
          subWrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSub();
          });
        }
      });

      // 拍照按钮：秒开原生相机取景，无损存入 Pictures/oxherd 手机专属相册
      const addPhotoBtn = cardEl.querySelector('.add-photo-btn') as HTMLElement;
      addPhotoBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        NativeBridgeService.triggerLightHaptic();
        try {
          const post = this.currentTask?.posts.find(p => p.id === item.postId);
          const postName = post ? post.name : '岗位';
          const result = await NativeBridgeService.capturePhoto(postName, item.title);
          if (result && result.thumbnailDataUrl) {
            const photo: InspectionPhoto = {
              id: 'ph_' + Date.now(),
              itemId: item.id,
              dataUrl: result.thumbnailDataUrl,
              fileName: result.fileName,
              timestamp: result.timestamp,
              fullUri: result.fullUri
            };
            item.photos.push(photo);
            DutyStorage.saveTask(this.currentTask!);
            NativeBridgeService.triggerCompleteHaptic();
            this.render();
          }
        } catch (err: any) {
          if (err && err !== '拍照已取消' && !String(err).includes('取消')) {
            alert('拍照提示: ' + (err.message || err));
          }
        }
      });

      // 照片缩略图交互：点击图片全屏高清放大查看，点击小角标快速删除
      cardEl.querySelectorAll('.photo-thumb-box').forEach(box => {
        const phId = box.querySelector('.photo-del-badge')?.getAttribute('data-photo-id');
        const ph = item.photos.find(p => p.id === phId);
        if (!ph) return;

        // 点击缩略图放大查看
        box.querySelector('img')?.addEventListener('click', (e) => {
          e.stopPropagation();
          NativeBridgeService.triggerLightHaptic();
          ModalManager.openPhotoLightboxModal(ph, () => {
            item.photos = item.photos.filter(p => p.id !== phId);
            DutyStorage.saveTask(task);
            this.render();
          });
        });

        // 点击右上角 ✕ 快速删除凭证
        box.querySelector('.photo-del-badge')?.addEventListener('click', (e) => {
          e.stopPropagation();
          item.photos = item.photos.filter(p => p.id !== phId);
          DutyStorage.saveTask(task);
          NativeBridgeService.triggerLightHaptic();
          this.render();
        });
      });

      // 复制凭证信息
      cardEl.querySelectorAll('.copy-photo-data-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const photoSummary = item.photos.map(p => `【${item.title}】凭证：${p.fileName} (拍摄于 ${p.timestamp})`).join('\n');
          navigator.clipboard.writeText(photoSummary).then(() => {
            alert('已复制照片凭证信息！\n超清原图已存入手机相册「oxherd」专辑');
            NativeBridgeService.triggerLightHaptic();
          });
        });
      });
    });
  }

  // ── 渲染顶栏水平滚动岗位胶囊 ────────────────────────────────
  private renderPostsNavScroll(currentPost?: any): void {
    if (!this.currentTask) return;
    const task = this.currentTask;

    const navScroll = document.getElementById('posts-nav-scroll');
    if (!navScroll) return;

    navScroll.innerHTML = `
      ${task.posts
        .map(p => {
          const isActive = p.id === currentPost?.id;
          const postItems = task.items.filter(i => i.postId === p.id);
          const doneCount = postItems.filter(i => i.isCompleted).length;
          const pendingCount = postItems.length - doneCount;
          const isAllDone = postItems.length > 0 && pendingCount === 0;
          return `
            <div class="post-nav-pill ${isActive ? 'active' : ''}" data-nav-post-id="${p.id}">
              <span>${p.name}</span>
              <span class="post-pill-badge ${isAllDone ? 'all-done' : (pendingCount > 0 ? 'has-pending' : '')}">${isAllDone ? '✓' : pendingCount}</span>
            </div>
          `;
        })
        .join('')}
      <div class="post-nav-manage-btn" id="open-post-manage-pill-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
        <span>岗位管理</span>
      </div>
    `;

    navScroll.querySelectorAll('.post-nav-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const pid = pill.getAttribute('data-nav-post-id');
        if (pid && this.currentTask) {
          this.currentTask.currentPostId = pid;
          DutyStorage.saveTask(this.currentTask);
          NativeBridgeService.triggerLightHaptic();
          this.render();
        }
      });
    });

    const manageBtn = navScroll.querySelector('#open-post-manage-pill-btn');
    manageBtn?.addEventListener('click', () => {
      if (!this.currentTask) return;
      NativeBridgeService.triggerLightHaptic();
      ModalManager.openPostSettingsModal(
        this.currentTask,
        (selectedPostId) => {
          if (this.currentTask) {
            this.currentTask.currentPostId = selectedPostId;
            DutyStorage.saveTask(this.currentTask);
            this.render();
          }
        },
        () => {
          this.render();
        }
      );
    });
  }

  // ── 渲染巡检条目卡片 HTML ────────────────────────────────────
  private renderItemCardHtml(item: DutyItem): string {
    const settings = DutyStorage.getSettings();
    const isDone = item.isCompleted;

    // 全局设置：未完成条目自动折叠以简化排布（必须拍照的项目严格排除在外，始终展开突出拍照区）
    let isExpanded: boolean;
    if (item.requirePhoto) {
      isExpanded = true;
    } else if (!isDone && settings.autoFoldUncompleted) {
      isExpanded = item.isExpanded === true;
    } else if (isDone && item.autoFold !== false) {
      isExpanded = item.isExpanded === true;
    } else {
      isExpanded = item.isExpanded !== false;
    }

    const isAutoFolded = (isDone && item.autoFold !== false && !isExpanded) ||
                         (!isDone && settings.autoFoldUncompleted && !item.requirePhoto && !isExpanded);
    const timeFormatted = item.completedAt ? new Date(item.completedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '';
    const hasPhotos = item.photos && item.photos.length > 0;
    const subCount = item.subItems.length;
    const subDoneCount = item.subItems.filter(s => s.isCompleted).length;
    const isScheduled = item.itemType === 'SCHEDULED';
    const canFold = subCount > 0 || item.requirePhoto || hasPhotos;
    const isSwipeSub = settings.subItemCompleteMode === 'swipe';

    const photosThumbHtml = hasPhotos
      ? item.photos
          .map(
            ph => `
            <div class="photo-thumb-box" title="${ph.fileName}">
              <img src="${ph.dataUrl}" alt="巡检凭证" />
              <div class="photo-del-badge" data-photo-id="${ph.id}">✕</div>
            </div>
          `
          )
          .join('')
      : '';

    const subItemsHtml =
      subCount > 0
        ? `
        <div class="subitems-list">
          ${item.subItems
            .map(
              sub => `
              <div class="subitem-row-wrapper ${sub.isCompleted ? 'is-completed' : ''}" data-sub-id="${sub.id}">
                ${
                  isSwipeSub && !sub.isCompleted
                    ? `
                  <div class="subitem-swipe-backdrop">
                    <span>✓ 完成</span>
                    <span>✓ 完成</span>
                  </div>
                `
                    : ''
                }
                <div class="subitem-row ${sub.isCompleted ? 'is-completed' : ''}" data-sub-id="${sub.id}">
                  <div class="subitem-checkbox ${sub.isCompleted ? 'checked' : ''}">
                    ${sub.isCompleted ? '✓' : ''}
                  </div>
                  <span style="${sub.isCompleted ? 'text-decoration:line-through; color:var(--text-sub);' : ''}">
                    ${sub.title}
                  </span>
                  ${sub.completedAt ? `<span style="font-size:0.6875rem; color:var(--text-sub); margin-left:auto;">${new Date(sub.completedAt).toLocaleTimeString('zh-CN', { hour12: false })}</span>` : ''}
                  ${isSwipeSub && !sub.isCompleted ? `<span class="subitem-swipe-hint-tag">‹ 滑动划除 ›</span>` : ''}
                </div>
              </div>
            `
            )
            .join('')}
        </div>
      `
        : '';

    const photosPanelHtml = `
      <div class="item-photos-panel">
        ${photosThumbHtml}
        <button class="add-photo-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="4"></circle>
          </svg>
          <span>${hasPhotos ? '继续拍照' : '现场拍照留痕'}</span>
        </button>

        ${
          hasPhotos
            ? `
          <button class="icon-btn copy-photo-data-btn" title="复制照片凭证信息" style="width:auto; height:32px; padding:0 8px; font-size:0.6875rem;">
            📋 复制凭证
          </button>
        `
            : ''
        }
      </div>
    `;

    return `
      <div class="duty-item-card ${isDone ? 'completed-card' : ''} ${!isExpanded ? 'is-folded' : ''} ${item.requirePhoto ? 'photo-required-card' : ''}" data-item-card-id="${item.id}">
        <!-- 左右双向滑动显露层 (仅未完成条目渲染) -->
        ${
          !isDone
            ? `
        <div class="swipe-backdrop">
          <div class="swipe-hint-left">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>已核验完成</span>
          </div>
          <div class="swipe-hint-right">
            <span>已核验完成</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>
        `
            : ''
        }

        <div class="item-content-wrapper">
          <div class="item-main-row">
            <div class="item-checkbox ${isDone ? 'checked' : ''}">
              ${isDone ? '✓' : ''}
            </div>
            
            <div class="item-info-col">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; width:100%; min-width:0;">
                <div class="item-title-text ${isDone ? 'striked' : ''}" style="flex:1; min-width:0; word-break:break-word;">
                  ${item.title}
                </div>
                <div style="display:flex; align-items:center; gap:2px; flex-shrink:0;">
                  ${
                    canFold
                      ? `
                    <button type="button" class="icon-btn item-fold-btn" style="width:28px; height:28px; border:none; background:transparent; color:var(--text-muted); flex-shrink:0;" title="${isExpanded ? '收起拍照与细项' : '展开拍照留痕与细项'}">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transform:${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'}; transition:transform 200ms ease;">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>
                  `
                      : ''
                  }
                  <button type="button" class="icon-btn item-edit-btn" style="width:28px; height:28px; border:none; background:transparent; color:var(--text-muted); flex-shrink:0;" title="编辑条目">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                </div>
              </div>

              <!-- 状态元数据 -->
              <div class="item-meta-row">
                ${
                  isScheduled
                    ? `
                  <div class="brand-badge" style="background:rgba(56, 189, 248, 0.15); color:var(--accent);">
                    ⏰ ${item.startTime || '09:00'} - ${item.endTime || '11:30'} 时段巡查
                  </div>
                `
                    : ''
                }

                ${
                  isDone
                    ? `
                  <div class="item-timestamp-badge" title="长按卡片可撤销完成">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>${timeFormatted} 已核验 · 长按可撤销</span>
                  </div>
                `
                    : '<span style="color:var(--text-muted); font-size:0.75rem;">待巡检（左右轻划即划去）</span>'
                }

                ${
                  item.requirePhoto
                    ? `
                  <div class="photo-req-tag ${hasPhotos ? 'ready' : ''}">
                    📷 ${hasPhotos ? `已附 ${item.photos.length} 张凭证` : '需拍照凭证'}
                  </div>
                `
                    : ''
                }

                ${
                  isAutoFolded
                    ? `
                  <span style="font-size:0.6875rem; color:var(--text-sub); border:1px solid var(--border-color); padding:1px 5px; border-radius:4px;">${isDone ? '已自动折叠' : '简化已折叠'}</span>
                `
                    : ''
                }
              </div>

              ${
                canFold
                  ? `
                <button class="subitems-toggle-btn">
                  <span>${isExpanded ? '▾ 收起细项与拍照' : '▸ 展开细项与拍照'} ${hasPhotos ? `(📷 ${item.photos.length}张照片)` : (item.requirePhoto ? '(需拍照)' : '')} ${subCount > 0 ? `(${subDoneCount}/${subCount}细项)` : ''} ${isAutoFolded ? (isDone ? '· 已自动折叠' : '· 简化已折叠') : ''}</span>
                </button>
                <div class="item-expandable-section ${!isExpanded ? 'collapsed' : ''}">
                  <div class="expandable-inner">
                    ${subItemsHtml}
                    ${photosPanelHtml}
                  </div>
                </div>
              `
                  : `
                <div class="item-expandable-section">
                  <div class="expandable-inner">
                    ${photosPanelHtml}
                  </div>
                </div>
              `
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new OxherdApp();
});
