import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import {
  ImportPropertiesUseCase,
  type ImportResult,
} from '@application/usecases/import-properties.usecase';

@Controller('properties')
export class PropertiesController {
  constructor(private readonly importProperties: ImportPropertiesUseCase) {}

  /**
   * Responds `200`, not `201`: the operation is idempotent and a repeated call
   * creates nothing, so "Created" would be a lie on every run after the first.
   *
   * The body is returned bare, exactly as the brief specifies — no envelope.
   */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  async import(): Promise<ImportResult> {
    return this.importProperties.execute();
  }
}
