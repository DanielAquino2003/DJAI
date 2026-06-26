import { SpotifyClient, SpotifyTrack } from "./spotify.js";

export type GeneratePlaylistInput = {
  prompt: string;
  durationMinutes?: number;
  name?: string;
  makePublic?: boolean;
  startPlayback?: boolean;
  market?: string;
};

export type GeneratedPlaylist = {
  playlistId: string;
  playlistUri: string;
  playlistUrl?: string;
  name: string;
  description: string;
  tracks: SpotifyTrack[];
  estimatedDurationMinutes: number;
  queries: string[];
};

const GENRE_HINTS = [
  "techno",
  "hard techno",
  "house",
  "drum and bass",
  "trance",
  "ambient",
  "rock",
  "metal",
  "hip hop",
  "reggaeton",
  "pop",
  "funk",
  "jazz",
  "classical"
];

const ACTIVITY_HINTS = {
  workout: ["workout", "training", "gym", "running", "high energy", "peak time"],
  focus: ["focus", "deep work", "instrumental", "concentration"],
  party: ["party", "dance", "upbeat", "club"],
  relax: ["chill", "relax", "calm", "downtempo"]
} as const;

type Activity = keyof typeof ACTIVITY_HINTS;

export async function generatePlaylistFromPrompt(
  spotify: SpotifyClient,
  input: GeneratePlaylistInput
): Promise<GeneratedPlaylist> {
  const targetMinutes = input.durationMinutes ?? inferDuration(input.prompt);
  const genre = inferGenre(input.prompt);
  const activity = inferActivity(input.prompt);
  const queries = buildQueries(input.prompt, genre, activity);
  const tracks = await collectTracks(spotify, queries, targetMinutes * 60_000, input.market);

  if (tracks.length === 0) {
    throw new Error("Spotify search returned no tracks for this prompt.");
  }

  const me = await spotify.me();
  const name = input.name ?? buildPlaylistName(genre, activity);
  const description = `Generated from prompt: "${input.prompt}". Uses Spotify text search, not restricted recommendation/audio-feature endpoints.`;
  const playlist = await spotify.createPlaylist(me.id, {
    name,
    description,
    public: input.makePublic ?? false
  });

  for (const chunk of chunkArray(tracks.map((track) => track.uri), 100)) {
    await spotify.addTracksToPlaylist(playlist.id, chunk);
  }

  if (input.startPlayback) {
    await spotify.play({ contextUri: playlist.uri });
  }

  return {
    playlistId: playlist.id,
    playlistUri: playlist.uri,
    playlistUrl: playlist.external_urls?.spotify,
    name,
    description,
    tracks,
    estimatedDurationMinutes: Math.round(tracks.reduce((sum, track) => sum + track.duration_ms, 0) / 60_000),
    queries
  };
}

function inferGenre(prompt: string): string {
  const normalized = prompt.toLowerCase();
  return GENRE_HINTS.find((genre) => normalized.includes(genre)) ?? "";
}

function inferActivity(prompt: string): Activity {
  const normalized = prompt.toLowerCase();
  if (/(entren|gym|workout|correr|running|cardio|pesas)/i.test(normalized)) return "workout";
  if (/(focus|concentr|trabaj|deep work|estudi)/i.test(normalized)) return "focus";
  if (/(party|fiesta|club|bail)/i.test(normalized)) return "party";
  if (/(relax|chill|tranquil|calm)/i.test(normalized)) return "relax";
  return "focus";
}

function inferDuration(prompt: string): number {
  const hourMatch = prompt.match(/(\d+(?:[.,]\d+)?)\s*(h|hora|horas|hour|hours)\b/i);
  if (hourMatch) return Math.round(Number(hourMatch[1].replace(",", ".")) * 60);

  const minuteMatch = prompt.match(/(\d+)\s*(min|mins|minutos|minutes)\b/i);
  if (minuteMatch) return Number(minuteMatch[1]);

  return 60;
}

function buildQueries(prompt: string, genre: string, activity: Activity): string[] {
  const baseGenre = genre || prompt.slice(0, 80);
  const hints = ACTIVITY_HINTS[activity];
  const queries = [
    `${baseGenre} ${hints[0]}`,
    `${baseGenre} ${hints[1]}`,
    `${baseGenre} ${hints[2]}`,
    `${baseGenre} playlist`,
    `${baseGenre} essentials`
  ];

  if (activity === "workout") {
    queries.push(`${baseGenre} high bpm`, `${baseGenre} intense`, `${baseGenre} peak time`);
  }

  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
}

async function collectTracks(
  spotify: SpotifyClient,
  queries: string[],
  targetMs: number,
  market?: string
): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  const seenTrackIds = new Set<string>();
  const seenArtistTrack = new Set<string>();
  let totalMs = 0;

  for (const query of queries) {
    const results = await spotify.searchTracks(query, 30, market);
    for (const track of results) {
      const artistKey = `${track.artists[0]?.toLowerCase() ?? ""}:${track.name.toLowerCase()}`;
      if (seenTrackIds.has(track.id) || seenArtistTrack.has(artistKey)) continue;

      seenTrackIds.add(track.id);
      seenArtistTrack.add(artistKey);
      tracks.push(track);
      totalMs += track.duration_ms;

      if (totalMs >= targetMs) return tracks;
    }
  }

  return tracks;
}

function buildPlaylistName(genre: string, activity: Activity): string {
  const date = new Date().toISOString().slice(0, 10);
  if (!genre) return `Agent playlist - ${date}`;
  const titleGenre = genre
    .split(" ")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
  return `${titleGenre} ${activity} - ${date}`;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
