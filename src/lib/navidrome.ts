import { SubsonicAPI, type AlbumList, type Child } from 'subsonic-api';
import type { LRCLIBResponse, LyricsResult, NavidromeServer, SyncedLyric } from './types/navidrome';

export class NavidromeClient {
    private api: SubsonicAPI;
    private auth: {
        username: string;
        password: string;
        token?: string;
        subsonicSalt?: string;
    }
    constructor(server: NavidromeServer) {
        console.log('Creating client')
        this.auth = {
            username: server.username,
            password: server.password
        }
        this.api = new SubsonicAPI({
            url: server.url,
            auth: this.auth
        });
        this.api.navidromeSession().then(s => {
            this.auth.token = s.subsonicToken;
            this.auth.subsonicSalt = s.subsonicSalt;
        })
    }


    private getURL(method: string, params: Record<string, unknown>) {
        let base = this.api.baseURL();
        const session = this.auth;
        if (!base.endsWith("rest/")) base += "rest/";

        if (!method.endsWith(".m3u8")) base += `${method}.view`;

        const url = new URL(base);
        url.searchParams.set("v", "1.16.1");
        url.searchParams.set("c", "NaviThingy");
        url.searchParams.set("f", "json");

        for (const [key, value] of Object.entries(params)) {
            if (typeof value === "undefined" || value === null) continue;
            if (Array.isArray(value)) {
                for (const v of value) {
                    url.searchParams.append(key, v.toString());
                }
            } else {
                url.searchParams.set(key, value.toString());
            }
        }

        if (session.username) {
            url.searchParams.set("u", session.username);
            const { token, subsonicSalt } = session;
            url.searchParams.set("t", token!);
            url.searchParams.set("s", subsonicSalt!);
        } else {
            throw new Error("no auth found");
        }

        return url.toString();
    }

    async getGenres() {
        return await this.api.getGenres();
    }

    async getAlbums(type: 'newest' | 'highest' | 'frequent' | 'recent' | 'favorites', params: {
        size?: number;
        offset?: number;
        fromYear?: number;
        toYear?: number;
        genre?: string;
        musicFolderId?: string;
    }
    ) {
        const {
            fromYear,
            toYear,
            genre,
            musicFolderId,
            size = 10,
            offset = 0
        } = params;
        if (type === 'favorites') {
            return (await this.getStarred()) as AlbumList
        }
        const { albumList } = await this.api.getAlbumList({ type, size, offset, fromYear, genre, musicFolderId, toYear });

        if (albumList.album) {
            albumList.album = albumList.album.map(album => {
                if (album.coverArt) {
                    album.coverArt = this.getAlbumCoverUrl(album.id);
                }
                return album;
            });
        }
        return albumList;
    }

    async getAlbumDetails(id: string) {
        const { album } = await this.api.getAlbum({ id });
        if (album.song) {
            album.song = album.song.map(song => {
                if (song.coverArt) {
                    song.coverArt = this.getAlbumCoverUrl(song.id);
                }
                return song;
            });
        }
        if (album.coverArt) {
            album.coverArt = this.getAlbumCoverUrl(album.id);
        }
        return album;
    }

    getAlbumCoverUrl(id: string, size = 1024) {
        return this.getURL("getCoverArt", { id, size });
    }

    async search(query: string, type?: 'song' | 'album' | 'artist', offset: number = 0) {
        const { searchResult3 } = await this.api.search3({
            query,
            artistCount: type === 'artist' ? 20 : undefined,
            artistOffset: type === 'artist' ? offset : undefined,
            albumCount: type === 'album' ? 20 : undefined,
            albumOffset: type === 'album' ? offset : undefined,
            songCount: type === 'song' ? 20 : undefined,
            songOffset: type === 'song' ? offset : undefined
        });

        if (searchResult3.album) {
            searchResult3.album = searchResult3.album.map(album => {
                if (album.coverArt) {
                    album.coverArt = this.getAlbumCoverUrl(album.id);
                }
                return album;
            });
        }

        if (searchResult3.song) {
            searchResult3.song = searchResult3.song.map(song => {
                if (song.coverArt) {
                    song.coverArt = this.getAlbumCoverUrl(song.id);
                }
                return song;
            });
        }
        return searchResult3;
    }

    async getSongStream(id: string) {
        return await this.api.stream({
            id,
            format: 'raw'
        })
    }

    getSongStreamURL(id: string) {
        return this.getURL("stream", { id, format: 'raw' });
    }

    download(id: string) {
        return this.getURL('download', { id, format: 'raw' });
    }

    async scrobble(id: string) {
        return await this.api.scrobble({ id, submission: false, time: Math.floor(Date.now() / 1000) });
    }

