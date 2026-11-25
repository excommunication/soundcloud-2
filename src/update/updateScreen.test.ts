import { describe, expect, it, vi } from 'vitest';
import { UPDATE_CARD, updateCardBounds } from './updateScreen';

vi.mock('electron', () => ({ WebContentsView: class {} }));
vi.mock('../trustedViews', () => ({ trustLocalFile: () => undefined }));

describe('updateCardBounds', () => {
    it('карточка в правом нижнем углу над плеером, а не на всё окно', () => {
        const box = updateCardBounds(1440, 900, 44);
        expect(box).toEqual({ x: 1440 - UPDATE_CARD.width - UPDATE_CARD.right, y: 900 - UPDATE_CARD.height - UPDATE_CARD.bottom, width: UPDATE_CARD.width, height: UPDATE_CARD.height });
        expect(box.width * box.height).toBeLessThan(1440 * 900 * 0.1);
    });

    it('в узком и низком окне не вылезает за края и не заходит на шапку', () => {
        const box = updateCardBounds(300, 160, 44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(300);
        expect(box.y).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeLessThanOrEqual(160 - 44);
    });
});
