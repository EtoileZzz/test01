package com.oxherd.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.Window;
import android.widget.Toast;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "OxherdNative",
    permissions = {
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA })
    }
)
public class OxherdPlugin extends Plugin {

    private Uri currentCameraPhotoUri = null;
    private File currentCameraTempFile = null;
    private String currentPostName = "岗位";
    private String currentItemTitle = "巡查";

    /**
     * 原生直启相机拍照，并直接将超清原画保存至手机相册「oxherd」专属相册文件夹
     */
    @PluginMethod
    public void capturePhoto(PluginCall call) {
        currentPostName = call.getString("postName", "岗位");
        currentItemTitle = call.getString("itemTitle", "巡查");

        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermissionCallback");
        } else {
            launchCamera(call);
        }
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            launchCamera(call);
        } else {
            call.reject("需要相机权限才能进行现场拍照打卡，请在系统设置中允许相机权限。");
        }
    }

    private void launchCamera(PluginCall call) {
        try {
            Context context = getContext();
            File cacheDir = new File(context.getCacheDir(), "camera_temp");
            if (!cacheDir.exists()) {
                cacheDir.mkdirs();
            }
            currentCameraTempFile = new File(cacheDir, "temp_capture_" + System.currentTimeMillis() + ".jpg");
            currentCameraPhotoUri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", currentCameraTempFile);

            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, currentCameraPhotoUri);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);

            startActivityForResult(call, intent, "cameraResultCallback");
        } catch (Exception e) {
            call.reject("启动系统相机失败: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void cameraResultCallback(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != android.app.Activity.RESULT_OK) {
            if (currentCameraTempFile != null && currentCameraTempFile.exists()) {
                currentCameraTempFile.delete();
            }
            call.reject("拍照已取消");
            return;
        }

        if (currentCameraTempFile == null || !currentCameraTempFile.exists() || currentCameraTempFile.length() == 0) {
            call.reject("未能成功获取拍摄照片");
            return;
        }

        Context context = getContext();
        try {
            // 1. 生成相册保存规范文件名：[岗位]_[条目名称]_[时间].jpg
            String safePost = currentPostName.replaceAll("[\\\\/:*?\"<>|\\s]", "_");
            String safeTitle = currentItemTitle.replaceAll("[\\\\/:*?\"<>|\\s]", "_");
            if (safeTitle.length() > 10) safeTitle = safeTitle.substring(0, 10);
            String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(new Date());
            String fileName = safePost + "_" + safeTitle + "_" + timestamp + ".jpg";

            // 2. 超清原图直存手机相册专属目录 Pictures/oxherd（无损原始画质）
            Uri savedGalleryUri = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/oxherd");
                savedGalleryUri = context.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (savedGalleryUri != null) {
                    try (OutputStream os = context.getContentResolver().openOutputStream(savedGalleryUri);
                         java.io.FileInputStream fis = new java.io.FileInputStream(currentCameraTempFile)) {
                        byte[] buffer = new byte[8192];
                        int bytesRead;
                        while ((bytesRead = fis.read(buffer)) != -1) {
                            os.write(buffer, 0, bytesRead);
                        }
                        os.flush();
                    }
                }
            } else {
                File picturesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
                File oxherdDir = new File(picturesDir, "oxherd");
                if (!oxherdDir.exists()) {
                    oxherdDir.mkdirs();
                }
                File destFile = new File(oxherdDir, fileName);
                try (java.io.FileInputStream fis = new java.io.FileInputStream(currentCameraTempFile);
                     FileOutputStream fos = new FileOutputStream(destFile)) {
                    byte[] buffer = new byte[8192];
                    int bytesRead;
                    while ((bytesRead = fis.read(buffer)) != -1) {
                        fos.write(buffer, 0, bytesRead);
                    }
                    fos.flush();
                }
                savedGalleryUri = Uri.fromFile(destFile);
                MediaScannerConnection.scanFile(context, new String[]{destFile.getAbsolutePath()}, new String[]{"image/jpeg"}, null);
            }

            // 3. 提取轻量级缩略图（宽度 240px，体积仅 ~10KB），用于前端卡片流畅渲染，避免 DOM / localStorage OOM
            android.graphics.BitmapFactory.Options opts = new android.graphics.BitmapFactory.Options();
            opts.inJustDecodeBounds = true;
            android.graphics.BitmapFactory.decodeFile(currentCameraTempFile.getAbsolutePath(), opts);
            int origWidth = opts.outWidth;
            int origHeight = opts.outHeight;
            int sampleSize = 1;
            while ((origWidth / sampleSize) > 400 || (origHeight / sampleSize) > 400) {
                sampleSize *= 2;
            }
            opts.inSampleSize = sampleSize;
            opts.inJustDecodeBounds = false;
            android.graphics.Bitmap thumbBmp = android.graphics.BitmapFactory.decodeFile(currentCameraTempFile.getAbsolutePath(), opts);

            String thumbBase64 = "";
            if (thumbBmp != null) {
                java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                thumbBmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 75, baos);
                thumbBase64 = "data:image/jpeg;base64," + android.util.Base64.encodeToString(baos.toByteArray(), android.util.Base64.NO_WRAP);
                thumbBmp.recycle();
            }

            // 清理临时缓存文件
            currentCameraTempFile.delete();

            // 提示用户已存入相册
            if (getActivity() != null) {
                getActivity().runOnUiThread(() -> {
                    Toast.makeText(context, "📷 原画已存入手机相册「oxherd」专辑", Toast.LENGTH_SHORT).show();
                });
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("fileName", fileName);
            ret.put("thumbnailDataUrl", thumbBase64);
            ret.put("fullUri", savedGalleryUri != null ? savedGalleryUri.toString() : "");
            ret.put("timestamp", new SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(new Date()));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("保存至相册失败: " + e.getMessage());
        }
    }

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

    /**
     * 真正保存配置文件至手机公共下载目录（绝不用剪贴板）
     */
    @PluginMethod
    public void saveConfigFile(PluginCall call) {
        String fileName = call.getString("fileName", "oxherd_duty_config.json");
        String content = call.getString("content", "{}");
        Context context = getContext();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/oxherd");

                Uri uri = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri != null) {
                    try (OutputStream os = context.getContentResolver().openOutputStream(uri)) {
                        if (os != null) {
                            os.write(content.getBytes(StandardCharsets.UTF_8));
                            os.flush();
                        }
                    }
                }
            } else {
                File downloadDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File oxherdDir = new File(downloadDir, "oxherd");
                if (!oxherdDir.exists()) {
                    oxherdDir.mkdirs();
                }
                File file = new File(oxherdDir, fileName);
                try (FileOutputStream fos = new FileOutputStream(file)) {
                    fos.write(content.getBytes(StandardCharsets.UTF_8));
                    fos.flush();
                }
                MediaScannerConnection.scanFile(context, new String[]{file.getAbsolutePath()}, null, null);
            }

            if (getActivity() != null) {
                getActivity().runOnUiThread(() -> {
                    Toast.makeText(context, "✅ 配置文件已保存至「手机文件/下载/oxherd」目录", Toast.LENGTH_LONG).show();
                });
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("path", "下载/oxherd/" + fileName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("保存配置文件失败: " + e.getMessage());
        }
    }

    /**
     * 原生文件分享到微信 / TIM / QQ 等应用（绝不用剪贴板）
     */
    @PluginMethod
    public void shareConfigFile(PluginCall call) {
        String fileName = call.getString("fileName", "oxherd_duty_config.json");
        String content = call.getString("content", "{}");
        Context context = getContext();

        try {
            File cacheDir = new File(context.getCacheDir(), "shared_configs");
            if (!cacheDir.exists()) {
                cacheDir.mkdirs();
            }
            File file = new File(cacheDir, fileName);
            try (FileOutputStream fos = new FileOutputStream(file)) {
                fos.write(content.getBytes(StandardCharsets.UTF_8));
                fos.flush();
            }

            Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);

            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("application/json");
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.putExtra(Intent.EXTRA_SUBJECT, "oxherd 值班巡检配置文件");
            intent.putExtra(Intent.EXTRA_TEXT, "分享 oxherd 值班巡检配置文件，可在应用内直接导入。");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(intent, "分享值班配置文件到微信/TIM/其它应用");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(chooser);

            call.resolve();
        } catch (Exception e) {
            call.reject("调起系统分享失败: " + e.getMessage());
        }
    }

    /**
     * 同步状态栏和导航栏文字图标的主题色（亮色/深色切换时高对比度显示）
     */
    @PluginMethod
    public void setStatusBarTheme(PluginCall call) {
        boolean isLight = call.getBoolean("isLight", false);
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                Window window = getActivity().getWindow();
                WindowInsetsControllerCompat controller =
                        WindowCompat.getInsetsController(window, window.getDecorView());
                if (controller != null) {
                    controller.setAppearanceLightStatusBars(isLight);
                    controller.setAppearanceLightNavigationBars(isLight);
                }
            });
        }
        call.resolve();
    }

    /**
     * 原生持久化金库备份：防止应用升级、系统清理 WebView 时数据意外丢失
     */
    @PluginMethod
    public void backupData(PluginCall call) {
        String key = call.getString("key", "");
        String value = call.getString("value", "");
        if (key != null && !key.isEmpty()) {
            SharedPreferences sp = getContext().getSharedPreferences("oxherd_native_persistent_vault", Context.MODE_PRIVATE);
            sp.edit().putString(key, value).apply();
        }
        call.resolve();
    }

    /**
     * 原生持久化金库还原
     */
    @PluginMethod
    public void restoreData(PluginCall call) {
        String key = call.getString("key", "");
        SharedPreferences sp = getContext().getSharedPreferences("oxherd_native_persistent_vault", Context.MODE_PRIVATE);
        String value = sp.getString(key, null);
        JSObject ret = new JSObject();
        ret.put("value", value);
        call.resolve(ret);
    }
}
