import JSZip from 'jszip';
import { NativeBridgeService } from '../services/nativeBridge';
import type { DutyTask, DutyTemplate, UserSettings, DutyArchive, DutyPost, DutyItem, DutySubItem } from '../models/types';

const STORAGE_KEYS = {
  SETTINGS: 'oxherd_user_settings_v3',
  TASKS: 'oxherd_tasks_v3',
  CURRENT_TASK_ID: 'oxherd_current_task_id_v3',
  TEMPLATES: 'oxherd_templates_v3',
  ARCHIVES: 'oxherd_archives_v3'
};

const LEGACY_STORAGE_KEYS = {
  TASKS: ['oxherd_tasks_v3', 'oxherd_tasks_v2', 'oxherd_tasks_v1', 'oxherd_tasks'],
  SETTINGS: ['oxherd_user_settings_v3', 'oxherd_user_settings_v2', 'oxherd_user_settings_v1', 'oxherd_user_settings'],
  CURRENT_TASK_ID: ['oxherd_current_task_id_v3', 'oxherd_current_task_id_v2', 'oxherd_current_task_id_v1', 'oxherd_current_task_id'],
  ARCHIVES: ['oxherd_archives_v3', 'oxherd_archives_v2', 'oxherd_archives_v1', 'oxherd_archives']
};

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  notificationsEnabled: true,
  advanceMinutes: 15,
  alarmSoundEnabled: true,
  strongVibrateEnabled: true,
  onDutyStartAlert: true,
  bootRestoreEnabled: true,
  autoArchiveZip: true,
  handoverExternalUrl: '',
  handoverTarget: 'url',
  subItemSpaceAutoSwitch: true,
  autoFoldUncompleted: false,
  subItemCompleteMode: 'click',
  themeColor: ''
};

export interface ConfigImportStats {
  postsCount: number;
  itemsCount: number;
  scheduledCount: number;
  subItemsCount: number;
  title: string;
}

