"""Run against real Tk widgets under Xvfb: .legacy-venv/bin/python tests/legacy-ui.py."""
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile
import tkinter as tk
import tkinter.font as tkfont
from unittest.mock import patch

root_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root_dir / "legacy"))
with tempfile.TemporaryDirectory(prefix="readly-legacy-test-") as temporary:
    os.environ["READLY_LEGACY_DATA_DIR"] = temporary
    with patch.object(tk.Tk, "mainloop"), patch("tkinter.messagebox.showerror", side_effect=AssertionError):
        namespace = runpy.run_path(str(root_dir / "legacy/Readly.pyw"))
    # Functions retain the original runpy globals dictionary.
    app = namespace["check_input"].__globals__
    root = app["root"]
    try:
        root.update()
        assert len(tkfont.families(root)) > 1, "Tk cannot see system fonts"
        font = tkfont.Font(root=root, family="Courier New", size=18)
        assert font.measure("Мороз и солнце") > 80, "Cyrillic glyphs did not render"
        assert root.title() == "Readly Legacy"
        assert len(app["notebook"].tabs()) == 4
        if os.environ.get("READLY_LEGACY_SCREENSHOT"):
            from PIL import ImageGrab
            ImageGrab.grab(bbox=(root.winfo_rootx(), root.winfo_rooty(), root.winfo_rootx() + root.winfo_width(), root.winfo_rooty() + root.winfo_height()), xdisplay=os.environ["DISPLAY"]).save(os.environ["READLY_LEGACY_SCREENSHOT"])
        text = app["original_text"]
        assert "Мороз и солнце" in text
        app["text_widget"].insert("1.0", "неправильный ответ")
        app["check_input"]()
        assert app["error_count"] == 1
        app["reset_after_error"]()
        app["text_widget"].insert("1.0", text)
        app["check_input"]()
        assert app["check_button"]["text"] == "Правильно!"
        app["proceed_to_stage_2"]()
        assert app["stage"] == 2
        assert not app["sample_text"].get("1.0", "end").strip()
        app["text_widget"].insert("1.0", text)
        app["check_input"]()
        assert app["check_button"]["text"] == "Успех!"
        app["finish_task"]()
        assert str(app["check_button"]["state"]) == "disabled"
        app["reset"]()
        app["line_text_widget"].insert("1.0", app["lines"][0])
        app["check_line"]()
        assert app["line_check_button"]["text"] == "Правильно!"
        app["theme_var"].set("Тёмная")
        app["update_theme"]()
        app["save_settings"]()
        assert json.loads((Path(temporary) / "settings.txt").read_text())["theme"] == "Тёмная"
        (Path(temporary) / "stih.txt").write_text("Свой текст", encoding="utf-8")
        from legacy_support import data_directory
        data_directory()
        assert (Path(temporary) / "stih.txt").read_text() == "Свой текст"
        print("Legacy UI: tabs, wrong/correct answers, memory, line mode, settings and data preservation OK")
    finally:
        root.destroy()
