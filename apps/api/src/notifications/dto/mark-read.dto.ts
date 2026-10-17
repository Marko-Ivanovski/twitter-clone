import { IsISO8601, IsOptional } from 'class-validator';

export class MarkReadDto {
  @IsOptional()
  @IsISO8601()
  upTo?: string;
}
