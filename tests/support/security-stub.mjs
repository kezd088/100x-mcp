// 测试替身：模拟 macOS 的 /usr/bin/security，只覆盖 100x 用到的两条子命令。
// 真实钥匙串行为仍须在 macOS 上验收，这里钉住的是参数、stdin 与失败分支。
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const store = process.env.STUB_KEYCHAIN_STORE;
const mode = process.env.STUB_KEYCHAIN_MODE || 'normal';
const args = process.argv.slice(2);
if (process.env.STUB_KEYCHAIN_ARGV) appendFileSync(process.env.STUB_KEYCHAIN_ARGV, JSON.stringify(args) + '\n');

const load = () => (existsSync(store) ? JSON.parse(readFileSync(store, 'utf8')) : {});
const save = value => writeFileSync(store, JSON.stringify(value));
const flag = (words, name) => { const at = words.indexOf(name); return at === -1 ? undefined : words[at + 1]; };
const key = words => flag(words, '-s') + '\u0000' + flag(words, '-a');

function add(words) {
  if (mode === 'deny-add') { process.stderr.write('security: SecKeychainItemCreateFromContent failed\n'); process.exit(45); }
  // -T 必须显式把 security 自己加入信任列表，否则 macOS 读取时会弹授权框。
  if (flag(words, '-T') !== '/usr/bin/security') { process.stderr.write('stub: missing -T /usr/bin/security\n'); process.exit(2); }
  if (!words.includes('-U') && load()[key(words)] !== undefined) { process.stderr.write('security: The specified item already exists\n'); process.exit(45); }
  if (mode === 'silent-drop') process.exit(0);
  const items = load();
  items[key(words)] = mode === 'corrupt' ? 'not+valid+base64!!' : flag(words, '-w');
  save(items);
}

function find(words) {
  const value = load()[key(words)];
  if (value === undefined) { process.stderr.write('security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.\n'); process.exit(44); }
  process.stdout.write(value + '\n');
}

if (args[0] === '-i') {
  for (const line of readFileSync(0, 'utf8').split('\n')) {
    const words = line.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    if (words[0] === 'add-generic-password') add(words);
    else if (words[0] === 'find-generic-password') find(words);
    else { process.stderr.write('stub: unsupported command ' + words[0] + '\n'); process.exit(2); }
  }
} else if (args[0] === 'add-generic-password') add(args);
else if (args[0] === 'find-generic-password') find(args);
else { process.stderr.write('stub: unsupported command\n'); process.exit(2); }
