use readly_core::{Poem, Saved, Settings, normalize, stanzas, tasks, view};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs,
    io::{self, BufRead, Write},
    path::Path,
};

#[derive(Deserialize)]
#[serde(tag = "op")]
enum Command {
    #[serde(rename = "load")]
    Load,
    #[serde(rename = "start")]
    Start,
    #[serde(rename = "restart")]
    Restart,
    #[serde(rename = "savePoem")]
    SavePoem { poem: Poem },
    #[serde(rename = "settings")]
    SetSettings { settings: Settings },
    #[serde(rename = "submit")]
    Submit { answer: String },
}
fn persist(path: &Path, state: &Saved) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temp = path.with_extension("tmp");
    let bytes = serde_json::to_vec_pretty(state).map_err(|e| e.to_string())?;
    let mut file = fs::File::create(&temp).map_err(|e| e.to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    fs::rename(temp, path).map_err(|e| format!("Не удалось сохранить прогресс: {e}"))
}
fn execute(state: &mut Saved, cmd: Command, path: &Path) -> Result<Value, String> {
    let mut next = state.clone();
    let mut result = json!({});
    match cmd {
        Command::Load => return Ok(json!({"state":view(state)})),
        Command::Start => next.started = true,
        Command::Restart => {
            next.position = 0;
            next.started = true;
        }
        Command::SavePoem { mut poem } => {
            if poem.text.len() > 100_000 {
                return Err("Стихотворение слишком длинное (максимум 100 КБ).".into());
            }
            poem.text = poem
                .text
                .replace("\r\n", "\n")
                .trim_matches('\n')
                .to_owned();
            let blocks = stanzas(&poem.text);
            if blocks.len() > 100 || blocks.iter().map(Vec::len).sum::<usize>() > 2000 {
                return Err("Слишком большой текст: максимум 100 строф и 2000 строк.".into());
            }
            if blocks.is_empty() {
                return Err("Вставьте текст стихотворения.".into());
            }
            if poem.title.trim().is_empty() {
                poem.title = "Без названия".into();
            }
            next.poem = poem;
            next.position = 0;
            next.started = false;
        }
        Command::SetSettings { settings } => {
            if !["light", "dark", "sepia", "system"].contains(&settings.theme.as_str())
                || !(55..=100).contains(&settings.opacity)
                || !(18..=34).contains(&settings.font_size)
            {
                return Err("Неверные параметры оформления.".into());
            }
            next.settings = settings;
        }
        Command::Submit { answer } => {
            if !state.started {
                return Err("Сначала начните занятие.".into());
            }
            let list = tasks(&state.poem.text);
            let task = list.get(state.position).ok_or("Занятие уже завершено.")?;
            let correct = !answer.trim().is_empty()
                && normalize(&answer, &state.settings) == normalize(&task.text, &state.settings);
            result["correct"] = json!(correct);
            if correct {
                next.position += 1;
            } else {
                result["message"] = json!("Есть неточности. Исправьте текст и проверьте ещё раз.");
            }
        }
    }
    persist(path, &next)?;
    *state = next;
    result["state"] = view(state);
    Ok(result)
}
fn main() {
    let Some(path) = std::env::args_os().nth(1) else {
        eprintln!("State path required");
        std::process::exit(1);
    };
    let path = Path::new(&path);
    let mut state: Saved = match fs::read(path) {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(s) => s,
            Err(e) => {
                eprintln!(
                    "Не удалось прочитать файл прогресса {}: {e}. Файл сохранён без изменений.",
                    path.display()
                );
                std::process::exit(1);
            }
        },
        Err(e) if e.kind() == io::ErrorKind::NotFound => Saved::default(),
        Err(e) => {
            eprintln!("Не удалось открыть прогресс: {e}");
            std::process::exit(1);
        }
    };
    for line in io::stdin().lock().lines() {
        let Ok(line) = line else {
            break;
        };
        let input: Value = serde_json::from_str(&line).unwrap_or(Value::Null);
        let id = input.get("id").cloned().unwrap_or(Value::Null);
        let response = match serde_json::from_value::<Command>(input) {
            Ok(cmd) => match execute(&mut state, cmd, path) {
                Ok(result) => json!({"id": id,"result":result}),
                Err(e) => json!({"id":id,"error":e}),
            },
            Err(e) => json!({"id":id,"error":e.to_string()}),
        };
        println!("{response}");
        let _ = io::stdout().flush();
    }
}
