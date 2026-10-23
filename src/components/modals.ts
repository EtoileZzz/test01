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

    // 触发打开动画
    requestAnimationFrame(() => {
      overlay.classList.add('open');
    });

    const closeBtn = overlay.querySelector('#modal-close-btn') as HTMLElement;
    const card = overlay.querySelector('#active-sheet-card') as HTMLElement;

    function close() {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 280);
    }

    closeBtn.onclick = close;
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };

    if (onMounted) {
      onMounted(card);
    }

    return close;
  }

  // ── 岗位在设置中切换与条目拍照配置 ──────────────────────────────
  static openPostSettingsModal(
    task: DutyTask,
    onSelectPost: (postId: string) => void,
    onTaskUpdated: () => void
  ): void {
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
                <div class="post-item-sub">${items.length} 个巡检条目 · 已核验 ${done} 个</div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="brand-badge">${Math.round(items.length > 0 ? (done / items.length) * 100 : 0)}%</span>
                <button class="icon-btn edit-post-btn" data-post-id="${post.id}" style="width:30px; height:30px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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

    // 当前选中岗位的拍照要求设置列表
    const currentPost = task.posts.find(p => p.id === task.currentPostId) || task.posts[0];
    const postItems = task.items.filter(i => i.postId === currentPost?.id);

    const renderItemPhotoConfigs = () => {
      if (!currentPost || postItems.length === 0) {
        return `<p style="font-size:0.8125rem; color:var(--text-muted);">当前岗位暂无检查条目</p>`;
      }
      return postItems
        .map(item => `
          <div class="settings-row" style="border-bottom: 1px dashed var(--border-color); padding: 8px 0;">
            <div class="settings-row-label">
              <span class="settings-main-label">${item.title}</span>
              <span class="settings-sub-label">${item.requirePhoto ? '📷 巡检要求拍照凭证' : '无需拍照，勾选或滑动划去即可'}</span>
            </div>
            <div class="toggle-switch ${item.requirePhoto ? 'on' : ''}" data-toggle-photo-item="${item.id}">
              <div class="toggle-knob"></div>
            </div>
          </div>
        `)
        .join('');
    };

    const contentHtml = `
      <div class="settings-group">
        <div class="settings-group-title">🎯 切换当前值班岗位（点击即换）</div>
        <div id="posts-switch-list" style="display:flex; flex-direction:column; gap:8px;">
          ${renderPosts()}
        </div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <input type="text" id="new-post-name-input" placeholder="输入新岗位名称 (如: 6楼天台机房)" 
            style="flex:1; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); font-size:0.875rem;" />
          <button class="icon-btn" id="add-post-btn" style="width:auto; padding:0 14px; font-weight:600; font-size:0.8125rem; background:var(--accent); color:white; border:none;">
            + 新增岗位
          </button>
        </div>
      </div>

      <div class="settings-group" style="margin-top:12px;">
        <div class="settings-group-title">📷 岗位 [${currentPost?.name || ''}] 的条目拍照配置</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">
          开启后，该条目必须拍摄现场照片方可完成核验，照片将自动分类归档。
        </div>
        <div id="item-photos-config-list">
          ${renderItemPhotoConfigs()}
        </div>
      </div>
    `;

    const close = this.openSheet('岗位设置与切换', contentHtml, (card) => {
      // 点击切换岗位
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
      const addBtn = card.querySelector('#add-post-btn') as HTMLElement;
      const input = card.querySelector('#new-post-name-input') as HTMLInputElement;
      if (addBtn && input) {
        addBtn.onclick = () => {
          const name = input.value.trim();
          if (!name) return;
          const newPostId = `post_${task.id}_${Date.now()}`;
          const newPost: DutyPost = {
            id: newPostId,
            taskId: task.id,
            name,
            sortOrder: task.posts.length
          };
          task.posts.push(newPost);
          task.currentPostId = newPostId;
          DutyStorage.saveTask(task);
          NativeBridgeService.triggerLightHaptic();
          onTaskUpdated();
          close();
        };
      }

      // 编辑岗位名称
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

      // 切换条目是否需要拍照
      card.querySelectorAll('[data-toggle-photo-item]').forEach(toggle => {
        toggle.addEventListener('click', () => {
          const itemId = toggle.getAttribute('data-toggle-photo-item');
          const item = task.items.find(i => i.id === itemId);
          if (item) {
            item.requirePhoto = !item.requirePhoto;
            DutyStorage.saveTask(task);
            toggle.classList.toggle('on', item.requirePhoto);
            const subLabel = toggle.parentElement?.querySelector('.settings-sub-label');
            if (subLabel) {
              subLabel.textContent = item.requirePhoto ? '📷 巡检要求拍照凭证' : '无需拍照，勾选或滑动划去即可';
            }
            NativeBridgeService.triggerLightHaptic();
            onTaskUpdated();
          }
        });
      });
    });
  }

  // ── 系统设置与通知唤醒配置 ────────────────────────────────────
  static async openSystemSettingsModal(onSettingsChanged: () => void): Promise<void> {
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

      <!-- 数据备份 -->
      <div class="settings-group">
        <div class="settings-group-title">💾 数据安全与备份</div>
        <div style="display:flex; gap:10px;">
          <button class="icon-btn" id="export-data-btn" style="flex:1; height:38px; font-size:0.8125rem; font-weight:600;">
            导出备份 (JSON)
          </button>
          <button class="icon-btn" id="import-data-btn" style="flex:1; height:38px; font-size:0.8125rem; font-weight:600;">
            导入备份
          </button>
          <input type="file" id="import-file-input" accept=".json" style="display:none;" />
        </div>
      </div>
    `;

    this.openSheet('应用全参数设置', contentHtml, (card) => {
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

      // 导出与导入
      const exportBtn = card.querySelector('#export-data-btn') as HTMLElement;
      exportBtn?.addEventListener('click', () => {
        const json = DutyStorage.exportAllData();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `oxherd_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });

      const importBtn = card.querySelector('#import-data-btn') as HTMLElement;
      const fileInput = card.querySelector('#import-file-input') as HTMLInputElement;
      importBtn?.addEventListener('click', () => fileInput.click());
      fileInput?.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          if (content && DutyStorage.importAllData(content)) {
            alert('数据导入成功！页面即将刷新。');
            window.location.reload();
          } else {
            alert('导入失败，请检查文件格式。');
          }
        };
        reader.readAsText(file);
      });
    });
  }

  // ── 交班完成总结报告与自动归档模态框 ────────────────────────────
  static openHandoverSummaryModal(archiveData: {
    summaryText: string;
    taskTitle: string;
    totalPhotos: number;
    onResetAndRestart: () => void;
  }): void {
    const contentHtml = `
      <div style="text-align:center; padding:10px 0 16px;">
        <div style="width:56px; height:56px; border-radius:50%; background:var(--success-light); color:var(--success); display:flex; align-items:center; justify-content:center; margin:0 auto 12px;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h2 style="font-size:1.25rem; font-weight:700;">值班巡查已全部完成！</h2>
        <p style="font-size:0.8125rem; color:var(--text-muted); margin-top:4px;">
          巡查记录与 ${archiveData.totalPhotos} 张现场照片已自动分类打包为 ZIP 归档包。
        </p>
      </div>

      <div class="settings-group">
        <div class="settings-group-title">📋 值班交班总结报告</div>
        <textarea id="summary-textarea" readonly style="width:100%; height:160px; font-family:var(--font-mono); font-size:0.75rem; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); resize:none;">${archiveData.summaryText}</textarea>
        <button class="icon-btn" id="copy-summary-btn" style="width:100%; height:40px; font-weight:600; font-size:0.875rem; background:var(--accent); color:white; border:none; gap:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          一键复制报告（便于填报值班链接 / 工作群）
        </button>
      </div>

      <div style="margin-top:12px;">
        <button class="icon-btn" id="reset-restart-btn" style="width:100%; height:48px; font-weight:700; font-size:0.9375rem; background:var(--text-main); color:var(--bg-main); border:none; gap:6px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
          归档并刷新，就绪下一次值班
        </button>
      </div>
    `;

    const close = this.openSheet('值班归档与交班总结', contentHtml, (card) => {
      const copyBtn = card.querySelector('#copy-summary-btn') as HTMLElement;
      const textarea = card.querySelector('#summary-textarea') as HTMLTextAreaElement;

      copyBtn?.addEventListener('click', () => {
        navigator.clipboard.writeText(textarea.value).then(() => {
          copyBtn.textContent = '✅ 已复制到剪贴板！可直接粘贴至值班链接';
          NativeBridgeService.triggerLightHaptic();
          setTimeout(() => {
            copyBtn.innerHTML = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              一键复制报告（便于填报值班链接 / 工作群）
            `;
          }, 2500);
        });
      });

      const resetBtn = card.querySelector('#reset-restart-btn') as HTMLElement;
      resetBtn?.addEventListener('click', () => {
        close();
        archiveData.onResetAndRestart();
      });
    });
  }

  // ── 值班模板选择与新建任务模态框 ────────────────────────────────
  static openCreateTaskModal(onTaskCreated: (task: DutyTask) => void): void {
    const templates = DutyStorage.getTemplates();

    const tplHtml = templates
      .map(t => `
        <div class="post-switch-item" data-tpl-id="${t.id}" style="cursor:pointer;">
          <div class="post-item-info">
            <div class="post-item-title">${t.name}</div>
            <div class="post-item-sub">${t.description}</div>
            <div style="font-size:0.6875rem; color:var(--accent); margin-top:4px;">
              预设 ${t.posts.length} 个岗位 (${t.posts.map(p => p.name.split(' ')[0]).join(' / ')})
            </div>
          </div>
          <button class="icon-btn" style="width:auto; height:32px; padding:0 12px; font-size:0.75rem; font-weight:600; background:var(--accent); color:white; border:none;">
            使用模板
          </button>
        </div>
      `)
      .join('');

    const contentHtml = `
      <div class="settings-group">
        <div class="settings-group-title">📋 从“值班模板库”一键快速生成</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${tplHtml}
        </div>
      </div>

      <div class="settings-group" style="margin-top:12px;">
        <div class="settings-group-title">✨ 创建自定义临时值班</div>
        <input type="text" id="custom-task-title" placeholder="输入值班任务名称 (如: 图书馆周末特勤)" 
          style="width:100%; padding:10px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); font-size:0.875rem;" />
        <button class="icon-btn" id="create-empty-task-btn" style="width:100%; height:40px; font-weight:600; font-size:0.875rem; background:var(--bg-elevated); color:var(--text-main); margin-top:6px;">
          创建空白值班任务
        </button>
      </div>
    `;

    const close = this.openSheet('创建值班任务', contentHtml, (card) => {
      // 模板创建
      card.querySelectorAll('[data-tpl-id]').forEach(el => {
        el.addEventListener('click', () => {
          const tplId = el.getAttribute('data-tpl-id');
          if (tplId) {
            const task = DutyStorage.createTaskFromTemplate(tplId);
            NativeBridgeService.triggerLightHaptic();
            close();
            onTaskCreated(task);
          }
        });
      });

      // 自定义创建
      const emptyBtn = card.querySelector('#create-empty-task-btn') as HTMLElement;
      const input = card.querySelector('#custom-task-title') as HTMLInputElement;
      emptyBtn?.addEventListener('click', () => {
        const title = input.value.trim() || '日常值班巡查';
        const task = DutyStorage.createEmptyTask(title);
        NativeBridgeService.triggerLightHaptic();
        close();
        onTaskCreated(task);
      });
    });
  }
}
