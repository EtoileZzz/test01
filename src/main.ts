import './styles/app.css';
import { FluidMotion, FluidMotionComponents } from './engine/fluidMotion';
import { DutyStorage } from './storage/db';
import { NativeBridgeService } from './services/nativeBridge';
import { ModalManager } from './components/modals';
import { bindCardSwipe } from './gestures/swipeTracker';
import type { DutyTask, DutyItem, InspectionPhoto } from './models/types';

class OxherdApp {
  private currentTask: DutyTask | null = null;
  private pendingPhotoItemId: string | null = null;
  private undoTimer: any = null;
  private lastSwipedItemInfo: { item: DutyItem; wasCompleted: boolean; oldTimestamp: string | null } | null = null;

  constructor() {
    this.initTheme();
    this.initTask();
    this.bindGlobalEvents();
    this.render();
  }

  // ── 主题模式初始化与跟随系统 ────────────────────────────────────
  private initTheme(): void {
    const settings = DutyStorage.getSettings();
    this.applyTheme(settings.theme);

    // 监听系统深浅色广播
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const current = DutyStorage.getSettings();
      if (current.theme === 'system') {
        const newTheme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
      }
    });
  }

  public applyTheme(theme: 'light' | 'dark' | 'system'): void {
    let resolved = theme;
    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
  }

  // ── 任务初始化 ──────────────────────────────────────────────
  private initTask(): void {
    let task = DutyStorage.getCurrentTask();
    if (!task) {
      // 首次加载或已归档后，自动从示范模板“图书馆常规值班巡视”新建任务
      const templates = DutyStorage.getTemplates();
      const defaultTpl = templates[0] || DutyStorage.createTaskFromTemplate('tpl_library');
      task = DutyStorage.createTaskFromTemplate(defaultTpl.id);
    }
    this.currentTask = task;
  }

  // ── 全局事件绑定 ────────────────────────────────────────────
  private bindGlobalEvents(): void {
    // 1. 重点需求：岗位在设置中切换
    const postSwitchBar = document.getElementById('post-switch-bar');
    postSwitchBar?.addEventListener('click', () => {
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

    // 2. 新建/切换任务
    const newTaskBtn = document.getElementById('new-task-btn');
    newTaskBtn?.addEventListener('click', () => {
      NativeBridgeService.triggerLightHaptic();
      ModalManager.openCreateTaskModal((newTask) => {
        this.currentTask = newTask;
        this.render();
      });
    });

    // 3. 系统全参数设置（通知唤醒 + 开机自启 + 保活 + 主题）
    const settingsBtn = document.getElementById('system-settings-btn');
    settingsBtn?.addEventListener('click', async () => {
      NativeBridgeService.triggerLightHaptic();
      await ModalManager.openSystemSettingsModal(() => {
        this.initTheme();
        this.render();
      });
    });

    // 4. 临时添加巡检项
    const addTempItemBtn = document.getElementById('add-temp-item-btn');
    addTempItemBtn?.addEventListener('click', () => {
      if (!this.currentTask) return;
      const title = prompt('请输入临时巡检条目名称：');
      if (title && title.trim()) {
        const newItem: DutyItem = {
          id: `item_${this.currentTask.currentPostId}_${Date.now()}`,
          postId: this.currentTask.currentPostId,
          title: title.trim(),
          requirePhoto: false,
          photos: [],
          isCompleted: false,
          completedAt: null,
          subItems: [],
          isExpanded: false
        };
        this.currentTask.items.push(newItem);
        DutyStorage.saveTask(this.currentTask);
        NativeBridgeService.triggerLightHaptic();
        this.render();
      }
    });

    // 5. 危险操作长按蓄力交班确认 (1.5秒)
    this.bindHandoverHold();

    // 6. 拍照选择器文件捕获
    const fileInput = document.getElementById('camera-file-input') as HTMLInputElement;
    fileInput?.addEventListener('change', (e) => {
      const file = fileInput.files?.[0];
      if (!file || !this.pendingPhotoItemId || !this.currentTask) return;

      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const dataUrl = uploadEvent.target?.result as string;
        if (!dataUrl) return;

        const targetItem = this.currentTask?.items.find(i => i.id === this.pendingPhotoItemId);
        if (targetItem) {
          const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
          const post = this.currentTask?.posts.find(p => p.id === targetItem.postId);
          const safePost = (post?.name || '岗位').split(' ')[0];
          const fileName = `${safePost}_${targetItem.title.substring(0, 10)}_${Date.now()}.jpg`;

          const photo: InspectionPhoto = {
            id: 'ph_' + Date.now(),
            itemId: targetItem.id,
            dataUrl,
            fileName,
            timestamp: nowStr
          };

          targetItem.photos.push(photo);
          DutyStorage.saveTask(this.currentTask!);
          NativeBridgeService.triggerLightHaptic();
          this.render();
        }
        fileInput.value = '';
        this.pendingPhotoItemId = null;
      };
      reader.readAsDataURL(file);
    });

    // 7. 撤销按钮
    const undoBtn = document.getElementById('undo-action-btn');
    undoBtn?.addEventListener('click', () => {
      if (this.lastSwipedItemInfo && this.currentTask) {
        const { item, wasCompleted, oldTimestamp } = this.lastSwipedItemInfo;
        item.isCompleted = wasCompleted;
        item.completedAt = oldTimestamp;
        DutyStorage.saveTask(this.currentTask);
        this.hideUndoToast();
        NativeBridgeService.triggerLightHaptic();
        this.render();
      }
    });
  }

  // ── 绑定 1.5 秒长按蓄力交班 ─────────────────────────────────
  private bindHandoverHold(): void {
    const handoverBtn = document.getElementById('handover-btn');
    const holdFill = document.getElementById('handover-hold-fill');
    if (!handoverBtn || !holdFill) return;

    let startTime = 0;
    let animFrame: any = null;
    const HOLD_DURATION = 1500; // 1.5 秒蓄力

    const cancelHold = () => {
      if (animFrame) {
        cancelAnimationFrame(animFrame);
        animFrame = null;
      }
      holdFill.style.transition = 'width 160ms cubic-bezier(.22, 1, .36, 1)';
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
          this.executeHandover();
          cancelHold();
        }
      };
      animFrame = requestAnimationFrame(tick);
    });

    handoverBtn.addEventListener('pointerup', cancelHold);
    handoverBtn.addEventListener('pointerleave', cancelHold);
    handoverBtn.addEventListener('pointercancel', cancelHold);
  }

  // ── 执行交班并自动归档 ──────────────────────────────────────
  private async executeHandover(): Promise<void> {
    if (!this.currentTask) return;

    const archive = await DutyStorage.completeAndArchiveTask(this.currentTask);

    ModalManager.openHandoverSummaryModal({
      summaryText: archive.summaryText,
      taskTitle: archive.taskTitle,
      totalPhotos: archive.totalPhotos,
      onResetAndRestart: () => {
        // 核心要求：“归档并刷新，支持下一次使用”
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

    text.textContent = `已核验划除：${title.substring(0, 12)}...`;
    toast.classList.add('show');

    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoTimer = setTimeout(() => {
      this.hideUndoToast();
    }, 3800);
  }

  private hideUndoToast(): void {
    const toast = document.getElementById('undo-toast');
    toast?.classList.remove('show');
  }

  // ── 界面全量响应式渲染 ──────────────────────────────────────
  private render(): void {
    if (!this.currentTask) return;

    const task = this.currentTask;
    const currentPost = task.posts.find(p => p.id === task.currentPostId) || task.posts[0];
    if (!currentPost && task.posts.length > 0) {
      task.currentPostId = task.posts[0].id;
    }

    // 1. 顶栏更新
    const shiftBadge = document.getElementById('shift-badge');
    if (shiftBadge) shiftBadge.textContent = task.shiftName;

    const currentPostName = document.getElementById('current-post-name');
    if (currentPostName) currentPostName.textContent = currentPost ? currentPost.name : '请设置岗位';

    const currentPostItems = task.items.filter(i => i.postId === currentPost?.id);
    const postCompletedCount = currentPostItems.filter(i => i.isCompleted).length;

    const currentPostStats = document.getElementById('current-post-stats');
    if (currentPostStats) {
      currentPostStats.textContent = `${postCompletedCount}/${currentPostItems.length} 项已核验`;
    }

    // 2. 进度条更新
    const taskTitleDisplay = document.getElementById('task-title-display');
    if (taskTitleDisplay) taskTitleDisplay.textContent = task.title;

    const totalTaskItems = task.items.length;
    const totalCompleted = task.items.filter(i => i.isCompleted).length;
    const percentage = totalTaskItems > 0 ? Math.round((totalCompleted / totalTaskItems) * 100) : 0;

    const percentageDisplay = document.getElementById('task-percentage-display');
    if (percentageDisplay) percentageDisplay.textContent = `${percentage}% (${totalCompleted}/${totalTaskItems})`;

    const progressFill = document.getElementById('task-progress-fill');
    if (progressFill) progressFill.style.width = `${percentage}%`;

    // 3. 渲染条目列表
    const container = document.getElementById('items-list');
    if (!container) return;

    if (currentPostItems.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:50px 20px; color:var(--text-muted);">
          <div style="font-size:2.5rem; margin-bottom:8px;">📝</div>
          <div style="font-weight:600; font-size:1rem; color:var(--text-main);">当前岗位暂无巡检条目</div>
          <div style="font-size:0.8125rem; margin-top:4px;">点击下方「+」按钮或右上角模板添加巡查事项</div>
        </div>
      `;
      return;
    }

    // 生成条目 HTML
    container.innerHTML = currentPostItems
      .map(item => this.renderItemCardHtml(item))
      .join('');

    // 为每个卡片绑定手势与微交互
    currentPostItems.forEach(item => {
      const cardEl = container.querySelector(`[data-item-card-id="${item.id}"]`) as HTMLElement;
      if (!cardEl) return;

      // 绑定滑动划去手势 (Swipe-to-complete)
      bindCardSwipe(cardEl, {
        threshold: 75,
        onSwipeComplete: () => {
          this.lastSwipedItemInfo = {
            item,
            wasCompleted: item.isCompleted,
            oldTimestamp: item.completedAt
          };
          item.isCompleted = true;
          item.completedAt = new Date().toISOString();
          // 如果有子条目，同步标记全部子条目完成
          item.subItems.forEach(sub => {
            sub.isCompleted = true;
            sub.completedAt = item.completedAt;
          });
          DutyStorage.saveTask(task);
          this.showUndoToast(item.title);
          this.render();
        }
      });

      // 快速勾选框点击
      const checkbox = cardEl.querySelector('.item-checkbox') as HTMLElement;
      checkbox?.addEventListener('click', (e) => {
        e.stopPropagation();
        item.isCompleted = !item.isCompleted;
        item.completedAt = item.isCompleted ? new Date().toISOString() : null;
        item.subItems.forEach(sub => {
          sub.isCompleted = item.isCompleted;
          sub.completedAt = item.completedAt;
        });
        DutyStorage.saveTask(task);
        NativeBridgeService.triggerLightHaptic();
        this.render();
      });

      // 子条目折叠展开
      const toggleSubBtn = cardEl.querySelector('.subitems-toggle-btn') as HTMLElement;
      toggleSubBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        item.isExpanded = !item.isExpanded;
        DutyStorage.saveTask(task);
        this.render();
      });

      // 单个子条目点击核验
      cardEl.querySelectorAll('.subitem-row').forEach(subRow => {
        subRow.addEventListener('click', (e) => {
          e.stopPropagation();
          const subId = subRow.getAttribute('data-sub-id');
          const sub = item.subItems.find(s => s.id === subId);
          if (sub) {
            sub.isCompleted = !sub.isCompleted;
            sub.completedAt = sub.isCompleted ? new Date().toISOString() : null;
            // 若全部子项完成，主项也标记完成
            const allSubDone = item.subItems.every(s => s.isCompleted);
            if (allSubDone && !item.isCompleted) {
              item.isCompleted = true;
              item.completedAt = new Date().toISOString();
            }
            DutyStorage.saveTask(task);
            NativeBridgeService.triggerLightHaptic();
            this.render();
          }
        });
      });

      // 拍照按钮点击
      const addPhotoBtn = cardEl.querySelector('.add-photo-btn') as HTMLElement;
      addPhotoBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pendingPhotoItemId = item.id;
        const fileInput = document.getElementById('camera-file-input') as HTMLInputElement;
        fileInput?.click();
      });

      // 复制照片凭证链接/数据
      cardEl.querySelectorAll('.copy-photo-data-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const photoSummary = item.photos.map(p => `【${item.title}】凭证：${p.fileName} (拍摄于 ${p.timestamp})`).join('\n');
          navigator.clipboard.writeText(photoSummary).then(() => {
            alert('已复制照片凭证信息，可直接粘贴至值班表单！');
            NativeBridgeService.triggerLightHaptic();
          });
        });
      });

      // 删除照片
      cardEl.querySelectorAll('.photo-del-badge').forEach(delBtn => {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const phId = delBtn.getAttribute('data-photo-id');
          item.photos = item.photos.filter(p => p.id !== phId);
          DutyStorage.saveTask(task);
          NativeBridgeService.triggerLightHaptic();
          this.render();
        });
      });
    });
  }

  private renderItemCardHtml(item: DutyItem): string {
    const isDone = item.isCompleted;
    const timeFormatted = item.completedAt ? new Date(item.completedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '';
    const hasPhotos = item.photos && item.photos.length > 0;
    const subCount = item.subItems.length;
    const subDoneCount = item.subItems.filter(s => s.isCompleted).length;

    // 照片缩略图
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

    // 子条目列表
    const subItemsHtml =
      subCount > 0 && item.isExpanded
        ? `
        <div class="subitems-list">
          ${item.subItems
            .map(
              sub => `
              <div class="subitem-row" data-sub-id="${sub.id}">
                <div class="subitem-checkbox ${sub.isCompleted ? 'checked' : ''}">
                  ${sub.isCompleted ? '✓' : ''}
                </div>
                <span style="${sub.isCompleted ? 'text-decoration:line-through; color:var(--text-sub);' : ''}">
                  ${sub.title}
                </span>
                ${sub.completedAt ? `<span style="font-size:0.6875rem; color:var(--text-sub); margin-left:auto;">${new Date(sub.completedAt).toLocaleTimeString('zh-CN', { hour12: false })}</span>` : ''}
              </div>
            `
            )
            .join('')}
        </div>
      `
        : '';

    return `
      <div class="duty-item-card" data-item-card-id="${item.id}">
        <!-- 滑动底衬 -->
        <div class="swipe-backdrop">
          <div class="swipe-icon-hint">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>向右滑动划去核验</span>
          </div>
        </div>

        <!-- 真实内容层 -->
        <div class="item-content-wrapper">
          <div class="item-main-row">
            <div class="item-checkbox ${isDone ? 'checked' : ''}">
              ${isDone ? '✓' : ''}
            </div>
            
            <div class="item-info-col">
              <div class="item-title-text ${isDone ? 'striked' : ''}">
                ${item.title}
              </div>

              <!-- 状态元数据 -->
              <div class="item-meta-row">
                ${
                  isDone
                    ? `
                  <div class="item-timestamp-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>${timeFormatted} 已核验</span>
                  </div>
                `
                    : '<span style="color:var(--text-muted);">待巡检核对 (可右滑划去)</span>'
                }

                <!-- 拍照要求标签 -->
                ${
                  item.requirePhoto
                    ? `
                  <div class="photo-req-tag ${hasPhotos ? 'ready' : ''}">
                    📷 ${hasPhotos ? `已附 ${item.photos.length} 张凭证` : '需拍照凭证'}
                  </div>
                `
                    : ''
                }
              </div>

              <!-- 展开/折叠子条目入口 -->
              ${
                subCount > 0
                  ? `
                <button class="subitems-toggle-btn">
                  <span>${item.isExpanded ? '▾ 收起细项' : '▸ 展开核查细项'} (${subDoneCount}/${subCount})</span>
                </button>
              `
                  : ''
              }

              <!-- 展开的子条目列表 -->
              ${subItemsHtml}

              <!-- 照片预览与上传面板 -->
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
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

// 页面加载就绪后启动应用
document.addEventListener('DOMContentLoaded', () => {
  new OxherdApp();
});
