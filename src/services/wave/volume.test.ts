import { describe, expect, it } from 'vitest';
import { volumeAt, volumeWheel } from './volume';

describe('громкость: место курсора и колесо', () => {
    it('доля по месту на дорожке, за краями края', () => {
        expect(volumeAt(150, 100, 100)).toBe(0.5);
        expect(volumeAt(50, 100, 100)).toBe(0);
        expect(volumeAt(400, 100, 100)).toBe(1);
        expect(volumeAt(150, 100, 0)).toBe(0);
    });
    it('колесо вверх громче, вниз тише, по 5 %', () => {
        expect(volumeWheel(0.5, -100)).toBe(0.55);
        expect(volumeWheel(0.5, 100)).toBe(0.45);
        expect(volumeWheel(0.98, -1)).toBe(1);
        expect(volumeWheel(0.02, 3)).toBe(0);
        expect(volumeWheel(0.4, 0)).toBe(0.4);
    });
});
