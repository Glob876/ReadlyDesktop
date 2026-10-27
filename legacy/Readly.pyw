import tkinter as tk
from tkinter import ttk, messagebox
import json
import os
import subprocess
import platform
from legacy_support import sound as winsound, data_directory
import requests
from bs4 import BeautifulSoup
import threading
import webbrowser
from PIL import Image, ImageDraw, ImageTk
import time

# Инициализация окна
root = tk.Tk(className="ReadlyLegacy")
script_dir = str(data_directory())
asset_dir = os.path.dirname(os.path.abspath(__file__))
try:
    icon_image = ImageTk.PhotoImage(Image.open(os.path.join(asset_dir, "ava.ico")))
    root.iconphoto(True, icon_image)
except (OSError, tk.TclError):
    pass
root.title("Readly Legacy")
root.geometry("1200x850")
try:
    root.state('zoomed')
except tk.TclError:
    try:
        root.attributes('-zoomed', True)
    except tk.TclError:
        pass

# Глобальные переменные
original_text = ""
stage = 1
case_sensitive = True
punctuation_sensitive = True
delay_time = 6
font_size = 18
auto_clear = True
bg_color = "#F5F5F4"
text_bg_color = "#FFFFFF"
button_color = "#D9E7F4"
text_color = "#333333"
theme = "Светлая"
language = "Русский"
error_count = 0  # Счётчик ошибок в сессии

lines = []
current_line = 0
line_stage = 1
quatrains = []
current_quatrain = 0

theme_var = tk.StringVar(value="Светлая")
language_var = tk.StringVar(value="Русский")
case_var = tk.BooleanVar(value=True)
punct_var = tk.BooleanVar(value=True)
auto_clear_var = tk.BooleanVar(value=True)

themes = {
    "Светлая": {"bg_color": "#F5F5F4", "text_bg_color": "#FFFFFF", "button_color": "#D9E7F4", "text_color": "#333333"},
    "Тёмная": {"bg_color": "#2F2F2F", "text_bg_color": "#3C3C3C", "button_color": "#4A6A8A", "text_color": "#E0E0E0"},
    "Ретро": {"bg_color": "#1A2A1A", "text_bg_color": "#000000", "button_color": "#3A5A3A", "text_color": "#00FF00"}
}

translations = {
    "Русский": {
        "title": "Ридли", "tab_main": "Главная", "tab_lines": "По строкам", "tab_paragraphs": "По абзацам",
        "tab_settings": "Параметры", "check": "Проверить", "reset": "Начать заново", "correct": "Правильно!",
        "error": "Ошибка!", "success": "Успех!", "check_memory": "Проверить память",
        "case_sensitive": "Учитывать размер букв", "punct_sensitive": "Учитывать знаки препинания",
        "auto_clear": "Автоматически очищать поле", "font_size": "Размер шрифта текста:",
        "theme": "Тема оформления:", "language": "Язык:", "open_folder": "Открыть папку", 
        "explore_poems": "Исследовать стихи...", "status_main": "Спиши текст в поле выше", 
        "status_main_memory": "Введи текст по памяти", "status_main_error": "Нет, неправильно. Попробуй ещё", 
        "status_main_done": "Правильно! Можешь начать заново", "status_lines": "Строка {0} из {1}: Спиши строку", 
        "status_lines_memory": "Строка {0} из {1}: Введи по памяти", "status_lines_error": "Строка {0} из {1}: Ошибка! Спиши заново", 
        "status_lines_done": "Все строки пройдены!", "status_para": "Абзац {0} из {1}", 
        "status_para_error": "Ошибка! Попробуй ещё раз", "status_para_done": "Все абзацы пройдены!",
        "errors": "Ошибок: {0}"
    },
    "English": {
        "title": "Readly", "tab_main": "Main", "tab_lines": "By Lines", "tab_paragraphs": "By Paragraphs",
        "tab_settings": "Settings", "check": "Check", "reset": "Start Over", "correct": "Correct!",
        "error": "Error!", "success": "Success!", "check_memory": "Check Memory",
        "case_sensitive": "Case Sensitive", "punct_sensitive": "Punctuation Sensitive",
        "auto_clear": "Auto Clear Field", "font_size": "Text Font Size:", "theme": "Theme:", 
        "language": "Language:", "open_folder": "Open Folder", "explore_poems": "Explore Poems...",
        "status_main": "Write the text in the field above", "status_main_memory": "Enter the text from memory",
        "status_main_error": "No, incorrect. Try again", "status_main_done": "Correct! You can start over",
        "status_lines": "Line {0} of {1}: Copy the line", "status_lines_memory": "Line {0} of {1}: Enter from memory",
        "status_lines_error": "Line {0} of {1}: Error! Copy again", "status_lines_done": "All lines completed!",
        "status_para": "Paragraph {0} of {1}", "status_para_error": "Error! Try again",
        "status_para_done": "All paragraphs completed!", "errors": "Errors: {0}"
    }
}

# Параметры кнопок
button_width, button_height = 200, 60
reset_button_width = 300
settings_button_width = 400  # Увеличенная ширина для кнопок в настройках
button_radius = 20

# Добавить в начало файла после других глобальных переменных
loaded_poems = None  # Глобальная переменная для хранения загруженных стихов
poems_loading = False  # Флаг загрузки стихов

def create_rounded_button_image(width, height, radius, bg_color, fill_bg=bg_color):
    image = Image.new("RGBA", (width, height), fill_bg)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([0, 0, width-1, height-1], radius=radius, fill=bg_color)
    return ImageTk.PhotoImage(image)

def update_button_color(button, color):
    width = reset_button_width if button in [reset_button, line_reset_button, quatrain_reset_button] else settings_button_width if button in [open_folder_button, poem_selector_button] else button_width
    new_img = create_rounded_button_image(width, button_height, button_radius, color, bg_color)
    button.config(image=new_img)
    button.image = new_img

