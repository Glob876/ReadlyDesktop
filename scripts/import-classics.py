"""Rebuild the bundled classics catalog from a pinned PoetryCorpus snapshot."""
import hashlib
import json
from pathlib import Path
import re
import urllib.request
import xml.etree.ElementTree as ET

COMMIT = "7a5f70e6a46b4717f7c903671f9a6a917aee6162"
SOURCE = f"https://github.com/IlyaGusev/PoetryCorpus/blob/{COMMIT}/datasets/web/klassika.xml"
AUTHORS = {
    "Александр Пушкин", "Михаил Лермонтов", "Федор Тютчев",
    "Афанасий Фет", "Николай Некрасов", "Василий Жуковский",
    "Евгений Баратынский", "Алексей Кольцов",
}
# Restore names and initials when converting the source's all-caps headings.
PROPER_WORDS = """Анакреона Ксенофана Колофонского Ушаковой Смирновой
Абамелек Филимонову Давыдову Полторацкой Сленину Пущину Шенье Афенея
Гафиза Алексееву Великопольскому Вяземскому Соболевскому Яковлеву
Баратынскому Вульф Чаадаеву Языкову Тимашевой России Козловскому
Казбеке Булгарина Лукулла Дондукова Корсакова Надеждина Петра Первого
Авроре Гёте Гете Купидона Еремушке Шернваль""".split()
root = Path(__file__).resolve().parent.parent
url = f"https://media.githubusercontent.com/media/IlyaGusev/PoetryCorpus/{COMMIT}/datasets/web/klassika.xml"
data = urllib.request.urlopen(url).read()
assert hashlib.sha256(data).hexdigest() == "523352891feec515ba1d685a34b37352ac0189a43d961c583950d84165c1fc87"
poems = []
seen = set()
for item in ET.fromstring(data):
    author = item.findtext("author", "")
    if author not in AUTHORS:
        continue
    text = "\n".join(line.rstrip() for line in item.findtext("text", "").splitlines()).strip()
    lines = [line for line in text.splitlines() if line.strip()]
    # Exclude long works and entries containing editorial notes or numbered sections.
    if not 4 <= len(lines) <= 120 or re.search(r"[\d*<>_]|\[[^]]+\]", text):
        continue
    if any(not re.search(r"[А-Яа-яЁёA-Za-z]", line) for line in lines):
        continue
    key = re.sub(r"\W", "", text.lower().replace("ё", "е"))
    if key in seen:
        continue
    seen.add(key)
    source_title = item.findtext("name", "").strip()
    title = source_title or lines[0].strip().rstrip(".,;:!?") + "…"
    if title.isupper():
        title = title.lower()
        for word in PROPER_WORDS:
            title = re.sub(r"\b" + word.lower() + r"\b", word, title)
        title = re.sub(r"\b[а-яa-z](?=\.)", lambda m: m[0].upper(), title)
        title = re.sub(r"\b[lvi]+\b", lambda m: m[0].upper(), title)
        title = re.sub(r"[а-яa-zё]", lambda m: m[0].upper(), title, count=1)
    poems.append({
        "id": hashlib.sha256((author + "\n" + text).encode()).hexdigest()[:16],
        "title": title, "author": author, "text": text,
        "year": item.findtext("date_from", ""),
        "source": SOURCE, "sourceTitle": source_title or lines[0].strip(),
    })
poems.sort(key=lambda poem: (poem["author"], poem["title"]))
(root / "src/data/classics.json").write_text(json.dumps(poems, ensure_ascii=False, indent=2) + "\n")
license_url = f"https://raw.githubusercontent.com/IlyaGusev/PoetryCorpus/{COMMIT}/LICENSE"
(root / "src/data/PoetryCorpus-LICENSE.txt").write_bytes(urllib.request.urlopen(license_url).read())
print(f"Imported {len(poems)} poems by {len({p['author'] for p in poems})} authors")
