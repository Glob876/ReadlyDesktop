use readly_core::{
    Difficulty, Entry, History, Plan, Poem, Saved, Settings, differences, normalize, stanzas, view,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs,
    io::{self, BufRead, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
enum Command {
    Load,
    ResetRecovery,
    Start {
        plan: Option<Plan>,
    },
    Restart {
        plan: Option<Plan>,
    },
    SavePoem {
        poem: Poem,
    },
    Settings {
        settings: Settings,
    },
    Submit {
        answer: String,
    },
    SelectPoem {
        #[serde(rename = "poemId")]
        id: String,
    },
    Favorite {
        #[serde(rename = "poemId")]
        id: String,
        value: bool,
    },
    Draft {
        answer: String,
    },
    Hint,
    ImportLibrary {
        poems: Option<Vec<Poem>>,
        snapshot: Option<Box<Saved>>,
    },
    ExportLibrary,
    RestoreBackup {
        name: String,
    },
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn backups(path: &Path) -> Vec<PathBuf> {
    let Some(dir) = path.parent() else {
        return vec![];
    };
    let prefix = format!("{}.backup-", path.file_name().unwrap().to_string_lossy());
    let mut list: Vec<_> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with(&prefix)
        })
        .collect();
    list.sort();
    list.reverse();
    list
}
fn persist(path: &Path, state: &Saved) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temp = path.with_extension(format!("{}.tmp", std::process::id()));
    let bytes = serde_json::to_vec_pretty(state).map_err(|e| e.to_string())?;
    let mut file = fs::File::create(&temp).map_err(|e| e.to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    if path.exists() {
        let name = format!(
            "{}.backup-{}-{}",
            path.file_name().unwrap().to_string_lossy(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos(),
            std::process::id()
        );
        fs::copy(path, path.with_file_name(name)).map_err(|e| e.to_string())?;
    }
    fs::rename(temp, path).map_err(|e| e.to_string())?;
    for old in backups(path).into_iter().skip(5) {
        let _ = fs::remove_file(old);
    }
    Ok(())
}
fn validate_poem(mut poem: Poem) -> Result<Poem, String> {
    if poem.text.len() > 100_000 {
        return Err("Стихотворение слишком длинное (максимум 100 КБ).".into());
    }
    poem.text = poem
        .text
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .trim_matches('\n')
        .into();
    let blocks = stanzas(&poem.text);
    if blocks.is_empty() {
        return Err("Вставьте текст стихотворения.".into());
    }
    if blocks.len() > 100 || blocks.iter().map(Vec::len).sum::<usize>() > 2000 {
        return Err("Слишком большой текст: максимум 100 строф и 2000 строк.".into());
    }
    if poem.title.trim().is_empty() {
        poem.title = "Без названия".into();
    }
    Ok(poem)
}
fn add(state: &mut Saved, poem: Poem) -> Result<String, String> {
    let poem = validate_poem(poem)?;
    if let Some(e) = state
        .library
        .iter()
        .find(|e| e.text == poem.text && e.title == poem.title && e.author == poem.author)
    {
        return Ok(e.id.clone());
    }
    if state.library.len() >= 500 {
        return Err("В библиотеке может быть не больше 500 текстов.".into());
    }
    let mut serial = state.library.len() + 1;
    while state
        .library
        .iter()
        .any(|e| e.id == format!("poem-{serial}"))
    {
        serial += 1;
    }
    let id = format!("poem-{serial}");
    state.library.push(Entry {
        id: id.clone(),
        title: poem.title,
        author: poem.author,
        text: poem.text,
        ..Entry::default()
    });
    Ok(id)
}
fn validate(state: &mut Saved) -> Result<(), String> {
    state.migrate()?;
    let mut ids = std::collections::HashSet::new();
    for entry in &state.library {
        if entry.id.is_empty() || !ids.insert(entry.id.clone()) {
            return Err("Повторяющийся идентификатор стихотворения.".into());
        }
    }
    validate_poem(state.poem.clone())?;
    if state.position > state.lesson().len() || state.hint_level > 4 {
        return Err("Неверный прогресс занятия.".into());
    }
    if state.library.len() > 500 {
        return Err("Слишком большая библиотека.".into());
    }
    for e in &state.library {
        validate_poem(Poem {
            title: e.title.clone(),
            author: e.author.clone(),
            text: e.text.clone(),
        })?;
        validate_plan(&e.plan, &e.text)?;
        if e.position > readly_core::task_count(&e.text, &e.plan, &e.stats) {
            return Err("Неверный прогресс занятия.".into());
        }
    }
    validate_settings(&state.settings)?;
    validate_plan(&state.plan, &state.poem.text)?;
    Ok(())
}
fn validate_settings(s: &Settings) -> Result<(), String> {
    if !["light", "dark", "sepia", "system"].contains(&s.theme.as_str())
        || ![
            "readly",
            "sepia",
            "github",
            "catppuccin",
            "matrix",
            "gruvbox",
            "nord",
        ]
        .contains(&s.color_theme.as_str())
        || !["green", "blue", "purple", "rose", "orange", "slate"].contains(&s.accent.as_str())
        || !(55..=100).contains(&s.opacity)
        || !(18..=34).contains(&s.font_size)
        || ![
            "serif",
            "sans",
            "mono",
            "onest",
            "manrope",
            "inter",
            "golos-text",
            "rubik",
        ]
        .contains(&s.font_family.as_str())
        || !(1.2..=2.4).contains(&s.line_height)
    {
        return Err("Неверные параметры оформления.".into());
    }
    Ok(())
}
fn validate_plan(p: &Plan, text: &str) -> Result<(), String> {
    if !["", "standard", "recall", "exam", "difficult"].contains(&p.mode.as_str())
        || p.block_size > 100
        || p.stanzas.iter().any(|i| *i >= stanzas(text).len())
    {
        return Err("Неверные параметры занятия.".into());
    }
    Ok(())
}
fn execute(
    state: &mut Saved,
    cmd: Command,
    path: &Path,
    recovery: &mut Option<String>,
) -> Result<Value, String> {
    let mut next = state.clone();
    let mut result = json!({});
    if recovery.is_some()
        && !matches!(
            cmd,
            Command::Load
                | Command::ResetRecovery
                | Command::RestoreBackup { .. }
                | Command::ImportLibrary {
                    snapshot: Some(_),
                    ..
                }
        )
    {
        return Err("Сначала восстановите сохранение из резервной копии.".into());
    }
    let restart = matches!(cmd, Command::Restart { .. });
    match cmd {
        Command::ResetRecovery => {
            if recovery.is_none() {
                return Err("Восстановление не требуется.".into());
            }
            next = Saved::default();
            next.migrate()?;
        }
        Command::Load => return Ok(json!({"state":state_view(state,path,recovery)})),
        Command::ExportLibrary => {
            return Ok(json!({"snapshot":state,"state":state_view(state,path,recovery)}));
        }
        Command::Start { plan } | Command::Restart { plan } => {
            let reset = restart || plan.is_some();
            if let Some(plan) = plan {
                validate_plan(&plan, &next.poem.text)?;
                next.plan = plan;
            }
            if reset {
                next.session_had_help = false;
                next.position = 0;
                next.draft_answer.clear();
                next.hint_level = 0;
            }
            next.started = true;
            if next.lesson().is_empty() {
                return Err("Нет трудных мест для повторения.".into());
            }
        }
        Command::SavePoem { poem } => {
            next.sync();
            let id = add(&mut next, poem)?;
            next.select(&id)?;
        }
        Command::SelectPoem { id } => next.select(&id)?,
        Command::Favorite { id, value } => {
            next.library
                .iter_mut()
                .find(|e| e.id == id)
                .ok_or("Стихотворение не найдено.")?
                .favorite = value
        }
        Command::Settings { settings } => {
            validate_settings(&settings)?;
            next.settings = settings;
        }
        Command::Draft { answer } => {
            if answer.len() > 200_000 {
                return Err("Слишком длинный ответ.".into());
            }
            next.draft_answer = answer;
        }
        Command::Hint => {
            let list = next.lesson();
            let task = list.get(next.position).ok_or("Занятие завершено.")?;
            if !next.started {
                return Err("Сначала начните занятие.".into());
            }
            if !task.recall {
                return Err("Образец уже показан на этом шаге.".into());
            }
            next.hint_level = (next.hint_level + 1).min(4);
            next.stats.hints += 1;
            next.session_had_help = true;
            let d = next
                .stats
                .difficult
                .iter()
                .position(|d| d.stanza == task.stanza && d.line == task.line);
            if let Some(i) = d {
                next.stats.difficult[i].hints += 1;
            } else {
                next.stats.difficult.push(Difficulty {
                    stanza: task.stanza,
                    line: task.line,
                    errors: 0,
                    hints: 1,
                });
            }
        }
        Command::Submit { answer } => {
            if !next.started {
                return Err("Сначала начните занятие.".into());
            }
            let list = next.lesson();
            let task = list.get(next.position).ok_or("Занятие уже завершено.")?;
            let matched = !answer.trim().is_empty()
                && normalize(&answer, &next.settings) == normalize(&task.text, &next.settings);
            let assisted = next.hint_level > 0;
            let correct = matched && !assisted;
            if !correct {
                next.session_had_help = true;
            }
            result["correct"] = json!(correct);
            result["differences"] = json!(differences(&task.text, &answer, &next.settings));
            next.stats.attempts += 1;
            next.stats.history.push(History {
                at: now(),
                correct,
                poem_title: next.poem.title.clone(),
            });
            if next.stats.history.len() > 200 {
                next.stats.history.remove(0);
            }
            if correct {
                next.position += 1;
                next.stats.correct += 1;
                next.draft_answer.clear();
            } else if assisted {
                next.hint_level = 0;
                next.draft_answer.clear();
                result["message"] = json!("Подсказка скрыта. Повторите ответ самостоятельно.");
            } else {
                let targets: Vec<usize> = if task.kind == "exam" {
                    (0..stanzas(&next.poem.text).len())
                        .filter(|i| next.plan.stanzas.is_empty() || next.plan.stanzas.contains(i))
                        .collect()
                } else if task.kind == "cumulative" {
                    let all = stanzas(&next.poem.text);
                    (0..all.len())
                        .filter(|i| task.text.contains(&all[*i].join("\n")))
                        .collect()
                } else {
                    vec![task.stanza]
                };
                for stanza in targets {
                    if let Some(d) = next
                        .stats
                        .difficult
                        .iter_mut()
                        .find(|d| d.stanza == stanza && d.line == task.line)
                    {
                        d.errors += 1;
                    } else {
                        next.stats.difficult.push(Difficulty {
                            stanza,
                            line: task.line,
                            errors: 1,
                            hints: 0,
                        });
                    }
                }
                next.draft_answer = answer;
                result["message"] = json!("Есть неточности. Исправьте текст и проверьте ещё раз.");
            }
            if correct && next.position == list.len() {
                next.stats.sessions += 1;
            }
            let full_text = next.plan.mode != "difficult"
                && (next.plan.stanzas.is_empty()
                    || (0..stanzas(&next.poem.text).len()).all(|i| next.plan.stanzas.contains(&i)));
            if correct
                && next.position == list.len()
                && full_text
                && let Some(e) = next.library.iter_mut().find(|e| e.id == next.active_id)
            {
                e.completed_at = Some(now());
                if next.session_had_help {
                    e.repetitions = 0;
                }
                let days = [1, 3, 7, 14, 30, 60];
                e.due_at = Some(now() + days[(e.repetitions as usize).min(5)] * 86400000);
                if !next.session_had_help {
                    e.repetitions = e.repetitions.saturating_add(1);
                }
            }
        }
        Command::ImportLibrary { poems, snapshot } => {
            next.sync();
            for poem in poems.unwrap_or_default() {
                add(&mut next, poem)?;
            }
            if let Some(mut snapshot) = snapshot {
                validate(&mut snapshot)?;
                snapshot.sync();
                for entry in snapshot.library.clone() {
                    let id = add(
                        &mut next,
                        Poem {
                            title: entry.title.clone(),
                            author: entry.author.clone(),
                            text: entry.text.clone(),
                        },
                    )?;
                    let target = next.library.iter_mut().find(|e| e.id == id).unwrap();
                    *target = Entry { id, ..entry };
                }
                let active = next.active_id.clone();
                next.active_id.clear();
                next.select(&active)?;
            }
        }
        Command::RestoreBackup { name } => {
            let target = backups(path)
                .into_iter()
                .find(|p| p.file_name().unwrap().to_string_lossy() == name)
                .ok_or("Резервная копия не найдена.")?;
            next = serde_json::from_slice(&fs::read(target).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            validate(&mut next)?;
        }
    }
    next.sync();
    if recovery.is_some() && path.exists() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let name = format!(
            "{}.corrupt-{suffix}",
            path.file_name().unwrap().to_string_lossy()
        );
        fs::copy(path, path.with_file_name(name))
            .map_err(|e| format!("Не удалось сохранить повреждённый файл: {e}"))?;
    }
    persist(path, &next)?;
    *state = next;
    *recovery = None;
    result["state"] = state_view(state, path, recovery);
    Ok(result)
}
fn state_view(state: &Saved, path: &Path, recovery: &Option<String>) -> Value {
    let mut v = view(state);
    v["recovery"] = json!(recovery);
    v["backups"]=json!(backups(path).iter().map(|p|json!({"name":p.file_name().unwrap().to_string_lossy(),"modifiedAt":fs::metadata(p).and_then(|m|m.modified()).ok().and_then(|t|t.duration_since(UNIX_EPOCH).ok()).map(|d|d.as_millis() as u64).unwrap_or(0)})).collect::<Vec<_>>());
    v
}
fn decode(bytes: &[u8]) -> Result<Saved, String> {
    let value: Value = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    for key in ["poem", "settings", "position", "started"] {
        if value.get(key).is_none() {
            return Err(format!("В сохранении отсутствует поле {key}."));
        }
    }
    let mut state: Saved = serde_json::from_value(value).map_err(|e| e.to_string())?;
    validate(&mut state)?;
    Ok(state)
}
fn main() {
    let Some(path) = std::env::args_os().nth(1) else {
        eprintln!("State path required");
        std::process::exit(1);
    };
    let path = Path::new(&path);
    let mut recovery = None;
    let mut state = match fs::read(path) {
        Ok(bytes) => match decode(&bytes) {
            Ok(s) => s,
            Err(e) => {
                recovery = Some(format!(
                    "Не удалось прочитать сохранение: {e}. Выберите резервную копию."
                ));
                Saved::default()
            }
        },
        Err(e) if e.kind() == io::ErrorKind::NotFound => Saved::default(),
        Err(e) => {
            recovery = Some(e.to_string());
            Saved::default()
        }
    };
    state.migrate().unwrap();
    for line in io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let input: Value = serde_json::from_str(&line).unwrap_or(Value::Null);
        let id = input.get("id").cloned().unwrap_or(Value::Null);
        let response = match serde_json::from_value::<Command>(input) {
            Ok(cmd) => match execute(&mut state, cmd, path, &mut recovery) {
                Ok(result) => json!({"id":id,"result":result}),
                Err(e) => json!({"id":id,"error":e}),
            },
            Err(e) => json!({"id":id,"error":e.to_string()}),
        };
        println!("{response}");
        let _ = io::stdout().flush();
    }
}