export class DutyStorage {
  /**
   * 应用启动时初始化并执行多版本兼容迁移与原生金库数据还原
   * 彻底解决应用更新后数据丢失问题
   */
  static async init(): Promise<void> {
    // 1. 迁移旧版 LocalStorage Key 数据
    this.migrateLegacyKeys();

    // 2. 如果 LocalStorage 为空（如更新 APK 导致 WebView 缓存被重置），从原生 SharedPreferences 金库恢复
    if (this.getTasks().length === 0) {
      try {
        const nativeTasks = await NativeBridgeService.restoreData('oxherd_tasks');
        if (nativeTasks) {
          const parsed = JSON.parse(nativeTasks);
          if (Array.isArray(parsed) && parsed.length > 0) {
            localStorage.setItem(STORAGE_KEYS.TASKS, nativeTasks);
            console.log('✅ 已成功从 Android 原生持久化金库恢复历史任务！');
          }
        }
      } catch (e) {}
    }

    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      try {
        const nativeSettings = await NativeBridgeService.restoreData('oxherd_settings');
        if (nativeSettings) {
          localStorage.setItem(STORAGE_KEYS.SETTINGS, nativeSettings);
        }
      } catch (e) {}
    }
  }

  static migrateLegacyKeys(): void {
    try {
      if (!localStorage.getItem(STORAGE_KEYS.TASKS)) {
        for (const k of LEGACY_STORAGE_KEYS.TASKS) {
          const val = localStorage.getItem(k);
          if (val) {
            localStorage.setItem(STORAGE_KEYS.TASKS, val);
            break;
          }
        }
      }

      if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
        for (const k of LEGACY_STORAGE_KEYS.SETTINGS) {
          const val = localStorage.getItem(k);
          if (val) {
            localStorage.setItem(STORAGE_KEYS.SETTINGS, val);
            break;
          }
        }
      }

      if (!localStorage.getItem(STORAGE_KEYS.CURRENT_TASK_ID)) {
        for (const k of LEGACY_STORAGE_KEYS.CURRENT_TASK_ID) {
          const val = localStorage.getItem(k);
          if (val) {
            localStorage.setItem(STORAGE_KEYS.CURRENT_TASK_ID, val);
            break;
          }
        }
      }
    } catch (e) {}
  }

  // ── 用户设置 ──────────────────────────────────────────────
  static getSettings(): UserSettings {
    try {
      this.migrateLegacyKeys();
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (raw) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('读取设置失败', e);
    }
    return DEFAULT_SETTINGS;
  }

  static saveSettings(settings: Partial<UserSettings>): UserSettings {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    const jsonStr = JSON.stringify(updated);
    localStorage.setItem(STORAGE_KEYS.SETTINGS, jsonStr);
    // 同步到 Android 原生持久化金库（更新安装绝不丢失）
    NativeBridgeService.backupData('oxherd_settings', jsonStr);
    return updated;
  }

  // ── 任务管理（初始空白纯净态，无任何硬编码预设） ─────────────
  static getTasks(): DutyTask[] {
    try {
      this.migrateLegacyKeys();
      const raw = localStorage.getItem(STORAGE_KEYS.TASKS);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }

  static getCurrentTaskId(): string | null {
    this.migrateLegacyKeys();
    return localStorage.getItem(STORAGE_KEYS.CURRENT_TASK_ID);
  }

  static setCurrentTaskId(id: string | null): void {
    if (id) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_TASK_ID, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_TASK_ID);
    }
  }

  static getCurrentTask(): DutyTask | null {
    const currentId = this.getCurrentTaskId();
    const tasks = this.getTasks();
    if (currentId) {
      const found = tasks.find(t => t.id === currentId && t.status === 'IN_PROGRESS');
      if (found) return found;
    }
    const inProgress = tasks.find(t => t.status === 'IN_PROGRESS');
    if (inProgress) {
      this.setCurrentTaskId(inProgress.id);
      return inProgress;
    }
    return null;
  }

  static saveTask(task: DutyTask): void {
    const tasks = this.getTasks();
    const idx = tasks.findIndex(t => t.id === task.id);
    if (idx >= 0) {
      tasks[idx] = task;
    } else {
      tasks.unshift(task);
    }
    const tasksJson = JSON.stringify(tasks);
    localStorage.setItem(STORAGE_KEYS.TASKS, tasksJson);
    // 关键：同步备份至 Android 原生 SharedPreferences 金库（APK 更新不丢数据）
    NativeBridgeService.backupData('oxherd_tasks', tasksJson);

    // 动态同步精确闹钟：支持每个岗位及条目的到点提醒
    this.syncAlarmsForTask(task);
  }

  static timeStringToMillis(timeStr: string): number {
    const parts = timeStr.split(':').map(n => parseInt(n, 10));
    const hours = parts[0] || 0;
    const minutes = parts[1] || 0;
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    if (d.getTime() <= Date.now()) {
      d.setDate(d.getDate() + 1);
    }
    return d.getTime();
  }

  static syncAlarmsForTask(task: DutyTask): void {
    const settings = this.getSettings();
    if (!settings.notificationsEnabled) return;

    // 1. 岗位级提醒：每个岗位的通知时间都可以设置
    task.posts.forEach(post => {
      if (post.alertEnabled && post.alertTime) {
        const triggerAtMillis = this.timeStringToMillis(post.alertTime);
        NativeBridgeService.scheduleAlarm({
          taskId: `post_${post.id}`,
          title: `oxherd 岗位巡更提醒`,
          message: `到达【${post.name}】预设巡查时间（${post.alertTime}），请前往现场核验`,
          triggerAtMillis,
          sound: settings.alarmSoundEnabled,
          vibrate: settings.strongVibrateEnabled
        });
      } else {
        NativeBridgeService.cancelAlarm(`post_${post.id}`);
      }
    });

    // 2. 条目级提醒：在设置中设置条目的提醒
    task.items.forEach(item => {
      const isScheduled = item.itemType === 'SCHEDULED';
      const alertTime = item.reminderTime || (isScheduled ? item.startTime : undefined);
      const shouldAlert = !item.isCompleted && (item.reminderEnabled || (isScheduled && settings.onDutyStartAlert));

      if (shouldAlert && alertTime) {
        const triggerAtMillis = this.timeStringToMillis(alertTime);
        NativeBridgeService.scheduleAlarm({
          taskId: `item_${item.id}`,
          title: `oxherd 巡检条目提醒`,
          message: `请核验条目：${item.title}${item.requirePhoto ? '（需拍照）' : ''}`,
          triggerAtMillis,
          sound: settings.alarmSoundEnabled,
          vibrate: settings.strongVibrateEnabled
        });
      } else {
        NativeBridgeService.cancelAlarm(`item_${item.id}`);
      }
    });
  }

  /**
   * 创建初始纯净空白任务
   */
  static createEmptyTask(title = '值班巡检', shiftName = '全天班'): DutyTask {
    const taskId = 'task_' + Date.now();
    const today = new Date().toISOString().split('T')[0];
    const defaultPostId = `post_${taskId}_0`;

    const defaultPost: DutyPost = {
      id: defaultPostId,
      taskId,
      name: '1号岗位 / 区域',
      description: '点击顶栏右侧管理按钮添加更多岗位',
      sortOrder: 0
    };

    const newTask: DutyTask = {
      id: taskId,
      title: `${title} (${today})`,
      date: today,
      shiftName,
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
      currentPostId: defaultPostId,
      posts: [defaultPost],
      items: [] // 纯净初始，无硬编码
    };

    this.saveTask(newTask);
    this.setCurrentTaskId(taskId);
    return newTask;
  }

  // ── 条目排列与属性管理 ──────────────────────────────────────────
  static moveItemOrder(task: DutyTask, itemId: string, direction: 'up' | 'down'): boolean {
    const postItems = task.items.filter(i => i.postId === task.currentPostId);
    const idx = postItems.findIndex(i => i.id === itemId);
    if (idx < 0) return false;

    if (direction === 'up' && idx > 0) {
      const targetItem = postItems[idx];
      const prevItem = postItems[idx - 1];
      const globalTargetIdx = task.items.indexOf(targetItem);
      const globalPrevIdx = task.items.indexOf(prevItem);
      task.items[globalTargetIdx] = prevItem;
      task.items[globalPrevIdx] = targetItem;
      this.saveTask(task);
      return true;
    } else if (direction === 'down' && idx < postItems.length - 1) {
      const targetItem = postItems[idx];
      const nextItem = postItems[idx + 1];
      const globalTargetIdx = task.items.indexOf(targetItem);
      const globalNextIdx = task.items.indexOf(nextItem);
      task.items[globalTargetIdx] = nextItem;
      task.items[globalNextIdx] = targetItem;
      this.saveTask(task);
      return true;
    }
    return false;
  }

  static toggleItemType(task: DutyTask, itemId: string): boolean {
    const item = task.items.find(i => i.id === itemId);
    if (!item) return false;

    if (item.itemType === 'SCHEDULED') {
      item.itemType = 'STANDARD';
    } else {
      item.itemType = 'SCHEDULED';
      if (!item.startTime) item.startTime = '09:00';
      if (!item.endTime) item.endTime = '11:30';
    }
    this.saveTask(task);
    return true;
  }

  static updateItemScheduleTime(task: DutyTask, itemId: string, startTime: string, endTime: string): void {
    const item = task.items.find(i => i.id === itemId);
    if (item) {
      item.itemType = 'SCHEDULED';
      item.startTime = startTime;
      item.endTime = endTime;
      this.saveTask(task);
    }
  }

  // ── 标准 JSON 导入导出 ──────────────────────────────────────────
  static exportDutyConfig(task: DutyTask): string {
    const config = {
      app: 'oxherd',
      specVersion: '1.0',
      exportedAt: new Date().toISOString(),
      taskTitle: task.title,
      shiftName: task.shiftName,
      posts: task.posts.map(p => ({
        name: p.name,
        description: p.description || '',
        items: task.items
          .filter(i => i.postId === p.id)
          .map(item => ({
            title: item.title,
            itemType: item.itemType || 'STANDARD',
            startTime: item.startTime || '',
            endTime: item.endTime || '',
            requirePhoto: !!item.requirePhoto,
            autoFold: item.autoFold !== undefined ? !!item.autoFold : true,
            subItems: (item.subItems || []).map(s => s.title)
          }))
      }))
    };
    return JSON.stringify(config, null, 2);
  }

  static parseAndValidateConfig(jsonStr: string): {
    valid: boolean;
    stats?: ConfigImportStats;
    data?: any;
    error?: string;
  } {
    try {
      const data = JSON.parse(jsonStr);
      if (!data || (!data.posts && !data.task)) {
        return { valid: false, error: '缺少 posts 岗位定义' };
      }

      const postsList = Array.isArray(data.posts) ? data.posts : (data.task?.posts || []);
      let totalItems = 0;
      let scheduledCount = 0;
      let totalSubItems = 0;

      postsList.forEach((p: any) => {
        const items = Array.isArray(p.items) ? p.items : [];
        totalItems += items.length;
        items.forEach((it: any) => {
          if (it.itemType === 'SCHEDULED' || it.startTime) {
            scheduledCount++;
          }
          if (Array.isArray(it.subItems)) {
            totalSubItems += it.subItems.length;
          }
        });
      });

      return {
        valid: true,
        stats: {
          title: data.taskTitle || data.task?.title || '导入的值班配置',
          postsCount: postsList.length,
          itemsCount: totalItems,
          scheduledCount,
          subItemsCount: totalSubItems
        },
        data: { ...data, posts: postsList }
      };
    } catch (e: any) {
      return { valid: false, error: e.message || '无效的 JSON 格式' };
    }
  }

  static applyImportedConfig(parsedData: any): DutyTask {
    const taskId = 'task_' + Date.now();
    const today = new Date().toISOString().split('T')[0];
    const posts: DutyPost[] = [];
    const items: DutyItem[] = [];

    parsedData.posts.forEach((p: any, pIdx: number) => {
      const postId = `post_${taskId}_${pIdx}`;
      posts.push({
        id: postId,
        taskId,
        name: p.name || `岗位 ${pIdx + 1}`,
        description: p.description || '',
        sortOrder: pIdx
      });

      const rawItems = Array.isArray(p.items) ? p.items : [];
      rawItems.forEach((it: any, iIdx: number) => {
        const itemId = `item_${postId}_${iIdx}`;
        const rawSub = Array.isArray(it.subItems) ? it.subItems : [];
        const subItems: DutySubItem[] = rawSub.map((subTitle: string, sIdx: number) => ({
          id: `sub_${itemId}_${sIdx}`,
          itemId,
          title: typeof subTitle === 'string' ? subTitle : (subTitle as any).title || '',
          isCompleted: false,
          completedAt: null
        }));

        items.push({
          id: itemId,
          postId,
          title: it.title || `巡检项 ${iIdx + 1}`,
          itemType: it.itemType === 'SCHEDULED' || it.startTime ? 'SCHEDULED' : 'STANDARD',
          startTime: it.startTime || '09:00',
          endTime: it.endTime || '11:30',
          requirePhoto: !!it.requirePhoto,
          photos: [],
          isCompleted: false,
          completedAt: null,
          subItems,
          autoFold: it.autoFold !== undefined ? !!it.autoFold : true,
          isExpanded: true
        });
      });
    });

    const newTask: DutyTask = {
      id: taskId,
      title: parsedData.taskTitle || `值班巡检 (${today})`,
      date: today,
      shiftName: parsedData.shiftName || '全天班',
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
      currentPostId: posts[0]?.id || '',
      posts,
      items
    };

    this.saveTask(newTask);
    this.setCurrentTaskId(taskId);
    return newTask;
  }

  // ── 确认填写完报告后，专门将照片分类打包归档并自动复位 ─────────
  /**
   * 核心要求：“不用交班报告，只需要把值班过程中的照片分类存储到指定文件夹即可，确认填写完报告后打包归档”
   */
  static async completeAndArchivePhotos(task: DutyTask): Promise<DutyArchive> {
    const completedAt = new Date().toISOString();
    task.status = 'COMPLETED';
    task.completedAt = completedAt;

    const zip = new JSZip();
    const safeTitle = task.title.replace(/[\\/:*?"<>|]/g, '_');
    const safeDate = task.date.replace(/-/g, '');
    const zipBaseName = `值班照片归档_${safeTitle}_${safeDate}`;

    let totalItems = task.items.length;
    let completedItems = task.items.filter(i => i.isCompleted).length;
    let totalPhotos = 0;

    // 按岗位建立子文件夹，存储照片
    task.posts.forEach((post, pIdx) => {
      const safePostName = `${pIdx + 1}_${post.name.replace(/[\\/:*?"<>|]/g, '_')}`;
      const postItems = task.items.filter(i => i.postId === post.id);

      postItems.forEach(item => {
        if (item.photos && item.photos.length > 0) {
          const safeItemTitle = item.title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 20);

          item.photos.forEach((ph, phIdx) => {
            totalPhotos++;
            const cleanTime = (ph.timestamp || '').replace(/[: ]/g, '');
            const photoFileName = `${safeItemTitle}_${cleanTime || phIdx + 1}.jpg`;

            if (ph.dataUrl && ph.dataUrl.includes('base64,')) {
              const base64Data = ph.dataUrl.split('base64,')[1];
              // 分类存储到对应的岗位子文件夹中：[岗位名称]/[条目名称]_[时间].jpg
              zip.folder(safePostName)?.file(photoFileName, base64Data, { base64: true });
            }
          });
        }
      });
    });

    // 触发 ZIP 生成与下载保存
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    try {
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${zipBaseName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      console.warn('下载 ZIP 归档包异常', e);
    }

    const archiveRecord: DutyArchive = {
      id: 'arch_' + Date.now(),
      taskId: task.id,
      taskTitle: task.title,
      date: task.date,
      shiftName: task.shiftName,
      completedAt,
      totalItems,
      completedItems,
      totalPhotos,
      zipBlob,
      summaryText: `共归档 ${totalPhotos} 张现场照片，已按岗位分类存储。`
    };

    const archives = this.getArchives();
    archives.unshift(archiveRecord);
    localStorage.setItem(STORAGE_KEYS.ARCHIVES, JSON.stringify(archives.slice(0, 30)));

    this.saveTask(task);

    // 核心要求：“交班刷新之后条目就没有了，保留”
    // 自动克隆保留全部岗位、巡查主项、时段、子条目等配置！仅将核验标记复位、清空已归档照片，以供下一班继续使用
    this.cloneAndResetTaskForNextShift(task);

    return archiveRecord;
  }

  /**
   * 核心方法：交班后为下一班克隆并重置任务（保留所有条目配置，重置打卡状态）
   */
  static cloneAndResetTaskForNextShift(task: DutyTask): DutyTask {
    const nextTaskId = 'task_' + Date.now();
    const today = new Date().toISOString().split('T')[0];

    // 清洗旧日期标签，替换为新班次日期
    const cleanTitle = task.title.replace(/\s*\(\d{4}-\d{2}-\d{2}\)/g, '').trim();

    // 建立新岗位ID映射
    const postIdMap = new Map<string, string>();
    const newPosts: DutyPost[] = task.posts.map((p, idx) => {
      const newPostId = `post_${nextTaskId}_${idx}`;
      postIdMap.set(p.id, newPostId);
      return {
        ...p,
        id: newPostId,
        taskId: nextTaskId
      };
    });

    const newCurrentPostId = postIdMap.get(task.currentPostId) || (newPosts[0]?.id || '');

    const settings = this.getSettings();

    // 完美保留所有配置条目与细项，重置打卡状态与照片
    const newItems: DutyItem[] = task.items.map((it, itIdx) => {
      const mappedPostId = postIdMap.get(it.postId) || (newPosts[0]?.id || '');
      const newItemId = `item_${nextTaskId}_${itIdx}`;
      return {
        ...it,
        id: newItemId,
        postId: mappedPostId,
        isCompleted: false,
        completedAt: null,
        photos: [], // 照片已打包归档至 ZIP，新班次清空
        autoFold: it.autoFold !== undefined ? !!it.autoFold : true, // 完美保留完成后自动折叠配置，默认开启
        isExpanded: it.requirePhoto ? true : (settings.autoFoldUncompleted ? false : true), // 遵循全局自动折叠配置（排除需拍照项）
        subItems: (it.subItems || []).map((s, sIdx) => ({
          ...s,
          id: `sub_${newItemId}_${sIdx}`,
          itemId: newItemId,
          isCompleted: false,
          completedAt: null
        }))
      };
    });

    const nextTask: DutyTask = {
      id: nextTaskId,
      title: `${cleanTitle || '值班巡检'} (${today})`,
      date: today,
      shiftName: task.shiftName,
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
      currentPostId: newCurrentPostId,
      posts: newPosts,
      items: newItems
    };

    this.saveTask(nextTask);
    this.setCurrentTaskId(nextTaskId);
    return nextTask;
  }

  static toggleItemAutoFold(task: DutyTask, itemId: string): boolean {
    const item = task.items.find(i => i.id === itemId);
    if (!item) return false;
    item.autoFold = item.autoFold === undefined ? false : !item.autoFold;
    this.saveTask(task);
    return !!item.autoFold;
  }

  static getArchives(): DutyArchive[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ARCHIVES);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }
}
