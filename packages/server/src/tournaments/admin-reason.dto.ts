import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from "class-validator";
import { CompetitionStatus } from "#prisma/enums";

export class ReasonDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Length(1, 500)
  reason!: string;
}

export class OptionalReasonDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(1, 500)
  @IsOptional()
  reason?: string;
}

export class StatusBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  userIds!: number[];

  @IsEnum(CompetitionStatus)
  status!: CompetitionStatus;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @ValidateIf(
    (dto: StatusBatchDto, value: unknown) =>
      dto.status !== CompetitionStatus.PLAYER || value !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  @Length(1, 500)
  reason?: string;
}
