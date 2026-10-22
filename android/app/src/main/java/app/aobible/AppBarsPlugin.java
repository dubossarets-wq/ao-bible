package app.aobible;

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
        getActivity()
            .runOnUiThread(() -> {
                View decor = getActivity().getWindow().getDecorView();
                GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] { top, top, bottom, bottom });
                decor.setBackground(bg);
                call.resolve();
            });
    }
}
