# Sadaqa Jaria release rules — kotlinx-serialization keep rules
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keep,includedescriptorclasses class app.sadaqa.android.**$$serializer { *; }
-keepclassmembers class app.sadaqa.android.** { *** Companion; }
-keepclasseswithmembers class app.sadaqa.android.** { kotlinx.serialization.KSerializer serializer(...); }
