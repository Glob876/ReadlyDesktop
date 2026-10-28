import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
function start(file) {
  const child = spawn(path.resolve('native/target/release/readly-core'), [file]);
  const queue = [];
  createInterface({input: child.stdout}).on('line', line => queue.shift()(JSON.parse(line)));
  return {child, request: command => new Promise(resolve => {
    queue.push(resolve); child.stdin.write(JSON.stringify({...command, id: 1})+'\n');
  }), close: () => new Promise(resolve => { child.once('exit', resolve); child.stdin.end(); })};
}
test('palette validation, restart persistence and migration of old sepia profiles', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'readly-palette-'));
  const file = path.join(dir, 'progress.json');
  let app = start(file);
  try {
    let state = (await app.request({op:'load'})).result.state;
    assert.equal(state.settings.colorTheme, 'readly');
    for (const colorTheme of ['readly','sepia','github','catppuccin','matrix','gruvbox','nord']) {
      for (const theme of ['light','dark','system']) {
        const result = await app.request({op:'settings', settings:{...state.settings, colorTheme, theme}});
        assert.equal(result.error, undefined);
        assert.equal(result.result.state.settings.colorTheme, colorTheme);
        assert.equal(result.result.state.settings.theme, theme);
      }
    }
    const invalid = await app.request({op:'settings', settings:{...state.settings, colorTheme:'unknown'}});
    assert.ok(invalid.error);
    await app.close(); app = start(file);
    state = (await app.request({op:'load'})).result.state;
    assert.equal(state.settings.colorTheme,'nord');
    assert.equal(state.settings.theme,'system');
    await app.close();
    state.settings.theme = 'sepia'; delete state.settings.colorTheme;
    await writeFile(file, JSON.stringify(state));
    app = start(file);
    state = (await app.request({op:'load'})).result.state;
    assert.equal(state.settings.colorTheme,'sepia');
    assert.equal(state.settings.theme,'light');
    assert.equal(state.poem.title,'Зимнее утро');
  } finally { if (app.child.exitCode === null) await app.close(); await rm(dir,{recursive:true,force:true}); }
});
