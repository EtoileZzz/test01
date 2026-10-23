import { Capacitor, registerPlugin } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export interface OxherdNativePlugin {
  isBatteryOptimizationIgnored(): Promise<{ ignored: boolean }>;
  requestIgnoreBatteryOptimization(): Promise<void>;
  openVendorAutoStartSettings(): Promise<{ success: boolean; vendor: string }>;
  getVendorInfo(): Promise<{ vendor: string }>;
  testNotification(options: {
    title: string;
    message: string;
    sound: boolean;
    vibrate: boolean;
  }): Promise<void>;
  scheduleDutyAlarm(options: {
    taskId: string;
    title: string;
    message: string;
    triggerAtMillis: number;
    sound: boolean;
    vibrate: boolean;
  }): Promise<{ success: boolean; notificationId: number }>;
  cancelDutyAlarm(options: { taskId: string }): Promise<void>;
  setBootRestoreEnabled(options: { enabled: boolean }): Promise<void>;
  saveConfigFile(options: { fileName: string; content: string }): Promise<{ success: boolean; path: string }>;
  shareConfigFile(options: { fileName: string; content: string }): Promise<void>;
  setStatusBarTheme(options: { isLight: boolean }): Promise<void>;
}

const OxherdNative = registerPlugin<OxherdNativePlugin>('OxherdNative');

export class NativeBridgeService {
  static isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  static async isBatteryOptimizationIgnored(): Promise<boolean> {
    if (this.isNative()) {
      try {
        const res = await OxherdNative.isBatteryOptimizationIgnored();
        return res.ignored;
      } catch (e) {
        console.warn('调用原生 isBatteryOptimizationIgnored 失败', e);
      }
    }
    return true; // 网页环境模拟已开启
  }

  static async requestIgnoreBatteryOptimization(): Promise<void> {
    if (this.isNative()) {
      try {
        await OxherdNative.requestIgnoreBatteryOptimization();
      } catch (e) {
        console.warn('调用原生 requestIgnoreBatteryOptimization 失败', e);
      }
    } else {
      alert('已在网页/WebView预览模式下模拟申请白名单。在安卓打包安装后将直接唤起系统原生申请窗口。');
    }
  }

  static async openVendorAutoStartSettings(): Promise<{ success: boolean; vendor: string }> {
    if (this.isNative()) {
      try {
        return await OxherdNative.openVendorAutoStartSettings();
      } catch (e) {
        console.warn('调用原生 openVendorAutoStartSettings 失败', e);
      }
    }
    return { success: false, vendor: 'Web Browser / 模拟环境' };
  }

  static async getVendorInfo(): Promise<string> {
    if (this.isNative()) {
      try {
        const res = await OxherdNative.getVendorInfo();
        return res.vendor;
      } catch (e) {}
    }
    return '通用 Android / 全面屏';
  }

  static async setBootRestoreEnabled(enabled: boolean): Promise<void> {
    if (this.isNative()) {
      try {
        await OxherdNative.setBootRestoreEnabled({ enabled });
      } catch (e) {}
    }
  }

  static async scheduleAlarm(options: {
    taskId: string;
    title: string;
    message: string;
    triggerAtMillis: number;
    sound: boolean;
    vibrate: boolean;
  }): Promise<void> {
    if (this.isNative()) {
      try {
        await OxherdNative.scheduleDutyAlarm(options);
      } catch (e) {
        console.warn('调度原生闹钟失败', e);
      }
    }
  }

  static async cancelAlarm(taskId: string): Promise<void> {
    if (this.isNative()) {
      try {
        await OxherdNative.cancelDutyAlarm({ taskId });
      } catch (e) {}
    }
  }

  /**
   * 保存配置文件至手机文件（绝不用剪贴板）
   */
  static async saveConfigFile(fileName: string, content: string): Promise<boolean> {
    if (this.isNative()) {
      try {
        const res = await OxherdNative.saveConfigFile({ fileName, content });
        return res.success;
      } catch (e: any) {
        console.warn('原生保存文件失败', e);
      }
    }

    // Web / 浏览器环境回退（使用标准文件下载，坚决不降级为剪贴板）
    try {
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      alert(`配置文件已成功触发下载并保存：\n${fileName}`);
      return true;
    } catch (e) {
      alert('保存配置文件失败，请检查浏览器权限。');
      return false;
    }
  }

  /**
   * 一键分享配置文件至微信 / TIM（原生 Intent 调起系统分享面板，绝不用剪贴板）
   */
  static async shareConfigFile(fileName: string, content: string): Promise<boolean> {
    if (this.isNative()) {
      try {
        await OxherdNative.shareConfigFile({ fileName, content });
        return true;
      } catch (e) {
        console.warn('原生调起系统分享面板失败', e);
      }
    }

    // Web / 浏览器环境：尝试 Web Share API（带文件），不支持则直接触发文件保存，坚决不使用剪贴板
    if (navigator.share) {
      try {
        const file = new File([content], fileName, { type: 'application/json' });
        await navigator.share({
          title: 'oxherd 值班巡检配置文件',
          text: '分享 oxherd 值班巡检配置文件，可在应用内直接导入。',
          files: [file]
        });
        return true;
      } catch (e) {
        // 用户主动取消分享或环境不支持文件分享
      }
    }

    // 无法唤起系统分享面板时，直接下载保存文件
    return await this.saveConfigFile(fileName, content);
  }

  /**
   * 同步状态栏和导航栏文字颜色与当前深浅色主题
   */
  static async syncStatusBarTheme(theme: 'light' | 'dark' | 'system'): Promise<void> {
    let isLight = theme === 'light';
    if (theme === 'system') {
      isLight = !window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    if (this.isNative()) {
      try {
        await OxherdNative.setStatusBarTheme({ isLight });
      } catch (e) {}
    }
  }

  /**
   * 一键测试通知提醒（发声 + 强震动）
   */
  static async testNotification(title: string, message: string, sound = true, vibrate = true): Promise<void> {
    if (this.isNative()) {
      try {
        await OxherdNative.testNotification({ title, message, sound, vibrate });
        return;
      } catch (e) {
        console.warn('调用原生 testNotification 失败，降级为 Web 模拟', e);
      }
    }

    if (vibrate) {
      this.playPatrolHaptics();
    }
    if (sound) {
      this.playAlarmSiren();
    }

    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body: message, icon: '/favicon.ico' });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification(title, { body: message, icon: '/favicon.ico' });
          }
        });
      }
    }
  }

  static async triggerLightHaptic(): Promise<void> {
    try {
      if (this.isNative()) {
        await Haptics.impact({ style: ImpactStyle.Light });
      } else if (navigator.vibrate) {
        navigator.vibrate(25);
      }
    } catch (e) {}
  }

  static async triggerCompleteHaptic(): Promise<void> {
    try {
      if (this.isNative()) {
        await Haptics.notification({ type: NotificationType.Success });
      } else if (navigator.vibrate) {
        navigator.vibrate([40, 60, 80]);
      }
    } catch (e) {}
  }

  static playPatrolHaptics(): void {
    if (navigator.vibrate) {
      navigator.vibrate([0, 500, 200, 500, 200, 800]);
    }
  }

  static playAlarmSiren(): void {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);

      const now = ctx.currentTime;
      for (let i = 0; i < 4; i++) {
        osc.frequency.setValueAtTime(880, now + i * 0.3);
        osc.frequency.setValueAtTime(1760, now + i * 0.3 + 0.15);
      }

      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.4);
    } catch (e) {
      console.warn('Web Audio 播放失败', e);
    }
  }
}