    async getArtist(id: string) {
        const { artist } = await this.api.getArtist({ id });
        const { artistInfo } = await this.api.getArtistInfo({ id });
        if (artist.album) {
            artist.album = artist.album.map(album => {
                if (album.coverArt) {
                    album.coverArt = this.getAlbumCoverUrl(album.id);
                }
                return album;
            });
        }

        return { artist, artistInfo };
    }

    async getArtists() {
        return (await this.api.getArtists()).artists;
    }

    async getSong(id: string) {
        const { song } = await this.api.getSong({ id });
        const { similarSongs } = await this.api.getSimilarSongs({ id });
        if (song.coverArt) {
            song.coverArt = this.getAlbumCoverUrl(song.id);
        }
        if (similarSongs.song) {
            similarSongs.song = similarSongs.song.map(song => {
                if (song.coverArt) {
                    song.coverArt = this.getAlbumCoverUrl(song.id);
                }
                return song;
            });
        }
        return { song, similarSongs };
    }

    async getRandomSongs(size = 1) {
        const { randomSongs } = await this.api.getRandomSongs({
            size
        });

        if (randomSongs.song) {
            randomSongs.song = randomSongs.song.map(song => {
                if (song.coverArt) {
                    song.coverArt = this.getAlbumCoverUrl(song.id);
                }
                return song;
            });
        }

        return randomSongs;
    }

    async getStarred() {
        const { starred } = await this.api.getStarred();
        if (starred.album) {
            starred.album = starred.album.map(album => {
                if (album.coverArt) {
                    album.coverArt = this.getAlbumCoverUrl(album.id);
                }
                return album;
            });
        }

        if (starred.song) {
            starred.song = starred.song.map(song => {
                if (song.coverArt) {
                    song.coverArt = this.getAlbumCoverUrl(song.id);
                }
                return song;
            });
        }
        return starred;
    }

    async star(id: string, type: 'track' | 'album' | 'artist') {
        switch (type) {
            case 'track':
                return await this.api.star({ id });
            case 'album':
                return await this.api.star({ albumId: id });
            case 'artist':
                return await this.api.star({ artistId: id });
        }
    }

    async unstar(id: string, type: 'track' | 'album' | 'artist') {
        switch (type) {
            case 'track':
                return await this.api.custom('unstar', { id });
            case 'album':
                return await this.api.custom('unstar', { albumId: id });
            case 'artist':
                return await this.api.custom('unstar', { artistId: id });
        }
    }

    private async getLyricsFromLRCLIB(song: Child): Promise<LyricsResult | undefined> {
        try {
            const params = new URLSearchParams({
                track_name: song.title || '',
                artist_name: song.artist!
            });

            if (song.album) params.append('album_name', song.album);
            if (song.duration) params.append('duration', Math.round(song.duration).toString());

            const response = await fetch(`https://lrclib.net/api/get?${params}`);

            if (!response.ok) return undefined;

            const data: LRCLIBResponse = await response.json();

            if (data.syncedLyrics) {
                const syncedLyrics = this.parseSyncedLyrics(data.syncedLyrics);
                return {
                    synced: true,
                    plain: data.plainLyrics,
                    lines: syncedLyrics
                };
            } else if (data.plainLyrics) {
                return {
                    synced: false,
                    plain: data.plainLyrics,
                    lines: []
                };
            }
        } catch (error) {
            console.error('LRCLIB fetch failed:', error);
        }
        return undefined;
    }

    async getLyrics(song: Child): Promise<LyricsResult | undefined> {
        try {
            const { lyrics } = await this.api.getLyrics({ artist: song.artist, title: song.title });
            if (lyrics?.value) {
                const syncedLyrics = this.parseSyncedLyrics(lyrics.value);
                if (syncedLyrics.length == 0) {
                    return await this.getLyricsFromLRCLIB(song);
                }
                return {
                    synced: syncedLyrics.length > 0,
                    plain: syncedLyrics.length > 0 ? syncedLyrics.map(l => l.text).join('\n') : lyrics.value,
                    lines: syncedLyrics
                };
            }
        } catch (error) {
            console.error('Subsonic lyrics fetch failed:', error);
        }

        return await this.getLyricsFromLRCLIB(song);
    }

    private parseSyncedLyrics(text: string): SyncedLyric[] {
        if (!text) return [];

        const lines = text.split('\n');
        const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
        const syncedLyrics: SyncedLyric[] = [];

        for (const line of lines) {
            const match = timeRegex.exec(line);
            if (match) {
                const mins = parseInt(match[1]);
                const secs = parseInt(match[2]);
                const ms = parseInt(match[3]);
                const time = (mins * 60 + secs) + (ms / 1000);
                const text = line.replace(timeRegex, '').trim();
                if (text) {
                    syncedLyrics.push({ time, text });
                }
            }
        }

        return syncedLyrics.sort((a, b) => a.time - b.time);
    }
}