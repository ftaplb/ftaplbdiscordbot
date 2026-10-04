import { createHash } from 'node:crypto';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { standings } from './leaderboard.js';
import { boardPages, renderPage } from './render.js';
import { requireThat } from './util.js';

export class Board {
  constructor(client, store, guild) {
    this.client = client;
    this.store = store;
    this.guild = guild;
    this.membersReady = false;
    this.lastError = null;
  }

  async sync() {
    // A failed member fetch must never turn an existing board into a partial list.
    await this.guild.roles.fetch();
    const previousIds = [...this.guild.members.cache.keys()];
    const fetched = await this.guild.members.fetch();
    for (const id of previousIds) if (!fetched.has(id)) this.guild.members.cache.delete(id);
    this.membersReady = true;
  }

  rows() {
    requireThat(this.membersReady, 'Members are still loading. Try $sync in a moment.');
    return standings(this.guild, this.store.state);
  }

  async channel(id) {
    const channel = await this.guild.channels.fetch(id);
    requireThat(channel && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type), 'Choose a text channel in this server.');
    const me = await this.guild.members.fetchMe();
    const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory];
    requireThat(channel.permissionsFor(me)?.has(needed), 'I need View Channel, Send Messages, Embed Links, Attach Files, and Read Message History there.');
    return channel;
  }

  async setChannel(id, actor) {
    await this.channel(id);
    const previous = structuredClone(this.store.state.delivery);
    if (previous.channelId === id) {
      await this.publish(true);
      return;
    }
    // Channel choice stays outside undo/restore, which are available to staff.
    this.store.runtime(next => {
      next.delivery = { channelId: id, messageIds: [], fingerprint: null, updatedAt: null };
      this.store.record(next, actor, `setchannel ${id}`);
    });
    try { await this.publish(true); }
    catch (error) {
      await this.clean(id, this.store.state.delivery.messageIds).catch(() => {});
      this.store.runtime(next => { next.delivery = previous; });
      throw error;
    }
    if (previous.channelId && previous.channelId !== id) await this.clean(previous.channelId, previous.messageIds);
  }

  async clean(channelId, messageIds) {
    if (!messageIds.length) return;
    let channel;
    try { channel = await this.guild.channels.fetch(channelId); }
    catch (error) { if (error.code === 10003) return; throw error; }
    if (!channel) return;
    for (const id of messageIds) {
      try {
        const message = await channel.messages.fetch(id);
        if (message?.author.id === this.client.user.id) await message.delete();
      } catch (error) { if (error.code !== 10008) throw error; }
    }
  }

  async publish(force = false) {
    const state = this.store.state;
    if (!state.delivery.channelId || (state.settings.paused && !force)) return false;
    const rows = this.rows();
    const selected = rows.slice(0, state.settings.limit);
    const fingerprint = createHash('sha256').update(JSON.stringify({ rows: selected, settings: state.settings })).digest('hex');
    if (!force && fingerprint === state.delivery.fingerprint) return false;
    const channel = await this.channel(state.delivery.channelId);
    const pages = boardPages(selected, state.settings);
    const updatedAt = new Date();
    for (let i = 0; i < pages.length; i++) {
      const payload = await renderPage(pages[i], state.settings, { page: i + 1, pages: pages.length, total: selected.length, updatedAt });
      const id = this.store.state.delivery.messageIds[i];
      let message = null;
      if (id) {
        try { message = await channel.messages.fetch(id); }
        catch (error) { if (error.code !== 10008) throw error; }
      }
      if (message?.author.id === this.client.user.id) {
        await message.edit({ ...payload, attachments: [] });
      } else {
        message = await channel.send(payload);
        // Save each message immediately so a later failed page won't duplicate earlier ones.
        this.store.runtime(next => { next.delivery.messageIds[i] = message.id; });
      }
    }
    const extra = this.store.state.delivery.messageIds.slice(pages.length);
    await this.clean(channel.id, extra);
    this.store.runtime(next => {
      next.delivery.messageIds = next.delivery.messageIds.slice(0, pages.length);
      next.delivery.fingerprint = fingerprint;
      next.delivery.updatedAt = updatedAt.toISOString();
    });
    this.lastError = null;
    return true;
  }

  async preview(page) {
    const state = this.store.state;
    const rows = this.rows().slice(0, state.settings.limit);
    const pages = boardPages(rows, state.settings);
    requireThat(page <= pages.length, `There are ${pages.length} pages.`);
    return renderPage(pages[page - 1], state.settings, { page, pages: pages.length, total: rows.length, updatedAt: new Date() });
  }
}
