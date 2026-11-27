package mx.entrecortes.prueba;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;

public final class MainActivity extends Activity {
    private static final int CAMERA = 1, PICK = 2;
    private WebView web;
    private Uri home;
    private PermissionRequest camera;
    private ValueCallback<Uri[]> picker;
    private Button retry;

    private boolean sameOrigin(Uri address) {
        return home.getScheme().equals(address.getScheme())
            && home.getHost().equalsIgnoreCase(address.getHost())
            && home.getPort() == address.getPort();
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        home = Uri.parse(getString(R.string.home));
        LinearLayout frame = new LinearLayout(this);
        frame.setOrientation(LinearLayout.VERTICAL);
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            frame.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            });
            getWindow().setDecorFitsSystemWindows(false);
        }
        retry = new Button(this);
        retry.setText("Reintentar conexión con EntreCortes");
        retry.setVisibility(android.view.View.GONE);
        retry.setOnClickListener(v -> web.loadUrl(home.toString()));
        frame.addView(retry);
        web = new WebView(this);
        frame.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(frame);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setUserAgentString(web.getSettings().getUserAgentString() + " EntreCortesAndroid/1");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (sameOrigin(uri)) return false;
                if (request.isForMainFrame() && request.hasGesture() && "https".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (android.content.ActivityNotFoundException ignored) { }
                }
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                retry.setVisibility(android.view.View.GONE);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) retry.setVisibility(android.view.View.VISIBLE);
            }
        });
        web.setDownloadListener((url, agent, disposition, type, size) -> {
            Uri uri = Uri.parse(url);
            if (sameOrigin(uri) && ("/descargas/EntreCortes.apk".equals(uri.getPath())
                || "/descargas/EntreCortes.msi".equals(uri.getPath()))) {
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                catch (android.content.ActivityNotFoundException ignored) {
                    android.widget.Toast.makeText(this, "Abre la página en Chrome para descargar.",
                        android.widget.Toast.LENGTH_LONG).show();
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                if (!sameOrigin(request.getOrigin())
                    || !java.util.Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                    request.deny();
                    return;
                }
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                } else if (camera == null) {
                    camera = request;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA);
                } else request.deny();
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (camera == request) camera = null;
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> result, FileChooserParams params) {
                if (picker != null) picker.onReceiveValue(null);
                picker = result;
                try { startActivityForResult(params.createIntent(), PICK); }
                catch (android.content.ActivityNotFoundException ignored) { picker.onReceiveValue(null); picker = null; }
                return true;
            }
        });
        if (state == null || web.restoreState(state) == null) web.loadUrl(home.toString());
    }

    @Override public void onRequestPermissionsResult(int code, String[] names, int[] grants) {
        super.onRequestPermissionsResult(code, names, grants);
        if (code != CAMERA || camera == null) return;
        if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED
            && web.getUrl() != null && sameOrigin(Uri.parse(web.getUrl())))
            camera.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        else camera.deny();
        camera = null;
    }
    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code != PICK || picker == null) return;
        Uri[] chosen = WebChromeClient.FileChooserParams.parseResult(result, data);
        java.util.List<Uri> files = new java.util.ArrayList<>();
        if (chosen != null) for (Uri uri : chosen) {
            if ("content".equals(uri.getScheme()) && checkUriPermission(uri, android.os.Process.myPid(),
                android.os.Process.myUid(), Intent.FLAG_GRANT_READ_URI_PERMISSION) == PackageManager.PERMISSION_GRANTED)
                files.add(uri);
        }
        picker.onReceiveValue(files.isEmpty() ? null : files.toArray(new Uri[0]));
        picker = null;
    }
    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        web.saveState(state);
    }
    @Override protected void onDestroy() {
        if (picker != null) picker.onReceiveValue(null);
        if (camera != null) camera.deny();
        ((ViewGroup) web.getParent()).removeView(web);
        web.destroy();
        super.onDestroy();
    }
}
