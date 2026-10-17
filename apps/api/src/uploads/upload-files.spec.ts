import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { deleteUploadedFile } from './upload-files';

const BASE = 'http://localhost:3001/api/uploads';
const FILE = '3f2b8c1e-9d4a-4e6b-8f1a-2c3d4e5f6a7b.png';

describe('deleteUploadedFile', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'uploads-'));
    await fs.mkdir(path.join(root, 'tweets'));
    await fs.writeFile(path.join(root, 'tweets', FILE), 'x');
  });

  afterEach(() => fs.rm(root, { recursive: true, force: true }));

  const exists = () =>
    fs.access(path.join(root, 'tweets', FILE)).then(
      () => true,
      () => false,
    );

  it('removes a file this API stored', async () => {
    await deleteUploadedFile(`${BASE}/tweets/${FILE}`, root);
    expect(await exists()).toBe(false);
  });

  it.each([
    ['an external URL', `https://elsewhere.example/tweets/${FILE}`],
    ['a traversal attempt', `${BASE}/tweets/../tweets/${FILE}`],
    ['nothing', null],
  ])('leaves files alone for %s', async (_name, url) => {
    await deleteUploadedFile(url, root);
    expect(await exists()).toBe(true);
  });

  it('ignores a file that is already gone', async () => {
    await expect(
      deleteUploadedFile(`${BASE}/avatars/${FILE}`, root),
    ).resolves.toBeUndefined();
  });
});
