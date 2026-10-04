import sharp from 'sharp';
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { chunks, plain } from './util.js';

const xml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
const clip = (value, length) => {
  const chars = Array.from(String(value).replace(/[\x00-\x1f\x7f]/g, ' '));
  return xml(chars.length > length ? `${chars.slice(0, length - 1).join('')}…` : chars.join(''));
};

export function cardSvg(rows, settings, { page = 1, pages = 1, total = rows.length, updatedAt = new Date() } = {}) {
  const height = 248 + Math.max(rows.length, 1) * 66;
  const accent = /^#[0-9a-f]{6}$/i.test(settings.color) ? settings.color : '#f5ca55';
  const body = rows.length ? rows.map((row, i) => {
    const y = 190 + i * 66;
    const medal = ['#f5ca55', '#c0cedd', '#d9a276'][row.position - 1];
    const color = /^#[0-9a-f]{6}$/i.test(row.color) ? row.color : '#acb5c4';
    return `<rect x="28" y="${y}" width="944" height="58" rx="10" fill="${medal ? '#1c2230' : '#141c29'}"/>
      ${medal ? `<rect x="28" y="${y + 12}" width="3" height="34" rx="1.5" fill="${medal}"/>` : ''}
      <text x="63" y="${y + 35}" text-anchor="middle" font-size="20" font-weight="700" fill="${medal || '#758297'}">${row.position.toString().padStart(2, '0')}</text>
      <text x="104" y="${y + 25}" clip-path="url(#names)" font-size="19" font-weight="600" fill="#f1f4fb">${clip(row.name, 36)}</text>
      <text x="104" y="${y + 45}" clip-path="url(#names)" font-size="13" fill="#9aa8be">${row.roblox ? `ROBLOX  ${clip(row.roblox, 28)}` : `DISCORD  ${clip(row.username, 28)}`}</text>
      <rect x="752" y="${y + 14}" width="196" height="30" rx="15" fill="${color}" fill-opacity=".10"/>
      <circle cx="771" cy="${y + 29}" r="3" fill="${color}"/>
      <text x="790" y="${y + 35}" font-size="15" font-weight="600" fill="${color}">${xml(row.rank)}</text>`;
  }).join('\n') : '<text x="500" y="227" font-size="18" fill="#9aa8be" text-anchor="middle">No ranked members yet.</text>';
  const date = new Date(updatedAt).toISOString().slice(0, 16).replace('T', ' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}">
    <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#172235"/><stop offset="1" stop-color="#0c111c"/></linearGradient>
      <clipPath id="names"><rect x="104" y="0" width="622" height="${height}"/></clipPath>
      <clipPath id="heading"><rect x="28" y="0" width="778" height="150"/></clipPath>
    </defs>
    <rect width="1000" height="${height}" rx="20" fill="#0c111c"/>
    <rect width="1000" height="160" rx="20" fill="url(#bg)"/>
    <rect x="28" y="30" width="36" height="4" rx="2" fill="${accent}"/>
    <g font-family="DejaVu Sans, Segoe UI, sans-serif">
      <text x="76" y="37" font-size="12" font-weight="700" letter-spacing="2.4" fill="${accent}">FTAP COMMUNITY</text>
      <text x="28" y="82" clip-path="url(#heading)" font-size="32" font-weight="700" fill="#f6f8ff">${clip(settings.title, 38)}</text>
      <text x="28" y="110" clip-path="url(#heading)" font-size="15" fill="#9aa8be">${clip(settings.description, 78)}</text>
      <rect x="830" y="32" width="142" height="69" rx="12" fill="#0d1421" stroke="#2c374b"/>
      <text x="901" y="62" text-anchor="middle" font-size="25" font-weight="700" fill="#f1f4fb">${total}<tspan font-size="14" fill="#758297"> / ${settings.limit}</tspan></text>
      <text x="901" y="82" text-anchor="middle" font-size="10" letter-spacing="1.3" fill="#9aa8be">PARTICIPANTS</text>
      <text x="46" y="171" font-size="10" letter-spacing="1.8" fill="#758297">POS</text>
      <text x="104" y="171" font-size="10" letter-spacing="1.8" fill="#758297">PLAYER</text>
      <text x="767" y="171" font-size="10" letter-spacing="1.8" fill="#758297">RANK</text>
      ${body}
      <line x1="28" y1="${height - 41}" x2="972" y2="${height - 41}" stroke="#243044"/>
      <text x="28" y="${height - 18}" font-size="11" fill="#758297">${clip(settings.footer, 42)} · ${date} UTC</text>
      <text x="972" y="${height - 18}" text-anchor="end" font-size="11" fill="#9aa8be">${page} / ${pages}</text>
    </g>
  </svg>`;
}

export async function renderPage(rows, settings, meta) {
  const name = `ftap-board-${meta.page}.png`;
  const png = await sharp(Buffer.from(cardSvg(rows, settings, meta))).png().toBuffer();
  const embed = new EmbedBuilder().setColor(settings.color).setImage(`attachment://${name}`);
  if (meta.page === 1) embed.setTitle(settings.title).setDescription(plain(settings.description));
  if (settings.thumbnail) embed.setThumbnail(settings.thumbnail);
  embed.setFooter({ text: `${meta.total} participants · Page ${meta.page}/${meta.pages}` });
  const description = rows.length ? rows.map(row => `${row.position}. ${row.name} — ${row.rank}${row.roblox ? ` (${row.roblox})` : ''}`).join('\n').slice(0, 1024) : 'No ranked members yet.';
  return { embeds: [embed], files: [new AttachmentBuilder(png, { name, description })], allowedMentions: { parse: [] } };
}

export function boardPages(rows, settings) {
  return chunks(rows.slice(0, settings.limit), settings.pageSize).length ? chunks(rows.slice(0, settings.limit), settings.pageSize) : [[]];
}
