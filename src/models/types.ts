/**
 * oxherd 数据类型定义
 */

export interface InspectionPhoto {
  id: string;
  itemId: string;
  dataUrl: string; // Base64 或 Blob URL
  fileName: string;
  timestamp: string;
  note?: string;
}

export interface DutySubItem {
  id: string;
  itemId: string;
  title: string;
  isCompleted: boolean;
  completedAt: string | null;
}

export type ItemType = 'STANDARD' | 'SCHEDULED'; // 常规待办 vs 时段巡查

export interface DutyItem {
  id: string;
  postId: string;
  title: string;
  itemType: ItemType; // 支持一键转换条目属性
  startTime?: string; // 时段巡查开始时间 (如 "09:00")
  endTime?: string;   // 时段巡查结束时间 (如 "11:30")
  note?: string;
  requirePhoto: boolean; // 设置中可配置是否拍照
  photos: InspectionPhoto[];
  isCompleted: boolean;
  completedAt: string | null;
  subItems: DutySubItem[];
  isExpanded?: boolean;
  autoFold?: boolean; // 完成后自动折叠（默认 true）
  reminderTime?: string; // 条目自定义提醒时间 (如 "09:30")
  reminderEnabled?: boolean; // 条目到点提醒开关
}

export interface DutyPost {
  id: string;
  taskId: string;
  name: string;
  description?: string;
  sortOrder: number;
  alertTime?: string; // 岗位巡查通知时间 (如 "10:00")
  alertEnabled?: boolean; // 岗位巡查通知开关
}

export type TaskStatus = 'IN_PROGRESS' | 'COMPLETED';

export interface DutyTask {
  id: string;
  templateId?: string;
  title: string;
  date: string;
  shiftName: string;
  status: TaskStatus;
  createdAt: string;
  completedAt?: string | null;
  currentPostId: string;
  posts: DutyPost[];
  items: DutyItem[];
  handoverNote?: string;
  archiveZipName?: string;
}

export interface TemplatePostPreset {
  name: string;
  description?: string;
  items: {
    title: string;
    itemType?: ItemType;
    startTime?: string;
    endTime?: string;
    requirePhoto?: boolean;
    subItems?: string[];
  }[];
}

export interface DutyTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  posts: TemplatePostPreset[];
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface UserSettings {
  theme: ThemeMode;
  notificationsEnabled: boolean;
  advanceMinutes: number; // 5, 10, 15, 30, 60
  alarmSoundEnabled: boolean;
  strongVibrateEnabled: boolean;
  onDutyStartAlert: boolean;
  bootRestoreEnabled: boolean;
  autoArchiveZip: boolean;
  handoverExternalUrl: string; // 预设值班交班外链 (如腾讯文档/飞书/企业微信表单)
  handoverTarget: 'url' | 'wechat' | 'tim' | 'none'; // 协同跳转目标
  subItemSpaceAutoSwitch?: boolean; // 细项录入根据空格自动切换
  autoFoldUncompleted?: boolean; // 未完成任务自动折叠简化排布（排除必须拍照项）
  subItemCompleteMode?: 'click' | 'swipe'; // 子项目完成交互模式：点击打勾划去 vs 左右划动划去
  themeColor?: string; // 自定义主题色十六进制代码 (如 #38BDF8)
}

export interface DutyArchive {
  id: string;
  taskId: string;
  taskTitle: string;
  date: string;
  shiftName: string;
  completedAt: string;
  totalItems: number;
  completedItems: number;
  totalPhotos: number;
  zipBlob?: Blob;
  summaryText: string;
}

export const APP_VERSION = '1.0.5';
export const APP_BUILD = 6;