def load_text_from_file():
    global original_text, lines, current_line, line_stage, quatrains, current_quatrain
    try:
        script_dir = str(data_directory())
        file_path = None
        supported_extensions = ['.txt', '.md', '.text']
        for ext in supported_extensions:
            potential_path = os.path.join(script_dir, f"stih{ext}")
            if os.path.exists(potential_path):
                file_path = potential_path
                break
        
        if not file_path:
            raise FileNotFoundError("Файл stih с поддерживаемым расширением не найден")

        with open(file_path, "r", encoding="utf-8") as file:
            original_text = file.read().strip()
        
        lines = [line.strip() for line in original_text.split('\n') if line.strip()]
        current_line = 0
        line_stage = 1

        if "\n\n" in original_text:
            quatrains = [block.strip() for block in original_text.split("\n\n") if block.strip()]
        else:
            temp_lines = original_text.split('\n')
            quatrains = ['\n'.join(temp_lines[i:i+4]) for i in range(0, len(temp_lines), 4)]
        current_quatrain = 0

        sample_text.config(state="normal")
        sample_text.delete("1.0", tk.END)
        sample_text.insert(tk.END, original_text)
        sample_text.config(state="disabled")
        
        if lines:
            line_sample_text.config(state="normal")
            line_sample_text.delete("1.0", tk.END)
            line_sample_text.insert(tk.END, lines[current_line])
            line_sample_text.config(state="disabled")
            line_status_label.config(text=translations[language]["status_lines"].format(current_line + 1, len(lines)))
        else:
            line_sample_text.config(state="normal")
            line_sample_text.delete("1.0", tk.END)
            line_sample_text.insert(tk.END, "Text is empty" if language == "English" else "Текст пуст")
            line_sample_text.config(state="disabled")
        
        if quatrains:
            quatrain_sample_text.config(state="normal")
            quatrain_sample_text.delete("1.0", tk.END)
            quatrain_sample_text.insert(tk.END, quatrains[current_quatrain])
            quatrain_sample_text.config(state="disabled")
            quatrain_status_label.config(text=translations[language]["status_para"].format(current_quatrain + 1, len(quatrains)))
        else:
            quatrain_sample_text.config(state="normal")
            quatrain_sample_text.delete("1.0", tk.END)
            quatrain_sample_text.insert(tk.END, "Text is empty" if language == "English" else "Текст пуст")
            quatrain_sample_text.config(state="disabled")
        
        status_label.config(text=translations[language]["status_main"])
    except Exception as e:
        messagebox.showerror("Error" if language == "English" else "Ошибка", f"Failed to load file: {e}")
        original_text = ""
        lines = []
        quatrains = []

def play_sound():
    try:
        winsound.Beep(37, 100)
        winsound.PlaySound("click.wav", winsound.SND_ASYNC | winsound.SND_FILENAME)
    except Exception:
        pass

def play_sound1():
    global error_count
    error_count += 1  # Увеличиваем счётчик ошибок
    update_error_label()
    try:
        winsound.Beep(37, 100)
        winsound.PlaySound("click1.wav", winsound.SND_ASYNC | winsound.SND_FILENAME)
    except Exception:
        pass

def play_click_sound():
    try:
        winsound.PlaySound("click2.wav", winsound.SND_ASYNC | winsound.SND_FILENAME)
    except Exception:
        pass

def check_input():
    global stage
    user_input = text_widget.get("1.0", tk.END).strip()
    text_to_compare = original_text

    if not case_sensitive:
        user_input = user_input.lower()
        text_to_compare = text_to_compare.lower()
    if not punctuation_sensitive:
        for punct in ".,!?;:-—\"'()[]{}":
            user_input = user_input.replace(punct, "")
            text_to_compare = text_to_compare.replace(punct, "")

    if user_input == text_to_compare:
        play_sound()
        if stage == 1:
            update_button_color(check_button, "green")
            check_button.config(text=translations[language]["correct"])
            root.after(delay_time * 1000, proceed_to_stage_2)
        elif stage == 2:
            update_button_color(check_button, "green")
            check_button.config(text=translations[language]["success"])
            root.after(delay_time * 1000, finish_task)
    else:
        play_sound1()
        update_button_color(check_button, "red")
        check_button.config(text=translations[language]["error"])
        root.after(delay_time * 1000, reset_after_error)

def proceed_to_stage_2():
    global stage
    stage = 2
    sample_text.config(state="normal")
    sample_text.delete("1.0", tk.END)
    sample_text.config(state="disabled")
    text_widget.delete("1.0", tk.END)
    status_label.config(text=translations[language]["status_main_memory"])
    update_button_color(check_button, button_color)
    check_button.config(text=translations[language]["check_memory"])

def finish_task():
    status_label.config(text=translations[language]["status_main_done"])
    text_widget.delete("1.0", tk.END)
    check_button.config(state=tk.DISABLED, text=translations[language]["check"])
    reset_button.config(state=tk.NORMAL)
    update_button_color(check_button, button_color)

def reset_after_error():
    global stage
    if stage == 1:
        status_label.config(text=translations[language]["status_main_error"])
        if auto_clear:
            text_widget.delete("1.0", tk.END)
    elif stage == 2:
        stage = 1
        sample_text.config(state="normal")
        sample_text.delete("1.0", tk.END)
        sample_text.insert(tk.END, original_text)
        sample_text.config(state="disabled")
        text_widget.delete("1.0", tk.END)
        status_label.config(text=translations[language]["status_main"])
    update_button_color(check_button, button_color)
    check_button.config(text=translations[language]["check"])

def reset():
    global stage, error_count
    stage = 1
    error_count = 0  # Сбрасываем счётчик ошибок
    update_error_label()
    sample_text.config(state="normal")
    sample_text.delete("1.0", tk.END)
    sample_text.insert(tk.END, original_text)
    sample_text.config(state="disabled")
    text_widget.delete("1.0", tk.END)
    status_label.config(text=translations[language]["status_main"])
    check_button.config(state=tk.NORMAL, text=translations[language]["check"])
    reset_button.config(state=tk.DISABLED)
    update_button_color(check_button, button_color)

