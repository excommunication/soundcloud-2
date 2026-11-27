import { describe, expect, it } from 'vitest';
import { isBlockedTrack } from './full';

describe('isBlockedTrack', () => {
    it('BLOCK закрыт в стране', () => {
        expect(isBlockedTrack({ policy: 'BLOCK' })).toBe(true);
        expect(isBlockedTrack({ policy: 'BLOCK', streamable: true })).toBe(true);
    });
    it('streamable: false без отрывка тоже закрыт', () => {
        expect(isBlockedTrack({ streamable: false })).toBe(true);
        expect(isBlockedTrack({ policy: 'ALLOW', streamable: false })).toBe(true);
    });
    it('отрывок Go+ (SNIP) играет и не считается закрытым', () => {
        expect(isBlockedTrack({ policy: 'SNIP' })).toBe(false);
        expect(isBlockedTrack({ policy: 'SNIP', streamable: false })).toBe(false);
    });
    it('обычный трек и пустые данные не закрыты', () => {
        expect(isBlockedTrack({ policy: 'ALLOW', streamable: true })).toBe(false);
        expect(isBlockedTrack({})).toBe(false);
        expect(isBlockedTrack(null)).toBe(false);
        expect(isBlockedTrack(undefined)).toBe(false);
    });
});
