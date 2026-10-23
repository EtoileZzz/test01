import { DutyStorage } from '../storage/db';
import { NativeBridgeService } from '../services/nativeBridge';
import { APP_VERSION, APP_BUILD, type DutyTask, type UserSettings, type DutyPost, type DutyItem } from '../models/types';

export class ModalManager {
  private static modalStack: Array<() => void> = [];
  private static isBackGestureInitialized = false;

  /**
   * 初始化侧滑返回与 Android 原生返回键事件拦截
   */
  static initBackGesture(): void {
    if (this.isBackGestureInitialized) return;
    this.isBackGestureInitialized = true;

    // 1. Android 原生返回键 / 全面屏侧滑返回手势
    NativeBridgeService.setupBackButton(() => {
      return this.closeTopModal();
    });

    // 2. 浏览器/WebView popstate 历史记录后退拦截
    window.addEventListener('popstate', () => {
      if (this.hasOpenModal()) {
        this.closeTopModal(false);
      }
    });
  }

  static hasOpenModal(): boolean {
    return this.modalStack.length > 0 || !!document.getElementById('active-modal-overlay');
  }

  static closeTopModal(popHistory = true): boolean {
    const closer = this.modalStack.pop();
    if (closer) {
      closer();
      if (popHistory && window.history.state?.modalOpen) {
        window.history.back();
      }
      return true;
    }
    const overlay = document.getElementById('active-modal-overlay');
    if (overlay) {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 280);
      return true;
    }
    return false;
  }

  // ── 通用创建与销毁模态框（含丝滑弹出动效、手势侧滑返回与下拉退出） ──
  static openSheet(title: string, contentHtml: string, onMounted?: (card: HTMLElement) => void): () => void {
    this.initBackGesture();

    const existing = document.getElementById('active-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'active-modal-overlay';
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
      <div class="sheet-card" id="active-sheet-card">
        <div class="sheet-header">
          <div>
            <div class="sheet-drag-handle"></div>
            <h3 class="sheet-title">${title}</h3>
          </div>
          <button class="icon-btn" id="modal-close-btn" aria-label="关闭">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="sheet-body">
          ${contentHtml}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const card = overlay.querySelector('#active-sheet-card') as HTMLElement;

    // 关键：强制同步回流，让初始 translateY(100%) 在渲染管线中立即生效，随后添加 .open 触发弹窗进入动效
    void overlay.offsetHeight;
    if (card) void card.offsetHeight;
    overlay.classList.add('open');

    // 写入 history state 使得系统侧滑后退时能触发 popstate
    try {
      window.history.pushState({ modalOpen: true }, '');
    } catch (e) {}

    let isClosed = false;
    const close = () => {
      if (isClosed) return;
      isClosed = true;
      const idx = ModalManager.modalStack.indexOf(close);
      if (idx !== -1) ModalManager.modalStack.splice(idx, 1);
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 300);
    };

    ModalManager.modalStack.push(close);

    const closeBtn = overlay.querySelector('#modal-close-btn') as HTMLElement;
    if (closeBtn) closeBtn.onclick = close;
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };

    // ── 窗口内侧滑返回手势 & 下拉退出手势 ──
    if (card) {
      let startX = 0;
      let startY = 0;
      let isTracking = false;
      let swipeDirection: 'horizontal' | 'vertical' | null = null;

      card.addEventListener('touchstart', (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        const target = e.target as HTMLElement;
        const isHeader = !!target.closest('.sheet-header') || !!target.closest('.sheet-drag-handle');
        // 支持从左边缘 60px 内侧滑返回，或在顶栏手柄上下拉/侧滑
        if (startX <= 60 || isHeader) {
          isTracking = true;
          swipeDirection = null;
          card.style.transition = 'none';
        }
      }, { passive: true });

      card.addEventListener('touchmove', (e: TouchEvent) => {
        if (!isTracking) return;
        const touch = e.touches[0];
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;

        if (!swipeDirection) {
          if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
            swipeDirection = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
          }
        }

        if (swipeDirection === 'horizontal' && deltaX > 0) {
          card.style.transform = `translateX(${deltaX}px)`;
          overlay.style.backgroundColor = `rgba(0, 0, 0, ${Math.max(0.08, 0.5 - deltaX / 400)})`;
        } else if (swipeDirection === 'vertical' && deltaY > 0) {
          card.style.transform = `translateY(${deltaY}px)`;
          overlay.style.backgroundColor = `rgba(0, 0, 0, ${Math.max(0.08, 0.5 - deltaY / 400)})`;
        }
      }, { passive: true });

      const handleTouchEnd = (e: TouchEvent) => {
        if (!isTracking) return;
        isTracking = false;
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;

        card.style.transition = 'transform 260ms var(--ease-ios)';
        overlay.style.transition = 'opacity 260ms ease, background-color 260ms ease';

        if ((swipeDirection === 'horizontal' && deltaX > 75) || (swipeDirection === 'vertical' && deltaY > 75)) {
          NativeBridgeService.triggerLightHaptic();
          if (swipeDirection === 'horizontal') {
            card.style.transform = `translateX(100%)`;
          } else {
            card.style.transform = `translateY(100%)`;
          }
          close();
        } else {
          card.style.transform = '';
          overlay.style.backgroundColor = '';
        }
        swipeDirection = null;
      };

      card.addEventListener('touchend', handleTouchEnd, { passive: true });
      card.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    }

    if (onMounted && card) {
      onMounted(card);
    }

    return close;
  }

  // ── 岗位在设置中管理（增删、改名、条目排序与时段调整） ───────────
  static openPostSettingsModal(
    task: DutyTask,
    onSelectPost: (postId: string) => void,
    onTaskUpdated: () => void
  ): void {
    const currentPost = task.posts.find(p => p.id === task.currentPostId) || task.posts[0];
    const postItems = task.items.filter(i => i.postId === currentPost?.id);

    const renderPosts = () => {
      return task.posts
        .map(post => {
          const items = task.items.filter(i => i.postId === post.id);
          const done = items.filter(i => i.isCompleted).length;
          const isActive = post.id === task.currentPostId;
          return `
            <div class="post-switch-item ${isActive ? 'active' : ''}" data-post-id="${post.id}">
              <div class="post-item-info">
                <div class="post-item-title">${post.name} ${isActive ? '📍 (当前岗位)' : ''}</div>
                <div class="post-item-sub">${items.length} 个巡检条目 · 已核验 ${done} 个</div>
                <div style="display:flex; align-items:center; gap:8px; margin-top:6px; font-size:0.75rem;" class="post-alert-setting-row" data-post-id="${post.id}">
                  <span style="color:var(--text-muted);">🔔 巡查提醒：</span>
                  <input type="time" class="time-input post-alert-time-input" data-post-id="${post.id}" value="${post.alertTime || '10:00'}"
                    style="padding:2px 6px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main); font-size:0.75rem; font-family:var(--font-mono);" />
                  <div class="toggle-switch ${post.alertEnabled ? 'on' : ''} toggle-post-alert-switch" data-post-id="${post.id}" style="width:34px; height:18px; cursor:pointer;" title="${post.alertEnabled ? '提醒已开启' : '提醒已关闭'}">
                    <div class="toggle-knob" style="width:14px; height:14px;"></div>
                  </div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                <button class="icon-btn edit-post-btn" data-post-id="${post.id}" title="重命名岗位" style="width:28px; height:28px;">
                  ✏️
                </button>
                ${
                  task.posts.length > 1
                    ? `
                  <button class="icon-btn del-post-btn" data-post-id="${post.id}" title="删除岗位" style="width:28px; height:28px; color:var(--danger);">
                    🗑️
                  </button>
                `
                    : ''
                }
              </div>
            </div>
          `;
        })
        .join('');
    };

    const renderItemsManagement = () => {
      if (!currentPost || postItems.length === 0) {
        return `
          <div style="text-align:center; padding:18px 10px; color:var(--text-muted); font-size:0.8125rem;">
            当前岗位暂无条目，请在主界面点击「添加巡查条目」开始录入
          </div>
        `;
      }

      return postItems
        .map((item, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === postItems.length - 1;
          const isScheduled = item.itemType === 'SCHEDULED';

          return `
            <div class="settings-group" style="padding:10px 12px; margin-bottom:8px; border:1px solid var(--border-color); background:var(--bg-card);" data-item-id="${item.id}">
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                <div style="font-weight:600; font-size:0.875rem; color:var(--text-main); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  <span style="color:var(--text-muted); font-size:0.75rem; margin-right:4px;">#${idx + 1}</span>
                  ${item.title}
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                  <button class="icon-btn move-up-btn" data-item-id="${item.id}" ${isFirst ? 'disabled style="opacity:0.25;"' : ''} style="width:28px; height:28px;" title="上移">
                    ▲
                  </button>
                  <button class="icon-btn move-down-btn" data-item-id="${item.id}" ${isLast ? 'disabled style="opacity:0.25;"' : ''} style="width:28px; height:28px;" title="下移">
                    ▼
                  </button>
                  <button class="icon-btn del-item-btn" data-item-id="${item.id}" style="width:28px; height:28px; color:var(--danger);" title="删除">
                    ✕
                  </button>
                </div>
              </div>

              <!-- 属性转换 (时段巡查 ↔ 常规待办：滑块切换) -->
              <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-top:1px dashed var(--border-color); border-bottom:1px dashed var(--border-color); margin:6px 0;">
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">
                  条目属性：
                </div>
                <div class="mini-slider-switch toggle-type-slider" data-item-id="${item.id}" data-value="${isScheduled ? 'SCHEDULED' : 'STANDARD'}">
                  <div class="mini-slider-thumb"></div>
                  <div class="mini-slider-label" data-type="STANDARD">常规待办</div>
                  <div class="mini-slider-label" data-type="SCHEDULED">时段巡查</div>
                </div>
              </div>

              <!-- 时段微调 (纯局部展开/收起) -->
              <div class="item-schedule-row" data-item-id="${item.id}" style="display:${isScheduled ? 'flex' : 'none'}; align-items:center; justify-content:space-between; padding:4px 0; font-size:0.75rem;">
                <span style="color:var(--text-muted);">巡查区间：</span>
                <div style="display:flex; align-items:center; gap:4px;">
                  <input type="time" class="time-input start-time-input" data-item-id="${item.id}" value="${item.startTime || '09:00'}" 
                    style="padding:3px 6px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main); font-size:0.75rem; font-family:var(--font-mono);" />
                  <span>至</span>
                  <input type="time" class="time-input end-time-input" data-item-id="${item.id}" value="${item.endTime || '11:30'}" 
                    style="padding:3px 6px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main); font-size:0.75rem; font-family:var(--font-mono);" />
                </div>
              </div>

              <!-- 拍照要求开关 -->
              <div style="display:flex; align-items:center; justify-content:space-between; padding-top:4px; font-size:0.75rem;">
                <span style="color:var(--text-muted);">${item.requirePhoto ? '📷 巡检必须拍照' : '无需拍照'}</span>
                <div class="toggle-switch ${item.requirePhoto ? 'on' : ''} toggle-photo-switch" data-item-id="${item.id}" style="width:36px; height:20px; cursor:pointer;">
                  <div class="toggle-knob" style="width:16px; height:16px;"></div>
                </div>
              </div>

              <!-- 自动折叠选项 (对所有条目生效，默认开启) -->
              <div class="autofold-row" data-item-id="${item.id}" style="display:flex; align-items:center; justify-content:space-between; padding-top:4px; font-size:0.75rem;">
                <span style="color:var(--text-muted);">📦 完成后自动折叠：</span>
                <div class="toggle-switch ${(item.autoFold !== false) ? 'on' : ''} toggle-autofold-switch" data-item-id="${item.id}" style="width:36px; height:20px; cursor:pointer;">
                  <div class="toggle-knob" style="width:16px; height:16px;"></div>
                </div>
              </div>

              <!-- 条目到点提醒设置 -->
              <div class="item-reminder-row" data-item-id="${item.id}" style="display:flex; align-items:center; justify-content:space-between; padding-top:4px; font-size:0.75rem;">
                <span style="color:var(--text-muted);">⏰ 到点核验提醒：</span>
                <div style="display:flex; align-items:center; gap:6px;">
                  <input type="time" class="time-input item-reminder-time-input" data-item-id="${item.id}" value="${item.reminderTime || item.startTime || '09:30'}"
                    style="padding:2px 6px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main); font-size:0.75rem; font-family:var(--font-mono);" />
                  <div class="toggle-switch ${item.reminderEnabled ? 'on' : ''} toggle-item-reminder-switch" data-item-id="${item.id}" style="width:34px; height:18px; cursor:pointer;" title="${item.reminderEnabled ? '到点提醒已开启' : '到点提醒已关闭'}">
                    <div class="toggle-knob" style="width:14px; height:14px;"></div>
                  </div>
                </div>
              </div>
            </div>
          `;
        })
        .join('');
    };

    const contentHtml = `
      <!-- 岗位管理 -->
      <div class="settings-group">
        <div class="settings-group-title">🎯 巡查岗位与楼层管理</div>
        <div id="posts-switch-list" style="display:flex; flex-direction:column; gap:8px;">
          ${renderPosts()}
        </div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <input type="text" id="new-post-name-input" placeholder="输入新岗位 (如: 3楼阅览室)" 
            style="flex:1; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); font-size:0.875rem;" />
          <button class="icon-btn" id="add-post-btn" style="width:auto; padding:0 14px; font-weight:600; font-size:0.8125rem; background:var(--accent); color:white; border:none;">
            + 新增岗位
          </button>
        </div>
      </div>

      <!-- 当前岗位的条目排序与管理 -->
      <div class="settings-group" style="margin-top:12px;">
        <div class="settings-group-title">📐 [${currentPost?.name || '当前岗位'}] 条目排序与属性管理</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">
          自由上移/下移排序、转换时段巡查与微调时间，实时保存生效。
        </div>

        <div id="items-mgmt-list">
          ${renderItemsManagement()}
        </div>
      </div>
    `;

    const close = this.openSheet('岗位与条目管理', contentHtml, (card) => {
      // 切换岗位
      card.querySelectorAll('.post-switch-item').forEach(el => {
        el.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (
            target.closest('.edit-post-btn') ||
            target.closest('.del-post-btn') ||
            target.closest('.post-alert-setting-row') ||
            target.closest('.post-alert-time-input') ||
            target.closest('.toggle-post-alert-switch')
          ) {
            return;
          }
          const postId = el.getAttribute('data-post-id');
          if (postId) {
            task.currentPostId = postId;
            DutyStorage.saveTask(task);
            NativeBridgeService.triggerLightHaptic();
            onSelectPost(postId);
            close();
          }
        });
      });

      // 岗位巡查提醒时间与开关
      card.querySelectorAll('.post-alert-time-input').forEach(input => {
        input.addEventListener('change', (e) => {
          e.stopPropagation();
          const postId = input.getAttribute('data-post-id');
          const val = (input as HTMLInputElement).value;
          const post = task.posts.find(p => p.id === postId);
          if (post && val) {
            post.alertTime = val;
            DutyStorage.saveTask(task);
            onTaskUpdated();
          }
        });
      });

      card.querySelectorAll('.toggle-post-alert-switch').forEach(sw => {
        sw.addEventListener('click', (e) => {
          e.stopPropagation();
          const postId = sw.getAttribute('data-post-id');
          const post = task.posts.find(p => p.id === postId);
          if (post) {
            post.alertEnabled = !post.alertEnabled;
            if (post.alertEnabled && !post.alertTime) {
              post.alertTime = '10:00';
            }
            DutyStorage.saveTask(task);
            NativeBridgeService.triggerLightHaptic();
            sw.classList.toggle('on', !!post.alertEnabled);
            onTaskUpdated();
          }
        });
      });

      // 添加新岗位
      const addPostBtn = card.querySelector('#add-post-btn') as HTMLElement;
      const postInput = card.querySelector('#new-post-name-input') as HTMLInputElement;
      addPostBtn?.addEventListener('click', () => {
        const name = postInput.value.trim();
        if (!name) return;
        const newPostId = `post_${task.id}_${Date.now()}`;
        task.posts.push({
          id: newPostId,
          taskId: task.id,
          name,
          sortOrder: task.posts.length
        });
        task.currentPostId = newPostId;
        DutyStorage.saveTask(task);
        NativeBridgeService.triggerLightHaptic();
        onTaskUpdated();
        close();
      });

      // 重命名岗位
      card.querySelectorAll('.edit-post-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const postId = btn.getAttribute('data-post-id');
          const post = task.posts.find(p => p.id === postId);
          if (!post) return;
          const newName = prompt('修改岗位名称：', post.name);
          if (newName && newName.trim()) {
            post.name = newName.trim();
            DutyStorage.saveTask(task);
            onTaskUpdated();
            close();
          }
        });
      });

      // 删除岗位
      card.querySelectorAll('.del-post-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const postId = btn.getAttribute('data-post-id');
          if (postId && confirm('确定删除该岗位及其包含的所有检查条目吗？')) {
            task.posts = task.posts.filter(p => p.id !== postId);
            task.items = task.items.filter(i => i.postId !== postId);
            if (task.currentPostId === postId && task.posts.length > 0) {
              task.currentPostId = task.posts[0].id;
            }
            DutyStorage.saveTask(task);
            onTaskUpdated();
            close();
          }
        });
      });

      const bindItemEvents = () => {
        // 上移条目 [ ▲ 上移 ] (纯局部无缝刷新)
        card.querySelectorAll('.move-up-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const itemId = btn.getAttribute('data-item-id');
            if (itemId && DutyStorage.moveItemOrder(task, itemId, 'up')) {
              NativeBridgeService.triggerLightHaptic();
              refreshItemsList();
              onTaskUpdated();
            }
          });
        });

        // 下移条目 [ ▼ 下移 ] (纯局部无缝刷新)
        card.querySelectorAll('.move-down-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const itemId = btn.getAttribute('data-item-id');
            if (itemId && DutyStorage.moveItemOrder(task, itemId, 'down')) {
              NativeBridgeService.triggerLightHaptic();
              refreshItemsList();
              onTaskUpdated();
            }
          });
        });

        // 删除条目 (纯局部无缝刷新)
        card.querySelectorAll('.del-item-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const itemId = btn.getAttribute('data-item-id');
            if (itemId && confirm('确定删除该检查条目吗？')) {
              task.items = task.items.filter(i => i.id !== itemId);
              DutyStorage.saveTask(task);
              NativeBridgeService.triggerLightHaptic();
              refreshItemsList();
              onTaskUpdated();
            }
          });
        });

        // 滑块切换类型 (时段巡查 ↔ 常规待办：纯局部平滑滑块切换，绝不关闭或全局刷新弹窗)
        card.querySelectorAll('.toggle-type-slider').forEach(slider => {
          slider.addEventListener('click', (e) => {
            e.stopPropagation();
            const itemId = slider.getAttribute('data-item-id');
            if (!itemId) return;
            const item = task.items.find(i => i.id === itemId);
            if (!item) return;

            const newType = item.itemType === 'SCHEDULED' ? 'STANDARD' : 'SCHEDULED';
            item.itemType = newType;
            if (newType === 'SCHEDULED') {
              if (!item.startTime) item.startTime = '09:00';
              if (!item.endTime) item.endTime = '11:30';
            }
            DutyStorage.saveTask(task);
            NativeBridgeService.triggerLightHaptic();

            slider.setAttribute('data-value', newType);
            const timeRow = card.querySelector(`.item-schedule-row[data-item-id="${itemId}"]`) as HTMLElement;
            if (timeRow) {
              timeRow.style.display = newType === 'SCHEDULED' ? 'flex' : 'none';
            }
            onTaskUpdated();
          });
        });

        // 拍照开关 (纯局部)
        card.querySelectorAll('.toggle-photo-switch').forEach(sw => {
          sw.addEventListener('click', (e) => {
            e.stopPropagation();
            const itemId = sw.getAttribute('data-item-id');
            if (!itemId) return;
            const item = task.items.find(i => i.id === itemId);
            if (!item) return;
            item.requirePhoto = !item.requirePhoto;
            DutyStorage.saveTask(task);
            NativeBridgeService.triggerLightHaptic();
            refreshItemsList();
            onTaskUpdated();
          });
        });

        // 自动折叠开关 (纯局部)
        card.querySelectorAll('.toggle-autofold-switch').forEach(sw => {
          sw.addEventListener('click', (e) => {
            e.stopPropagation();
            const itemId = sw.getAttribute('data-item-id');
            if (!itemId) return;
            DutyStorage.toggleItemAutoFold(task, itemId);
            const item = task.items.find(i => i.id === itemId);
            sw.classList.toggle('on', item?.autoFold !== false);
            NativeBridgeService.triggerLightHaptic();
            onTaskUpdated();
          });
        });

        // 微调起止时间
        card.querySelectorAll('.start-time-input').forEach(input => {
          input.addEventListener('change', () => {
            const itemId = input.getAttribute('data-item-id');
            const startVal = (input as HTMLInputElement).value;
            const endInput = card.querySelector(`.end-time-input[data-item-id="${itemId}"]`) as HTMLInputElement;
            const endVal = endInput ? endInput.value : '11:30';
            if (itemId) {
              DutyStorage.updateItemScheduleTime(task, itemId, startVal, endVal);
              onTaskUpdated();
            }
          });
        });

        card.querySelectorAll('.end-time-input').forEach(input => {
          input.addEventListener('change', () => {
            const itemId = input.getAttribute('data-item-id');
            const endVal = (input as HTMLInputElement).value;
            const startInput = card.querySelector(`.start-time-input[data-item-id="${itemId}"]`) as HTMLInputElement;
            const startVal = startInput ? startInput.value : '09:00';
            if (itemId) {
              DutyStorage.updateItemScheduleTime(task, itemId, startVal, endVal);
              onTaskUpdated();
            }
          });
        });

        // 条目自定义到点提醒时间
        card.querySelectorAll('.item-reminder-time-input').forEach(input => {
          input.addEventListener('change', () => {
            const itemId = input.getAttribute('data-item-id');
            const val = (input as HTMLInputElement).value;
            const item = task.items.find(i => i.id === itemId);
            if (item && val) {
              item.reminderTime = val;
              DutyStorage.saveTask(task);
              onTaskUpdated();
            }
          });
        });

        // 条目到点提醒开关
        card.querySelectorAll('.toggle-item-reminder-switch').forEach(sw => {
          sw.addEventListener('click', (e) => {
            e.stopPropagation();
            const itemId = sw.getAttribute('data-item-id');
            const item = task.items.find(i => i.id === itemId);
            if (item) {
              item.reminderEnabled = !item.reminderEnabled;
              if (item.reminderEnabled && !item.reminderTime) {
                item.reminderTime = item.startTime || '09:30';
              }
              DutyStorage.saveTask(task);
              NativeBridgeService.triggerLightHaptic();
              sw.classList.toggle('on', !!item.reminderEnabled);
              onTaskUpdated();
            }
          });
        });
      };

      const refreshItemsList = () => {
        const listEl = card.querySelector('#items-mgmt-list');
        if (listEl) {
          listEl.innerHTML = renderItemsManagement();
          bindItemEvents();
        }
      };

      bindItemEvents();
    });
  }

  // ── 应用设置与配置中心 ──────────────────────────────────────────
  static async openSystemSettingsModal(task: DutyTask | null, onSettingsChanged: () => void): Promise<void> {
    const settings = DutyStorage.getSettings();
    const isBatteryIgnored = await NativeBridgeService.isBatteryOptimizationIgnored();
    const vendorInfo = await NativeBridgeService.getVendorInfo();

    const contentHtml = `
      <!-- 外观主题与自绘色盘 -->
      <div class="settings-group">
        <div class="settings-group-title">🎨 外观主题与主题色定制</div>
        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-main-label">深浅色显示</span>
            <span class="settings-sub-label">支持浅色、深色及跟随系统自动切换</span>
          </div>
          <div class="select-pills" id="theme-pills">
            <div class="pill-option ${settings.theme === 'light' ? 'active' : ''}" data-val="light">☀️ 浅色</div>
            <div class="pill-option ${settings.theme === 'dark' ? 'active' : ''}" data-val="dark">🌙 深色</div>
            <div class="pill-option ${settings.theme === 'system' ? 'active' : ''}" data-val="system">💻 跟随系统</div>
          </div>
        </div>

        <!-- 自绘色盘取色器 -->
        <div class="theme-palette-box">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div id="theme-color-preview-circle" style="width:20px; height:20px; border-radius:50%; background:var(--accent); border:2px solid white; box-shadow:0 0 0 1px var(--border-color);"></div>
              <span style="font-size:0.8125rem; font-weight:700; color:var(--text-main);">自绘全色光谱色盘</span>
              <span id="theme-color-hex-tag" style="font-size:0.75rem; font-family:var(--font-mono); color:var(--text-muted);">${settings.themeColor || '默认'}</span>
            </div>
            <button type="button" class="icon-btn" id="reset-theme-color-btn" style="width:auto; height:26px; padding:0 10px; font-size:0.6875rem;">
              恢复默认
            </button>
          </div>
          
          <div class="theme-canvas-container">
            <canvas id="theme-color-canvas" width="300" height="110"></canvas>
          </div>

          <div style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:0.6875rem; color:var(--text-muted); font-weight:600;">经典预设推荐：</span>
            <div class="color-presets-row" id="theme-color-presets">
              ${[
                { name: '极光天蓝', hex: '#38BDF8' },
                { name: '深海湛蓝', hex: '#0284C7' },
                { name: '翡翠生机', hex: '#10B981' },
                { name: '赛博青翠', hex: '#06B6D4' },
                { name: '梦幻星紫', hex: '#8B5CF6' },
                { name: '珊瑚粉红', hex: '#F43F5E' },
                { name: '日落落霞', hex: '#F97316' },
                { name: '高级石墨', hex: '#64748B' }
              ].map(p => `
                <button type="button" class="color-swatch-btn ${settings.themeColor === p.hex ? 'active' : ''}" data-hex="${p.hex}" style="background:${p.hex};" title="${p.name} (${p.hex})"></button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- 预设交班表单/协同外链 -->
      <div class="settings-group">
        <div class="settings-group-title">🔗 值班填报链接与协同跳转</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">
          在此预设单位值班填报链接（如腾讯文档、飞书、问卷等），巡查完成时可一键跳转填写。
        </div>
        <input type="url" id="handover-url-input" value="${settings.handoverExternalUrl || ''}" placeholder="粘贴值班表单/链接 (https://...)" 
          style="width:100%; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); font-size:0.8125rem;" />
        <div style="display:flex; gap:8px; margin-top:6px;">
          <button class="icon-btn save-handover-url-btn" style="flex:1; height:34px; font-size:0.75rem; font-weight:600; background:var(--accent); color:white; border:none;">
            💾 保存填报链接
          </button>
        </div>
      </div>

      <!-- 巡查排布与细项交互偏好 -->
      <div class="settings-group">
        <div class="settings-group-title">📋 巡查排布与细项交互偏好</div>
        
        <!-- 未完成条目自动折叠 (全局设置，排除必须拍照的项目) -->
        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-main-label">未完成条目自动折叠</span>
            <span class="settings-sub-label">未完成条目默认收起细项以简化排布（必须拍照的项目除外，保持展开）</span>
          </div>
          <div class="toggle-switch ${settings.autoFoldUncompleted ? 'on' : ''}" id="toggle-autofold-uncompleted">
            <div class="toggle-knob"></div>
          </div>
        </div>

        <!-- 细分子项完成方式：点击打勾 vs 左右划去 -->
        <div class="settings-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
          <div class="settings-row-label" style="width:100%;">
            <span class="settings-main-label">细分子项完成操作方式</span>
            <span class="settings-sub-label">选择子项核验时的交互手势（点击或跟手左右划去）</span>
          </div>
          <div class="select-pills" id="subitem-mode-pills" style="width:100%;">
            <div class="pill-option ${settings.subItemCompleteMode !== 'swipe' ? 'active' : ''}" data-mode="click" style="flex:1; text-align:center;">
              👉 点击打勾划去
            </div>
            <div class="pill-option ${settings.subItemCompleteMode === 'swipe' ? 'active' : ''}" data-mode="swipe" style="flex:1; text-align:center;">
              ↔️ 左右划动划去
            </div>
          </div>
        </div>

        <!-- 细项录入空格自动切换 -->
        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-main-label">细项录入空格自动切换</span>
            <span class="settings-sub-label">输入细项时按空格键或输入空格立即自动生成细项并切换至下一项</span>
          </div>
          <div class="toggle-switch ${settings.subItemSpaceAutoSwitch !== false ? 'on' : ''}" id="toggle-sub-space-switch">
            <div class="toggle-knob"></div>
          </div>
        </div>
      </div>

      <!-- 配置文件标准 JSON 导入导出 -->
      <div class="settings-group">
        <div class="settings-group-title">📦 配置文件导入导出（标准 JSON）</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:6px;">
          采用标准 JSON 封装所有岗位、主项、时段及子条目，支持保存至手机文件或一键分享到微信/TIM。
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; gap:8px;">
            <button class="icon-btn" id="export-json-file-btn" style="flex:1; height:38px; font-size:0.8125rem; font-weight:600;">
              💾 保存至手机文件
            </button>
            <button class="icon-btn" id="share-json-btn" style="flex:1; height:38px; font-size:0.8125rem; font-weight:600; background:var(--accent-light); color:var(--accent);">
              📲 一键分享微信/TIM
            </button>
          </div>
          <button class="icon-btn" id="import-json-btn" style="width:100%; height:38px; font-size:0.8125rem; font-weight:600; background:var(--bg-elevated);">
            📂 从手机选取 JSON 导入（带合法性统计预览）
          </button>
          <input type="file" id="json-file-input" accept=".json" style="display:none;" />
        </div>
      </div>

      <!-- 通知唤醒全参数 -->
      <div class="settings-group">
        <div class="settings-group-title">🔔 通知唤醒全参数自定义</div>
        
        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-main-label">通知总开关</span>
            <span class="settings-sub-label">控制值班巡查任务的全部闹钟提醒</span>
          </div>
          <div class="toggle-switch ${settings.notificationsEnabled ? 'on' : ''}" id="toggle-notif-main">
            <div class="toggle-knob"></div>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-main-label">提前预警量</span>
            <span class="settings-sub-label">巡查开始前多久发出预警</span>
          </div>
          <div class="select-pills" id="advance-pills">
            ${[5, 10, 15, 30, 60].map(m => `
              <div class="pill-option ${settings.advanceMinutes === m ? 'active' : ''}" data-mins="${m}">${m}m</div>
            `).join('')}
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-main-label">高优先级唤醒提示音</span>
            <span class="settings-sub-label">使用系统闹钟音频流，静音模式下也能发声</span>
          </div>
          <div class="toggle-switch ${settings.alarmSoundEnabled ? 'on' : ''}" id="toggle-sound">
            <div class="toggle-knob"></div>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-main-label">巡更强震动模式</span>
            <span class="settings-sub-label">交替长震动波形，确保现场巡视即时感知</span>
          </div>
          <div class="toggle-switch ${settings.strongVibrateEnabled ? 'on' : ''}" id="toggle-vibrate">
            <div class="toggle-knob"></div>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-main-label">时段巡查开始提醒</span>
            <span class="settings-sub-label">到达每个时段起点时自动触发打卡提醒</span>
          </div>
          <div class="toggle-switch ${settings.onDutyStartAlert ? 'on' : ''}" id="toggle-start-alert">
            <div class="toggle-knob"></div>
          </div>
        </div>

        <div style="margin-top:6px;">
          <button class="icon-btn" id="test-notif-btn" style="width:100%; height:40px; font-weight:600; font-size:0.875rem; background:var(--accent); color:white; border:none; gap:6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            一键测试通知提醒（发声 + 强震动）
          </button>
        </div>
      </div>

      <!-- 开机自启动与后台保活 -->
      <div class="settings-group">
        <div class="settings-group-title">⚡ 开机自启动与后台保活（确保通知必达）</div>
        
        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-main-label">开机自启恢复调度</span>
            <span class="settings-sub-label">手机关机重启或更新后自动向系统重新注册闹钟</span>
          </div>
          <div class="toggle-switch ${settings.bootRestoreEnabled ? 'on' : ''}" id="toggle-boot-restore">
            <div class="toggle-knob"></div>
          </div>
        </div>

        <div class="settings-row" style="align-items:center;">
          <div class="settings-row-label">
            <span class="settings-main-label">电池优化白名单</span>
            <span class="settings-sub-label">防止手机进入 Doze 深度休眠杀停值班闹钟</span>
          </div>
          <button class="icon-btn" id="battery-opt-btn" style="width:auto; height:32px; padding:0 12px; font-size:0.75rem; font-weight:600; border-color:${isBatteryIgnored ? 'var(--success)' : 'var(--warning)'}; color:${isBatteryIgnored ? 'var(--success)' : 'var(--warning)'};">
            ${isBatteryIgnored ? '✅ 已在白名单' : '⚠️ 点击申请加入'}
          </button>
        </div>

        <div class="settings-row" style="align-items:center;">
          <div class="settings-row-label">
            <span class="settings-main-label">厂商自启动权限</span>
            <span class="settings-sub-label">当前识别设备：${vendorInfo}</span>
          </div>
          <button class="icon-btn" id="vendor-autostart-btn" style="width:auto; height:32px; padding:0 12px; font-size:0.75rem; font-weight:600; background:var(--bg-elevated); flex-shrink:0;">
            直达设置 ↗
          </button>
        </div>
      </div>

      <!-- 版本信息与在线检查更新 -->
      <div class="settings-group">
        <div class="settings-group-title">🚀 软件版本与在线更新</div>
        <div class="settings-row" style="align-items:center;">
          <div class="settings-row-label">
            <span class="settings-main-label">oxherd 巡更值班助手</span>
            <span class="settings-sub-label">当前版本：v${APP_VERSION} (Build ${APP_BUILD})</span>
          </div>
          <button class="icon-btn" id="check-update-btn" style="width:auto; height:32px; padding:0 14px; font-size:0.75rem; font-weight:700; background:var(--accent); color:white; border:none; gap:6px; flex-shrink:0;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            <span id="check-update-btn-text">检查更新</span>
          </button>
        </div>
        <div id="update-result-box" style="display:none; margin-top:8px; padding:10px 12px; border-radius:var(--radius-sm); font-size:0.8125rem; line-height:1.5;"></div>
      </div>
    `;

    this.openSheet('应用设置与配置中心', contentHtml, (card) => {
      // 主题切换
      card.querySelectorAll('#theme-pills .pill-option').forEach(pill => {
        pill.addEventListener('click', () => {
          const val = pill.getAttribute('data-val') as any;
          settings.theme = val;
          DutyStorage.saveSettings({ theme: val });
          card.querySelectorAll('#theme-pills .pill-option').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          NativeBridgeService.syncStatusBarTheme(val);
          onSettingsChanged();
        });
      });

      // 保存交班外链
      const saveUrlBtn = card.querySelector('.save-handover-url-btn');
      const urlInput = card.querySelector('#handover-url-input') as HTMLInputElement;
      saveUrlBtn?.addEventListener('click', () => {
        const url = urlInput.value.trim();
        DutyStorage.saveSettings({ handoverExternalUrl: url });
        NativeBridgeService.triggerLightHaptic();
        alert('值班填报链接已保存！');
      });

      // 🎨 自绘色盘取色与主题色定制
      const canvas = card.querySelector('#theme-color-canvas') as HTMLCanvasElement;
      const hexTag = card.querySelector('#theme-color-hex-tag') as HTMLElement;
      const previewCircle = card.querySelector('#theme-color-preview-circle') as HTMLElement;
      const resetColorBtn = card.querySelector('#reset-theme-color-btn') as HTMLElement;
      const presetBtns = card.querySelectorAll('#theme-color-presets .color-swatch-btn');

      const applyThemeColor = (colorHex: string) => {
        settings.themeColor = colorHex;
        DutyStorage.saveSettings({ themeColor: colorHex });
        if (hexTag) hexTag.textContent = colorHex || '默认';
        if (previewCircle) previewCircle.style.background = colorHex || 'var(--accent)';
        presetBtns.forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-hex') === colorHex);
        });

        if (colorHex) {
          document.documentElement.style.setProperty('--accent', colorHex);
          document.documentElement.style.setProperty('--border-focus', colorHex);
          const hex = colorHex.replace('#', '');
          if (hex.length === 6) {
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            document.documentElement.style.setProperty('--accent-light', `rgba(${r}, ${g}, ${b}, 0.16)`);
          }
        } else {
          document.documentElement.style.removeProperty('--accent');
          document.documentElement.style.removeProperty('--accent-light');
          document.documentElement.style.removeProperty('--border-focus');
        }
        onSettingsChanged();
      };

      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;

          const drawSpectrum = (markerX?: number, markerY?: number) => {
            // 水平彩虹光谱
            const hGrad = ctx.createLinearGradient(0, 0, width, 0);
            hGrad.addColorStop(0, '#ff0000');
            hGrad.addColorStop(0.17, '#ffff00');
            hGrad.addColorStop(0.33, '#00ff00');
            hGrad.addColorStop(0.50, '#00ffff');
            hGrad.addColorStop(0.67, '#0000ff');
            hGrad.addColorStop(0.83, '#ff00ff');
            hGrad.addColorStop(1, '#ff0000');
            ctx.fillStyle = hGrad;
            ctx.fillRect(0, 0, width, height);

            // 垂直明度与饱和度渐变
            const vGrad = ctx.createLinearGradient(0, 0, 0, height);
            vGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
            vGrad.addColorStop(0.48, 'rgba(255, 255, 255, 0)');
            vGrad.addColorStop(0.52, 'rgba(0, 0, 0, 0)');
            vGrad.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
            ctx.fillStyle = vGrad;
            ctx.fillRect(0, 0, width, height);

            // 绘制当前光标指示器
            if (markerX !== undefined && markerY !== undefined) {
              ctx.beginPath();
              ctx.arc(markerX, markerY, 7, 0, Math.PI * 2);
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 2.5;
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(markerX, markerY, 5, 0, Math.PI * 2);
              ctx.strokeStyle = '#000000';
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }
          };

          drawSpectrum();

          const pickColor = (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            const rawX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const rawY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
            const canvasX = Math.round((rawX / rect.width) * width);
            const canvasY = Math.round((rawY / rect.height) * height);

            drawSpectrum(canvasX, canvasY);

            const pixel = ctx.getImageData(canvasX, canvasY, 1, 1).data;
            const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(x => x.toString(16).padStart(2, '0')).join('');
            applyThemeColor(hex);
          };

          let isPicking = false;
          canvas.addEventListener('pointerdown', (e) => {
            isPicking = true;
            try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
            pickColor(e);
            NativeBridgeService.triggerLightHaptic();
          });
          canvas.addEventListener('pointermove', (e) => {
            if (isPicking) pickColor(e);
          });
          const endPick = (e: PointerEvent) => {
            if (isPicking) {
              isPicking = false;
              try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
            }
          };
          canvas.addEventListener('pointerup', endPick);
          canvas.addEventListener('pointercancel', endPick);
        }
      }

      // 预设推荐色
      presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const hex = btn.getAttribute('data-hex');
          if (hex) {
            applyThemeColor(hex);
            NativeBridgeService.triggerLightHaptic();
          }
        });
      });

      // 恢复默认主题色
      resetColorBtn?.addEventListener('click', () => {
        applyThemeColor('');
        NativeBridgeService.triggerLightHaptic();
      });

      // 未完成条目自动折叠开关（排除必须拍照的项目）
      const toggleAutofoldUncompleted = card.querySelector('#toggle-autofold-uncompleted');
      toggleAutofoldUncompleted?.addEventListener('click', () => {
        const nextVal = !settings.autoFoldUncompleted;
        settings.autoFoldUncompleted = nextVal;
        DutyStorage.saveSettings({ autoFoldUncompleted: nextVal });
        toggleAutofoldUncompleted.classList.toggle('on', nextVal);
        NativeBridgeService.triggerLightHaptic();

        // 立即同步当前未完成条目的折叠状态
        if (task) {
          task.items.forEach(item => {
            if (!item.isCompleted) {
              item.isExpanded = item.requirePhoto ? true : !nextVal;
            }
          });
          DutyStorage.saveTask(task);
        }
        onSettingsChanged();
      });

      // 细分子项完成方式切换 (点击打勾 vs 左右划去)
      card.querySelectorAll('#subitem-mode-pills .pill-option').forEach(pill => {
        pill.addEventListener('click', () => {
          const mode = pill.getAttribute('data-mode') as 'click' | 'swipe';
          settings.subItemCompleteMode = mode;
          DutyStorage.saveSettings({ subItemCompleteMode: mode });
          card.querySelectorAll('#subitem-mode-pills .pill-option').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          NativeBridgeService.triggerLightHaptic();
          onSettingsChanged();
        });
      });

      // 细分子条目录入空格自动切换开关
      const toggleSubSpace = card.querySelector('#toggle-sub-space-switch');
      toggleSubSpace?.addEventListener('click', () => {
        const current = settings.subItemSpaceAutoSwitch !== false;
        const updated = !current;
        settings.subItemSpaceAutoSwitch = updated;
        DutyStorage.saveSettings({ subItemSpaceAutoSwitch: updated });
        toggleSubSpace.classList.toggle('on', updated);
        NativeBridgeService.triggerLightHaptic();
      });

      // 保存至手机文件 (JSON，绝不用剪贴板)
      const exportFileBtn = card.querySelector('#export-json-file-btn');
      exportFileBtn?.addEventListener('click', async () => {
        if (!task) return;
        const json = DutyStorage.exportDutyConfig(task);
        const fileName = `oxherd_duty_config_${new Date().toISOString().split('T')[0]}.json`;
        NativeBridgeService.triggerLightHaptic();
        await NativeBridgeService.saveConfigFile(fileName, json);
      });

      // 一键分享到微信 / TIM（原生 Intent 调起应用分享，绝不用剪贴板）
      const shareBtn = card.querySelector('#share-json-btn');
      shareBtn?.addEventListener('click', async () => {
        if (!task) return;
        const json = DutyStorage.exportDutyConfig(task);
        const fileName = `oxherd_duty_config_${new Date().toISOString().split('T')[0]}.json`;
        NativeBridgeService.triggerLightHaptic();
        await NativeBridgeService.shareConfigFile(fileName, json);
      });

      // 导入 JSON
      const importBtn = card.querySelector('#import-json-btn');
      const fileInput = card.querySelector('#json-file-input') as HTMLInputElement;
      importBtn?.addEventListener('click', () => fileInput.click());

      fileInput?.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          const result = DutyStorage.parseAndValidateConfig(content);

          if (!result.valid || !result.stats) {
            alert(`配置文件校验失败：${result.error || '格式错误'}`);
            return;
          }

          const s = result.stats;
          const confirmMsg =
            `【JSON 配置文件校验成功】\n\n` +
            `· 任务标题：${s.title}\n` +
            `· 岗位数量：${s.postsCount} 个\n` +
            `· 检查条目：${s.itemsCount} 条\n` +
            `· 时段巡查项：${s.scheduledCount} 条\n` +
            `· 细分子条目：${s.subItemsCount} 个\n\n` +
            `确定覆盖当前值班配置并立即载入吗？`;

          if (confirm(confirmMsg)) {
            DutyStorage.applyImportedConfig(result.data);
            alert('配置已成功导入覆盖！页面即将刷新。');
            window.location.reload();
          }
        };
        reader.readAsText(file);
      });

      // 通知开关
      const toggleNotif = card.querySelector('#toggle-notif-main');
      toggleNotif?.addEventListener('click', () => {
        settings.notificationsEnabled = !settings.notificationsEnabled;
        DutyStorage.saveSettings({ notificationsEnabled: settings.notificationsEnabled });
        toggleNotif.classList.toggle('on', settings.notificationsEnabled);
        NativeBridgeService.triggerLightHaptic();
      });

      // 提前量
      card.querySelectorAll('#advance-pills .pill-option').forEach(pill => {
        pill.addEventListener('click', () => {
          const m = parseInt(pill.getAttribute('data-mins') || '15', 10);
          settings.advanceMinutes = m;
          DutyStorage.saveSettings({ advanceMinutes: m });
          card.querySelectorAll('#advance-pills .pill-option').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          NativeBridgeService.triggerLightHaptic();
        });
      });

      // 提示音
      const toggleSound = card.querySelector('#toggle-sound');
      toggleSound?.addEventListener('click', () => {
        settings.alarmSoundEnabled = !settings.alarmSoundEnabled;
        DutyStorage.saveSettings({ alarmSoundEnabled: settings.alarmSoundEnabled });
        toggleSound.classList.toggle('on', settings.alarmSoundEnabled);
        NativeBridgeService.triggerLightHaptic();
      });

      // 强震动
      const toggleVibrate = card.querySelector('#toggle-vibrate');
      toggleVibrate?.addEventListener('click', () => {
        settings.strongVibrateEnabled = !settings.strongVibrateEnabled;
        DutyStorage.saveSettings({ strongVibrateEnabled: settings.strongVibrateEnabled });
        toggleVibrate.classList.toggle('on', settings.strongVibrateEnabled);
        NativeBridgeService.triggerLightHaptic();
      });

      // 时段提醒
      const toggleStart = card.querySelector('#toggle-start-alert');
      toggleStart?.addEventListener('click', () => {
        settings.onDutyStartAlert = !settings.onDutyStartAlert;
        DutyStorage.saveSettings({ onDutyStartAlert: settings.onDutyStartAlert });
        toggleStart.classList.toggle('on', settings.onDutyStartAlert);
        NativeBridgeService.triggerLightHaptic();
      });

      // 一键测试通知
      const testBtn = card.querySelector('#test-notif-btn') as HTMLElement;
      testBtn?.addEventListener('click', () => {
        NativeBridgeService.testNotification(
          'oxherd 值班巡更测试',
          '这是一条测试高优先级提醒，提示音与强震动正常运行！',
          settings.alarmSoundEnabled,
          settings.strongVibrateEnabled
        );
      });

      // 开机自启
      const toggleBoot = card.querySelector('#toggle-boot-restore');
      toggleBoot?.addEventListener('click', () => {
        settings.bootRestoreEnabled = !settings.bootRestoreEnabled;
        DutyStorage.saveSettings({ bootRestoreEnabled: settings.bootRestoreEnabled });
        toggleBoot.classList.toggle('on', settings.bootRestoreEnabled);
        NativeBridgeService.setBootRestoreEnabled(settings.bootRestoreEnabled);
        NativeBridgeService.triggerLightHaptic();
      });

      // 电池优化
      const batteryBtn = card.querySelector('#battery-opt-btn') as HTMLElement;
      batteryBtn?.addEventListener('click', async () => {
        await NativeBridgeService.requestIgnoreBatteryOptimization();
      });

      // 厂商自启动
      const vendorBtn = card.querySelector('#vendor-autostart-btn') as HTMLElement;
      vendorBtn?.addEventListener('click', async () => {
        const res = await NativeBridgeService.openVendorAutoStartSettings();
        if (!res.success) {
          alert(`已尝试唤起 ${res.vendor} 自启动管理界面。请在手机「设置 -> 应用管理 -> oxherd」中开启自启动和后台无限制保护。`);
        }
      });

      // 检查在线更新 (GitHub Releases API)
      const checkUpdateBtn = card.querySelector('#check-update-btn') as HTMLButtonElement;
      const checkUpdateText = card.querySelector('#check-update-btn-text') as HTMLElement;
      const resultBox = card.querySelector('#update-result-box') as HTMLElement;

      checkUpdateBtn?.addEventListener('click', async () => {
        NativeBridgeService.triggerLightHaptic();
        checkUpdateBtn.disabled = true;
        checkUpdateText.textContent = '检查中...';
        resultBox.style.display = 'block';
        resultBox.style.background = 'var(--bg-card)';
        resultBox.style.border = '1px solid var(--border-color)';
        resultBox.style.color = 'var(--text-muted)';
        resultBox.innerHTML = '正在连接 GitHub 检索最新版本...';

        try {
          const resp = await fetch('https://api.github.com/repos/EtoileZzz/test01/releases/latest', {
            headers: { 'Accept': 'application/vnd.github.v3+json' }
          });

          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
          }

          const data = await resp.json();
          const latestTag = (data.tag_name || '').replace(/^v/, '');
          const currentTag = APP_VERSION.replace(/^v/, '');

          const compareVersions = (v1: string, v2: string) => {
            const p1 = v1.split('.').map(n => parseInt(n, 10) || 0);
            const p2 = v2.split('.').map(n => parseInt(n, 10) || 0);
            for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
              const a = p1[i] || 0;
              const b = p2[i] || 0;
              if (a > b) return 1;
              if (a < b) return -1;
            }
            return 0;
          };

          const isNewer = compareVersions(latestTag, currentTag) > 0;

          if (isNewer) {
            const apkAsset = (data.assets || []).find((a: any) => a.name.endsWith('.apk'));
            const downloadUrl = apkAsset ? apkAsset.browser_download_url : data.html_url;

            resultBox.style.background = 'var(--accent-light)';
            resultBox.style.border = '1px solid var(--accent)';
            resultBox.style.color = 'var(--text-main)';
            resultBox.innerHTML = `
              <div style="font-weight:700; color:var(--accent); display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                <span>🎉 发现新版本 v${latestTag}</span>
                <span class="badge-pill" style="background:var(--accent); color:white; font-size:0.6875rem;">可升级</span>
              </div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; white-space:pre-wrap; max-height:120px; overflow-y:auto;">${data.body ? data.body.slice(0, 300) : '包含多项功能修复与界面优化'}</div>
              <a href="${downloadUrl}" target="_blank" rel="noopener noreferrer" class="icon-btn" style="width:100%; height:36px; background:var(--accent); color:white; font-weight:700; font-size:0.8125rem; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:6px; border:none;">
                ⬇️ 立即下载安装新版 APK (${apkAsset ? (apkAsset.size / 1024 / 1024).toFixed(1) + 'MB' : '最新版'})
              </a>
            `;
          } else {
            resultBox.style.background = 'var(--success-light)';
            resultBox.style.border = '1px solid var(--success)';
            resultBox.style.color = 'var(--success)';
            resultBox.innerHTML = `
              <div style="font-weight:700; display:flex; align-items:center; gap:6px;">
                <span>✅ 当前已是最新版本 (v${APP_VERSION})</span>
              </div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                恭喜，当前安装的已是最新稳定版本，无需更新。
              </div>
            `;
          }
        } catch (err: any) {
          resultBox.style.background = 'var(--bg-card)';
          resultBox.style.border = '1px solid var(--border-color)';
          resultBox.style.color = 'var(--text-main)';
          resultBox.innerHTML = `
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:6px;">
              网络连接受限或 GitHub 访问受阻。您可以直接前往 Releases 页面查看：
            </div>
            <a href="https://github.com/EtoileZzz/test01/releases" target="_blank" rel="noopener noreferrer" class="icon-btn" style="width:100%; height:32px; background:var(--bg-elevated); color:var(--text-main); font-size:0.75rem; font-weight:600; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:6px;">
              🌐 打开 GitHub Releases 页面 ↗
            </a>
          `;
        } finally {
          checkUpdateBtn.disabled = false;
          checkUpdateText.textContent = '重新检查';
        }
      });
    });
  }

  // ── 确认填写完报告后，专门打包归档照片与自动复位 ────────────────
  /**
   * 核心要求：“不用交班报告，只需要把值班过程中的照片分类存储到指定文件夹即可，确认填写完报告后打包归档”
   */
  static openPhotosArchiveCompletedModal(archiveData: {
    totalPhotos: number;
    postsCount: number;
    onResetAndRestart: () => void;
  }): void {
    const contentHtml = `
      <div style="text-align:center; padding:12px 0 16px;">
        <div style="width:60px; height:60px; border-radius:50%; background:var(--success-light); color:var(--success); display:flex; align-items:center; justify-content:center; margin:0 auto 12px;">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            <polyline points="12 11 12 17"></polyline>
            <polyline points="9 14 12 17 15 14"></polyline>
          </svg>
        </div>
        <h2 style="font-size:1.1875rem; font-weight:700;">巡检照片已分类打包归档！</h2>
        <p style="font-size:0.8125rem; color:var(--text-muted); margin-top:6px; line-height:1.5;">
          已将本次值班涉及的 <b>${archiveData.postsCount} 个岗位</b>、共 <b>${archiveData.totalPhotos} 张现场照片</b> 按岗位建立独立文件夹分类归纳，并自动生成 ZIP 压缩包下载保存。
        </p>
      </div>

      <div class="settings-group" style="padding:12px; font-size:0.8125rem; color:var(--text-main);">
        <div style="font-weight:600; margin-bottom:4px;">📁 照片分类归档路径示意：</div>
        <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted); line-height:1.6;">
          • [岗位名称]/[条目名称]_[拍摄时间].jpg<br>
          • 压缩包已保存至手机文件/下载目录
        </div>
      </div>

      <div style="margin-top:12px;">
        <button class="icon-btn" id="finish-reset-btn" style="width:100%; height:46px; font-weight:700; font-size:0.9375rem; background:var(--text-main); color:var(--bg-main); border:none; gap:6px;">
          🔄 归档并刷新，就绪下一次值班
        </button>
      </div>
    `;

    const close = this.openSheet('值班照片分类打包完成', contentHtml, (card) => {
      const resetBtn = card.querySelector('#finish-reset-btn') as HTMLElement;
      resetBtn?.addEventListener('click', () => {
        close();
        archiveData.onResetAndRestart();
      });
    });
  }

  // ── 新建空白值班模态框 ──────────────────────────────────────────
  static openCreateTaskModal(onTaskCreated: (task: DutyTask) => void): void {
    const contentHtml = `
      <div class="settings-group">
        <div class="settings-group-title">✨ 创建全新空白值班任务</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">
          纯净空白初始态。创建后在主界面点击「添加巡查条目」即可自由添加。
        </div>
        <input type="text" id="custom-task-title" placeholder="输入值班任务名称 (如: 图书馆常规值班)" 
          style="width:100%; padding:10px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); font-size:0.875rem;" />
        
        <div style="display:flex; gap:8px; margin-top:8px;">
          <input type="text" id="custom-shift-name" placeholder="班次名称 (如: 早班/晚班)" value="全天班"
            style="width:140px; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); font-size:0.875rem;" />
          <button class="icon-btn" id="create-empty-task-btn" style="flex:1; height:40px; font-weight:600; font-size:0.875rem; background:var(--accent); color:white; border:none;">
            立即创建空白值班
          </button>
        </div>
      </div>
    `;

    const close = this.openSheet('新建值班任务', contentHtml, (card) => {
      const emptyBtn = card.querySelector('#create-empty-task-btn') as HTMLElement;
      const input = card.querySelector('#custom-task-title') as HTMLInputElement;
      const shiftInput = card.querySelector('#custom-shift-name') as HTMLInputElement;

      emptyBtn?.addEventListener('click', () => {
        const title = input.value.trim() || '日常值班巡查';
        const shift = shiftInput.value.trim() || '全天班';
        const task = DutyStorage.createEmptyTask(title, shift);
        NativeBridgeService.triggerLightHaptic();
        close();
        onTaskCreated(task);
      });
    });
  }
}