def check_line():
    global current_line, line_stage
    user_input = line_text_widget.get("1.0", tk.END).strip()
    text_to_compare = lines[current_line].strip()

    if not case_sensitive:
        user_input = user_input.lower()
        text_to_compare = text_to_compare.lower()
    if not punctuation_sensitive:
        for punct in ".,!?;:-—\"'()[]{}":
            user_input = user_input.replace(punct, "")
            text_to_compare = text_to_compare.replace(punct, "")

    if user_input == text_to_compare:
        play_sound()
        update_button_color(line_check_button, "green")
        line_check_button.config(text=translations[language]["correct"])
        if line_stage == 1:
            root.after(delay_time * 1000, proceed_to_memory_stage)
        elif line_stage == 2:
            root.after(delay_time * 1000, next_line)
    else:
        play_sound1()
        update_button_color(line_check_button, "red")
        line_check_button.config(text=translations[language]["error"])
        root.after(delay_time * 1000, reset_line_error)

def proceed_to_memory_stage():
    global line_stage
    line_stage = 2
    line_sample_text.config(state="normal")
    line_sample_text.delete("1.0", tk.END)
    line_sample_text.config(state="disabled")
    line_text_widget.delete("1.0", tk.END)
    line_status_label.config(text=translations[language]["status_lines_memory"].format(current_line + 1, len(lines)))
    update_button_color(line_check_button, button_color)
    line_check_button.config(text=translations[language]["check_memory"])

def next_line():
    global current_line, line_stage
    current_line += 1
    line_stage = 1
    if current_line < len(lines):
        line_sample_text.config(state="normal")
        line_sample_text.delete("1.0", tk.END)
        line_sample_text.insert(tk.END, lines[current_line])
        line_sample_text.config(state="disabled")
        line_text_widget.delete("1.0", tk.END)
        line_status_label.config(text=translations[language]["status_lines"].format(current_line + 1, len(lines)))
        update_button_color(line_check_button, button_color)
        line_check_button.config(text=translations[language]["check"])
    else:
        line_status_label.config(text=translations[language]["status_lines_done"])
        line_check_button.config(state=tk.DISABLED, text=translations[language]["check"])
        line_reset_button.config(state=tk.NORMAL)

def reset_line_error():
    global line_stage
    if line_stage == 1:
        line_status_label.config(text=translations[language]["status_lines_error"].format(current_line + 1, len(lines)))
    elif line_stage == 2:
        line_stage = 1
        line_sample_text.config(state="normal")
        line_sample_text.delete("1.0", tk.END)
        line_sample_text.insert(tk.END, lines[current_line])
        line_sample_text.config(state="disabled")
        line_status_label.config(text=translations[language]["status_lines_error"].format(current_line + 1, len(lines)))
    if auto_clear:
        line_text_widget.delete("1.0", tk.END)
    update_button_color(line_check_button, button_color)
    line_check_button.config(text=translations[language]["check"])

def reset_lines():
    global current_line, line_stage, error_count
    current_line = 0
    line_stage = 1
    error_count = 0  # Сбрасываем счётчик ошибок
    update_error_label()
    if lines:
        line_sample_text.config(state="normal")
        line_sample_text.delete("1.0", tk.END)
        line_sample_text.insert(tk.END, lines[current_line])
        line_sample_text.config(state="disabled")
    line_text_widget.delete("1.0", tk.END)
    line_status_label.config(text=translations[language]["status_lines"].format(1, len(lines)))
    line_check_button.config(state=tk.NORMAL, text=translations[language]["check"])
    line_reset_button.config(state=tk.DISABLED)
    update_button_color(line_check_button, button_color)

def check_quatrain():
    global current_quatrain
    user_input = quatrain_text_widget.get("1.0", tk.END).strip()
    text_to_compare = quatrains[current_quatrain].strip()

    if not case_sensitive:
        user_input = user_input.lower()
        text_to_compare = text_to_compare.lower()
    if not punctuation_sensitive:
        for punct in ".,!?;:-—\"'()[]{}":
            user_input = user_input.replace(punct, "")
            text_to_compare = text_to_compare.replace(punct, "")

    if user_input == text_to_compare:
        play_sound()
        update_button_color(quatrain_check_button, "green")
        quatrain_check_button.config(text=translations[language]["correct"])
        root.after(delay_time * 1000, next_quatrain)
    else:
        play_sound1()
        update_button_color(quatrain_check_button, "red")
        quatrain_check_button.config(text=translations[language]["error"])
        root.after(delay_time * 1000, reset_quatrain_error)

def next_quatrain():
    global current_quatrain
    current_quatrain += 1
    if current_quatrain < len(quatrains):
        quatrain_sample_text.config(state="normal")
        quatrain_sample_text.delete("1.0", tk.END)
        quatrain_sample_text.insert(tk.END, quatrains[current_quatrain])
        quatrain_sample_text.config(state="disabled")
        quatrain_text_widget.delete("1.0", tk.END)
        quatrain_status_label.config(text=translations[language]["status_para"].format(current_quatrain + 1, len(quatrains)))
        update_button_color(quatrain_check_button, button_color)
        quatrain_check_button.config(text=translations[language]["check"])
    else:
        quatrain_status_label.config(text=translations[language]["status_para_done"])
        quatrain_check_button.config(state=tk.DISABLED, text=translations[language]["check"])
        quatrain_reset_button.config(state=tk.NORMAL)

def reset_quatrain_error():
    quatrain_status_label.config(text=translations[language]["status_para_error"])
    if auto_clear:
        quatrain_text_widget.delete("1.0", tk.END)
    update_button_color(quatrain_check_button, button_color)
    quatrain_check_button.config(text=translations[language]["check"])

def reset_quatrains():
    global current_quatrain, error_count
    current_quatrain = 0
    error_count = 0  # Сбрасываем счётчик ошибок
    update_error_label()
    if quatrains:
        quatrain_sample_text.config(state="normal")
        quatrain_sample_text.delete("1.0", tk.END)
        quatrain_sample_text.insert(tk.END, quatrains[current_quatrain])
        quatrain_sample_text.config(state="disabled")
    quatrain_text_widget.delete("1.0", tk.END)
    quatrain_status_label.config(text=translations[language]["status_para"].format(1, len(quatrains)))
    quatrain_check_button.config(state=tk.NORMAL, text=translations[language]["check"])
    quatrain_reset_button.config(state=tk.DISABLED)
    update_button_color(quatrain_check_button, button_color)

def update_case_sensitivity():
    global case_sensitive
    case_sensitive = case_var.get()

