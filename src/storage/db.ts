import JSZip from 'jszip';
import type { DutyTask, DutyTemplate, UserSettings, DutyArchive, DutyPost, DutyItem, DutySubItem } from '../models/types';

const STORAGE_KEYS = {
  SETTINGS: 'oxherd_user_settings_v2',
  TASKS: 'oxherd_tasks_v2',
  CURRENT_TASK_ID: 'oxherd_current_task_id_v2',
  TEMPLATES: 'oxherd_templates_v2',
  ARCHIVES: 'oxherd_archives_v2'
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
  handoverTarget: 'url'
};

// 完全纯净自定义：移除所有硬编码预设模板与条目，初始纯净空白态
const SEED_TEMPLATES: DutyTemplate[] = [];

export interface ConfigImportStats {
  postsCount: number;
  itemsCount: number;
  scheduledCount: number;
  subItemsCount: number;
  title: string;
}

export class DutyStorage {
  // ── 用户设置 ──────────────────────────────────────────────
  static getSettings(): UserSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (raw) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('读取设置失败，使用默认值', e);
    }
    return DEFAULT_SETTINGS;
  }

  static saveSettings(settings: Partial<UserSettings>): UserSettings {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
    return updated;
  }

  // ── 模板管理（纯净空模板库） ──────────────────────────────
  static getTemplates(): DutyTemplate[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }

  static saveTemplate(template: DutyTemplate): void {
    const list = this.getTemplates();
    const idx = list.findIndex(t => t.id === template.id);
    if (idx >= 0) {
      list[idx] = template;
    } else {
      list.push(template);
    }
    localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(list));
  }

  static deleteTemplate(id: string): void {
    const list = this.getTemplates().filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(list));
  }

  // ── 任务管理（纯净空白初始态） ───────────────────────────
  static getTasks(): DutyTask[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TASKS);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }

  static getCurrentTaskId(): string | null {
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
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
  }

  /**
   * 创建初始纯净空白值班任务（零硬编码预设）
   */
  static createEmptyTask(title = '日常值班巡查', shiftName = '全天班'): DutyTask {
    const taskId = 'task_' + Date.now();
    const today = new Date().toISOString().split('T')[0];
    const defaultPostId = `post_${taskId}_0`;

    const defaultPost: DutyPost = {
      id: defaultPostId,
      taskId,
      name: '1号岗位 / 巡视点',
      description: '可在岗位设置中修改名称或添加更多岗位',
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
      items: [] // 纯净初始，无任何预设条目
    };

    this.saveTask(newTask);
    this.setCurrentTaskId(taskId);
    return newTask;
  }

  // ── 条目顺序与属性管理 ──────────────────────────────────────────
  /**
   * 上移或下移条目
   */
  static moveItemOrder(task: DutyTask, itemId: string, direction: 'up' | 'down'): boolean {
    const postItems = task.items.filter(i => i.postId === task.currentPostId);
    const idx = postItems.findIndex(i => i.id === itemId);
    if (idx < 0) return false;

    if (direction === 'up' && idx > 0) {
      const targetItem = postItems[idx];
      const prevItem = postItems[idx - 1];
      // 在总 items 中交换相对位置
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

  /**
   * 转换条目属性：常规待办 <-> 时段巡查
   */
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

  /**
   * 快捷微调时段巡查开始与结束时间
   */
  static updateItemScheduleTime(task: DutyTask, itemId: string, startTime: string, endTime: string): void {
    const item = task.items.find(i => i.id === itemId);
    if (item) {
      item.itemType = 'SCHEDULED';
      item.startTime = startTime;
      item.endTime = endTime;
      this.saveTask(task);
    }
  }

  // ── 配置文件标准 JSON 导入导出 ────────────────────────────────
  /**
   * 导出标准 JSON 配置文件（包含所有岗位、主项、时段及子条目）
   */
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
            subItems: (item.subItems || []).map(s => s.title)
          }))
      }))
    };
    return JSON.stringify(config, null, 2);
  }

  /**
   * 解析并校验导入的 JSON 配置文件，生成统计预览
   */
  static parseAndValidateConfig(jsonStr: string): {
    valid: boolean;
    stats?: ConfigImportStats;
    data?: any;
    error?: string;
  } {
    try {
      const data = JSON.parse(jsonStr);
      if (!data || (!data.posts && !data.task)) {
        return { valid: false, error: 'JSON 文件缺少 posts 结构定义' };
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

  /**
   * 执行配置覆盖导入
   */
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
          isExpanded: false
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

  // ── 完成值班、打包归档与自动复位 ──────────────────────────────
  static async completeAndArchiveTask(task: DutyTask, handoverNote?: string): Promise<DutyArchive> {
    const completedAt = new Date().toISOString();
    task.status = 'COMPLETED';
    task.completedAt = completedAt;
    task.handoverNote = handoverNote || task.handoverNote || '';

    const zip = new JSZip();
    const safeTitle = task.title.replace(/[\\/:*?"<>|]/g, '_');
    const safeDate = task.date.replace(/-/g, '');
    const zipBaseName = `值班归档_${safeTitle}_${safeDate}`;

    let md = `# 值班交班总结报告\n\n`;
    md += `- **值班任务**：${task.title}\n`;
    md += `- **值班日期**：${task.date} (${task.shiftName})\n`;
    md += `- **创建时间**：${new Date(task.createdAt).toLocaleString('zh-CN')}\n`;
    md += `- **交班时间**：${new Date(completedAt).toLocaleString('zh-CN')}\n`;
    if (task.handoverNote) {
      md += `- **交班交接备注**：${task.handoverNote}\n`;
    }
    md += `\n---\n\n## 岗位核验明细\n\n`;

    let totalItems = task.items.length;
    let completedItems = 0;
    let totalPhotos = 0;

    const photoManifest: Array<{ postName: string; itemTitle: string; fileName: string; timestamp: string }> = [];

    task.posts.forEach((post, pIdx) => {
      const postItems = task.items.filter(i => i.postId === post.id);
      const postDone = postItems.filter(i => i.isCompleted).length;
      md += `### ${pIdx + 1}. 岗位：${post.name} (${postDone}/${postItems.length} 已核验)\n\n`;

      if (postItems.length === 0) {
        md += `*（本岗位无核对条目）*\n\n`;
      } else {
        postItems.forEach(item => {
          if (item.isCompleted) completedItems++;
          const checkMark = item.isCompleted ? '[x]' : '[ ]';
          const timeStr = item.completedAt ? ` (${new Date(item.completedAt).toLocaleTimeString('zh-CN')})` : '';
          const typeStr = item.itemType === 'SCHEDULED' ? ` [⏰时段巡查 ${item.startTime}-${item.endTime}]` : '';
          const photoTag = item.photos && item.photos.length > 0 ? ` 📷已附${item.photos.length}张照片` : (item.requirePhoto ? ' ⚠️未按要求拍照' : '');

          md += `- ${checkMark} **${item.title}**${typeStr}${timeStr}${photoTag}\n`;

          if (item.subItems && item.subItems.length > 0) {
            item.subItems.forEach(sub => {
              const subMark = sub.isCompleted ? '[x]' : '[ ]';
              const subTime = sub.completedAt ? ` (${new Date(sub.completedAt).toLocaleTimeString('zh-CN')})` : '';
              md += `  - ${subMark} ${sub.title}${subTime}\n`;
            });
          }

          if (item.photos && item.photos.length > 0) {
            item.photos.forEach((ph, phIdx) => {
              totalPhotos++;
              const safePost = post.name.replace(/[\\/:*?"<>|]/g, '_');
              const safeItem = item.title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 20);
              const fileName = `${safePost}_${safeItem}_${phIdx + 1}.jpg`;

              photoManifest.push({
                postName: post.name,
                itemTitle: item.title,
                fileName,
                timestamp: ph.timestamp
              });

              if (ph.dataUrl && ph.dataUrl.includes('base64,')) {
                const base64Data = ph.dataUrl.split('base64,')[1];
                zip.folder('photos')?.file(fileName, base64Data, { base64: true });
              }
            });
          }
        });
        md += `\n`;
      }
    });

    if (photoManifest.length > 0) {
      md += `## 巡查现场照片索引（已归类整理）\n\n`;
      md += `| 序号 | 所在岗位 | 检查条目 | 文件名 | 拍摄时间 |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- |\n`;
      photoManifest.forEach((p, idx) => {
        md += `| ${idx + 1} | ${p.postName} | ${p.itemTitle} | \`${p.fileName}\` | ${p.timestamp} |\n`;
      });
      md += `\n`;
    }

    zip.file('duty_summary.md', md);
    zip.file('duty_data.json', JSON.stringify(task, null, 2));

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
    } catch (e) {}

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
      summaryText: md
    };

    const archives = this.getArchives();
    archives.unshift(archiveRecord);
    const metaList = archives.slice(0, 30).map(a => ({
      ...a,
      zipBlob: undefined
    }));
    localStorage.setItem(STORAGE_KEYS.ARCHIVES, JSON.stringify(metaList));

    this.saveTask(task);
    this.setCurrentTaskId(null);

    return archiveRecord;
  }

  static getArchives(): DutyArchive[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ARCHIVES);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }
}
