use serde::{Deserialize, Serialize};
use unicode_categories::UnicodeCategories;
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub case_sensitive: bool,
    pub punctuation: bool,
    pub distinguish_yo: bool,
    pub strict_whitespace: bool,
    pub line_breaks: bool,
    pub theme: String,
    pub opacity: u8,
    pub font_size: u8,
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
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Saved {
    pub poem: Poem,
    pub settings: Settings,
    pub position: usize,
    pub started: bool,
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
    serde_json::json!({ "poem": saved.poem, "settings": saved.settings, "position": saved.position,
        "started": saved.started, "tasks": tasks(&saved.poem.text), "stanzas": stanzas(&saved.poem.text) })
}
#[cfg(test)]
mod tests {
    use super::*;
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
}
