const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const lucide = require('lucide-react');

const icons = {
  download: lucide.Download, play: lucide.Play, monitor: lucide.Monitor,
  scissors: lucide.Scissors, undo: lucide.Undo2, focus: lucide.Focus,
  captions: lucide.Captions, 'file-video': lucide.FileVideo,
  'arrow-right': lucide.ArrowRight, 'arrow-up-right': lucide.ArrowUpRight,
  github: lucide.Github, 'shield-check': lucide.ShieldCheck, copy: lucide.Copy,
};
const file = path.join(__dirname, '..', 'docs', 'index.html');
let html = fs.readFileSync(file, 'utf8');
for (const [name, icon] of Object.entries(icons)) {
  const markup = renderToStaticMarkup(React.createElement(icon, { 'aria-hidden': 'true', focusable: 'false', strokeWidth: 1.7 }));
  const pattern = new RegExp(`<span data-icon="${name}">(?:<svg[\\s\\S]*?</svg>)?</span>`, 'g');
  html = html.replace(pattern, `<span data-icon="${name}">${markup}</span>`);
}
fs.writeFileSync(file, html);
console.log('Site icons generated from lucide-react.');
