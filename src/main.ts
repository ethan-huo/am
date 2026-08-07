#!/usr/bin/env bun

import { toStandardJsonSchema } from "@valibot/to-json-schema";
import { c, cli, group } from "argc";
import * as v from "valibot";

import packageJson from "../package.json" with { type: "json" };
import * as api from "./api.ts";
import { clearKeychain, getTokens, peek, refresh } from "./auth.ts";
import * as local from "./local.ts";

const s = toStandardJsonSchema;

const trackIds = v.pipe(
  v.array(v.pipe(v.string(), v.minLength(1))),
  v.minLength(1),
  v.description("Catalog song IDs from `am search`"),
);

const schema = {
  search: c
    .meta({
      description: "Search the Apple Music catalog",
      examples: [
        // ISRC is the point: title-only matching silently returns covers and
        // remixes, so callers should pin the edition before writing anything.
        `am search "{ term: 'nujabes aruarian dance', limit: 3 }"`,
      ],
    })
    .positional("term")
    .input(
      s(
        v.object({
          term: v.pipe(v.string(), v.minLength(1)),
          limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(25)), 10),
          storefront: v.optional(v.string()),
        }),
      ),
    ),

  taste: c
    .meta({
      description: "Summarize local listening history — the signal the catalog API cannot provide",
    })
    .input(
      s(
        v.object({
          artists: v.optional(v.pipe(v.number(), v.minValue(1)), 20),
          tracks: v.optional(v.pipe(v.number(), v.minValue(1)), 25),
        }),
      ),
    ),

  play: c
    .meta({ description: "Play a library playlist in Music.app" })
    .positional("playlist")
    .input(s(v.object({ playlist: v.pipe(v.string(), v.minLength(1)) }))),

  now: c.meta({ description: "Show what Music.app is playing" }).input(s(v.object({}))),

  control: c
    .meta({ description: "Control playback" })
    .positional("action")
    .input(
      s(
        v.object({
          action: v.picklist(["play", "pause", "next", "previous"]),
        }),
      ),
    ),

  playlist: group(
    { description: "Library playlists" },
    {
      list: c
        .meta({ description: "List library playlists" })
        .input(s(v.object({ limit: v.optional(v.pipe(v.number(), v.minValue(1)), 25) }))),

      tracks: c
        .meta({ description: "List a playlist's tracks" })
        .positional("id")
        .input(s(v.object({ id: v.pipe(v.string(), v.minLength(1)) }))),

      create: c.meta({ description: "Create a playlist and seed it with catalog tracks" }).input(
        s(
          v.object({
            name: v.pipe(v.string(), v.minLength(1)),
            tracks: trackIds,
            description: v.optional(v.string()),
          }),
        ),
      ),

      add: c
        .meta({ description: "Add catalog tracks to an existing playlist" })
        .input(s(v.object({ id: v.pipe(v.string(), v.minLength(1)), tracks: trackIds }))),
    },
  ),

  auth: group(
    { description: "Apple Music credentials" },
    {
      status: c.meta({ description: "Show credential status" }).input(s(v.object({}))),
      refresh: c
        .meta({ description: "Force-refresh credentials via Aside" })
        .input(s(v.object({}))),
      logout: c.meta({ description: "Delete stored credentials" }).input(s(v.object({}))),
    },
  ),
};

const app = cli(schema, {
  name: "am",
  version: packageJson.version,
  description: "Control Apple Music and read your listening history",
});

await app.run({
  handlers: {
    search: async ({ input }) => {
      const storefront = input.storefront ?? (await getTokens()).storefront;
      const songs = await api.search(input.term, input.limit, storefront);
      return songs.length === 0
        ? { results: [], $hints: "No catalog matches" }
        : { results: songs };
    },

    taste: async ({ input }) => local.taste(input.artists, input.tracks),

    play: async ({ input }) => {
      const { waitedMs } = await local.playPlaylist(input.playlist);
      return { playing: input.playlist, ...(waitedMs > 1000 ? { syncWaitMs: waitedMs } : {}) };
    },

    now: async () => local.nowPlaying(),

    control: async ({ input }) => {
      await local.control(input.action);
      return { ok: input.action };
    },

    playlist: {
      list: async ({ input }) => ({ playlists: await api.listPlaylists(input.limit) }),

      tracks: async ({ input }) => ({ tracks: await api.playlistTracks(input.id) }),

      create: async ({ input }) => {
        const pl = await api.createPlaylist(input.name, input.tracks, input.description);
        return {
          id: pl.id,
          name: pl.name,
          tracks: input.tracks.length,
          $hints: `Play it with: am play ${JSON.stringify(pl.name)}`,
        };
      },

      add: async ({ input }) => {
        await api.addTracks(input.id, input.tracks);
        return { added: input.tracks.length, playlist: input.id };
      },
    },

    auth: {
      status: async () => {
        const tokens = await peek();
        if (!tokens) return { authenticated: false };
        return { authenticated: true, storefront: tokens.storefront };
      },

      refresh: async () => {
        const tokens = await refresh();
        return { authenticated: true, storefront: tokens.storefront };
      },

      logout: async () => ({ cleared: await clearKeychain() }),
    },
  },
});
