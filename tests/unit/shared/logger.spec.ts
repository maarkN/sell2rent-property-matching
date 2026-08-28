import { Logger } from '@shared/utils/logger';

describe('Logger', () => {
  it('renders an Error message and stack rather than an empty object', () => {
    const logger = new Logger();
    const emitted: unknown[] = [];

    // Reach into the winston instance to observe what would be written.
    const internal = (logger as unknown as { logger: { error: unknown } }).logger;
    (internal as { error: (m: string, meta: unknown) => void }).error = (
      _message,
      meta,
    ) => {
      emitted.push(meta);
    };

    logger.error('boom', new Error('the real cause'));

    // JSON.stringify(new Error(...)) is '{}', so passing an Error inside a
    // metadata bag logs nothing. This asserts it was unpacked.
    expect(emitted[0]).toMatchObject({ errorMessage: 'the real cause' });
    expect(emitted[0]).toHaveProperty('stack');
  });
});
