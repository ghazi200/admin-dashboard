package com.abe.guardui;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Required with {@code Theme.SplashScreen} (see {@code AppTheme.NoActionBarLaunch}).
     * Without this, Android 12+ can leave the splash layer on top so the WebView never appears
     * even though the app process and JS are running.
     */
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void load() {
        super.load();
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView wv = getBridge().getWebView();
            wv.setScrollbarFadingEnabled(false);
        }
    }
}
