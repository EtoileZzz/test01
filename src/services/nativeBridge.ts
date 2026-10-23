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
    return '通用 Android / WebView';
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
   * 一键测试通知提醒（发声 + 强震动）
   */
  static async testNotification(title: string, message: string, sound = true, vibrate = true): Promise<void> {
    // 1. 原生调用
    if (this.isNative()) {
      try {
        await OxherdNative.testNotification({ title, message, sound, vibrate });
        return;
      } catch (e) {
        console.warn('调用原生 testNotification 失败，降级为 Web 模拟', e);
      }
    }

    // 2. 网页/测试环境下的高保真震动与声音合成
    if (vibrate) {
      this.playPatrolHaptics();
    }
    if (sound) {
      this.playAlarmSiren();
    }

    // 3. 浏览器原生 Notification 弹窗
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

  /**
   * 触发打卡或微交互轻微触感
   */
  static async triggerLightHaptic(): Promise<void> {
    try {
      if (this.isNative()) {
        await Haptics.impact({ style: ImpactStyle.Light });
      } else if (navigator.vibrate) {
        navigator.vibrate(25);
      }
    } catch (e) {}
  }

  /**
   * 触发滑动完成强触感
   */
  static async triggerCompleteHaptic(): Promise<void> {
    try {
      if (this.isNative()) {
        await Haptics.notification({ type: NotificationType.Success });
      } else if (navigator.vibrate) {
        navigator.vibrate([40, 60, 80]);
      }
    } catch (e) {}
  }

  /**
   * 巡更强震动 (双重长震动)
   */
  static playPatrolHaptics(): void {
    if (navigator.vibrate) {
      // 0ms, 500ms震动, 200ms停, 500ms震动, 200ms停, 800ms震动
      navigator.vibrate([0, 500, 200, 500, 200, 800]);
    }
  }

  /**
   * Web Audio API 警报合成音（双频巡逻交替声）
   */
  static playAlarmSiren(): void {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);

      // 双频交替 880Hz <-> 1760Hz
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
