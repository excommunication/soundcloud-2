// Полный трек вместо отрывка Go+: ищет ту же песню на YouTube через yt-dlp и отдаёт прямую ссылку на аудиопоток.
// Включается только когда в папке данных лежит yt-cookies.txt (экспорт cookies отдельного аккаунта): без входа YouTube
// отвечает «подтвердите, что вы не бот». yt-dlp скачивается с официального релиза при первом использовании.
import { execFile } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';

export interface FullQuery {
    title: string;
    uploader: string;
    durationMs: number;
}
export interface FullResult {
    url: string;
    videoId: string;
    title: string;
}
export interface FlatEntry {
    id?: unknown;
    title?: unknown;
    channel?: unknown;
    uploader?: unknown;
    duration?: unknown;
}

const norm = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// Нужная песня, а не её переделка: эти слова в названии видео допустимы, только если они есть и в названии трека
const VARIANT = /\b(remix|cover|slowed|sped|reverb|nightcore|8d|bass boosted|karaoke|instrumental|mashup|live|ремикс|кавер)\b/;
const LYRICS = /\b(lyrics?|audio|official audio|topic|visualizer|hd)\b/;

/** Лучшее видео из поиска: длительность в пределах 4 секунд, без ремиксов и каверов, если их нет в названии трека */
export function pickCandidate(entries: FlatEntry[], query: FullQuery): { id: string; title: string } | null {
    const want = Math.round(query.durationMs / 1000);
    const wantTitle = norm(query.title);
    const wantArtist = norm(query.uploader);
    const wantVariant = VARIANT.test(wantTitle);
    let best: { id: string; title: string; score: number } | null = null;
    for (const entry of entries) {
        const id = typeof entry.id === 'string' ? entry.id : '';
        const title = typeof entry.title === 'string' ? entry.title : '';
        const duration = typeof entry.duration === 'number' ? entry.duration : 0;
        if (!id || !title) continue;
        if (want && duration && Math.abs(duration - want) > 4) continue;
        const text = norm(title);
        if (!wantVariant && VARIANT.test(text)) continue;
        const channel = norm(String(entry.channel ?? entry.uploader ?? ''));
        let score = 0;
        const core = wantTitle.replace(/\b(feat|ft|prod)\b.*$/, '').trim();
        if (core && text.includes(core)) score += 4;
        if (wantArtist && (text.includes(wantArtist) || channel.includes(wantArtist))) score += 3;
        if (/ topic$/.test(channel) || channel.includes('vevo') || channel.includes('official')) score += 2;
        if (LYRICS.test(text)) score += 1;
        if (want && duration) score -= Math.abs(duration - want) / 4;
        if (!best || score > best.score) best = { id, title, score };
    }
    return best && best.score >= 4 ? { id: best.id, title: best.title } : null;
}

type Run = (file: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number) => Promise<string>;
const run: Run = (file, args, env, timeoutMs) =>
    new Promise((resolve, reject) => {
        execFile(file, args, { env, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (error, stdout) => (error ? reject(error) : resolve(String(stdout))));
    });

export interface FullTrackOptions {
    dataDir: string;
    /** Исполняемый файл, который yt-dlp использует как Node для расшифровки ссылок YouTube (в Electron с ELECTRON_RUN_AS_NODE) */
    nodePath: string;
    download(url: string): Promise<Buffer>;
    run?: Run;
}

const BINARY_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';

export class FullTrackService {
    private readonly cache = new Map<string, FullResult | null>();
    private readonly pending = new Map<string, Promise<FullResult | null>>();
    private binary: Promise<string | null> | null = null;
    private readonly exec: Run;

    constructor(private readonly options: FullTrackOptions) {
        this.exec = options.run ?? run;
    }
    /** Включено, когда пользователь положил cookies; без них YouTube не отдаёт потоки */
    public enabled(): boolean {
        return process.platform === 'win32' && existsSync(join(this.options.dataDir, 'yt-cookies.txt'));
    }
    private ensureBinary(): Promise<string | null> {
        const path = join(this.options.dataDir, 'yt-dlp.exe');
        this.binary ??= (async () => {
            if (existsSync(path)) return path;
            try {
                mkdirSync(this.options.dataDir, { recursive: true });
                const data = await this.options.download(BINARY_URL);
                if (data.length < 5_000_000 || data.subarray(0, 2).toString() !== 'MZ') return null;
                writeFileSync(path + '.part', data);
                renameSync(path + '.part', path);
                return path;
            } catch (error) {
                console.warn('yt-dlp не скачан', error);
                return null;
            }
        })();
        void this.binary.then((value) => {
            if (!value) this.binary = null;
        });
        return this.binary;
    }
    public resolve(query: FullQuery): Promise<FullResult | null> {
        if (!this.enabled() || !query.title) return Promise.resolve(null);
        const key = norm(query.uploader + ' ' + query.title) + '|' + Math.round(query.durationMs / 1000);
        if (this.cache.has(key)) return Promise.resolve(this.cache.get(key) ?? null);
        const waiting = this.pending.get(key);
        if (waiting) return waiting;
        let failed = false;
        const job = this.find(query)
            .catch((error: unknown) => {
                console.warn('Полный трек не найден', error);
                failed = true;
                return null;
            })
            .then((result) => {
                // Сбой не запоминается: следующая попытка повторит поиск. Найденное и «нет такого видео» помнятся
                if (!failed) {
                    this.cache.set(key, result);
                    setTimeout(() => this.cache.delete(key), result ? 3 * 3600_000 : 20 * 60_000).unref?.();
                }
                return result;
            })
            .finally(() => this.pending.delete(key));
        this.pending.set(key, job);
        return job;
    }
    private async find(query: FullQuery): Promise<FullResult | null> {
        const binary = await this.ensureBinary();
        if (!binary) return null;
        const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
        const base = [
            '--cookies', join(this.options.dataDir, 'yt-cookies.txt'),
            '--js-runtimes', 'node:' + this.options.nodePath,
            '--remote-components', 'ejs:github',
            '--no-warnings', '--no-playlist',
        ];
        const search = await this.exec(binary, [...base, '--flat-playlist', '-J', 'ytsearch6:' + (query.uploader + ' ' + query.title).slice(0, 200)], env, 30000);
        const entries = (JSON.parse(search) as { entries?: FlatEntry[] }).entries ?? [];
        const pick = pickCandidate(entries, query);
        if (!pick) return null;
        const out = await this.exec(binary, [...base, '-f', 'bestaudio', '-g', 'https://www.youtube.com/watch?v=' + pick.id], env, 40000);
        const url = out.split(/\r?\n/).map((line) => line.trim()).find((line) => /^https:\/\/[a-z0-9.-]+\.googlevideo\.com\//.test(line));
        return url ? { url, videoId: pick.id, title: pick.title } : null;
    }
}
export { BINARY_URL };
