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

export interface DutyItem {
  id: string;
  postId: string;
  title: string;
  note?: string;
  requirePhoto: boolean; // 设置中可配置是否拍照
  photos: InspectionPhoto[];
  isCompleted: boolean;
  completedAt: string | null;
  subItems: DutySubItem[];
  isExpanded?: boolean;
}

export interface DutyPost {
  id: string;
  taskId: string;
  name: string;
  description?: string;
  sortOrder: number;
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
  zipBase64?: string;
  summaryText: string;
}
