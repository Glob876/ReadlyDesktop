import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtemp, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
function core(file) {
  const child = spawn(path.resolve("native/target/release/readly-core"), [
    file,
  ]);
  const queue = [];
  let serial = 0;
  createInterface({ input: child.stdout }).on("line", (line) =>
    queue.shift()?.(JSON.parse(line)),
  );
  return {
    child,
    request: (cmd) =>
      new Promise((resolve) => {
        queue.push(resolve);
        child.stdin.write(JSON.stringify({ ...cmd, id: ++serial }) + "\n");
      }),
  };
}
test("complete lesson, rejected answers, settings and restart persistence", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-core-"));
  const file = path.join(dir, "progress.json");
  let app = core(file);
  try {
    const initial = (await app.request({ op: "load" })).result.state;
    assert.equal(initial.started, false);
    let response = await app.request({
      op: "savePoem",
      poem: {
        title: "Проверка",
        author: "",
        text: "Ёж идёт!\nСнег.\n\nВетер.",
      },
    });
    assert.equal(response.result.state.tasks.length, 14);
    response = await app.request({
      op: "savePoem",
      poem: { title: "", author: "", text: " \n " },
    });
    assert.match(response.error, /Вставьте/);
    await app.request({ op: "start" });
    response = await app.request({ op: "submit", answer: "нет" });
    assert.equal(response.result.correct, false);
    assert.equal(response.result.state.position, 0);
    response = await app.request({ op: "submit", answer: "еж идет" });
    assert.equal(response.result.correct, true);
    const settings = {
      ...initial.settings,
      caseSensitive: true,
      distinguishYo: true,
      punctuation: true,
      opacity: 75,
      theme: "dark",
    };
    await app.request({ op: "settings", settings });
    response = await app.request({ op: "submit", answer: "еж идет" });
    assert.equal(response.result.correct, false);
    app.child.kill();
    app = core(file);
    response = await app.request({ op: "load" });
    assert.equal(response.result.state.position, 1);
    assert.equal(response.result.state.settings.opacity, 75);
    const tasks = response.result.state.tasks;
    for (const task of tasks.slice(1)) {
      response = await app.request({ op: "submit", answer: task.text });
      assert.equal(response.result.correct, true);
    }
    assert.equal(response.result.state.position, tasks.length);
    response = await app.request({ op: "submit", answer: "Ветер." });
    assert.match(response.error, /завершено/);
    response = await app.request({
      op: "settings",
      settings: { ...settings, opacity: 1 },
    });
    assert.ok(response.error);
    response = await app.request({ op: "restart" });
    assert.equal(response.result.state.position, 0);
    assert.equal(JSON.parse(await readFile(file, "utf8")).position, 0);
  } finally {
    app.child.kill();
    await rm(dir, { recursive: true, force: true });
  }
});

test("library, plans, drafts, assisted recall and review scheduling", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-library-"));
  const app = core(path.join(dir,"progress.json"));
  const request = async cmd => { const r=await app.request(cmd); assert.equal(r.error,undefined); return r.result; };
  try {
    let r=await request({op:"savePoem",poem:{title:"A",author:"",text:"Раз\nДва\n\nТри"}});
    const first=r.state.activeId;
    await request({op:"start",plan:{mode:"recall",stanzas:[1],blockSize:1}});
    await request({op:"draft",answer:"Черновик"});
    r=await request({op:"savePoem",poem:{title:"B",author:"",text:"Другой текст"}});
    assert.equal(r.state.library.length,3);
    r=await request({op:"selectPoem",poemId:first});
    assert.equal(r.state.draftAnswer,"Черновик");assert.equal(r.state.tasks[0].text,"Три");
    await request({op:"hint"});
    r=await request({op:"submit",answer:"Три"});assert.equal(r.correct,false);assert.equal(r.state.position,0);assert.equal(r.state.hintLevel,0);
    r=await request({op:"submit",answer:"Ошибка"});assert.ok(r.differences.length);
    for(const task of r.state.tasks)r=await request({op:"submit",answer:task.text});
    const entry=r.state.library.find(e=>e.id===first);assert.equal(entry.dueAt,null);assert.equal(entry.completedAt,null);assert.equal(r.state.stats.sessions,1);assert.equal(entry.repetitions,0);assert.equal(r.state.sessionHadHelp,true);
    r=await request({op:"restart",plan:{mode:"difficult",stanzas:[],blockSize:0}});assert.equal(r.state.tasks.length,1);
    const snapshot=(await request({op:"exportLibrary"})).snapshot;
    await request({op:"importLibrary",snapshot});
    const before=JSON.stringify((await request({op:"load"})).state.library);
    const bad=await app.request({op:"importLibrary",poems:[{title:"Valid",author:"",text:"text"},{title:"Bad",author:"",text:""}]});assert.ok(bad.error);
    assert.equal(JSON.stringify((await request({op:"load"})).state.library),before);
  } finally {app.child.kill();await rm(dir,{recursive:true,force:true});}
});

