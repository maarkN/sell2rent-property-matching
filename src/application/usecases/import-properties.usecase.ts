import { readFile } from 'node:fs/promises';
import { Inject, Injectable } from '@nestjs/common';

import { Property } from '@domain/entities/property.entity';
import {
  PROPERTY_REPOSITORY,
  type PropertyRepository,
} from '@domain/interfaces/property-repository.interface';
import { ConfigService } from '@shared/config/config.service';
import { Logger } from '@shared/utils/logger';

export interface ImportRejection {
  /**
   * Null when the record carries no usable identifier.
   *
   * The brief's shape is `{ external_id, reason }`, but three records in the
   * feed have a null, absent or non-string identifier. `index` is what keeps
   * those traceable instead of unreportable.
   */
  readonly external_id: string | null;
  readonly index: number;
  readonly reason: string;
}

export interface ImportResult {
  readonly imported: number;
  readonly skipped: number;
  readonly errors: readonly ImportRejection[];
}

@Injectable()
export class ImportPropertiesUseCase {
  constructor(
    @Inject(PROPERTY_REPOSITORY)
    private readonly properties: PropertyRepository,
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {}

  async execute(feedPath?: string): Promise<ImportResult> {
    const path = feedPath ?? this.config.env.PROPERTIES_FEED_PATH;
    const raw: unknown = JSON.parse(await readFile(path, 'utf8'));

    if (!Array.isArray(raw)) {
      throw new Error(`Feed at ${path} is not a JSON array`);
    }

    return this.importRecords(raw);
  }

  /** Separated so tests can drive records directly, without a file. */
  async importRecords(records: readonly unknown[]): Promise<ImportResult> {
    const valid: Property[] = [];
    const errors: ImportRejection[] = [];

    records.forEach((record, index) => {
      const result = Property.create(record);

      if (result.ok) {
        valid.push(result.value);
        return;
      }

      // Accumulate, never fail fast: one malformed record must not cost the
      // other 419.
      const externalId =
        typeof record === 'object' &&
        record !== null &&
        typeof (record as { external_id?: unknown }).external_id === 'string'
          ? ((record as { external_id: string }).external_id)
          : null;

      errors.push({ external_id: externalId, index, reason: result.error });
      this.logger.warn('Skipped malformed feed record', {
        externalId,
        index,
        reason: result.error,
      });
    });

    const imported = await this.properties.insertIgnoringDuplicates(valid);

    this.logger.info('Property import finished', {
      received: records.length,
      valid: valid.length,
      imported,
      skipped: errors.length,
    });

    return { imported, skipped: errors.length, errors };
  }
}
