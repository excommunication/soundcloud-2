import { describe, expect, it } from 'vitest';
import { webContentsGone } from './webContentsGone';

describe('webContentsGone', () => {
    it('считает пустой вид и вид без webContents ушедшими', () => {
        expect(webContentsGone(null)).toBe(true);
        expect(webContentsGone(undefined)).toBe(true);
        expect(webContentsGone({ webContents: undefined })).toBe(true);
    });
    it('смотрит на isDestroyed живого webContents', () => {
        expect(webContentsGone({ webContents: { isDestroyed: () => true } })).toBe(true);
        expect(webContentsGone({ webContents: { isDestroyed: () => false } })).toBe(false);
    });
});
