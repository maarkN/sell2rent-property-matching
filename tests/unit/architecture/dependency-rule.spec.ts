import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', '..', 'src');

const filesUnder = (dir: string): string[] => {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory()
      ? filesUnder(full)
      : full.endsWith('.ts')
        ? [full]
        : [];
  });
};

const importsOf = (file: string): string[] =>
  Array.from(readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)).map(
    (match) => match[1] ?? '',
  );

/**
 * The dependency rule is only real if something enforces it. A comment in a
 * README does not survive the third week of a project.
 */
describe('dependency rule', () => {
  it('domain imports no framework, no driver and no validation library', () => {
    const offenders = filesUnder(join(SRC, 'domain')).flatMap((file) =>
      importsOf(file)
        .filter((mod) => mod.startsWith('@nestjs') || mod === 'pg' || mod === 'zod')
        .map((mod) => `${file}: ${mod}`),
    );

    expect(offenders).toEqual([]);
  });

  it('application never imports an infrastructure implementation', () => {
    const applicationDir = join(SRC, 'application');
    let files: string[] = [];
    try {
      files = filesUnder(applicationDir);
    } catch {
      return; // layer not populated yet
    }

    const offenders = files.flatMap((file) =>
      importsOf(file)
        .filter((mod) => mod.startsWith('@infrastructure'))
        .map((mod) => `${file}: ${mod}`),
    );

    expect(offenders).toEqual([]);
  });
});