def update_punctuation_sensitivity():
    global punctuation_sensitive
    punctuation_sensitive = punct_var.get()

def update_delay_time():
    global delay_time
    try:
        delay_time = int(delay_entry.get())
        if delay_time < 1:
            delay_time = 1
            delay_entry.delete(0, tk.END)
            delay_entry.insert(0, "1")
    except ValueError:
        delay_time = 6
        delay_entry.delete(0, tk.END)
        delay_entry.insert(0, "6")

def update_font_size():
    global font_size
    try:
        font_size = int(font_entry.get())
        if font_size < 8:
            font_size = 8
            font_entry.delete(0, tk.END)
            font_entry.insert(0, "8")
        sample_text.config(font=("Courier New", font_size))
        text_widget.config(font=("Courier New", font_size))
        line_sample_text.config(font=("Courier New", font_size))
        line_text_widget.config(font=("Courier New", font_size))
        quatrain_sample_text.config(font=("Courier New", font_size))
        quatrain_text_widget.config(font=("Courier New", font_size))
    except ValueError:
        font_size = 18
        font_entry.delete(0, tk.END)
        font_entry.insert(0, "18")

def update_auto_clear():
    global auto_clear
    auto_clear = auto_clear_var.get()

def update_theme():
    global bg_color, text_bg_color, button_color, text_color, theme
    theme = theme_var.get()
    selected_theme = themes[theme]
    
    bg_color = selected_theme["bg_color"]
    text_bg_color = selected_theme["text_bg_color"]
    button_color = selected_theme["button_color"]
    text_color = selected_theme["text_color"]
    
    root.config(bg=bg_color)
    settings_canvas.config(bg=bg_color)
    settings_frame.config(bg=bg_color)
    title_label.config(bg=bg_color, fg=text_color)
    sample_text.config(bg=text_bg_color, fg=text_color)
    text_widget.config(bg=text_bg_color, fg=text_color)
    status_label.config(bg=bg_color, fg=text_color)
    error_label.config(bg=bg_color, fg=text_color)
    font_label.config(bg=bg_color, fg=text_color)
    case_check.config(bg=bg_color, fg=text_color)
    punct_check.config(bg=bg_color, fg=text_color)
    auto_clear_check.config(bg=bg_color, fg=text_color)
    line_sample_text.config(bg=text_bg_color, fg=text_color)
    line_text_widget.config(bg=text_bg_color, fg=text_color)
    line_status_label.config(bg=bg_color, fg=text_color)
    quatrain_sample_text.config(bg=text_bg_color, fg=text_color)
    quatrain_text_widget.config(bg=text_bg_color, fg=text_color)
    quatrain_status_label.config(bg=bg_color, fg=text_color)
    theme_label.config(bg=bg_color, fg=text_color)
    language_label.config(bg=bg_color, fg=text_color)
    
    update_all_buttons()

def update_language():
    global language
    language = language_var.get()
    root.title("Readly Legacy")
    notebook.tab(frame_main, text=translations[language]["tab_main"])
    notebook.tab(line_frame, text=translations[language]["tab_lines"])
    notebook.tab(quatrain_frame, text=translations[language]["tab_paragraphs"])
    notebook.tab(frame_settings, text=translations[language]["tab_settings"])
    check_button.config(text=translations[language]["check"])
    reset_button.config(text=translations[language]["reset"])
    line_check_button.config(text=translations[language]["check"])
    line_reset_button.config(text=translations[language]["reset"])
    quatrain_check_button.config(text=translations[language]["check"])
    quatrain_reset_button.config(text=translations[language]["reset"])
    case_check.config(text=translations[language]["case_sensitive"])
    punct_check.config(text=translations[language]["punct_sensitive"])
    auto_clear_check.config(text=translations[language]["auto_clear"])
    font_label.config(text=translations[language]["font_size"])
    theme_label.config(text=translations[language]["theme"])
    language_label.config(text=translations[language]["language"])
    open_folder_button.config(text=translations[language]["open_folder"])
    poem_selector_button.config(text=translations[language]["explore_poems"])
    status_label.config(text=translations[language]["status_main"])
    error_label.config(text=translations[language]["errors"].format(error_count))
    if lines:
        line_status_label.config(text=translations[language]["status_lines"].format(current_line + 1, len(lines)))
    if quatrains:
        quatrain_status_label.config(text=translations[language]["status_para"].format(current_quatrain + 1, len(quatrains)))

def save_settings():
    settings = {
        "case_sensitive": case_sensitive,
        "punctuation_sensitive": punctuation_sensitive,
        "delay_time": delay_time,
        "font_size": font_size,
        "auto_clear": auto_clear,
        "theme": theme_var.get(),
        "language": language_var.get()
    }
    script_dir = str(data_directory())
    settings_path = os.path.join(script_dir, "settings.txt")
    with open(settings_path, "w", encoding="utf-8") as f:
        json.dump(settings, f)

def load_settings():
    global case_sensitive, punctuation_sensitive, delay_time, font_size, auto_clear, theme, language
    script_dir = str(data_directory())
    settings_path = os.path.join(script_dir, "settings.txt")
    if os.path.exists(settings_path):
        with open(settings_path, "r", encoding="utf-8") as f:
            settings = json.load(f)
            case_sensitive = settings.get("case_sensitive", True)
            punctuation_sensitive = settings.get("punctuation_sensitive", True)
            delay_time = settings.get("delay_time", 6)
            font_size = settings.get("font_size", 18)
            auto_clear = settings.get("auto_clear", True)
            theme_var.set(settings.get("theme", "Светлая"))
            language_var.set(settings.get("language", "Русский"))
            case_var.set(case_sensitive)
            punct_var.set(punctuation_sensitive)
            auto_clear_var.set(auto_clear)
            font_entry.delete(0, tk.END)
            font_entry.insert(0, str(font_size))
            update_theme()
            update_language()

def open_folder():
    folder_path = str(data_directory())
    try:
        system = platform.system()
        if system == "Windows":
            os.startfile(folder_path)
        elif system == "Darwin":
            subprocess.run(["open", folder_path])
        elif system == "Linux":
            subprocess.run(["xdg-open", folder_path])
    except Exception as e:
        messagebox.showerror("Error" if language == "English" else "Ошибка", f"Failed to open folder: {e}")

