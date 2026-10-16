import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  content!: string;

  @IsOptional()
  @IsUUID()
  parentCommentId?: string;
}
