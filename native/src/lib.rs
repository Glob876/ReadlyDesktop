use serde::{Deserialize, Serialize};
use unicode_categories::UnicodeCategories;
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub case_sensitive: bool,
    pub punctuation: bool,
    pub distinguish_yo: bool,
    pub strict_whitespace: bool,
    pub line_breaks: bool,
    pub theme: String,
    pub opacity: u8,
    pub font_size: u8,
    pub font_family: String,
    pub line_height: f64,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            case_sensitive: false,
            punctuation: false,
            distinguish_yo: false,
            strict_whitespace: false,
            line_breaks: true,
            theme: "light".into(),
            opacity: 100,
            font_size: 24,
            font_family: "serif".into(),
            line_height: 1.8,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Poem {
    pub title: String,
    pub author: String,
    pub text: String,
}
impl Default for Poem {
    fn default() -> Self {
        Self { title: "Зимнее утро".into(), author: "Александр Пушкин".into(), text: "Мороз и солнце; день чудесный!\nЕще ты дремлешь, друг прелестный —\nПора, красавица, проснись:\nОткрой сомкнуты негой взоры\nНавстречу северной Авроры,\nЗвездою севера явись!\n\nВечор, ты помнишь, вьюга злилась,\nНа мутном небе мгла носилась;\nЛуна, как бледное пятно,\nСквозь тучи мрачные желтела,\nИ ты печальная сидела —\nА нынче… погляди в окно:\n\nПод голубыми небесами\nВеликолепными коврами,\nБлестя на солнце, снег лежит;\nПрозрачный лес один чернеет,\nИ ель сквозь иней зеленеет,\nИ речка подо льдом блестит.".into() }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Plan {
    pub mode: String,
    pub stanzas: Vec<usize>,
    pub block_size: usize,
}
impl Default for Plan {
    fn default() -> Self {
        Self {
            mode: "standard".into(),
            stanzas: Vec::new(),
            block_size: 0,
        }
    }
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct History {
    pub at: u64,
    pub correct: bool,
    pub poem_title: String,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Difficulty {
    pub stanza: usize,
    pub line: Option<usize>,
    pub errors: usize,
    pub hints: usize,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Stats {
    pub attempts: usize,
    pub correct: usize,
    pub hints: usize,
    pub sessions: usize,
    pub history: Vec<History>,
    pub difficult: Vec<Difficulty>,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub title: String,
    pub author: String,
    pub text: String,
    pub favorite: bool,
    pub position: usize,
    pub started: bool,
    pub completed_at: Option<u64>,
    pub due_at: Option<u64>,
    pub draft_answer: String,
    pub hint_level: usize,
    pub plan: Plan,
    pub stats: Stats,
    pub session_had_help: bool,
    pub repetitions: u32,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Saved {
    pub poem: Poem,
    pub settings: Settings,
    pub position: usize,
    pub started: bool,
    pub schema_version: u32,
    pub active_id: String,
    pub library: Vec<Entry>,
    pub draft_answer: String,
    pub hint_level: usize,
    pub plan: Plan,
    pub stats: Stats,
    pub session_had_help: bool,
}
impl Saved {
    pub fn migrate(&mut self) -> Result<(), String> {
        if self.schema_version > 1 {
            return Err("Формат сохранения новее поддерживаемого.".into());
        }
        if self.library.is_empty() {
            self.active_id = "poem-1".into();
            self.library.push(Entry {
                id: self.active_id.clone(),
                title: self.poem.title.clone(),
                author: self.poem.author.clone(),
                text: self.poem.text.clone(),
                ..Entry::default()
            });
            self.sync();
        } else if !self.library.iter().any(|e| e.id == self.active_id) {
            return Err("Не найдено активное стихотворение.".into());
        }
        self.schema_version = 1;
        Ok(())
    }
    pub fn sync(&mut self) {
        if let Some(e) = self.library.iter_mut().find(|e| e.id == self.active_id) {
            e.position = self.position;
            e.started = self.started;
            e.draft_answer = self.draft_answer.clone();
            e.hint_level = self.hint_level;
            e.plan = self.plan.clone();
            e.stats = self.stats.clone();
            e.session_had_help = self.session_had_help;
        }
    }
    pub fn select(&mut self, id: &str) -> Result<(), String> {
        self.sync();
        let e = self
            .library
            .iter()
            .find(|e| e.id == id)
            .ok_or("Стихотворение не найдено.")?;
        self.active_id = e.id.clone();
        self.poem = Poem {
            title: e.title.clone(),
            author: e.author.clone(),
            text: e.text.clone(),
        };
        self.position = e.position;
        self.started = e.started;
        self.draft_answer = e.draft_answer.clone();
        self.hint_level = e.hint_level;
        self.plan = e.plan.clone();
        self.stats = e.stats.clone();
        self.session_had_help = e.session_had_help;
        Ok(())
    }
    pub fn lesson(&self) -> Vec<Task> {
        planned_tasks(&self.poem.text, &self.plan, &self.stats)
    }
}
pub fn planned_tasks(text: &str, plan: &Plan, stats: &Stats) -> Vec<Task> {
    let blocks = stanzas(text);
    let selected: Vec<usize> = (0..blocks.len())
        .filter(|i| plan.stanzas.is_empty() || plan.stanzas.contains(i))
        .collect();
    if plan.mode == "exam" {
        return vec![Task {
            kind: "exam",
            stanza: 0,
            line: None,
            recall: true,
            text: selected
                .iter()
                .map(|i| blocks[*i].join("\n"))
                .collect::<Vec<_>>()
                .join("\n\n"),
        }];
    }
    if plan.mode == "difficult" {
        return selected
            .iter()
            .filter(|i| {
                stats
                    .difficult
                    .iter()
                    .any(|d| d.stanza == **i && (d.errors > 0 || d.hints > 0))
            })
            .map(|i| Task {
                kind: "stanza",
                stanza: *i,
                line: None,
                recall: true,
                text: blocks[*i].join("\n"),
            })
            .collect();
    }
    let mut out = Vec::new();
    let size = if plan.block_size == 0 {
        selected.len().max(1)
    } else {
        plan.block_size
    };
    for chunk in selected.chunks(size) {
        let text = chunk
            .iter()
            .map(|i| blocks[*i].join("\n"))
            .collect::<Vec<_>>()
            .join("\n\n");
        for mut task in tasks(&text) {
            task.stanza = chunk[if task.kind == "previous" {
                task.stanza.saturating_sub(1)
            } else {
                task.stanza
            }];
            if plan.mode != "recall" || task.recall {
                out.push(task);
            }
        }
    }
    out
}
pub fn task_count(text: &str, plan: &Plan, stats: &Stats) -> usize {
    let blocks = stanzas(text);
    let selected: Vec<_> = (0..blocks.len())
        .filter(|i| plan.stanzas.is_empty() || plan.stanzas.contains(i))
        .collect();
    match plan.mode.as_str() {
        "exam" => 1,
        "difficult" => selected
            .iter()
            .filter(|i| {
                stats
                    .difficult
                    .iter()
                    .any(|d| d.stanza == **i && (d.errors > 0 || d.hints > 0))
            })
            .count(),
        _ => {
            let size = if plan.block_size == 0 {
                selected.len().max(1)
            } else {
                plan.block_size
            };
            let count = selected
                .chunks(size)
                .map(|chunk| {
                    chunk
                        .iter()
                        .map(|i| blocks[*i].len() * 2 + 2)
                        .sum::<usize>()
                        + chunk.len().saturating_sub(1) * 4
                })
                .sum::<usize>();
            if plan.mode == "recall" {
                count / 2
            } else {
                count
            }
        }
    }
}
fn comparison_tokens(text: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut start = 0;
    let mut whitespace = None;
    for (index, ch) in text.char_indices() {
        if whitespace.is_some_and(|previous| previous != ch.is_whitespace()) {
            out.push(&text[start..index]);
            start = index;
        }
        whitespace = Some(ch.is_whitespace());
    }
    if start < text.len() {
        out.push(&text[start..]);
    }
    out
}
pub fn differences(expected: &str, actual: &str, settings: &Settings) -> Vec<serde_json::Value> {
    let expected = normalize(expected, settings);
    let actual = normalize(actual, settings);
    if expected == actual {
        return vec![];
    }
    let left = comparison_tokens(&expected);
    let right = comparison_tokens(&actual);
    let prefix = left.iter().zip(&right).take_while(|(a, b)| a == b).count();
    let mut a = &left[prefix..];
    let mut b = &right[prefix..];
    let suffix = a
        .iter()
        .rev()
        .zip(b.iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    a = &a[..a.len() - suffix];
    b = &b[..b.len() - suffix];
    let difference = |e: String, v: String| {
        serde_json::json!({
            "kind": if e.is_empty() {"extra"} else if v.is_empty() {"missing"} else {"replace"},
            "expected": e, "actual": v
        })
    };
    // Bound memory and time for unrelated large answers. The changed middle is
    // still displayed exactly, while equal prefix and suffix stay excluded.
    const CELL_LIMIT: usize = 1_000_000;
    if (a.len() + 1).saturating_mul(b.len() + 1) > CELL_LIMIT {
        return vec![difference(a.concat(), b.concat())];
    }
    let width = b.len() + 1;
    let mut costs = vec![0u32; (a.len() + 1) * width];
    for i in 0..=a.len() {
        costs[i * width + b.len()] = (a.len() - i) as u32;
    }
    for j in 0..=b.len() {
        costs[a.len() * width + j] = (b.len() - j) as u32;
    }
    for i in (0..a.len()).rev() {
        for j in (0..b.len()).rev() {
            costs[i * width + j] = if a[i] == b[j] {
                costs[(i + 1) * width + j + 1]
            } else {
                1 + costs[(i + 1) * width + j + 1]
                    .min(costs[(i + 1) * width + j])
                    .min(costs[i * width + j + 1])
            };
        }
    }
    let (mut i, mut j) = (0, 0);
    let mut out = Vec::new();
    let (mut missing, mut extra) = (String::new(), String::new());
    while i < a.len() || j < b.len() {
        if i < a.len() && j < b.len() && a[i] == b[j] {
            if !missing.is_empty() || !extra.is_empty() {
                if out.len() == 99 {
                    out.push(difference(
                        a[i.saturating_sub(comparison_tokens(&missing).len())..].concat(),
                        b[j.saturating_sub(comparison_tokens(&extra).len())..].concat(),
                    ));
                    return out;
                }
                out.push(difference(
                    std::mem::take(&mut missing),
                    std::mem::take(&mut extra),
                ));
            }
            i += 1;
            j += 1;
        } else if i < a.len()
            && j < b.len()
            && costs[i * width + j] == 1 + costs[(i + 1) * width + j + 1]
        {
            missing.push_str(a[i]);
            extra.push_str(b[j]);
            i += 1;
            j += 1;
        } else if i < a.len()
            && (j == b.len() || costs[i * width + j] == 1 + costs[(i + 1) * width + j])
        {
            missing.push_str(a[i]);
            i += 1;
        } else {
            extra.push_str(b[j]);
            j += 1;
        }
    }
    if !missing.is_empty() || !extra.is_empty() {
        out.push(difference(missing, extra));
    }
    out
}
#[derive(Debug, Clone, Serialize)]
pub struct Task {
    pub kind: &'static str,
    pub stanza: usize,
    pub line: Option<usize>,
    pub recall: bool,
    pub text: String,
}
pub fn stanzas(text: &str) -> Vec<Vec<String>> {
    let text = text.replace("\r\n", "\n").replace('\r', "\n");
    let mut out = Vec::new();
    let mut current = Vec::new();
    for line in text.lines() {
        if line.trim().is_empty() {
            if !current.is_empty() {
                out.push(std::mem::take(&mut current));
            }
        } else {
            current.push(line.to_string());
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}
pub fn tasks(text: &str) -> Vec<Task> {
    let blocks = stanzas(text);
    let mut out = Vec::new();
    for (i, block) in blocks.iter().enumerate() {
        let mut pair = |kind, line, text: String| {
            for recall in [false, true] {
                out.push(Task {
                    kind,
                    stanza: i,
                    line,
                    recall,
                    text: text.clone(),
                });
            }
        };
        for (j, line) in block.iter().enumerate() {
            pair("line", Some(j), line.clone());
        }
        pair("stanza", None, block.join("\n"));
        if i > 0 {
            pair("previous", None, blocks[i - 1].join("\n"));
            pair(
                "cumulative",
                None,
                blocks[..=i]
                    .iter()
                    .map(|s| s.join("\n"))
                    .collect::<Vec<_>>()
                    .join("\n\n"),
            );
        }
    }
    out
}
pub fn normalize(text: &str, s: &Settings) -> String {
    let mut result = text
        .nfc()
        .collect::<String>()
        .replace("\r\n", "\n")
        .replace('\r', "\n");
    if !s.case_sensitive {
        result = result.to_lowercase();
    }
    if !s.distinguish_yo {
        result = result.replace('ё', "е").replace('Ё', "Е");
    }
    if !s.punctuation {
        result.retain(|c| !c.is_punctuation());
    }
    if !s.line_breaks {
        result = result.replace('\n', " ");
    }
    if s.strict_whitespace {
        result
    } else if s.line_breaks {
        result
            .trim()
            .lines()
            .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        result.split_whitespace().collect::<Vec<_>>().join(" ")
    }
}
pub fn view(saved: &Saved) -> serde_json::Value {
    let mut value = serde_json::to_value(saved).unwrap();
    value["tasks"] = serde_json::json!(saved.lesson());
    value["stanzas"] = serde_json::json!(stanzas(&saved.poem.text));
    for entry in value["library"].as_array_mut().unwrap() {
        let e: Entry = serde_json::from_value(entry.clone()).unwrap();
        entry["total"] = serde_json::json!(task_count(&e.text, &e.plan, &e.stats));
    }
    value
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn plans_bound_repetition_and_preserve_original_stanza_indices() {
        let plan = Plan {
            mode: "standard".into(),
            stanzas: vec![1, 2],
            block_size: 1,
        };
        let lesson = planned_tasks("a\n\nb\n\nc", &plan, &Stats::default());
        assert_eq!(lesson.len(), 8);
        assert_eq!(lesson[0].stanza, 1);
        assert_eq!(lesson[4].stanza, 2);
        assert!(lesson.iter().all(|task| task.kind != "cumulative"));
        let exam = Plan {
            mode: "exam".into(),
            ..plan.clone()
        };
        assert_eq!(
            planned_tasks("a\n\nb\n\nc", &exam, &Stats::default())[0].text,
            "b\n\nc"
        );
        let recall = Plan {
            mode: "recall".into(),
            ..plan
        };
        assert!(
            planned_tasks("a\n\nb\n\nc", &recall, &Stats::default())
                .iter()
                .all(|t| t.recall)
        );
    }
    #[test]
    fn differences_follow_normalization_settings() {
        let settings = Settings::default();
        assert!(differences("Ёж, идёт!", "еж идет", &settings).is_empty());
        assert!(!differences("a\nb", "a b", &settings).is_empty());
        let settings = Settings {
            strict_whitespace: true,
            ..settings
        };
        assert!(!differences("a  b", "a b", &settings).is_empty());
    }
    #[test]
    fn differences_align_multiple_missing_extra_and_replaced_words() {
        let settings = Settings::default();
        let missing = differences("one two three four", "three four", &settings);
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0]["kind"], "missing");
        assert_eq!(missing[0]["expected"], "one two ");
        let extra = differences("three four", "one two three four", &settings);
        assert_eq!(extra.len(), 1);
        assert_eq!(extra[0]["kind"], "extra");
        assert_eq!(extra[0]["actual"], "one two ");
        let replaced = differences("one two three", "one other three", &settings);
        assert_eq!(replaced.len(), 1);
        assert_eq!(replaced[0]["kind"], "replace");
        assert_eq!(replaced[0]["expected"], "two");
        assert_eq!(replaced[0]["actual"], "other");
        let middle = differences("a one two three four z", "a three four z", &settings);
        assert_eq!(middle[0]["kind"], "missing");
        assert_eq!(middle[0]["expected"], "one two ");
    }
    #[test]
    fn differences_bound_large_unrelated_answers_and_output() {
        let settings = Settings::default();
        let a = "alpha ".repeat(20_000);
        let b = "beta ".repeat(20_000);
        let changes = differences(&a, &b, &settings);
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0]["kind"], "replace");
        let a = (0..200)
            .map(|i| format!("same{i} old{i}"))
            .collect::<Vec<_>>()
            .join(" ");
        let b = (0..200)
            .map(|i| format!("same{i} new{i}"))
            .collect::<Vec<_>>()
            .join(" ");
        assert!(differences(&a, &b, &settings).len() <= 100);
    }
    #[test]
    fn sequence() {
        let t = tasks("a\nb\n\nc\n\nd");
        assert_eq!(t.len(), 22);
        assert_eq!(t[0].kind, "line");
        assert!(!t[0].recall);
        assert!(t[1].recall);
        assert_eq!(t[4].text, "a\nb");
        assert_eq!(t[10].kind, "previous");
        assert_eq!(t[12].text, "a\nb\n\nc");
        assert_eq!(t[18].text, "c");
        assert_eq!(t[21].text, "a\nb\n\nc\n\nd");
        assert!(t[21].recall);
    }
    #[test]
    fn comparison_rules() {
        let mut s = Settings::default();
        assert_eq!(normalize("Ёж, — друг!", &s), normalize("еж друг", &s));
        assert_ne!(normalize("a\nb", &s), normalize("a b", &s));
        s.line_breaks = false;
        assert_eq!(normalize("a\nb", &s), "a b");
        s.case_sensitive = true;
        assert_ne!(normalize("Еж", &s), normalize("еж", &s));
        s.distinguish_yo = true;
        assert_ne!(normalize("ё", &s), normalize("е", &s));
        s.punctuation = true;
        assert_ne!(normalize("…", &s), normalize("", &s));
        s.strict_whitespace = true;
        assert_ne!(normalize(" a ", &s), normalize("a", &s));
        assert_eq!(normalize("е\u{308}", &s), normalize("ё", &s));
    }
    #[test]
    fn blank_stanzas() {
        assert_eq!(
            stanzas("\n a\r\n\r\n \n b\n\n"),
            vec![vec![" a"], vec![" b"]]
        );
    }
    #[test]
    fn stanza_and_task_parsing_accepts_all_line_endings() {
        let text = "a\nb\n\nc";
        for ending in ["\r\n", "\r"] {
            let converted = text.replace('\n', ending);
            assert_eq!(stanzas(&converted), stanzas(text));
            assert_eq!(
                serde_json::to_value(tasks(&converted)).unwrap(),
                serde_json::to_value(tasks(text)).unwrap()
            );
        }
    }
}
