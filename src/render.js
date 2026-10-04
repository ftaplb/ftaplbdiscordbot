import sharp from 'sharp';
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { chunks, plain } from './util.js';

const xml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
const clip = (value, length) => {
  const chars = Array.from(String(value).replace(/[\x00-\x1f\x7f]/g, ' '));
  return xml(chars.length > length ? `${chars.slice(0, length - 1).join('')}…` : chars.join(''));
};

export function cardSvg(rows, settings, { page = 1, pages = 1, total = rows.length, updatedAt = new Date() } = {}) {
  const columns = [
    { label: '#', width: 55, key: 'position', max: 3 },
    { label: 'Player', width: 250, key: 'name', max: 24 },
    { label: 'Rank', width: 160, key: 'rank', max: 16 },
    { label: 'Rating', width: 100, key: 'rating', max: 10 },
    { label: 'RD', width: 65, key: 'rd', max: 5 },
    { label: 'Country', width: 235, key: 'country', max: 25 },
    { label: 'Clan', width: 135, key: 'clan', max: 12 },
  ];
  const width = columns.reduce((sum, column) => sum + column.width, 0);
  const headerHeight = 34;
  const rowHeight = 30;
  const tableHeight = headerHeight + Math.max(rows.length, 1) * rowHeight;
  const height = tableHeight + 26;
  const accent = /^#[0-9a-f]{6}$/i.test(settings.color) ? settings.color : '#d6d18e';
  let offset = 0;
  const clips = columns.map((column, i) => {
    column.x = offset;
    offset += column.width;
    return `<clipPath id="c${i}"><rect x="${column.x + 8}" y="0" width="${column.width - 16}" height="${tableHeight}"/></clipPath>`;
  }).join('');
  const labels = columns.map(column => `<text x="${column.x + column.width / 2}" y="24" text-anchor="middle" font-weight="700" fill="#eeeeee">${column.label}</text>`).join('');
  const body = rows.length ? rows.map((row, index) => {
    const y = headerHeight + index * rowHeight;
    const cells = columns.map((column, i) => {
      const value = row[column.key] === null || row[column.key] === undefined || row[column.key] === '' ? '—' : row[column.key];
      return `<text x="${column.x + column.width / 2}" y="${y + 21}" clip-path="url(#c${i})" text-anchor="middle" font-weight="${column.key === 'name' ? 600 : 400}" fill="${column.key === 'name' ? accent : '#d0d0d0'}">${clip(value, column.max)}</text>`;
    }).join('');
    return `<rect y="${y}" width="${width}" height="${rowHeight}" fill="${index % 2 ? '#202020' : '#262626'}"/>${cells}<line y1="${y + rowHeight}" y2="${y + rowHeight}" x2="${width}" stroke="#090909" stroke-width="2"/>`;
  }).join('') : `<text x="${columns[1].x + columns[1].width / 2}" y="55" text-anchor="middle" fill="#c0c0c0">No ranked players</text>`;
  const grid = columns.slice(1).map(column => `<line x1="${column.x}" x2="${column.x}" y2="${tableHeight}" stroke="#090909" stroke-width="2"/>`).join('');
  const date = new Date(updatedAt).toISOString().slice(0, 16).replace('T', ' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>${clips}</defs>
    <rect width="${width}" height="${height}" fill="#1c1c1c"/>
    <rect width="${width}" height="${headerHeight}" fill="#303030"/>
    <g font-family="DejaVu Sans, Segoe UI, sans-serif" font-size="17">${labels}${body}</g>
    <line y1="${headerHeight}" y2="${headerHeight}" x2="${width}" stroke="#090909" stroke-width="2"/>
    ${grid}
    <rect x="1" y="1" width="${width - 2}" height="${tableHeight - 2}" fill="none" stroke="#090909" stroke-width="2"/>
    <g font-family="DejaVu Sans, Segoe UI, sans-serif" font-size="11" fill="#a0a0a0">
      <text x="8" y="${height - 8}">${clip(settings.footer, 42)} · ${total}/${settings.limit} players · ${date} UTC</text>
      <text x="${width - 8}" y="${height - 8}" text-anchor="end">${page}/${pages}</text>
    </g>
  </svg>`;
}

export async function renderPage(rows, settings, meta) {
  const name = `ftap-board-${meta.page}.png`;
  const png = await sharp(Buffer.from(cardSvg(rows, settings, meta))).png().toBuffer();
  const embed = new EmbedBuilder().setColor(settings.color).setImage(`attachment://${name}`);
  if (meta.page === 1) embed.setTitle(plain(settings.title)).setDescription(plain(settings.description));
  if (settings.thumbnail) embed.setThumbnail(settings.thumbnail);
  const description = rows.length ? rows.map(row => `${row.position}. ${row.name} — ${row.rank}${row.roblox ? ` (${row.roblox})` : ''}`).join('\n').slice(0, 1024) : 'No ranked members yet.';
  return { embeds: [embed], files: [new AttachmentBuilder(png, { name, description })], allowedMentions: { parse: [] } };
}

export function boardPages(rows, settings) {
  const pages = chunks(rows.slice(0, settings.limit), settings.pageSize);
  return pages.length ? pages : [[]];
}
