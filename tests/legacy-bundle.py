"""Check the packaged Legacy without external Python/Tk environment variables."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

project = Path(__file__).resolve().parents[1]
executable = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else project / "release/Readly-linux-x64/ReadlyLegacy"
with tempfile.TemporaryDirectory(prefix="readly-frozen-") as directory:
    env = dict(os.environ, READLY_LEGACY_DATA_DIR=directory)
    for key in ("LD_LIBRARY_PATH", "TCL_LIBRARY", "TK_LIBRARY", "PYTHONHOME", "PYTHONPATH"):
        env.pop(key, None)
    child = subprocess.Popen([str(executable)], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        deadline = time.monotonic() + 10
        while not (Path(directory) / "stih.txt").exists():
            if child.poll() is not None:
                raise AssertionError(child.communicate())
            if time.monotonic() >= deadline:
                raise AssertionError("Legacy did not initialize")
            time.sleep(0.05)
        time.sleep(1)
        assert child.poll() is None, child.communicate()
        if os.environ.get("READLY_LEGACY_SCREENSHOT"):
            from PIL import ImageGrab
            ImageGrab.grab(xdisplay=os.environ["DISPLAY"]).save(os.environ["READLY_LEGACY_SCREENSHOT"])
        print("Standalone Legacy opened without external Python/Tk environment")
    finally:
        child.terminate()
        out, err = child.communicate(timeout=5)
        assert not err, err.decode()
