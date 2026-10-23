package app.aobible;

import android.content.Context;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Приложение передаёт виджету «Стих дня» стихи на месяц вперёд (src/core/widget.js):
 * список хранится в настройках приложения, виджет сам берёт стих на сегодняшнюю дату.
 */
@CapacitorPlugin(name = "VerseWidget")
public class VerseWidgetPlugin extends Plugin {

    @PluginMethod
    public void setVerses(PluginCall call) {
        String items = call.getString("items", "[]");
        String title = call.getString("title", "");
        Context ctx = getContext();
        ctx.getSharedPreferences(VerseWidget.PREFS, Context.MODE_PRIVATE).edit().putString("items", items).putString("title", title).apply();
        VerseWidget.updateAll(ctx);
        call.resolve();
    }
}
