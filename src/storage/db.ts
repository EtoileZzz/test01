import JSZip from 'jszip';
import type { DutyTask, DutyTemplate, UserSettings, DutyArchive, DutyPost, DutyItem, DutySubItem } from '../models/types';

const STORAGE_KEYS = {
  SETTINGS: 'oxherd_user_settings_v1',
  TASKS: 'oxherd_tasks_v1',
  CURRENT_TASK_ID: 'oxherd_current_task_id_v1',
  TEMPLATES: 'oxherd_templates_v1',
  ARCHIVES: 'oxherd_archives_v1'
};

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  notificationsEnabled: true,
  advanceMinutes: 15,
  alarmSoundEnabled: true,
  strongVibrateEnabled: true,
  onDutyStartAlert: true,
  bootRestoreEnabled: true,
  autoArchiveZip: true
};

const SEED_TEMPLATES: DutyTemplate[] = [
  {
    id: 'tpl_library',
    name: '图书馆常规值班巡视',
    category: '公共场馆',
    description: '适用于图书馆各楼层自习室、阅览区、古籍特藏及消防温控巡更',
    posts: [
      {
        name: '3楼 社科阅览室与借阅区',
        description: '主通道、自习阅览位、消防栓与中央空调控制',
        items: [
          {
            title: '消防设施与应急疏散通道巡查',
            requirePhoto: true,
            subItems: [
              '消火栓压力表指针在绿区且铅封完好',
              '安全出口指示灯常亮无遮挡',
              '常闭式防火门处于关闭状态且开启顺畅'
            ]
          },
          {
            title: '读者阅览秩序与公共电源插座安全',
            requirePhoto: false,
            subItems: [
              '自习区桌面排插无过载、异响及电线破损',
              '阅览区静音标识完好，无过度占座占位情况',
              '借阅书架通道通畅，无图书掉落堆积'
            ]
          },
          {
            title: '中央空调温控与新风通风状态',
            requirePhoto: true,
            subItems: [
              '中央空调控制面板设定在 24-26℃ 舒适区间',
              '南向与北向通风百叶正常开启，空气无异味'
            ]
          }
        ]
      },
      {
        name: '4楼 电子阅览与静音自习区',
        description: '多媒体机位、电子检索台、研讨室门窗巡检',
        items: [
          {
            title: '公用电子检索机与网络机位运转核查',
            requirePhoto: false,
            subItems: [
              '1-30号机位显示器及外设连接稳固',
              '自助打印复印机纸张充盈、无卡纸报警'
            ]
          },
          {
            title: '静音研讨室与照明管路安全',
            requirePhoto: true,
            subItems: [
              '4间研讨室门禁及窗户锁扣状态正常',
              '楼层照明开关电箱无跳闸及异常发热'
            ]
          }
        ]
      },
      {
        name: '5楼 古籍特藏与文献保护室',
        description: '精密恒温恒湿系统、气体灭火控制器与紫外遮光',
        items: [
          {
            title: '恒温恒湿精密空调系统参数核查',
            requirePhoto: true,
            subItems: [
              '特藏库温度维持在 18-22℃，湿度维持在 45%-55%',
              '气体灭火系统主控制器处于正常自动巡检状态'
            ]
          },
          {
            title: '门禁安防报警与遮光防紫外线窗帘巡视',
            requirePhoto: false,
            subItems: [
              '红外双鉴入侵探测器自检指示灯正常',
              '防紫外线遮光卷帘已拉至标准遮光刻度'
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'tpl_datacenter',
    name: '实训中心与数据机房日班巡检',
    category: '技术设施',
    description: 'UPS配电、核心机房服务器机柜指示灯与消防钢瓶巡查',
    posts: [
      {
        name: 'A座 配电与UPS不间断电源室',
        description: '市电进线配电屏、UPS主机及蓄电池组巡检',
        items: [
          {
            title: 'UPS主机指示面板与蓄电池巡视',
            requirePhoto: true,
            subItems: [
              'UPS运行在市电逆变状态，输出电压 220V±2%',
              '蓄电池室通风正常，无漏液及鼓包异味'
            ]
          }
        ]
      },
      {
        name: 'B座 核心服务器与网络机柜区',
        description: '刀片服务器、核心交换机与精密列间空调',
        items: [
          {
            title: '机柜冷热通道与精密空调运行巡视',
            requirePhoto: true,
            subItems: [
              '冷通道封闭门关闭严密，回风温度 23℃',
              '核心交换机无红灯报警，光纤跳线无死弯'
            ]
          }
        ]
      }
    ]
  }
];

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

  // ── 模板管理 ──────────────────────────────────────────────
  static getTemplates(): DutyTemplate[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('读取模板库失败', e);
    }
    // 首次启动存入示范模板
    localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(SEED_TEMPLATES));
    return SEED_TEMPLATES;
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

  // ── 任务管理 ──────────────────────────────────────────────
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
    // 如果没有指定或已完成，查找正在进行的第一个任务
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
   * 从模板一键生成新值班任务
   */
  static createTaskFromTemplate(templateId: string, customTitle?: string, shiftName = '全天班'): DutyTask {
    const templates = this.getTemplates();
    const tpl = templates.find(t => t.id === templateId) || templates[0];
    const taskId = 'task_' + Date.now();
    const today = new Date().toISOString().split('T')[0];

    const posts: DutyPost[] = [];
    const items: DutyItem[] = [];

    tpl.posts.forEach((p, pIdx) => {
      const postId = `post_${taskId}_${pIdx}`;
      posts.push({
        id: postId,
        taskId,
        name: p.name,
        description: p.description,
        sortOrder: pIdx
      });

      p.items.forEach((itemPreset, iIdx) => {
        const itemId = `item_${postId}_${iIdx}`;
        const subItems: DutySubItem[] = (itemPreset.subItems || []).map((subTitle, sIdx) => ({
          id: `sub_${itemId}_${sIdx}`,
          itemId,
          title: subTitle,
          isCompleted: false,
          completedAt: null
        }));

        items.push({
          id: itemId,
          postId,
          title: itemPreset.title,
          requirePhoto: !!itemPreset.requirePhoto,
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
      templateId: tpl.id,
      title: customTitle || `${tpl.name} (${today})`,
      date: today,
      shiftName,
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

  /**
   * 创建空白自定义值班任务
   */
  static createEmptyTask(title: string, shiftName = '全天班'): DutyTask {
    const taskId = 'task_' + Date.now();
    const today = new Date().toISOString().split('T')[0];
    const defaultPostId = `post_${taskId}_0`;

    const defaultPost: DutyPost = {
      id: defaultPostId,
      taskId,
      name: '默认岗位',
      description: '请在岗位设置中修改或添加更多岗位',
      sortOrder: 0
    };

    const newTask: DutyTask = {
      id: taskId,
      title: title || `日常值班 (${today})`,
      date: today,
      shiftName,
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
      currentPostId: defaultPostId,
      posts: [defaultPost],
      items: []
    };

    this.saveTask(newTask);
    this.setCurrentTaskId(taskId);
    return newTask;
  }

  // ── 完成值班、打包归档与自动复位 ──────────────────────────────
  static async completeAndArchiveTask(task: DutyTask, handoverNote?: string): Promise<DutyArchive> {
    const completedAt = new Date().toISOString();
    const completedTimeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    task.status = 'COMPLETED';
    task.completedAt = completedAt;
    task.handoverNote = handoverNote || task.handoverNote || '';

    // 生成 ZIP 归档包
    const zip = new JSZip();
    const safeTitle = task.title.replace(/[\\/:*?"<>|]/g, '_');
    const safeDate = task.date.replace(/-/g, '');
    const zipBaseName = `值班归档_${safeTitle}_${safeDate}`;

    // 1. 生成 Markdown 总结报告
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
        postItems.forEach((item, iIdx) => {
          if (item.isCompleted) completedItems++;
          const checkMark = item.isCompleted ? '[x]' : '[ ]';
          const timeStr = item.completedAt ? ` (${new Date(item.completedAt).toLocaleTimeString('zh-CN')})` : '';
          const photoTag = item.photos && item.photos.length > 0 ? ` 📷已附${item.photos.length}张照片` : (item.requirePhoto ? ' ⚠️未按要求拍照' : '');

          md += `- ${checkMark} **${item.title}**${timeStr}${photoTag}\n`;

          // 子条目
          if (item.subItems && item.subItems.length > 0) {
            item.subItems.forEach(sub => {
              const subMark = sub.isCompleted ? '[x]' : '[ ]';
              const subTime = sub.completedAt ? ` (${new Date(sub.completedAt).toLocaleTimeString('zh-CN')})` : '';
              md += `  - ${subMark} ${sub.title}${subTime}\n`;
            });
          }

          // 照片文件整理到 ZIP
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

              // 从 DataUrl 写入文件
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

    // 2. 写入 ZIP 文件
    zip.file('duty_summary.md', md);
    zip.file('duty_data.json', JSON.stringify(task, null, 2));

    // 3. 生成 Blob
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    // 4. 触发浏览器/WebView文件下载保存
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
      console.warn('自动触发下载失败', e);
    }

    // 5. 存储归档记录
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
    // LocalStorage 不存过大 blob，仅存摘要与元数据
    const metaList = archives.slice(0, 30).map(a => ({
      ...a,
      zipBlob: undefined
    }));
    localStorage.setItem(STORAGE_KEYS.ARCHIVES, JSON.stringify(metaList));

    // 保存已完成的任务状态
    this.saveTask(task);

    // 6. 核心要求：“归档并刷新，支持下一次使用”
    // 清空当前活跃 taskId，让工作台恢复就绪态
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

  // ── 全量数据备份与还原 ─────────────────────────────────────────
  static exportAllData(): string {
    const data = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      settings: this.getSettings(),
      templates: this.getTemplates(),
      tasks: this.getTasks(),
      archives: this.getArchives()
    };
    return JSON.stringify(data, null, 2);
  }

  static importAllData(jsonStr: string): boolean {
    try {
      const data = JSON.parse(jsonStr);
      if (data.settings) localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings));
      if (data.templates) localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(data.templates));
      if (data.tasks) localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(data.tasks));
      if (data.archives) localStorage.setItem(STORAGE_KEYS.ARCHIVES, JSON.stringify(data.archives));
      return true;
    } catch (e) {
      console.error('导入失败', e);
      return false;
    }
  }
}
