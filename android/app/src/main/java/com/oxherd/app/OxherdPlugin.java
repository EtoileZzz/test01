package com.oxherd.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "OxherdNative")
public class OxherdPlugin extends Plugin {

    @PluginMethod
    public void isBatteryOptimizationIgnored(PluginCall call) {
        boolean ignored = KeepAliveHelper.isBatteryOptimizationIgnored(getContext());
        JSObject ret = new JSObject();
        ret.put("ignored", ignored);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimization(PluginCall call) {
        if (getActivity() != null) {
            KeepAliveHelper.requestIgnoreBatteryOptimization(getActivity());
            call.resolve();
        } else {
            call.reject("Activity is null");
        }
    }

    @PluginMethod
    public void openVendorAutoStartSettings(PluginCall call) {
        boolean success = KeepAliveHelper.openVendorAutoStartSettings(getContext());
        JSObject ret = new JSObject();
        ret.put("success", success);
        ret.put("vendor", KeepAliveHelper.getManufacturerName());
        call.resolve(ret);
    }

    @PluginMethod
    public void getVendorInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("vendor", KeepAliveHelper.getManufacturerName());
        call.resolve(ret);
    }

    @PluginMethod
    public void testNotification(PluginCall call) {
        String title = call.getString("title", "oxherd 值班巡更测试");
        String message = call.getString("message", "这是一条测试高优先级提醒，提示音与强震动正常运行！");
        boolean sound = call.getBoolean("sound", true);
        boolean vibrate = call.getBoolean("vibrate", true);

        Intent intent = new Intent(getContext(), AlarmReceiver.class);
        intent.putExtra("title", title);
        intent.putExtra("message", message);
        intent.putExtra("soundEnabled", sound);
        intent.putExtra("vibrateEnabled", vibrate);
        intent.putExtra("notificationId", 9999);
        getContext().sendBroadcast(intent);

        call.resolve();
    }

    @PluginMethod
    public void scheduleDutyAlarm(PluginCall call) {
        String taskId = call.getString("taskId", "");
        String title = call.getString("title", "oxherd 值班巡更提醒");
        String message = call.getString("message", "值班时段即将开始，请注意打卡核验。");
        long triggerAtMillis = call.getLong("triggerAtMillis", 0L);
        boolean sound = call.getBoolean("sound", true);
        boolean vibrate = call.getBoolean("vibrate", true);
        int notificationId = (int) (triggerAtMillis % 100000);

        if (triggerAtMillis <= System.currentTimeMillis()) {
            call.reject("triggerAtMillis must be in the future");
            return;
        }

        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            call.reject("AlarmManager is null");
            return;
        }

        Intent intent = new Intent(context, AlarmReceiver.class);
        intent.putExtra("title", title);
        intent.putExtra("message", message);
        intent.putExtra("soundEnabled", sound);
        intent.putExtra("vibrateEnabled", vibrate);
        intent.putExtra("notificationId", notificationId);

        PendingIntent pi = PendingIntent.getBroadcast(
                context,
                notificationId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
        } else {
            alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
        }

        // 写入 SharedPreferences 供开机广播恢复
        try {
            SharedPreferences sp = context.getSharedPreferences(DutyBootReceiver.PREF_NAME, Context.MODE_PRIVATE);
            String rawJson = sp.getString(DutyBootReceiver.KEY_PENDING_ALARMS, "[]");
            JSONArray array = new JSONArray(rawJson);

            JSONObject item = new JSONObject();
            item.put("taskId", taskId);
            item.put("title", title);
            item.put("message", message);
            item.put("triggerAtMillis", triggerAtMillis);
            item.put("sound", sound);
            item.put("vibrate", vibrate);
            item.put("notificationId", notificationId);
            array.put(item);

            sp.edit().putString(DutyBootReceiver.KEY_PENDING_ALARMS, array.toString()).apply();
        } catch (Exception e) {
            e.printStackTrace();
        }

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("notificationId", notificationId);
        call.resolve(ret);
    }

    @PluginMethod
    public void cancelDutyAlarm(PluginCall call) {
        String taskId = call.getString("taskId", "");
        Context context = getContext();
        SharedPreferences sp = context.getSharedPreferences(DutyBootReceiver.PREF_NAME, Context.MODE_PRIVATE);

        try {
            String rawJson = sp.getString(DutyBootReceiver.KEY_PENDING_ALARMS, "[]");
            JSONArray array = new JSONArray(rawJson);
            JSONArray newArray = new JSONArray();
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

            for (int i = 0; i < array.length(); i++) {
                JSONObject item = array.getJSONObject(i);
                if (taskId.equals(item.optString("taskId"))) {
                    int notificationId = item.optInt("notificationId");
                    if (alarmManager != null) {
                        Intent intent = new Intent(context, AlarmReceiver.class);
                        PendingIntent pi = PendingIntent.getBroadcast(
                                context,
                                notificationId,
                                intent,
                                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
                        );
                        alarmManager.cancel(pi);
                    }
                } else {
                    newArray.put(item);
                }
            }
            sp.edit().putString(DutyBootReceiver.KEY_PENDING_ALARMS, newArray.toString()).apply();
        } catch (Exception e) {
            e.printStackTrace();
        }

        call.resolve();
    }

    @PluginMethod
    public void setBootRestoreEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        SharedPreferences sp = getContext().getSharedPreferences(DutyBootReceiver.PREF_NAME, Context.MODE_PRIVATE);
        sp.edit().putBoolean(DutyBootReceiver.KEY_BOOT_RESTORE, enabled).apply();
        call.resolve();
    }
}
