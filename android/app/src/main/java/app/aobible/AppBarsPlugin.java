package app.aobible;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.View;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Цвет полос под строкой состояния и под кнопками навигации.
 * На телефонах со старым встроенным браузером (WebView < 140) Capacitor не растягивает страницу под системные
 * полосы, а отодвигает её отступами окна — и в отступах виден фон окна (по умолчанию белый).
 * Красим фон окна: верх — цветом верхней панели приложения, низ — цветом страницы.
 * Середину закрывает сама страница, поэтому переход цветов не виден.
 */
@CapacitorPlugin(name = "AppBars")
public class AppBarsPlugin extends Plugin {

    @PluginMethod
    public void setColors(PluginCall call) {
        final int top;
        final int bottom;
        try {
            top = Color.parseColor(call.getString("top", "#000000"));
            bottom = Color.parseColor(call.getString("bottom", "#000000"));
        } catch (IllegalArgumentException e) {
            call.reject("bad color");
            return;
        }
        // Запоминаем: при следующем запуске окно сразу этих цветов (тёмная тема — без светлой вспышки)
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt("top", top).putInt("bottom", bottom).apply();
        getActivity()
            .runOnUiThread(() -> {
                apply(getActivity(), top, bottom);
                call.resolve();
            });
    }

    static final String PREFS = "app_bars";

    static void apply(Activity activity, int top, int bottom) {
        View decor = activity.getWindow().getDecorView();
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] { top, top, bottom, bottom });
        decor.setBackground(bg);
    }

    // Запуск: цвета прошлой темы — окну и подложке страницы, ещё до загрузки приложения
    static void restore(Activity activity, View webView) {
        android.content.SharedPreferences p = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!p.contains("bottom")) return;
        int top = p.getInt("top", 0);
        int bottom = p.getInt("bottom", 0);
        apply(activity, top, bottom);
        if (webView != null) webView.setBackgroundColor(bottom);
    }
}
