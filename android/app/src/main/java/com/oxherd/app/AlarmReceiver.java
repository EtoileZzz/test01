package com.oxherd.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Vibrator;
import android.os.VibrationEffect;
import androidx.core.app.NotificationCompat;

public class AlarmReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "oxherd_duty_reminders";
    public static final String CHANNEL_NAME = "值班巡更提醒";

    @Override
    public void onReceive(Context context, Intent intent) {
        String title = intent.getStringExtra("title");
        String message = intent.getStringExtra("message");
        boolean soundEnabled = intent.getBooleanExtra("soundEnabled", true);
        boolean vibrateEnabled = intent.getBooleanExtra("vibrateEnabled", true);
        int notificationId = intent.getIntExtra("notificationId", (int) System.currentTimeMillis());

        if (title == null || title.isEmpty()) {
            title = "oxherd 值班巡更提醒";
        }
        if (message == null || message.isEmpty()) {
            message = "您的值班任务即将开始或需前往岗位打卡核验，请注意查收。";
        }

        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) return;

        // 默认声音与震动波形 (巡更强震动：等待100ms，震动500ms，停200ms，震动500ms，停200ms，震动800ms)
        long[] vibrationPattern = vibrateEnabled ? new long[]{0, 500, 200, 500, 200, 800} : new long[]{0};
        Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (soundUri == null) {
            soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("用于 oxherd 值班巡检、岗位核验的高优先级响铃震动提醒");
            channel.enableLights(true);
            channel.enableVibration(vibrateEnabled);
            if (vibrateEnabled) {
                channel.setVibrationPattern(vibrationPattern);
            }
            if (soundEnabled && soundUri != null) {
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .build();
                channel.setSound(soundUri, audioAttributes);
            } else {
                channel.setSound(null, null);
            }
            notificationManager.createNotificationChannel(channel);
        }

        // 点击通知唤起主界面
        Intent tapIntent = new Intent(context, MainActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                notificationId,
                tapIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(message)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);

        if (soundEnabled && soundUri != null) {
            builder.setSound(soundUri);
        }
        if (vibrateEnabled) {
            builder.setVibrate(vibrationPattern);
        }

        notificationManager.notify(notificationId, builder.build());

        // 双重保险：如果是强震动模式，额外触发 Vibrator 服务
        if (vibrateEnabled) {
            try {
                Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
                if (vibrator != null && vibrator.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vibrator.vibrate(VibrationEffect.createWaveform(vibrationPattern, -1));
                    } else {
                        vibrator.vibrate(vibrationPattern, -1);
                    }
                }
            } catch (Exception ignored) {}
        }
    }
}
