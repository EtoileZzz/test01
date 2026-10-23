package com.oxherd.app;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

public class KeepAliveHelper {
    private static final String TAG = "KeepAliveHelper";

    /**
     * 检查是否已经忽略电池优化（在白名单中）
     */
    public static boolean isBatteryOptimizationIgnored(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                return powerManager.isIgnoringBatteryOptimizations(context.getPackageName());
            }
        }
        return true;
    }

    /**
     * 申请加入电池优化白名单 (ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
     */
    public static void requestIgnoreBatteryOptimization(Activity activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                if (!isBatteryOptimizationIgnored(activity)) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + activity.getPackageName()));
                    activity.startActivity(intent);
                }
            } catch (Exception e) {
                Log.e(TAG, "申请电池优化白名单异常", e);
                try {
                    Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    activity.startActivity(fallback);
                } catch (Exception ex) {
                    Log.e(TAG, "跳转电池优化页面失败", ex);
                }
            }
        }
    }

    /**
     * 获取当前设备厂商名称
     */
    public static String getManufacturerName() {
        String manufacturer = Build.MANUFACTURER.toLowerCase();
        if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi")) {
            return "Xiaomi / HyperOS";
        } else if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
            return "Huawei / HarmonyOS";
        } else if (manufacturer.contains("oppo") || manufacturer.contains("realme") || manufacturer.contains("oneplus")) {
            return "OPPO / ColorOS";
        } else if (manufacturer.contains("vivo") || manufacturer.contains("iqoo")) {
            return "vivo / OriginOS";
        } else if (manufacturer.contains("samsung")) {
            return "Samsung / OneUI";
        } else if (manufacturer.contains("meizu")) {
            return "Meizu / Flyme";
        }
        return Build.MANUFACTURER;
    }

    /**
     * 跳转至主流手机厂商的自启动/后台保护设置页面
     */
    public static boolean openVendorAutoStartSettings(Context context) {
        String manufacturer = Build.MANUFACTURER.toLowerCase();
        Intent intent = new Intent();
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi")) {
                // 小米 MIUI / HyperOS 自启动管理
                intent.setComponent(new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"));
                context.startActivity(intent);
                return true;
            } else if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
                // 华为 HarmonyOS / EMUI 自启动与应用启动管理
                try {
                    intent.setComponent(new ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"));
                    context.startActivity(intent);
                    return true;
                } catch (Exception e) {
                    intent.setComponent(new ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.bootstart.BootStartActivity"));
                    context.startActivity(intent);
                    return true;
                }
            } else if (manufacturer.contains("oppo") || manufacturer.contains("realme") || manufacturer.contains("oneplus")) {
                // OPPO / ColorOS 自启动管理
                try {
                    intent.setComponent(new ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"));
                    context.startActivity(intent);
                    return true;
                } catch (Exception e) {
                    intent.setComponent(new ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"));
                    context.startActivity(intent);
                    return true;
                }
            } else if (manufacturer.contains("vivo") || manufacturer.contains("iqoo")) {
                // vivo / OriginOS 自启动管理
                try {
                    intent.setComponent(new ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"));
                    context.startActivity(intent);
                    return true;
                } catch (Exception e) {
                    intent.setComponent(new ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.PurviewTabActivity"));
                    context.startActivity(intent);
                    return true;
                }
            } else if (manufacturer.contains("meizu")) {
                // 魅族 Flyme
                intent.setComponent(new ComponentName("com.meizu.safe", "com.meizu.safe.permission.SmartBGActivity"));
                context.startActivity(intent);
                return true;
            }
        } catch (Exception e) {
            Log.w(TAG, "直达厂商自启动界面失败，尝试打开通用应用详情页", e);
        }

        // 通用兜底：跳转至系统应用详情页
        try {
            Intent appDetails = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            appDetails.setData(Uri.parse("package:" + context.getPackageName()));
            appDetails.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(appDetails);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "打开应用详情页失败", e);
            return false;
        }
    }
}
