// Builds index.html from src/shell.html + src/app.jsx.
// The JSX is compiled and minified here, so visitors' browsers don't have to.
// Setup once:  npm install     Then after every change:  node build.js
const fs = require('fs');
const babel = require('@babel/core');
const { minify } = require('terser');

(async () => {
  const src = fs.readFileSync(__dirname + '/src/app.jsx', 'utf8');
  const shell = fs.readFileSync(__dirname + '/src/shell.html', 'utf8');
  const compiled = babel.transformSync(src, { presets: [require.resolve('@babel/preset-react')], babelrc: false, configFile: false }).code;
  const min = await minify(compiled, { ecma: 2020, compress: { passes: 2 }, mangle: true, format: { ascii_only: false } });
  if (!shell.includes('/*APP*/')) throw new Error('shell.html is missing the /*APP*/ placeholder');
  const safe = min.code.replace(/<\/script/gi, '<\\/script');
  const out = shell.split('/*APP*/').join(safe);
  fs.writeFileSync(__dirname + '/index.html', out);
  console.log('index.html built:', Math.round(out.length / 1024) + 'KB');
})().catch(e => { console.error(e.message); process.exit(1); });