def on_mouse_wheel(event, canvas=None):
    if canvas:
        canvas.yview_scroll(-1 * int(event.delta / 120), "units")

# Выбор стихов
def fetch_stihi_ru_data():
    try:
        url = "https://stihi.ru"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
            'Connection': 'keep-alive'
        }
        
        # Получаем главную страницу
        response = requests.get(url, headers=headers, timeout=30)  # Увеличиваем таймаут
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')

        # Ищем все ссылки на стихи
        poem_links = soup.select('.poemlink')
        if not poem_links:
            print("No poems found on the page")
            return None

        poems = []
        for link in poem_links:
            max_retries = 3  # Максимальное количество попыток
            retry_count = 0
            
            while retry_count < max_retries:
                try:
                    title = link.text.strip()
                    poem_url = "https://stihi.ru" + link['href']
                    
                    # Получаем страницу стиха с увеличенным таймаутом
                    poem_response = requests.get(poem_url, headers=headers, timeout=30)
                    poem_response.raise_for_status()
                    poem_soup = BeautifulSoup(poem_response.text, 'html.parser')
                    
                    # Получаем автора стиха
                    author_elem = poem_soup.select_one('a[href^="/avtor/"]')
                    author = author_elem.text.strip() if author_elem else "Unknown Author" if language == "English" else "Неизвестный автор"
                    
                    # Получаем текст стиха
                    poem_text_elem = poem_soup.select_one('div.text')
                    poem_text = poem_text_elem.text.strip() if poem_text_elem else "Text not found" if language == "English" else "Текст не найден"
                    
                    poems.append({
                        'title': title,
                        'author': author,
                        'text': poem_text
                    })
                    
                    # Увеличиваем задержку между запросами
                    time.sleep(1)
                    break  # Выходим из цикла попыток, если успешно
                    
                except requests.exceptions.Timeout:
                    retry_count += 1
                    if retry_count == max_retries:
                        print(f"Failed to fetch poem '{title}' after {max_retries} attempts")
                    else:
                        print(f"Timeout fetching poem '{title}', retrying... ({retry_count}/{max_retries})")
                        time.sleep(2)  # Увеличиваем задержку перед повторной попыткой
                except Exception as e:
                    print(f"Error processing poem '{title}': {e}")
                    break
        
        if not poems:
            print("No poems were successfully processed")
            return None
            
        return poems
        
    except requests.exceptions.RequestException as e:
        print(f"Network error: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error: {e}")
        return None

def load_poems_background():
    global loaded_poems, poems_loading
    poems_loading = True
    try:
        loaded_poems = fetch_stihi_ru_data()
        if loaded_poems:
            print(f"Successfully loaded {len(loaded_poems)} poems")
        else:
            print("No poems were loaded")
    except Exception as e:
        print(f"Error loading poems: {e}")
    finally:
        poems_loading = False

def open_poem_selector():
    # Скрываем основное содержимое
    notebook.grid_remove()
    title_label.grid_remove()
    
    # Создаем фрейм для стихов
    poem_frame = tk.Frame(root, bg=bg_color)
    poem_frame.grid(row=0, column=0, sticky="nsew", padx=10, pady=10)
    
    # Создаем фрейм для списка стихов
    poem_left_frame = tk.Frame(poem_frame)
    poem_left_frame.grid(row=0, column=0, sticky="nsew")
    
    poem_listbox = tk.Listbox(poem_left_frame, width=40, font=("Courier New", 16))
    poem_listbox.grid(row=0, column=0, sticky="nsew")
    
    poem_scrollbar = tk.Scrollbar(poem_left_frame, orient="vertical")
    poem_scrollbar.config(command=poem_listbox.yview)
    poem_scrollbar.grid(row=0, column=1, sticky="ns")
    poem_listbox.config(yscrollcommand=poem_scrollbar.set)
    
    # Создаем фрейм для предпросмотра
    poem_preview_frame = tk.Frame(poem_frame, bg=bg_color)
    poem_preview_frame.grid(row=0, column=1, sticky="nsew")
    
    poem_preview_title = tk.Label(poem_preview_frame, text="", font=("Courier New", 16), bg=bg_color, fg=text_color, wraplength=600, justify="center")
    poem_preview_title.grid(row=0, column=0, sticky="ew", padx=10, pady=5)
    
    poem_preview_author = tk.Label(poem_preview_frame, text="", font=("Courier New", 14), bg=bg_color, fg=text_color, wraplength=600, justify="center")
    poem_preview_author.grid(row=1, column=0, sticky="ew", padx=10, pady=5)
    
    poem_preview_text = tk.Text(poem_preview_frame, wrap="word", state="disabled", font=("Courier New", 16))
    poem_preview_text.grid(row=2, column=0, sticky="nsew", padx=10, pady=5)
    
    # Создаем фрейм для кнопок
    button_frame = tk.Frame(poem_frame, bg=bg_color)
    button_frame.grid(row=1, column=0, columnspan=2, pady=10)
    
    # Кнопка "Назад"
    back_button_img = create_rounded_button_image(button_width, button_height, button_radius, button_color, bg_color)
    back_button = tk.Button(button_frame, image=back_button_img, text="Назад" if language == "Русский" else "Back", 
                           compound="center", command=lambda: back_to_main(poem_frame),
                           fg=text_color, font=("Courier New", 24), borderwidth=0, bg=bg_color, activebackground=bg_color)
    back_button.image = back_button_img
    back_button.grid(row=0, column=0, padx=5)
    
    # Кнопка "Добавить в stih.txt"
    poem_add_button_img = create_rounded_button_image(button_width, button_height, button_radius, button_color, bg_color)
    poem_add_button = tk.Button(button_frame, image=poem_add_button_img, text="Добавить в stih.txt" if language == "Русский" else "Add to stih.txt", 
                               compound="center", command=lambda: add_to_stih(poem_listbox, poem_frame), state="disabled",
                               fg=text_color, font=("Courier New", 24), borderwidth=0, bg=bg_color, activebackground=bg_color)
    poem_add_button.image = poem_add_button_img
    poem_add_button.grid(row=0, column=1, padx=5)
    
    # Кнопка "Перейти на stihi.ru"
    poem_site_button_img = create_rounded_button_image(button_width, button_height, button_radius, button_color, bg_color)
    poem_site_button = tk.Button(button_frame, image=poem_site_button_img, text="Перейти на stihi.ru" if language == "Русский" else "Go to stihi.ru", 
                                compound="center", command=lambda: webbrowser.open("https://stihi.ru"),
                                fg=text_color, font=("Courier New", 24), borderwidth=0, bg=bg_color, activebackground=bg_color)
    poem_site_button.image = poem_site_button_img
    poem_site_button.grid(row=0, column=2, padx=5)
    
    poem_error_label = tk.Label(poem_frame, text="", font=("Courier New", 16), fg="red", bg=bg_color)
    poem_error_label.grid(row=2, column=0, columnspan=2)
    
    # Настройка весов для правильного растягивания
    root.grid_rowconfigure(0, weight=1)
    root.grid_columnconfigure(0, weight=1)
    poem_frame.grid_rowconfigure(0, weight=1)
    poem_frame.grid_columnconfigure(0, weight=1)
    poem_frame.grid_columnconfigure(1, weight=3)
    poem_left_frame.grid_rowconfigure(0, weight=1)
    poem_left_frame.grid_columnconfigure(0, weight=1)
    poem_preview_frame.grid_rowconfigure(2, weight=1)
    poem_preview_frame.grid_columnconfigure(0, weight=1)
    
    def back_to_main(poem_frame):
        poem_frame.grid_remove()
        title_label.grid()
        notebook.grid()
    
    def update_poem_list(listbox, frame):
        listbox.delete(0, tk.END)
        if poems_loading:
            listbox.insert(tk.END, "Загрузка..." if language == "Русский" else "Loading...")
            poem_error_label.config(text="")
            # Проверяем статус загрузки каждые 500 мс
            root.after(500, lambda: update_poem_list(listbox, frame))
        elif loaded_poems:
            listbox.delete(0, tk.END)  # Очищаем сообщение о загрузке
            for poem in loaded_poems:
                listbox.insert(tk.END, f"{poem['title']} - {poem['author']}")
            frame.poems = loaded_poems
            poem_add_button.config(state="normal")
        else:
            poem_error_label.config(text="Не удалось загрузить стихи" if language == "Русский" else "Failed to load poems")
    
    def on_poem_select(event):
        if poems_loading:
            return  # Игнорируем выбор во время загрузки
        selection = poem_listbox.curselection()
        if selection:
            index = selection[0]
            poem = poem_frame.poems[index]
            poem_preview_title.config(text=poem['title'])
            poem_preview_author.config(text=poem['author'])
            poem_preview_text.config(state="normal")
            poem_preview_text.delete("1.0", tk.END)
            poem_preview_text.insert(tk.END, poem['text'])
            poem_preview_text.config(state="disabled")
            poem_add_button.config(state="normal")
    
    poem_listbox.bind("<<ListboxSelect>>", on_poem_select)
    update_poem_list(poem_listbox, poem_frame)

