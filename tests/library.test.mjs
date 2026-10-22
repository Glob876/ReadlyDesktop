import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("bundled classics have complete metadata, unique texts and preserved stanzas", async () => {
  const catalog = JSON.parse(await readFile(new URL("../src/data/classics.json", import.meta.url), "utf8"));
  const allowed = new Set(["Александр Пушкин", "Михаил Лермонтов", "Федор Тютчев", "Афанасий Фет", "Николай Некрасов", "Василий Жуковский", "Евгений Баратынский", "Алексей Кольцов"]);
  assert.ok(catalog.length >= 200);
  assert.equal(new Set(catalog.map((poem) => poem.id)).size, catalog.length);
  for (const poem of catalog) {
    assert.ok(allowed.has(poem.author));
    assert.ok(poem.title.trim() && poem.sourceTitle.trim());
    assert.ok(poem.text.trim() && poem.text.length < 100_000);
    assert.match(poem.source, /^https:\/\/github.com\/IlyaGusev\/PoetryCorpus\/blob\/[a-f0-9]{40}\/datasets\/web\/klassika.xml$/);
    assert.doesNotMatch(poem.text, /[<>*_\d]/);
  }
  const winter = catalog.find((poem) => poem.title === "Зимнее утро");
  assert.equal(winter.author, "Александр Пушкин");
  assert.deepEqual(winter.text.split("\n\n").map((stanza) => stanza.split("\n").length), [6, 6, 6, 6, 6]);
  assert.match(winter.text, /И берег, милый для меня\.$/);
});
