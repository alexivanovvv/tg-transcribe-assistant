// Generic CLI Glob Runner Helper
//
// Why this script exists:
// CLI tools/flags like `node --check` do not natively perform glob expansion on Windows shell arguments.
// This script takes a command and arguments (including glob patterns), expands any patterns using `fs.globSync`,
// and executes the command cross-platform.
//
// Usage:
//   node tests/run_glob.js <command> [flags...] <glob_patterns...>
// Example:
//   node tests/run_glob.js node --check "{api,lib,src,scripts,tests,netlify}/**/*.{js,mjs}"

const { execFileSync } = require('node:child_process');
const { globSync } = require('node:fs');

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node tests/run_glob.js <command> [args...]');
  process.exit(1);
}

const cmd = args[0];
const expandedArgs = [];

for (let i = 1; i < args.length; i++) {
  const arg = args[i];
  if (arg.includes('*') || arg.includes('{')) {
    const matched = globSync(arg);
    expandedArgs.push(...matched);
  } else {
    expandedArgs.push(arg);
  }
}

execFileSync(cmd, expandedArgs, { stdio: 'inherit' });