def update_all_buttons():
    global check_button, reset_button, line_check_button, line_reset_button, quatrain_check_button, quatrain_reset_button, open_folder_button, poem_selector_button
    for btn in [check_button, line_check_button, quatrain_check_button]:
        new_img = create_rounded_button_image(button_width, button_height, button_radius, button_color, bg_color)
        btn.config(image=new_img, fg=text_color)
        btn.image = new_img
    for btn in [reset_button, line_reset_button, quatrain_reset_button]:
        new_img = create_rounded_button_image(reset_button_width, button_height, button_radius, button_color, bg_color)
        btn.config(image=new_img, fg=text_color)
        btn.image = new_img
    for btn in [open_folder_button, poem_selector_button]:
        new_img = create_rounded_button_image(settings_button_width, button_height, button_radius, button_color, bg_color)
        btn.config(image=new_img, fg=text_color)
        btn.image = new_img

def update_error_label():
    error_label.config(text=translations[language]["errors"].format(error_count))

# Интерфейс
title_label = tk.Label(root, text=translations[language]["title"], font=("Courier New", 40), bg=bg_color, fg=text_color)
title_label.grid(row=0, column=0, padx=20, pady=20, sticky="n")
title_label.bind("<Button-1>", lambda e: play_click_sound())

notebook = ttk.Notebook(root)
notebook.grid(row=1, column=0, pady=20, sticky="nsew")

# Вкладка "Главная"
frame_main = tk.Frame(notebook, bg=bg_color)
notebook.add(frame_main, text=translations[language]["tab_main"])

sample_text_frame = tk.Frame(frame_main)
sample_text_frame.grid(row=0, column=0, padx=20, pady=20, sticky="nsew")
sample_text = tk.Text(sample_text_frame, wrap="word", height=20, width=40, font=("Courier New", font_size), 
                      bg=text_bg_color, fg=text_color, exportselection=0)
sample_text.pack(side="left", fill="both", expand=True)
sample_text.config(state="disabled")
sample_scrollbar = tk.Scrollbar(sample_text_frame, orient="vertical", command=sample_text.yview)
sample_scrollbar.pack(side="right", fill="y")
sample_text.config(yscrollcommand=sample_scrollbar.set)

right_frame = tk.Frame(frame_main, bg=bg_color)
right_frame.grid(row=0, column=1, padx=20, pady=20, sticky="nsew")

text_widget = tk.Text(right_frame, width=40, height=20, font=("Courier New", font_size), bg=text_bg_color, fg=text_color)
text_widget.grid(row=0, column=0, padx=0, pady=10, sticky="nsew")

status_label = tk.Label(right_frame, text=translations[language]["status_main"], font=("Courier New", 20), bg=bg_color, fg=text_color)
status_label.grid(row=1, column=0, padx=0, pady=10, sticky="nsew")

error_label = tk.Label(right_frame, text=translations[language]["errors"].format(error_count), font=("Courier New", 16), bg=bg_color, fg=text_color)
error_label.grid(row=2, column=0, padx=0, pady=5, sticky="nsew")

