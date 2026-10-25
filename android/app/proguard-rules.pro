# Add project specific ProGuard rules here.
-keep public class * extends com.getcapacitor.Plugin {
    public *;
}
-keep public class * extends com.getcapacitor.BridgeActivity {
    public *;
}
-keep class com.getcapacitor.** { *; }
-keep class com.oxherd.app.** { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
    @com.getcapacitor.annotation.CapacitorPlugin public *;
}
-dontwarn com.getcapacitor.**
