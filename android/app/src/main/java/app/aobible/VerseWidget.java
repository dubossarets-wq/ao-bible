package app.aobible;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Виджет «Стих дня» на главном экране. Стихи на месяц вперёд присылает приложение (VerseWidgetPlugin);
 * здесь берётся стих на сегодняшнюю дату (если такой нет — последний из списка). Нажатие открывает приложение.
 * Система обновляет виджет раз в несколько часов (verse_widget_info.xml) — так стих меняется и без запуска приложения.
 */
public class VerseWidget extends AppWidgetProvider {

    static final String PREFS = "verse_widget";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, views(ctx));
    }

    static void updateAll(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(new ComponentName(ctx, VerseWidget.class));
        for (int id : ids) manager.updateAppWidget(id, views(ctx));
    }

    private static RemoteViews views(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_verse);
        String text = ctx.getString(R.string.widget_empty);
        String ref = "";
        String title = "";
        try {
            android.content.SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            title = p.getString("title", "");
            JSONArray items = new JSONArray(p.getString("items", "[]"));
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            JSONObject pick = null;
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.getJSONObject(i);
                if (it.optString("d").compareTo(today) <= 0) pick = it; // список по датам — последний не позже сегодня
            }
            if (pick == null && items.length() > 0) pick = items.getJSONObject(0);
            if (pick != null) {
                text = pick.optString("text", text);
                ref = pick.optString("ref", "");
            }
        } catch (Exception ignored) {
            // нет данных — показываем подсказку открыть приложение
        }
        v.setTextViewText(R.id.widget_title, title.isEmpty() ? ctx.getString(R.string.widget_title) : title);
        v.setTextViewText(R.id.widget_text, text);
        v.setTextViewText(R.id.widget_ref, ref);
        Intent open = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.widget_root, pi);
        return v;
    }
}
