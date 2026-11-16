#!/bin/zsh
set -e
cd -- "${0:A:h}"

step_node="$(command -v node || true)"
if [[ -z "$step_node" ]]; then
  step_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$step_node" ]]; then
  print '请先安装 Node.js 20.19+ 或 22.12+，再运行本文件。'
  read '?按回车关闭…'
  exit 1
fi
if [[ ! -f node_modules/vite/bin/vite.js ]]; then
  print '首次运行，请先在此目录执行 npm install。'
  read '?按回车关闭…'
  exit 1
fi
"$step_node" scripts/copy-occt.mjs
print 'STEP Studio 正在启动；关闭此窗口或按 Ctrl+C 可停止服务。'
"$step_node" node_modules/vite/bin/vite.js --host 127.0.0.1 --open