test("legacy migration, recovery preserves corruption and restores validated backup", async () => {
 const dir=await mkdtemp(path.join(tmpdir(),"readly-recovery-")); const file=path.join(dir,"progress.json"); let app=core(file);
 try {
  let state=(await app.request({op:"load"})).result.state;
  app.child.kill(); await new Promise(resolve=>app.child.once("exit",resolve));
  await writeFile(file,JSON.stringify({poem:state.poem,settings:state.settings,position:1,started:true}));
  app=core(file); state=(await app.request({op:"load"})).result.state;assert.equal(state.position,1);assert.equal(state.library.length,1);
  let r=await app.request({op:"draft",answer:"saved"}); const name=r.result.state.backups[0].name;
  app.child.kill();await new Promise(resolve=>app.child.once("exit",resolve)); await writeFile(file,"broken");
  app=core(file);state=(await app.request({op:"load"})).result.state;assert.ok(state.recovery);assert.ok((await app.request({op:"start"})).error);assert.equal(await readFile(file,"utf8"),"broken");
  r=await app.request({op:"restoreBackup",name});assert.equal(r.error,undefined);assert.equal(r.result.state.recovery,null);assert.equal(r.result.state.position,1);
 } finally {app.child.kill();await rm(dir,{recursive:true,force:true});}
});

test("recovery without backups can create a clean profile and retains corrupt original", async () => {
 const dir=await mkdtemp(path.join(tmpdir(),"readly-reset-")); const file=path.join(dir,"progress.json"); await writeFile(file,"corrupt original");const app=core(file);
 try {
  assert.ok((await app.request({op:"load"})).result.state.recovery);
  const result=await app.request({op:"resetRecovery"});assert.equal(result.error,undefined);assert.equal(result.result.state.recovery,null);
  const preserved=(await readdir(dir)).find(name=>name.startsWith("progress.json.corrupt-"));assert.ok(preserved);assert.equal(await readFile(path.join(dir,preserved),"utf8"),"corrupt original");
  assert.ok((await app.request({op:"resetRecovery"})).error);
 } finally {app.child.kill();await rm(dir,{recursive:true,force:true});}
});

test("partial sessions do not complete a poem; full exam schedules repetition", async () => {
 const dir=await mkdtemp(path.join(tmpdir(),"readly-partial-"));const app=core(path.join(dir,"progress.json"));
 const request=async cmd=>{const r=await app.request(cmd);assert.equal(r.error,undefined);return r.result;};
 try {
  await request({op:"savePoem",poem:{title:"Scope",author:"",text:"One\n\nTwo"}});
  await request({op:"start",plan:{mode:"exam",stanzas:[1],blockSize:0}});
  let r=await request({op:"submit",answer:"Two"});let e=r.state.library.find(e=>e.id===r.state.activeId);assert.equal(e.completedAt,null);assert.equal(e.dueAt,null);assert.equal(r.state.stats.sessions,1);
  await request({op:"restart",plan:{mode:"exam",stanzas:[0,1],blockSize:0}});
  r=await request({op:"submit",answer:"One\n\nTwo"});e=r.state.library.find(e=>e.id===r.state.activeId);assert.ok(e.completedAt);assert.ok(e.dueAt>Date.now());assert.equal(r.state.stats.sessions,2);
 }finally{app.child.kill();await rm(dir,{recursive:true,force:true});}
});
