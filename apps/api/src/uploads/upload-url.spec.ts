import { isOwnUploadUrl } from './upload-url';

describe('isOwnUploadUrl', () => {
  const base = 'http://localhost:3001/api/uploads';
  const uuid = '3f2b8c1e-9d4a-4e6b-8f1a-2c3d4e5f6a7b';

  it('accepts an image this API stored', () => {
    expect(isOwnUploadUrl(`${base}/tweets/${uuid}.png`)).toBe(true);
  });

  it.each([
    ['an external host', `https://evil.example/${uuid}.png`],
    ['a non-image extension', `${base}/tweets/${uuid}.html`],
    ['path traversal', `${base}/../../${uuid}.png`],
    ['an unknown folder', `${base}/secret/${uuid}.png`],
    ['a host that only shares the prefix', `${base}.evil.example/x.png`],
    ['a javascript URL', 'javascript:alert(1)'],
  ])('rejects %s', (_name, url) => {
    expect(isOwnUploadUrl(url)).toBe(false);
  });
});
