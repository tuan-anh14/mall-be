import { IsString, IsOptional, IsArray, IsNotEmpty } from 'class-validator';

export class GenerateDescriptionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  categoryName?: string;

  @IsArray()
  @IsOptional()
  specifications?: { key: string; value: string }[];

  @IsArray()
  @IsOptional()
  colors?: string[];

  @IsArray()
  @IsOptional()
  sizes?: string[];

  @IsString()
  @IsOptional()
  additionalInstructions?: string;
}
