import { DutyStorage } from '../storage/db';
import { NativeBridgeService } from '../services/nativeBridge';
import type { DutyTask, UserSettings, DutyPost, DutyItem } from '../models/types';

export class ModalManager {
  // ── 通用创建与销毁模态框 ──────────────────────────────────────
  static openSheet(title: string, contentHtml: string, onMounted?: (card: HTMLElement) => void): () => void {
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

    requestAnimationFrame(() => {
      overlay.classList.add('open');
    });

    const closeBtn = overlay.querySelector('#modal-close-btn') as HTMLElement;

    function close() {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 280);
    }

    closeBtn.onclick = close;
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };

    if (onMounted) {
      onMounted(overlay.querySelector('#active-sheet-card') as HTMLElement);
    }

    return close;
  }

  // ── 岗位在设置中切换、条目自由排列、属性转换与时段微调 ─────────
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
                <div class="post-item-title">${post.name} ${isActive ? '📍 (当前值班中)' : ''}</div>
                <div class="post-item-sub">${items.length} 个条目 · 已核验 ${done} 个</div>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                <span class="brand-badge">${items.length > 0 ? Math.round((done / items.length) * 100) : 0}%</span>
                <button class="icon-btn edit-post-btn" data-post-id="${post.id}" title="重命名" style="width:28px; height:28px;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                  </svg>
                </button>
              </div>
            </div>
          `;
        })
        .join('');
    };

    const renderItemsManagement = () => {
      if (!currentPost || postItems.length === 0) {
        return `
          <div style="text-align:center; padding:16px; color:var(--text-muted); font-size:0.8125rem;">
            当前岗位暂无巡检条目，请在下方点击「+ 添加新条目」自由创建
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
              <!-- 标题行与排序移动 -->
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                <div style="font-weight:600; font-size:0.875rem; color:var(--text-main); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  <span style="color:var(--text-muted); font-size:0.75rem; margin-right:4px;">#${idx + 1}</span>
                  ${item.title}
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                  <!-- 上移 -->
                  <button class="icon-btn move-up-btn" data-item-id="${item.id}" ${isFirst ? 'disabled style="opacity:0.3;"' : ''} style="width:28px; height:28px;" title="上移">
                    ▲
                  </button>
                  <!-- 下移 -->
                  <button class="icon-btn move-down-btn" data-item-id="${item.id}" ${isLast ? 'disabled style="opacity:0.3;"' : ''} style="width:28px; height:28px;" title="下移">
                    ▼
                  </button>
                  <!-- 删除条目 -->
                  <button class="icon-btn del-item-btn" data-item-id="${item.id}" style="width:28px; height:28px; color:var(--danger);" title="删除">
                    ✕
                  </button>
                </div>
              </div>

              <!-- 属性转换：常规待办 ↔ 时段巡查 -->
              <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 0; border-top:1px dashed var(--border-color); border-bottom:1px dashed var(--border-color); margin:6px 0;">
                <div style="font-size:0.75rem; color:var(--text-muted); display:flex; align-items:center; gap:6px;">
                  <span>条目属性：</span>
                  <span class="brand-badge" style="background:${isScheduled ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-card-subtle)'}; color:${isScheduled ? 'var(--accent)' : 'var(--text-muted)'};">
                    ${isScheduled ? '⏰ 时段巡查' : '📝 常规待办'}
                  </span>
                </div>
                <button class="icon-btn toggle-type-btn" data-item-id="${item.id}" style="width:auto; height:26px; padding:0 8px; font-size:0.6875rem; font-weight:600;">
                  🔄 切换为${isScheduled ? '常规待办' : '时段巡查'}
                </button>
              </div>

              <!-- 若为时段巡查，显示时间微调 -->
              ${
                isScheduled
                  ? `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 0; font-size:0.75rem;">
                  <span style="color:var(--text-muted);">巡查时段：</span>
                  <div style="display:flex; align-items:center; gap:4px;">
                    <input type="time" class="time-input start-time-input" data-item-id="${item.id}" value="${item.startTime || '09:00'}" 
                      style="padding:3px 6px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main); font-size:0.75rem; font-family:var(--font-mono);" />
                    <span>至</span>
                    <input type="time" class="time-input end-time-input" data-item-id="${item.id}" value="${item.endTime || '11:30'}" 
                      style="padding:3px 6px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main); font-size:0.75rem; font-family:var(--font-mono);" />
                  </div>
                </div>
              `
                  : ''
              }

              <!-- 拍照要求开关 -->
              <div style="display:flex; align-items:center; justify-content:space-between; padding-top:4px; font-size:0.75rem;">
                <span style="color:var(--text-muted);">${item.requirePhoto ? '📷 巡检必须拍照' : '无需拍照'}</span>
                <div class="toggle-switch ${item.requirePhoto ? 'on' : ''}" data-toggle-photo-item="${item.id}" style="width:36px; height:20px;">
                  <div class="toggle-knob" style="width:16px; height:16px;"></div>
                </div>
              </div>
            </div>
          `;
        })
        .join('');
    };

    const contentHtml = `
      <!-- 岗位切换 -->
      <div class="settings-group">
        <div class="settings-group-title">🎯 切换值班岗位（点击即换）</div>
        <div id="posts-switch-list" style="display:flex; flex-direction:column; gap:8px;">
          ${renderPosts()}
        </div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <input type="text" id="new-post-name-input" placeholder="输入新岗位名称 (如: 3楼阅览室)" 
            style="flex:1; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); font-size:0.875rem;" />
          <button class="icon-btn" id="add-post-btn" style="width:auto; padding:0 14px; font-weight:600; font-size:0.8125rem; background:var(--accent); color:white; border:none;">
            + 新增岗位
          </button>
        </div>
      </div>

      <!-- 条目自由排列与显示管理 -->
      <div class="settings-group" style="margin-top:12px;">
        <div class="settings-group-title">📐 [${currentPost?.name || '当前岗位'}] 条目排列与属性管理</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">
          支持自由上移/下移排序、时段巡查与常规待办一键转换、起止时间快捷微调。
        </div>

        <div id="items-mgmt-list">
          ${renderItemsManagement()}
        </div>

        <!-- 自由新增条目 -->
        <div style="display:flex; gap:8px; margin-top:8px;">
          <input type="text" id="new-item-title-input" placeholder="添加新巡查条目名称..." 
            style="flex:1; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); font-size:0.875rem;" />
          <button class="icon-btn" id="add-item-btn" style="width:auto; padding:0 14px; font-weight:600; font-size:0.8125rem; background:var(--accent); color:white; border:none;">
            + 添加条目
          </button>
        </div>
      </div>
    `;

    const close = this.openSheet('岗位与条目显示管理', contentHtml, (card) => {
      // 切换岗位
      card.querySelectorAll('.post-switch-item').forEach(el => {
        el.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('.edit-post-btn')) return;
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

      // 上移条目 [ ▲ 上移 ]
      card.querySelectorAll('.move-up-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const itemId = btn.getAttribute('data-item-id');
          if (itemId && DutyStorage.moveItemOrder(task, itemId, 'up')) {
            NativeBridgeService.triggerLightHaptic();
            onTaskUpdated();
            close();
            ModalManager.openPostSettingsModal(task, onSelectPost, onTaskUpdated);
          }
        });
      });

      // 下移条目 [ ▼ 下移 ]
      card.querySelectorAll('.move-down-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const itemId = btn.getAttribute('data-item-id');
          if (itemId && DutyStorage.moveItemOrder(task, itemId, 'down')) {
            NativeBridgeService.triggerLightHaptic();
            onTaskUpdated();
            close();
            ModalManager.openPostSettingsModal(task, onSelectPost, onTaskUpdated);
          }
        });
      });

      // 删除条目
      card.querySelectorAll('.del-item-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const itemId = btn.getAttribute('data-item-id');
          if (itemId && confirm('确定删除该检查条目吗？')) {
            task.items = task.items.filter(i => i.id !== itemId);
            DutyStorage.saveTask(task);
            NativeBridgeService.triggerLightHaptic();
            onTaskUpdated();
            close();
            ModalManager.openPostSettingsModal(task, onSelectPost, onTaskUpdated);
          }
        });
      });

      // 一键转换属性 (时段巡查 ↔ 常规待办)
      card.querySelectorAll('.toggle-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const itemId = btn.getAttribute('data-item-id');
          if (itemId && DutyStorage.toggleItemType(task, itemId)) {
            NativeBridgeService.triggerLightHaptic();
            onTaskUpdated();
            close();
            ModalManager.openPostSettingsModal(task, onSelectPost, onTaskUpdated);
          }
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

      // 切换是否拍照
      card.querySelectorAll('[data-toggle-photo-item]').forEach(toggle => {
        toggle.addEventListener('click', () => {
          const itemId = toggle.getAttribute('data-toggle-photo-item');
          const item = task.items.find(i => i.id === itemId);
          if (item) {
            item.requirePhoto = !item.requirePhoto;
            DutyStorage.saveTask(task);
            toggle.classList.toggle('on', item.requirePhoto);
            NativeBridgeService.triggerLightHaptic();
            onTaskUpdated();
          }
        });
      });

      // 添加新条目
      const addItemBtn = card.querySelector('#add-item-btn') as HTMLElement;
      const itemTitleInput = card.querySelector('#new-item-title-input') as HTMLInputElement;
      addItemBtn?.addEventListener('click', () => {
        const title = itemTitleInput.value.trim();
        if (!title || !currentPost) return;
        const newItem: DutyItem = {
          id: `item_${currentPost.id}_${Date.now()}`,
          postId: currentPost.id,
          title,
          itemType: 'STANDARD',
          requirePhoto: false,
          photos: [],
          isCompleted: false,
          completedAt: null,
          subItems: [],
          isExpanded: false
        };
        task.items.push(newItem);
        DutyStorage.saveTask(task);
        NativeBridgeService.triggerLightHaptic();
        onTaskUpdated();
        close();
        ModalManager.openPostSettingsModal(task, onSelectPost, onTaskUpdated);
      });
    });
  }

  // ── 系统设置：通知唤醒、开机保活、协同外链、JSON导入导出 ────────
  static async openSystemSettingsModal(task: DutyTask | null, onSettingsChanged: () => void): Promise<void> {
    const settings = DutyStorage.getSettings();
    const isBatteryIgnored = await NativeBridgeService.isBatteryOptimizationIgnored();
    const vendorInfo = await NativeBridgeService.getVendorInfo();

    const contentHtml = `
      <!-- 主题模式设置 -->
      <div class="settings-group">
        <div class="settings-group-title">🎨 外观主题模式</div>
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
      </div>

      <!-- 交班协同外链设置 -->
      <div class="settings-group">
        <div class="settings-group-title">🔗 交班协同外链与快捷跳转</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">
          预设值班交班链接或协同软件（如 TIM/微信），确认交班后一键直接跳转汇报。
        </div>
        <input type="url" id="handover-url-input" value="${settings.handoverExternalUrl || ''}" placeholder="粘贴交班表单/文档链接 (https://...)" 
          style="width:100%; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); font-size:0.8125rem;" />
        <div style="display:flex; gap:8px; margin-top:6px;">
          <button class="icon-btn save-handover-url-btn" style="flex:1; height:34px; font-size:0.75rem; font-weight:600; background:var(--accent); color:white; border:none;">
            💾 保存交班外链设置
          </button>
        </div>
      </div>

      <!-- 配置文件导入导出 -->
      <div class="settings-group">
        <div class="settings-group-title">📦 配置文件导入导出（标准 JSON）</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:6px;">
          采用标准 JSON 封装所有岗位、主项、时段及子条目，支持保存至手机或直接分享到微信/TIM。
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; gap:8px;">
            <button class="icon-btn" id="export-json-file-btn" style="flex:1; height:38px; font-size:0.8125rem; font-weight:600;">
              💾 保存至手机文件
            </button>
            <button class="icon-btn" id="share-json-btn" style="flex:1; height:38px; font-size:0.8125rem; font-weight:600; background:var(--accent-light); color:var(--accent);">
              📲 一键分享到微信/TIM
            </button>
          </div>
          <button class="icon-btn" id="import-json-btn" style="width:100%; height:38px; font-size:0.8125rem; font-weight:600; background:var(--bg-elevated);">
            📂 从手机选取 JSON 导入（带合法性统计预览）
          </button>
          <input type="file" id="json-file-input" accept=".json" style="display:none;" />
        </div>
      </div>

      <!-- 通知唤醒全参数自定义 -->
      <div class="settings-group">
        <div class="settings-group-title">🔔 通知唤醒全参数设置</div>
        
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
          <button class="icon-btn" id="vendor-autostart-btn" style="width:auto; height:32px; padding:0 12px; font-size:0.75rem; font-weight:600; background:var(--bg-elevated);">
            直达设置 ↗
          </button>
        </div>
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
        alert('交班协同外链已保存！');
      });

      // 保存至手机文件 (JSON)
      const exportFileBtn = card.querySelector('#export-json-file-btn');
      exportFileBtn?.addEventListener('click', () => {
        if (!task) return;
        const json = DutyStorage.exportDutyConfig(task);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `oxherd_duty_config_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        NativeBridgeService.triggerLightHaptic();
      });

      // 一键分享到微信 / TIM
      const shareBtn = card.querySelector('#share-json-btn');
      shareBtn?.addEventListener('click', async () => {
        if (!task) return;
        const json = DutyStorage.exportDutyConfig(task);
        const fileName = `oxherd_config_${task.title.substring(0, 10)}.json`;

        if (navigator.share) {
          try {
            const file = new File([json], fileName, { type: 'application/json' });
            await navigator.share({
              title: 'oxherd 值班巡检配置文件',
              text: `分享「${task.title}」值班配置文件，直接在 oxherd 中导入即可。`,
              files: [file]
            });
            return;
          } catch (e) {
            console.log('文件分享取消或失败，降级为文本分享', e);
          }
        }

        // 剪贴板兜底
        navigator.clipboard.writeText(json).then(() => {
          alert('配置 JSON 已复制到剪贴板！可直接粘贴发送给同事在微信/TIM中使用。');
          NativeBridgeService.triggerLightHaptic();
        });
      });

      // 选取 JSON 导入（带合法性统计预览与覆盖确认）
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
            alert('配置已成功导入覆盖！页面即将刷新呈现。');
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
    });
  }

  // ── 交班完成总结报告、协同外链一键跳转与自动归档 ──────────────
  static openHandoverSummaryModal(archiveData: {
    summaryText: string;
    taskTitle: string;
    totalPhotos: number;
    onResetAndRestart: () => void;
  }): void {
    const settings = DutyStorage.getSettings();
    const hasExternalUrl = !!settings.handoverExternalUrl;

    const contentHtml = `
      <div style="text-align:center; padding:10px 0 16px;">
        <div style="width:56px; height:56px; border-radius:50%; background:var(--success-light); color:var(--success); display:flex; align-items:center; justify-content:center; margin:0 auto 12px;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h2 style="font-size:1.25rem; font-weight:700;">值班巡查已全部完成！</h2>
        <p style="font-size:0.8125rem; color:var(--text-muted); margin-top:4px;">
          交班报告已自动复制到剪贴板，巡检照片已自动打包为 ZIP 归档包。
        </p>
      </div>

      <!-- 交班协同外链一键跳转 -->
      ${
        hasExternalUrl
          ? `
        <div style="margin-bottom:12px;">
          <button class="icon-btn" id="jump-external-btn" style="width:100%; height:46px; font-weight:700; font-size:0.9375rem; background:linear-gradient(90deg, #2563EB, #38BDF8); color:white; border:none; gap:8px;">
            🚀 一键跳转预设交班链接汇报
            <span style="font-size:0.75rem; opacity:0.85;">(自动携带剪贴板报告)</span>
          </button>
        </div>
      `
          : ''
      }

      <!-- 协同软件快捷跳转 -->
      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <button class="icon-btn" id="jump-wechat-btn" style="flex:1; height:38px; font-size:0.8125rem; font-weight:600; background:#07C160; color:white; border:none;">
          💬 唤起微信
        </button>
        <button class="icon-btn" id="jump-tim-btn" style="flex:1; height:38px; font-size:0.8125rem; font-weight:600; background:#12B7F5; color:white; border:none;">
          💬 唤起 TIM / QQ
        </button>
      </div>

      <div class="settings-group">
        <div class="settings-group-title">📋 值班交班总结报告</div>
        <textarea id="summary-textarea" readonly style="width:100%; height:140px; font-family:var(--font-mono); font-size:0.75rem; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); resize:none;">${archiveData.summaryText}</textarea>
        <button class="icon-btn" id="copy-summary-btn" style="width:100%; height:38px; font-weight:600; font-size:0.8125rem; background:var(--accent); color:white; border:none; gap:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          重新复制报告内容
        </button>
      </div>

      <div style="margin-top:12px;">
        <button class="icon-btn" id="reset-restart-btn" style="width:100%; height:46px; font-weight:700; font-size:0.9375rem; background:var(--text-main); color:var(--bg-main); border:none; gap:6px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
          归档并刷新，就绪下一次值班
        </button>
      </div>
    `;

    // 默认自动将报告复制到剪贴板，方便跳转后直接粘贴
    try {
      navigator.clipboard.writeText(archiveData.summaryText);
    } catch (e) {}

    const close = this.openSheet('值班归档与交班汇报', contentHtml, (card) => {
      // 跳转预设外链
      const jumpExtBtn = card.querySelector('#jump-external-btn');
      jumpExtBtn?.addEventListener('click', () => {
        if (settings.handoverExternalUrl) {
          window.open(settings.handoverExternalUrl, '_blank');
        }
      });

      // 唤起微信
      const jumpWechatBtn = card.querySelector('#jump-wechat-btn');
      jumpWechatBtn?.addEventListener('click', () => {
        window.location.href = 'weixin://';
      });

      // 唤起 TIM / QQ
      const jumpTimBtn = card.querySelector('#jump-tim-btn');
      jumpTimBtn?.addEventListener('click', () => {
        window.location.href = 'mqqapi://';
      });

      // 复制报告
      const copyBtn = card.querySelector('#copy-summary-btn') as HTMLElement;
      const textarea = card.querySelector('#summary-textarea') as HTMLTextAreaElement;
      copyBtn?.addEventListener('click', () => {
        navigator.clipboard.writeText(textarea.value).then(() => {
          copyBtn.textContent = '✅ 已成功复制！';
          NativeBridgeService.triggerLightHaptic();
          setTimeout(() => {
            copyBtn.textContent = '重新复制报告内容';
          }, 2000);
        });
      });

      // 归档并刷新
      const resetBtn = card.querySelector('#reset-restart-btn') as HTMLElement;
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
          完全纯净自定义，不带任何预设。创建后可在岗位设置中自由增删改岗位与检查条目。
        </div>
        <input type="text" id="custom-task-title" placeholder="输入值班任务名称 (如: 图书馆夜班巡更)" 
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
