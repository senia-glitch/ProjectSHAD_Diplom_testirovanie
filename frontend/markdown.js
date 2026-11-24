'use strict';
/* Безопасный Markdown для описаний заданий и тестов.
   Весь текст сначала экранируется; создаются только известные теги, ссылки — только http(s)/mailto.
   Медиа не хранятся в системе: картинки, видео и аудио подключаются по внешним URL. */

const MD_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const mdEscape = (s) => String(s).replace(/[&<>"']/g, (c) => MD_ESC[c]);
const mdUnescape = (s) => String(s).replace(/&(amp|lt|gt|quot|#39);/g, (m) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[m]);

function mdSafeUrl(escaped, { mail = false } = {}) {
  const raw = mdUnescape(escaped).trim();
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' || url.protocol === 'http:' || (mail && url.protocol === 'mailto:')) return mdEscape(url.href);
  } catch {}
  return null;
}

const MD_IMAGE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?.*)?$/i;
const MD_VIDEO = /\.(mp4|webm|ogv|mov)(\?.*)?$/i;
const MD_AUDIO = /\.(mp3|wav|ogg|oga|m4a|flac|aac)(\?.*)?$/i;

/* Встраиваемые видео только с известных площадок. */
function mdEmbed(href) {
  let url;
  try { url = new URL(mdUnescape(href)); } catch { return null; }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id;
  if (host === 'youtube.com' && url.pathname === '/watch') id = url.searchParams.get('v');
  else if (host === 'youtu.be') id = url.pathname.slice(1);
  else if (host === 'youtube.com' && /^\/(embed|shorts)\//.test(url.pathname)) id = url.pathname.split('/')[2];
  if (id && /^[\w-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
  if (host === 'vimeo.com' && /^\/\d+$/.test(url.pathname)) return `https://player.vimeo.com/video${url.pathname}`;
  if (host === 'rutube.ru') { const m = url.pathname.match(/^\/video\/([0-9a-f]{32})/); if (m) return `https://rutube.ru/play/embed/${m[1]}`; }
  return null;
}

/* Медиа-блок по ссылке: картинка, видео, аудио, встраиваемый плеер. */
function mdMedia(href, alt = '') {
  const plain = mdUnescape(href);
  const embed = mdEmbed(href);
  if (embed) return `<div class="md-video"><iframe src="${mdEscape(embed)}" title="${alt || 'Видео'}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  if (MD_VIDEO.test(plain)) return `<video class="md-media" controls preload="metadata" src="${href}"></video>`;
  if (MD_AUDIO.test(plain)) return `<audio class="md-audio" controls preload="none" src="${href}"></audio>`;
  return `<img class="md-media" src="${href}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer">`;
}

function mdInline(text) {
  // Готовые фрагменты (код, ссылки, медиа) прячутся в метки, чтобы следующие замены их не трогали.
  const codes = [];
  const keep = (html) => { codes.push(html); return `\u0000${codes.length - 1}\u0000`; };
  let s = text.replace(/`([^`]+)`/g, (_, c) => keep(`<code>${c}</code>`));
  // ![alt](url) — медиа по ссылке
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => { const href = mdSafeUrl(url); return href ? keep(mdMedia(href, alt)) : m; });
  // [текст](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const href = mdSafeUrl(url, { mail: true });
    return href ? keep(`<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">`) + label + keep('</a>') : m;
  });
  // голые ссылки
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<\u0000]+[^\s<.,;:!?)\]\u0000])/g, (m, pre, url) => {
    const href = mdSafeUrl(url);
    return href ? pre + keep(`<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`) : m;
  });
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, '$1<em>$2</em>').replace(/(^|[^\w])_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[i]);
}

/* Строка целиком — ссылка на картинку/видео/аудио или поддерживаемый плеер. */
function mdIsMediaLine(line) {
  const m = line.trim().match(/^(https?:\/\/\S+)$/);
  if (!m) return false;
  const href = mdSafeUrl(m[1]), plain = mdUnescape(m[1]);
  return !!href && !!(mdEmbed(href) || MD_IMAGE.test(plain) || MD_VIDEO.test(plain) || MD_AUDIO.test(plain));
}

function renderMarkdown(source) {
  const lines = mdEscape(String(source || '').replace(/\r\n?/g, '\n')).split('\n');
  const out = [];
  let i = 0;
  const isTableSep = (l) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => mdInline(c.trim()));
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(/^```\s*([\w-]*)\s*$/))) {
      const code = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push(`<pre><code>${code.join('\n')}</code></pre>`);
      continue;
    }
    if ((m = line.match(/^(#{1,4})\s+(.+)$/))) { out.push(`<h${m[1].length + 1}>${mdInline(m[2])}</h${m[1].length + 1}>`); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    // ссылка на медиа отдельной строкой — встроить
    if (mdIsMediaLine(line)) { out.push(mdMedia(mdSafeUrl(line.trim()))); i++; continue; }
    if (/^&gt;\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) quote.push(lines[i++].replace(/^&gt;\s?/, ''));
      out.push(`<blockquote>${renderMarkdownEscaped(quote)}</blockquote>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        let text = lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        const task = text.match(/^\[([ xX])\]\s+(.*)$/);
        if (task) text = `${task[1] === ' ' ? '☐' : '☑'} ${task[2]}`;
        items.push(`<li>${mdInline(text)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const headerCells = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(`<div class="table-wrap md-table"><table><thead><tr>${headerCells.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${headerCells.map((_, k) => `<td>${r[k] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|&gt;|\s*([-*+]|\d+[.)])\s+)/.test(lines[i]) && !(para.length && mdIsMediaLine(lines[i]))) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    out.push(`<p>${para.map(mdInline).join('<br>')}</p>`);
  }
  return out.join('\n');
}

/* Вложенный рендер для цитат: строки уже экранированы. */
function renderMarkdownEscaped(lines) { return renderMarkdown(lines.map(mdUnescape).join('\n')); }

/* Краткий текст без разметки — для карточек и списков. */
function markdownPlain(source) {
  return String(source || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/(\*\*|__|~~|`)/g, '').replace(/(^|\W)[*_](\S[^*_]*?)[*_](?=\W|$)/g, '$1$2')
    .replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
}

/* Элемент с отрендеренным Markdown (HTML собран только из экранированного текста). */
function markdownBlock(source, cls = '') {
  const box = el('div', { class: `prose md ${cls}`.trim(), html: renderMarkdown(source) });
  // Недоступное внешнее медиа заменяется понятной ссылкой вместо пустой рамки.
  box.querySelectorAll('img.md-media, video.md-media, audio.md-audio').forEach((node) => {
    node.addEventListener('error', () => {
      const src = node.getAttribute('src');
      node.replaceWith(el('a', { class: 'media-link', href: src, target: '_blank', rel: 'noopener noreferrer nofollow' },
        el('span', {}, 'Не удалось загрузить медиа по ссылке', el('small', { text: src }))));
    }, { once: true });
  });
  return box;
}
