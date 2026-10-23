package app.aobible;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // От края до края на всех версиях Android, как с Android 15 по умолчанию (совет Google Play):
        // отступы под строкой состояния, вырезом и кнопками навигации раскладывает Capacitor (SystemBars) и CSS страницы
        EdgeToEdge.enable(this);
        // Свой модуль: цвет полос под строкой состояния и кнопками навигации (см. AppBarsPlugin)
        registerPlugin(AppBarsPlugin.class);
        // Виджет «Стих дня»: приложение передаёт ему стихи на месяц вперёд (см. VerseWidgetPlugin)
        registerPlugin(VerseWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        // Сразу цвета прошлой темы (без вспышки светлого фона у тёмной темы)
        AppBarsPlugin.restore(this, getBridge() != null ? getBridge().getWebView() : null);
    }
}
