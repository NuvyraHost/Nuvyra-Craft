package com.nuvyra.craft.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ServerProcessPlugin.class);
        registerPlugin(JavaManagerPlugin.class);
        registerPlugin(FileManagerPlugin.class);
        registerPlugin(SystemInfoPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (isFinishing()) {
            ServerProcessPlugin.stopServerSafely();
        }
    }
}
