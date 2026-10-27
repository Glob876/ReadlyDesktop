"""Platform support for the original Tkinter interface."""
import os
from pathlib import Path
import shutil
import subprocess
import sys


def data_directory():
    override = os.environ.get("READLY_LEGACY_DATA_DIR")
    if override:
        directory = Path(override).expanduser().resolve()
    elif sys.platform == "win32":
        directory = Path(os.environ.get("APPDATA", Path.home() / "AppData/Roaming")) / "ReadlyLegacy"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", ""))
        if not base.is_absolute():
            base = Path.home() / ".local/share"
        directory = base / "readly-legacy"
    directory.mkdir(parents=True, exist_ok=True)
    # Never replace the user's text on startup or update.
    if not any((directory / ("stih" + ext)).exists() for ext in (".txt", ".md", ".text")):
        try:
            with (directory / "stih.txt").open("x", encoding="utf-8") as stream:
                stream.write((Path(__file__).parent / "stih.txt").read_text(encoding="utf-8"))
        except FileExistsError:
            pass
    return directory


class Sound:
    SND_ASYNC = 1
    SND_FILENAME = 0

    @staticmethod
    def Beep(*args):
        pass

    @staticmethod
    def PlaySound(filename, flags):
        asset = str(Path(__file__).parent / filename)
        if sys.platform == "win32":
            import winsound
            winsound.PlaySound(asset, winsound.SND_ASYNC | winsound.SND_FILENAME)
        else:
            for player in ("paplay", "aplay"):
                executable = shutil.which(player)
                if executable:
                    # Reap the short-lived audio process without blocking the GUI.
                    import threading
                    process = subprocess.Popen([executable, asset], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    threading.Thread(target=process.wait, daemon=True).start()
                    break


sound = Sound()
