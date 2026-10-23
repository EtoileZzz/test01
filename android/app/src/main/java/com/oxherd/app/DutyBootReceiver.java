package com.oxherd.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;

public class DutyBootReceiver extends BroadcastReceiver {
    private static final String TAG = "DutyBootReceiver";
    public static final String PREF_NAME = "oxherd_alarm_prefs";
    public static final String KEY_BOOT_RESTORE = "boot_restore_enabled";
    public static final String KEY_PENDING_ALARMS = "pending_alarms_json";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        Log.i(TAG, "收到系统广播: " + action);

        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            Intent.ACTION_MY_PACKAGE_REPLACED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action)) {

            SharedPreferences sp = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
            boolean bootRestoreEnabled = sp.getBoolean(KEY_BOOT_RESTORE, true);

            if (!bootRestoreEnabled) {
                Log.i(TAG, "开机自启恢复调度未开启，跳过恢复。");
                return;
            }

            String alarmsJson = sp.getString(KEY_PENDING_ALARMS, "[]");
            restoreAlarms(context, alarmsJson);
        }
    }

    private void restoreAlarms(Context context, String alarmsJson) {
        try {
            JSONArray array = new JSONArray(alarmsJson);
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) return;

            long now = System.currentTimeMillis();
            JSONArray remainingArray = new JSONArray();

            for (int i = 0; i < array.length(); i++) {
                JSONObject item = array.getJSONObject(i);
                long triggerAtMillis = item.optLong("triggerAtMillis");
                String taskId = item.optString("taskId");
                String title = item.optString("title");
                String message = item.optString("message");
                boolean sound = item.optBoolean("sound", true);
                boolean vibrate = item.optBoolean("vibrate", true);
                int notificationId = item.optInt("notificationId", (int) (triggerAtMillis % 100000));

                if (triggerAtMillis > now) {
                    Intent alarmIntent = new Intent(context, AlarmReceiver.class);
                    alarmIntent.putExtra("title", title);
                    alarmIntent.putExtra("message", message);
                    alarmIntent.putExtra("soundEnabled", sound);
                    alarmIntent.putExtra("vibrateEnabled", vibrate);
                    alarmIntent.putExtra("notificationId", notificationId);

                    PendingIntent pi = PendingIntent.getBroadcast(
                            context,
                            notificationId,
                            alarmIntent,
                            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
                    );

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
                    } else {
                        alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
                    }
                    remainingArray.put(item);
                    Log.i(TAG, "已成功恢复值班闹钟: " + title + " 触发时间: " + triggerAtMillis);
                }
            }

            // 更新 SharedPreferences 中剩余未过期的闹钟
            SharedPreferences sp = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
            sp.edit().putString(KEY_PENDING_ALARMS, remainingArray.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "恢复值班闹钟失败", e);
        }
    }
}
