// Model the bounded OSC palette probe used by a TUI, without any network/API.
process.stdin.setRawMode(true);
process.stdin.resume();
let input = '';
const timeout = setTimeout(() => {
  process.stdout.write('PROBE_TIMEOUT\r\n', () => process.exit(2));
}, 250);
process.stdin.on('data', (data) => {
  input += data.toString();
  if (!input.includes(']10;rgb:') || !input.includes(']11;rgb:')) return;
  clearTimeout(timeout);
  const expected = input.includes(']11;rgb:1e1e/1e1e/1e1e');
  process.stdout.write(
    '\x1b[48;2;58;58;58m gray composer \x1b[0m\r\nPROBE_' + (expected ? 'OK' : 'WRONG_COLOR') + '\r\n',
    () => process.exit(expected ? 0 : 3)
  );
});
process.stdout.write('\x1b]10;?\x1b\\\x1b]11;?\x1b\\');
