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
  @MaxLength(280)
  content!: string;

  @IsOptional()
  @IsUUID()
  parentCommentId?: string;
}