check_button_img = create_rounded_button_image(button_width, button_height, button_radius, button_color, bg_color)
check_button = tk.Button(right_frame, image=check_button_img, text=translations[language]["check"], compound="center", 
                         command=check_input, fg=text_color, font=("Courier New", 24), borderwidth=0, bg=bg_color, activebackground=bg_color)
check_button.image = check_button_img
check_button.grid(row=3, column=0, pady=10, sticky="ew")

reset_button_img = create_rounded_button_image(reset_button_width, button_height, button_radius, button_color, bg_color)
reset_button = tk.Button(right_frame, image=reset_button_img, text=translations[language]["reset"], compound="center", 
                         command=reset, state=tk.DISABLED, fg=text_color, font=("Courier New", 24), borderwidth=0, bg=bg_color, activebackground=bg_color)
reset_button.image = reset_button_img
reset_button.grid(row=4, column=0, pady=10, sticky="ew")

frame_main.grid_rowconfigure(0, weight=1)
frame_main.grid_columnconfigure(0, weight=1)
frame_main.grid_columnconfigure(1, weight=1)
right_frame.grid_rowconfigure(0, weight=3)
right_frame.grid_rowconfigure(1, weight=1)
right_frame.grid_columnconfigure(0, weight=1)

# Вкладка "По строкам"
line_frame = tk.Frame(notebook, bg=bg_color)
notebook.add(line_frame, text=translations[language]["tab_lines"])

line_sample_text_frame = tk.Frame(line_frame)
line_sample_text_frame.grid(row=0, column=0, padx=20, pady=20, sticky="nsew")
line_sample_text = tk.Text(line_sample_text_frame, wrap="word", height=20, width=40, font=("Courier New", font_size), 
                           bg=text_bg_color, fg=text_color, exportselection=0)
line_sample_text.pack(side="left", fill="both", expand=True)
line_sample_text.config(state="disabled")
line_sample_scrollbar = tk.Scrollbar(line_sample_text_frame, orient="vertical", command=line_sample_text.yview)
line_sample_scrollbar.pack(side="right", fill="y")
line_sample_text.config(yscrollcommand=line_sample_scrollbar.set)

line_right_frame = tk.Frame(line_frame, bg=bg_color)
line_right_frame.grid(row=0, column=1, padx=20, pady=20, sticky="nsew")

line_text_widget = tk.Text(line_right_frame, width=40, height=20, font=("Courier New", font_size), bg=text_bg_color, fg=text_color)
line_text_widget.grid(row=0, column=0, padx=0, pady=10, sticky="nsew")

line_status_label = tk.Label(line_right_frame, text=" ", font=("Courier New", 20), bg=bg_color, fg=text_color)
line_status_label.grid(row=1, column=0, padx=0, pady=10, sticky="nsew")

line_error_label = tk.Label(line_right_frame, text=translations[language]["errors"].format(error_count), font=("Courier New", 16), bg=bg_color, fg=text_color)
line_error_label.grid(row=2, column=0, padx=0, pady=5, sticky="nsew")

line_check_button_img = create_rounded_button_image(button_width, button_height, button_radius, button_color, bg_color)
line_check_button = tk.Button(line_right_frame, image=line_check_button_img, text=translations[language]["check"], compound="center", 
                              command=check_line, fg=text_color, font=("Courier New", 24), borderwidth=0, bg=bg_color, activebackground=bg_color)
line_check_button.image = line_check_button_img
line_check_button.grid(row=3, column=0, pady=10, sticky="ew")

line_reset_button_img = create_rounded_button_image(reset_button_width, button_height, button_radius, button_color, bg_color)
line_reset_button = tk.Button(line_right_frame, image=line_reset_button_img, text=translations[language]["reset"], compound="center", 
                              command=reset_lines, state=tk.DISABLED, fg=text_color, font=("Courier New", 24), borderwidth=0, bg=bg_color, activebackground=bg_color)
line_reset_button.image = line_reset_button_img
line_reset_button.grid(row=4, column=0, pady=10, sticky="ew")

line_frame.grid_rowconfigure(0, weight=1)
line_frame.grid_columnconfigure(0, weight=1)
line_frame.grid_columnconfigure(1, weight=1)
line_right_frame.grid_rowconfigure(0, weight=3)
line_right_frame.grid_rowconfigure(1, weight=1)
line_right_frame.grid_columnconfigure(0, weight=1)

# Вкладка "По абзацам"
quatrain_frame = tk.Frame(notebook, bg=bg_color)
notebook.add(quatrain_frame, text=translations[language]["tab_paragraphs"])

quatrain_sample_text_frame = tk.Frame(quatrain_frame)
quatrain_sample_text_frame.grid(row=0, column=0, padx=20, pady=20, sticky="nsew")
quatrain_sample_text = tk.Text(quatrain_sample_text_frame, wrap="word", height=20, width=40, font=("Courier New", font_size), 
                               bg=text_bg_color, fg=text_color, exportselection=0)
quatrain_sample_text.pack(side="left", fill="both", expand=True)
quatrain_sample_text.config(state="disabled")
quatrain_sample_scrollbar = tk.Scrollbar(quatrain_sample_text_frame, orient="vertical", command=quatrain_sample_text.yview)
quatrain_sample_scrollbar.pack(side="right", fill="y")
quatrain_sample_text.config(yscrollcommand=quatrain_sample_scrollbar.set)

quatrain_right_frame = tk.Frame(quatrain_frame, bg=bg_color)
quatrain_right_frame.grid(row=0, column=1, padx=20, pady=20, sticky="nsew")

quatrain_text_widget = tk.Text(quatrain_right_frame, width=40, height=20, font=("Courier New", font_size), bg=text_bg_color, fg=text_color)
quatrain_text_widget.grid(row=0, column=0, padx=0, pady=10, sticky="nsew")

quatrain_status_label = tk.Label(quatrain_right_frame, text=" ", font=("Courier New", 20), bg=bg_color, fg=text_color)
quatrain_status_label.grid(row=1, column=0, padx=0, pady=10, sticky="nsew")

quatrain_error_label = tk.Label(quatrain_right_frame, text=translations[language]["errors"].format(error_count), font=("Courier New", 16), bg=bg_color, fg=text_color)
quatrain_error_label.grid(row=2, column=0, padx=0, pady=5, sticky="nsew")

