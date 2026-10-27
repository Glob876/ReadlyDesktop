"""Prepare an isolated Python environment, run Legacy, or build its standalone app."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
ENV = PROJECT / ".legacy-venv"
PYTHON = ENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")

# A local Tk installation can be used without changing the OS packages.
LOCAL_TK = PROJECT / ".legacy-tk/usr"
if sys.platform == "linux" and LOCAL_TK.exists():
    os.environ["LD_LIBRARY_PATH"] = str(LOCAL_TK / "lib") + os.pathsep + os.environ.get("LD_LIBRARY_PATH", "")
    os.environ["TCL_LIBRARY"] = str(LOCAL_TK / "lib/tcl8.6")
    os.environ["TK_LIBRARY"] = str(LOCAL_TK / "lib/tk8.6")


def run(args):
    subprocess.run([str(arg) for arg in args], check=True)


def prepare():
    uv = shutil.which("uv")
    if not PYTHON.exists():
        if uv and sys.platform == "linux":
            run([uv, "venv", "--python", sys.executable, "--no-managed-python", ENV])
        elif uv:
            run([uv, "venv", "--managed-python", "--python", "3.12", ENV])
        else:
            run([sys.executable, "-m", "venv", ENV])
    probe = subprocess.run([str(PYTHON), "-c", "import tkinter"], capture_output=True, text=True)
    if probe.returncode:
        raise RuntimeError("Python не может загрузить Tkinter. Установите системный Tkinter: python3-tk (Debian/Ubuntu), tk (Arch), python3-tkinter (Fedora). Для сборки без Legacy: ./build.sh --no-legacy.\n" + probe.stderr)
    if sys.platform == "linux":
        module = subprocess.check_output([str(PYTHON), "-c", "import _tkinter; print(_tkinter.__file__)"], text=True).strip()
        libraries = subprocess.check_output(["ldd", module], text=True)
        if "libXft" not in libraries:
            raise RuntimeError("Этот Python собран с Tk без Xft: кириллица будет отображаться неправильно. Используйте системный Python с Tkinter и Xft вместо Python из uv. Удалите .legacy-venv и повторите запуск системным python3.")
    requirements = ROOT / "requirements.txt"
    digest = hashlib.sha256(requirements.read_bytes()).hexdigest()
    stamp = ENV / ".readly-requirements"
    if not stamp.exists() or stamp.read_text() != digest:
        if uv:
            run([uv, "pip", "install", "--python", PYTHON, "-r", requirements])
        else:
            run([PYTHON, "-m", "pip", "install", "-r", requirements])
        stamp.write_text(digest)
    return PYTHON


def main():
    arguments = sys.argv[1:]
    if arguments not in ([], ["--build"]):
        raise RuntimeError("Использование: bootstrap.py [--build]")
    python = prepare()
    if arguments == ["--build"]:
        run([python, "-m", "PyInstaller", "--noconfirm", "--clean", "--windowed",
             "--hidden-import", "PIL._tkinter_finder",
             "--name", "ReadlyLegacy", "--distpath", PROJECT / "release/legacy",
             "--workpath", PROJECT / "release/legacy-work", "--specpath", PROJECT / "release/legacy-work",
             "--add-data", str(ROOT / "stih.txt") + os.pathsep + ".",
             "--add-data", str(ROOT / "ava.ico") + os.pathsep + ".",
             *[arg for name in ("click.wav", "click1.wav", "click2.wav")
               for arg in ("--add-data", str(ROOT / name) + os.pathsep + ".")],
             ROOT / "Readly.pyw"])
    else:
        os.execv(str(python), [str(python), str(ROOT / "Readly.pyw")])


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print(f"Readly Legacy: {error}", file=sys.stderr)
        sys.exit(1)
