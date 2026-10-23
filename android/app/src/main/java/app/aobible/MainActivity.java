package app.aobible;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Свой модуль: цвет полос под строкой состояния и кнопками навигации (см. AppBarsPlugin)
        registerPlugin(AppBarsPlugin.class);
        // Виджет «Стих дня»: приложение передаёт ему стихи на месяц вперёд (см. VerseWidgetPlugin)
        registerPlugin(VerseWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