quatrain_check_button_img = create_rounded_button_image(button_width, button_height, button_radius, button_color, bg_color)
quatrain_check_button = tk.Button(quatrain_right_frame, image=quatrain_check_button_img, text=translations[language]["check"], compound="center", 
                                  command=check_quatrain, fg=text_color, font=("Courier New", 24), borderwidth=0, bg=bg_color, activebackground=bg_color)
quatrain_check_button.image = quatrain_check_button_img
quatrain_check_button.grid(row=3, column=0, pady=10, sticky="ew")

quatrain_reset_button_img = create_rounded_button_image(reset_button_width, button_height, button_radius, button_color, bg_color)
quatrain_reset_button = tk.Button(quatrain_right_frame, image=quatrain_reset_button_img, text=translations[language]["reset"], compound="center", 
                                  command=reset_quatrains, state=tk.DISABLED, fg=text_color, font=("Courier New", 24), borderwidth=0, bg=bg_color, activebackground=bg_color)
quatrain_reset_button.image = quatrain_reset_button_img
quatrain_reset_button.grid(row=4, column=0, pady=10, sticky="ew")

quatrain_frame.grid_rowconfigure(0, weight=1)
quatrain_frame.grid_columnconfigure(0, weight=1)
quatrain_frame.grid_columnconfigure(1, weight=1)
quatrain_right_frame.grid_rowconfigure(0, weight=3)
quatrain_right_frame.grid_rowconfigure(1, weight=1)
quatrain_right_frame.grid_columnconfigure(0, weight=1)

# Вкладка "Параметры"
frame_settings = tk.Frame(notebook, bg=bg_color)
notebook.add(frame_settings, text=translations[language]["tab_settings"])

settings_canvas = tk.Canvas(frame_settings, bg=bg_color)
settings_scrollbar = ttk.Scrollbar(frame_settings, orient="vertical", command=settings_canvas.yview)
settings_canvas.configure(yscrollcommand=settings_scrollbar.set)

settings_frame = tk.Frame(settings_canvas, bg=bg_color)
settings_canvas.create_window((0, 0), window=settings_frame, anchor="nw")

case_check = tk.Checkbutton(settings_frame, text=translations[language]["case_sensitive"], font=("Courier New", 16), 
                            variable=case_var, command=update_case_sensitivity, bg=bg_color, fg=text_color)
case_check.grid(row=0, column=0, pady=10, sticky="w")

punct_check = tk.Checkbutton(settings_frame, text=translations[language]["punct_sensitive"], font=("Courier New", 16), 
                             variable=punct_var, command=update_punctuation_sensitivity, bg=bg_color, fg=text_color)
punct_check.grid(row=1, column=0, pady=10, sticky="w")

font_label = tk.Label(settings_frame, text=translations[language]["font_size"], font=("Courier New", 16), bg=bg_color, fg=text_color)
font_label.grid(row=3, column=0, pady=10, sticky="w")

font_entry = tk.Entry(settings_frame, width=5, font=("Courier New", 16))
font_entry.grid(row=3, column=0, padx=(250, 0), pady=10, sticky="w")
font_entry.insert(0, "18")
font_entry.bind("<FocusOut>", lambda e: update_font_size())

auto_clear_check = tk.Checkbutton(settings_frame, text=translations[language]["auto_clear"], font=("Courier New", 16), 
                                  variable=auto_clear_var, command=update_auto_clear, bg=bg_color, fg=text_color)
auto_clear_check.grid(row=4, column=0, pady=10, sticky="w")

theme_label = tk.Label(settings_frame, text=translations[language]["theme"], font=("Courier New", 16), bg=bg_color, fg=text_color)
theme_label.grid(row=5, column=0, pady=10, sticky="w")

theme_menu = ttk.OptionMenu(settings_frame, theme_var, "Светлая", "Светлая", "Тёмная", "Ретро", command=lambda e: update_theme())
theme_menu.grid(row=5, column=0, padx=(250, 0), pady=10, sticky="w")

language_label = tk.Label(settings_frame, text=translations[language]["language"], font=("Courier New", 16), bg=bg_color, fg=text_color)
language_label.grid(row=6, column=0, pady=10, sticky="w")

language_menu = ttk.OptionMenu(settings_frame, language_var, "Русский", "Русский", "English", command=lambda e: update_language())
language_menu.grid(row=6, column=0, padx=(250, 0), pady=10, sticky="w")

open_folder_button_img = create_rounded_button_image(settings_button_width, button_height, button_radius, button_color, bg_color)
open_folder_button = tk.Button(settings_frame, image=open_folder_button_img, text=translations[language]["open_folder"], compound="center", 
                               command=open_folder, fg=text_color, font=("Courier New", 24), borderwidth=0, bg=bg_color, activebackground=bg_color)
open_folder_button.image = open_folder_button_img
open_folder_button.grid(row=8, column=0, pady=10, sticky="ew")

poem_selector_button_img = create_rounded_button_image(settings_button_width, button_height, button_radius, button_color, bg_color)
poem_selector_button = tk.Button(settings_frame, image=poem_selector_button_img, text=translations[language]["explore_poems"], compound="center", 
                                 command=open_poem_selector, fg=text_color, font=("Courier New", 24), borderwidth=0, bg=bg_color, activebackground=bg_color)
poem_selector_button.image = poem_selector_button_img
poem_selector_button.grid(row=9, column=0, pady=10, sticky="ew")

settings_canvas.pack(side="left", fill="both", expand=True)
settings_scrollbar.pack(side="right", fill="y")

def configure_settings_scroll(event):
    settings_canvas.configure(scrollregion=settings_canvas.bbox("all"))
    settings_canvas.yview_moveto(0)

settings_frame.bind("<Configure>", configure_settings_scroll)
settings_canvas.bind("<MouseWheel>", lambda e: on_mouse_wheel(e, settings_canvas))

# Инициализация программы
load_settings()
load_text_from_file()

def close_legacy():
    try:
        save_settings()
    finally:
        root.destroy()

root.protocol("WM_DELETE_WINDOW", close_legacy)

# Основной цикл
root.grid_rowconfigure(1, weight=1)
root.grid_columnconfigure(0, weight=1)
root.mainloop()