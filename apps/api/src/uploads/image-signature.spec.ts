import { detectImageExtension } from './image-signature';

describe('detectImageExtension', () => {
  it.each([
    ['jpeg', [0xff, 0xd8, 0xff, 0xe0], '.jpg'],
    ['png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], '.png'],
    ['gif', [...Buffer.from('GIF89a')], '.gif'],
    ['webp', [...Buffer.from('RIFF\0\0\0\0WEBP')], '.webp'],
  ])('recognises %s by its magic bytes', (_name, bytes, expected) => {
    expect(detectImageExtension(Buffer.from(bytes))).toBe(expected);
  });

  it.each([
    ['html', Buffer.from('<script>alert(1)</script>')],
    ['svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['empty file', Buffer.alloc(0)],
    ['truncated png', Buffer.from([0x89, 0x50, 0x4e])],
  ])('rejects %s', (_name, buffer) => {
    expect(detectImageExtension(buffer)).toBeNull();
  });
});
