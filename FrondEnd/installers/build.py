"""Build both private installers into FrondEnd/public/descargas on Windows."""
import argparse
import ipaddress
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree
from zipfile import ZipFile

import msilib as m
from msilib import schema, sequence
from PIL import Image

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public"


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True)


def local_url(value, android=False):
    url = urlsplit(value)
    if not url.hostname or url.username or url.password or url.path not in ("", "/") or url.query or url.fragment:
        raise ValueError("Usa la dirección raíz de la prueba.")
    host = url.hostname
    local = host == "localhost" or ipaddress.ip_address(host).is_private
    if not local or (url.scheme != "https" and (android or host not in ("localhost", "127.0.0.1") or url.scheme != "http")):
        raise ValueError("Android requiere HTTPS local. Windows también admite HTTP en localhost.")
    if url.port is None:
        return f"{url.scheme}://{host}/"
    return f"{url.scheme}://{host}:{url.port}/"


def android(tmp, args):
    sdk = Path(os.environ["ANDROID_HOME"])
    java = Path(os.environ["JAVA_HOME"]) / "bin"
    tools = sdk / "build-tools" / args.tools
    platform = sdk / "platforms" / args.platform / "android.jar"
    gen, classes, dex, res = (tmp / n for n in ("gen", "classes", "dex", "res"))
    for path in (gen, classes, dex, res / "xml", res / "values", res / "raw", res / "drawable-nodpi"):
        path.mkdir(parents=True)
    origin = local_url(args.android_url, android=True)
    security = ElementTree.Element("network-security-config")
    domain = ElementTree.SubElement(security, "domain-config", cleartextTrafficPermitted="false")
    ElementTree.SubElement(domain, "domain").text = urlsplit(origin).hostname
    anchors = ElementTree.SubElement(domain, "trust-anchors")
    ElementTree.SubElement(anchors, "certificates", src="@raw/local_ca")
    ElementTree.ElementTree(security).write(res / "xml/network_security_config.xml", encoding="utf-8")
    shutil.copyfile(args.ca, res / "raw/local_ca.crt")
    values = ElementTree.Element("resources")
    ElementTree.SubElement(values, "string", name="home", translatable="false").text = origin
    ElementTree.ElementTree(values).write(res / "values/config.xml", encoding="utf-8")
    shutil.copyfile(PUBLIC / "pwa/icon-192.png", res / "drawable-nodpi/icon.png")
    unsigned = tmp / "unsigned.apk"
    run(tools / "aapt.exe", "package", "-f", "-m", "-J", gen, "-M", HERE / "AndroidManifest.xml",
        "-S", res, "-I", platform, "-F", unsigned)
    run(java / "javac.exe", "-encoding", "UTF-8", "--release", "8", "-classpath", platform,
        "-d", classes, *gen.rglob("R.java"), HERE / "MainActivity.java")
    run(java / "jar.exe", "cf", tmp / "classes.jar", "-C", classes, ".")
    run(tools / "d8.bat", "--lib", platform, "--min-api", "26", "--output", dex, tmp / "classes.jar")
    with ZipFile(unsigned, "a") as apk:
        apk.write(dex / "classes.dex", "classes.dex")
    run(tools / "zipalign.exe", "-f", "4", unsigned, tmp / "aligned.apk")
    result = tmp / "EntreCortes.apk"
    run(tools / "apksigner.bat", "sign", "--ks", args.keystore, "--ks-key-alias", "entrecortes",
        "--ks-pass", "env:ENTRECORTES_KEYPASS", "--out", result, tmp / "aligned.apk")
    run(tools / "apksigner.bat", "verify", "--verbose", result)
    return result


def windows(tmp, args):
    result = tmp / "EntreCortes.msi"
    exe, icon = tmp / "EntreCortes.exe", tmp / "EntreCortes.ico"
    with Image.open(PUBLIC / "pwa/icon-512.png") as image:
        image.save(icon, sizes=[(n,n) for n in (16,32,48,64,128,256)])
    src = tmp / "Launcher.cs"
    src.write_text((HERE / "Launcher.cs").read_text(encoding="utf8").replace("__SERVICE_URL__", local_url(args.windows_url)), encoding="utf-8-sig")
    csc = Path(os.environ["WINDIR"]) / "Microsoft.NET/Framework/v4.0.30319/csc.exe"
    run(csc, "/nologo", "/target:winexe", "/platform:anycpu", "/reference:System.Windows.Forms.dll",
        "/win32icon:" + str(icon), "/out:" + str(exe), src)
    m.AMD64 = False
    db = m.init_database(str(result), schema, "EntreCortes (prueba local)",
                         "{614B4716-4B32-4030-8114-C2F4821A2F18}", "1.0.0", "EntreCortes")
    m.add_tables(db, sequence)
    summary = db.GetSummaryInformation(1)
    summary.SetProperty(m.PID_WORDCOUNT, 10)  # compressed, per-user, no elevation
    summary.Persist()
    cab = m.CAB("entrecortes.cab")
    root = m.Directory(db, cab, None, str(tmp), "TARGETDIR", "SourceDir")
    local = m.Directory(db, cab, root, "", "LocalAppDataFolder", ".")
    app = m.Directory(db, cab, local, "", "INSTALLDIR", "ECORTES|EntreCortesPWA")
    feature = m.Feature(db, "App", "EntreCortes", "Aplicación local", 1)
    app.start_component("Launcher", feature=feature, flags=0, keyfile=exe.name, uuid="{75F448F3-63C0-41AB-BA9D-BD7CB5B3B8DA}")
    app.add_file(exe.name)
    m.add_data(db, "Icon", [("EntreCortes.ico", m.Binary(str(icon)))])
    m.add_data(db, "Property", [("ARPPRODUCTICON", "EntreCortes.ico")])
    for folder in ("ProgramMenuFolder", "DesktopFolder"):
        m.Directory(db, cab, root, "", folder, ".")
        m.add_data(db, "Shortcut", [("Abrir" + folder, folder, "ECORTES|EntreCortes", "Launcher",
                    "App", None, "Abrir EntreCortes", None, "EntreCortes.ico", 0, 1, "INSTALLDIR")])
    cab.commit(db)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("android-url", "windows-url", "keystore", "ca"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--tools", default="36.0.0")
    parser.add_argument("--platform", default="android-37.0")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as directory:
        tmp = Path(directory)
        files = (android(tmp, args), windows(tmp, args))
        dest = PUBLIC / "descargas"
        dest.mkdir(exist_ok=True)
        for path in files:
            stage = dest / (path.name + ".tmp")
            shutil.copyfile(path, stage)
            stage.replace(dest / path.name)
        (dest / "disponibles.json").write_text(json.dumps({"version": 1}), encoding="utf8")


if __name__ == "__main__":
    main()
